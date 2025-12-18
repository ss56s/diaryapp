
import { google } from 'googleapis';
import { TimelineItem } from '../types';
import { Readable } from 'stream';
// Fix: Import Buffer explicitly for Node.js environment consistency in server actions
import { Buffer } from 'buffer';

const getOAuth2Client = () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
};

const findOrCreateFolder = async (drive: any, parentId: string, folderName: string) => {
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
};

export const uploadLogToDrive = async (username: string, log: TimelineItem) => {
  const drive = getOAuth2Client();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_ID;
  if (!rootId) throw new Error("GOOGLE_DRIVE_ROOT_ID is missing");

  const diaryId = await findOrCreateFolder(drive, rootId, '日记');
  const userId = await findOrCreateFolder(drive, diaryId, username);
  
  const [year, month, day] = log.date.split('-');
  const yearId = await findOrCreateFolder(drive, userId, year);
  const monthId = await findOrCreateFolder(drive, yearId, month);
  const dayId = await findOrCreateFolder(drive, monthId, day);

  // Upload Attachments
  const attachmentLinks = [];
  if (log.attachments) {
    for (const att of log.attachments) {
      if (att.url.startsWith('data:')) {
        const base64Data = att.url.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Convert Buffer to Readable Stream for googleapis
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const res = await drive.files.create({
          requestBody: { name: `img_${log.timestamp}_${att.id}.jpg`, parents: [dayId] },
          media: { mimeType: 'image/jpeg', body: stream },
          fields: 'id, webViewLink'
        });
        attachmentLinks.push({ ...att, driveId: res.data.id, url: res.data.webViewLink });
      } else {
        attachmentLinks.push(att);
      }
    }
  }

  const logToSave = { ...log, attachments: attachmentLinks, syncStatus: 'synced' };
  const logContent = JSON.stringify(logToSave, null, 2);
  
  // Create stream from string
  const logStream = new Readable();
  logStream.push(logContent);
  logStream.push(null);

  // Check if file already exists (upsert)
  const existingFileQ = `'${dayId}' in parents and name = 'log_${log.id}.json' and trashed = false`;
  const existing = await drive.files.list({ q: existingFileQ, fields: 'files(id)' });

  if (existing.data.files && existing.data.files.length > 0 && existing.data.files[0].id) {
    await drive.files.update({
      fileId: existing.data.files[0].id as string, // Fix: Explicit cast to string
      media: { mimeType: 'application/json', body: logStream },
    });
  } else {
    await drive.files.create({
      requestBody: { name: `log_${log.id}.json`, parents: [dayId] },
      media: { mimeType: 'application/json', body: logStream },
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
      const content = await drive.files.get({ fileId: file.id, alt: 'media' });
      items.push(content.data as TimelineItem);
    }
    return items;
  } catch (e) {
    console.error("Fetch Error:", e);
    return [];
  }
};
