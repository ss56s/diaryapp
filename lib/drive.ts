
import { google } from 'googleapis';
import { TimelineItem } from '../types';
import { Buffer } from 'buffer';

const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error("Missing Google OAuth environment variables");
    throw new Error("Google OAuth 配置缺失");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
};

const findOrCreateFolder = async (drive: any, parentId: string, folderName: string) => {
  try {
    const q = `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id, name)' });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id!;
    }

    const file = await drive.files.create({
      requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    return file.data.id!;
  } catch (error: any) {
    console.error(`Error finding/creating folder '${folderName}':`, error.message);
    throw new Error(`无法访问或创建文件夹: ${folderName}`);
  }
};

export const uploadLogToDrive = async (username: string, log: TimelineItem): Promise<TimelineItem> => {
  console.log(`[Sync] Starting sync for log ${log.id}`);
  const drive = getOAuth2Client();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_ID;
  if (!rootId) throw new Error("GOOGLE_DRIVE_ROOT_ID is missing in env");

  const diaryId = await findOrCreateFolder(drive, rootId, '日记');
  const userId = await findOrCreateFolder(drive, diaryId, username);
  
  const [year, month, day] = log.date.split('-');
  const yearId = await findOrCreateFolder(drive, userId, year);
  const monthId = await findOrCreateFolder(drive, yearId, month);
  const dayId = await findOrCreateFolder(drive, monthId, day);

  // Deep copy attachments
  const updatedAttachments = [];

  if (log.attachments && log.attachments.length > 0) {
    // Dynamic import to be safe in all environments, though strictly server-side
    const { Readable } = await import('stream');

    for (const att of log.attachments) {
      // Check if it's a Base64 string that needs uploading
      if (att.url.startsWith('data:')) {
        try {
          console.log(`[Sync] Uploading image for attachment ${att.id}`);
          const base64Data = att.url.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          
          const stream = new Readable();
          stream.push(buffer);
          stream.push(null);

          const res = await drive.files.create({
            requestBody: { 
              name: `img_${log.timestamp}_${att.id}.jpg`, 
              parents: [dayId],
            },
            media: { mimeType: 'image/jpeg', body: stream },
            // Request thumbnailLink explicitly
            fields: 'id, thumbnailLink, webViewLink' 
          });
          
          if(res.data.id) {
            // FIX: Use thumbnailLink and modify it to get a larger size (=s2000)
            // thumbnailLink usually looks like: https://lh3.googleusercontent.com/...?=s220
            // changing to =s2000 makes it high res and accessible for img tags
            let finalUrl = res.data.thumbnailLink;
            if (finalUrl && finalUrl.includes('=s')) {
                finalUrl = finalUrl.replace(/=s\d+/, '=s2000');
            }
            
            updatedAttachments.push({ 
              ...att, 
              driveId: res.data.id, 
              url: finalUrl || res.data.webViewLink || att.url 
            });
          } else {
            updatedAttachments.push(att);
          }
        } catch (imgErr) {
          console.error("Image upload failed", imgErr);
          updatedAttachments.push(att); // Keep original (unsynced) if fail
        }
      } else {
        // Already a remote URL
        updatedAttachments.push(att);
      }
    }
  }

  // Create the final object to be saved to JSON
  const logToSave = { 
    ...log, 
    attachments: updatedAttachments, 
    syncStatus: 'synced' as const 
  };

  const logContent = JSON.stringify(logToSave, null, 2);
  
  // Save the JSON file
  const media = {
    mimeType: 'application/json',
    body: logContent
  };

  const existingFileQ = `'${dayId}' in parents and name = 'log_${log.id}.json' and trashed = false`;
  const existing = await drive.files.list({ q: existingFileQ, fields: 'files(id)' });

  if (existing.data.files && existing.data.files.length > 0 && existing.data.files[0].id) {
    await drive.files.update({
      fileId: existing.data.files[0].id as string,
      media: media,
    });
  } else {
    await drive.files.create({
      requestBody: { name: `log_${log.id}.json`, parents: [dayId] },
      media: media,
    });
  }

  return logToSave;
};

export const fetchLogsByDate = async (username: string, date: string): Promise<TimelineItem[]> => {
  const drive = getOAuth2Client();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_ID;
  if (!rootId) return [];

  try {
    const diaryId = await findOrCreateFolder(drive, rootId, '日记');
    const userId = await findOrCreateFolder(drive, diaryId, username);
    const [year, month, day] = date.split('-');
    
    const findFolderId = async (pId: string, name: string) => {
      const q = `'${pId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const res = await drive.files.list({ q, fields: 'files(id)' });
      return res.data.files?.[0]?.id;
    };

    const yearId = await findFolderId(userId, year);
    if (!yearId) return [];
    const monthId = await findFolderId(yearId, month);
    if (!monthId) return [];
    const dayId = await findFolderId(monthId, day);
    if (!dayId) return [];

    const q = `'${dayId}' in parents and name contains 'log_' and mimeType = 'application/json' and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id, name)' });

    const items: TimelineItem[] = [];
    for (const file of res.data.files || []) {
      if (!file.id) continue;
      try {
        const content = await drive.files.get({ fileId: file.id, alt: 'media' });
        if (typeof content.data === 'object') {
             items.push(content.data as TimelineItem);
        } else if (typeof content.data === 'string') {
             items.push(JSON.parse(content.data));
        }
      } catch (readErr) {
        console.error(`Error reading file ${file.id}`, readErr);
      }
    }
    return items;
  } catch (e) {
    console.error("Fetch Error:", e);
    return [];
  }
};
