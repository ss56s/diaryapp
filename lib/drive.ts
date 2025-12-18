import { google } from 'googleapis';
import { TimelineItem } from '../types';
import { Readable } from 'stream';
// Import Buffer to resolve TypeScript error in Node.js environment
import { Buffer } from 'buffer';

const getDriveClient = () => {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
};

const findOrCreateFolder = async (drive: any, parentId: string, folderName: string) => {
  const q = `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q, fields: 'files(id, name)' });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const file = await drive.files.create({
    requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return file.data.id;
};

export const uploadLogToDrive = async (username: string, log: TimelineItem) => {
  const drive = getDriveClient();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_ID;
  if (!rootId) throw new Error("GOOGLE_DRIVE_ROOT_ID is missing");

  // 1. Recursive Path: 日记 -> {username} -> {Year} -> {Month} -> {Day}
  const diaryId = await findOrCreateFolder(drive, rootId, '日记');
  const userId = await findOrCreateFolder(drive, diaryId, username);
  
  const [year, month, day] = log.date.split('-');
  const yearId = await findOrCreateFolder(drive, userId, year);
  const monthId = await findOrCreateFolder(drive, yearId, month);
  const dayId = await findOrCreateFolder(drive, monthId, day);

  // 2. Upload Attachments First (to replace DataURLs with filenames if needed)
  const attachmentLinks = [];
  if (log.attachments) {
    for (const att of log.attachments) {
      if (att.url.startsWith('data:')) {
        const base64Data = att.url.split(',')[1];
        // Fix: Use Buffer.from after importing Buffer
        const buffer = Buffer.from(base64Data, 'base64');
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const res = await drive.files.create({
          requestBody: { name: `img_${log.timestamp}_${att.id}.jpg`, parents: [dayId] },
          media: { mimeType: 'image/jpeg', body: stream },
          fields: 'id, webViewLink'
        });
        attachmentLinks.push({ ...att, driveId: res.data.id, url: res.data.webViewLink });
      }
    }
  }

  // 3. Upload JSON Log
  const logToSave = { ...log, attachments: attachmentLinks, syncStatus: 'synced' };
  const logStream = new Readable();
  logStream.push(JSON.stringify(logToSave, null, 2));
  logStream.push(null);

  await drive.files.create({
    requestBody: { name: `log_${log.timestamp}.json`, parents: [dayId] },
    media: { mimeType: 'application/json', body: logStream },
  });

  return true;
};