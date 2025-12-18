
import { google } from 'googleapis';
import { TimelineItem } from '../types';
import { Readable } from 'stream';
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

export const uploadLogToDrive = async (username: string, log: TimelineItem) => {
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

  // Upload Attachments
  const attachmentLinks = [];
  if (log.attachments && log.attachments.length > 0) {
    for (const att of log.attachments) {
      if (att.url.startsWith('data:')) {
        try {
          const base64Data = att.url.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Use Readable.from if available (Node 10.17+), fallback to push
          let stream: Readable;
          if (Readable.from) {
             stream = Readable.from(buffer);
          } else {
             stream = new Readable();
             stream.push(buffer);
             stream.push(null);
          }

          const res = await drive.files.create({
            requestBody: { name: `img_${log.timestamp}_${att.id}.jpg`, parents: [dayId] },
            media: { mimeType: 'image/jpeg', body: stream },
            fields: 'id, webViewLink'
          });
          
          if(res.data.id) {
            // Construct a viewable link (Note: webViewLink might require auth, raw ID is better for app logic but let's store link)
            attachmentLinks.push({ ...att, driveId: res.data.id, url: res.data.webViewLink || att.url });
          } else {
            attachmentLinks.push(att);
          }
        } catch (imgErr) {
          console.error("Image upload failed", imgErr);
          attachmentLinks.push(att); // Keep original if fail
        }
      } else {
        attachmentLinks.push(att);
      }
    }
  }

  const logToSave = { ...log, attachments: attachmentLinks, syncStatus: 'synced' };
  const logContent = JSON.stringify(logToSave, null, 2);
  
  // Use string directly for body to avoid stream issues for small text files
  const media = {
    mimeType: 'application/json',
    body: logContent
  };

  // Check if file already exists (upsert)
  const existingFileQ = `'${dayId}' in parents and name = 'log_${log.id}.json' and trashed = false`;
  const existing = await drive.files.list({ q: existingFileQ, fields: 'files(id)' });

  if (existing.data.files && existing.data.files.length > 0 && existing.data.files[0].id) {
    console.log(`[Sync] Updating existing file ${existing.data.files[0].id}`);
    await drive.files.update({
      fileId: existing.data.files[0].id as string,
      media: media,
    });
  } else {
    console.log(`[Sync] Creating new file for ${log.id}`);
    await drive.files.create({
      requestBody: { name: `log_${log.id}.json`, parents: [dayId] },
      media: media,
    });
  }

  return true;
};

export const fetchLogsByDate = async (username: string, date: string): Promise<TimelineItem[]> => {
  const drive = getOAuth2Client();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_ID;
  if (!rootId) return [];

  try {
    const diaryId = await findOrCreateFolder(drive, rootId, '日记');
    const userId = await findOrCreateFolder(drive, diaryId, username);
    const [year, month, day] = date.split('-');
    
    // Helper to find folder without creating
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
    // Don't throw, just return empty to allow local offline work
    return [];
  }
};
