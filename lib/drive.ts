
import { google } from 'googleapis';
import { TimelineItem } from '../types';
import { Buffer } from 'buffer';
import { Readable } from 'stream';

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

const findLogFileId = async (drive: any, username: string, date: string, logId: string) => {
  try {
    const fileName = `log_${logId}.json`;
    const q = `name = '${fileName}' and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id, parents)' });
    
    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }
    return null;
  } catch (e) {
    console.error("Error finding log file:", e);
    return null;
  }
};

// Helper: Map MIME types to extensions
const getExtensionFromMime = (mime: string, originalName?: string): string => {
  // 1. Try to get extension from original filename first (most reliable for complex types)
  if (originalName && originalName.includes('.')) {
    return originalName.split('.').pop() || 'bin';
  }
  
  // 2. Fallback to MIME mapping
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    // Word
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    // Excel
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    // PPT
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    // Archives
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/x-7z-compressed': '7z',
    'application/x-rar-compressed': 'rar',
    // Text
    'text/plain': 'txt',
    'text/csv': 'csv',
    'text/markdown': 'md',
    'application/json': 'json'
  };

  // Exact match
  if (map[mime]) return map[mime];

  // Fuzzy match
  for (const key in map) {
    if (mime.includes(key)) return map[key];
  }

  return 'bin';
};

export const deleteLogFromDrive = async (username: string, date: string, logId: string) => {
  const drive = getOAuth2Client();
  const fileId = await findLogFileId(drive, username, date, logId);
  
  if (fileId) {
    console.log(`[Sync] Deleting file ${fileId} from Drive`);
    await drive.files.update({
      fileId: fileId as string,
      requestBody: { trashed: true }
    });
    return true;
  } else {
    console.warn(`[Sync] File for log ${logId} not found on Drive, skipping.`);
    return false;
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

  // Deep copy attachments to avoid mutating original during loop
  const cleanAttachments = [];

  if (log.attachments && log.attachments.length > 0) {
    for (const att of log.attachments) {
      // Check if it's a new upload (Base64 Data URL)
      if (att.url.startsWith('data:')) {
        try {
          console.log(`[Sync] Processing file upload for attachment ${att.id} (${att.name})...`);
          
          // 1. Parse Base64
          const matches = att.url.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches || matches.length !== 3) {
            console.warn("Invalid base64 string, skipping upload and keeping base64");
            cleanAttachments.push(att); 
            continue;
          }

          const mimeType = matches[1];
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Use original name extension if available, otherwise guess from mime
          const ext = getExtensionFromMime(mimeType, att.name);
          const fileName = `${log.timestamp}_${att.id}.${ext}`; 

          // 2. Create Readable Stream from Buffer
          const stream = new Readable();
          stream.push(buffer);
          stream.push(null); // Signal end of stream

          // 3. Upload File to Drive
          const res = await drive.files.create({
            requestBody: { 
              name: fileName, 
              parents: [dayId],
              description: `Attachment for log ${log.id} (${att.name})`
            },
            media: { 
              mimeType: mimeType, 
              body: stream 
            },
            fields: 'id, thumbnailLink, webViewLink, webContentLink' 
          });
          
          if(res.data.id) {
            // 4. Determine Link
            // webContentLink: DIRECT DOWNLOAD LINK (force download)
            // webViewLink: Preview Link (Google Docs Viewer)
            // thumbnailLink: Image thumbnail
            
            // Default to webContentLink for files to enable direct download
            let finalUrl = res.data.webContentLink; 
            
            // Fallback if webContentLink is missing for some reason
            if (!finalUrl) finalUrl = res.data.webViewLink;

            // Optimization for Images: Use high-res thumbnail for display
            // (Images are displayed inline, so we need the image data, not a download link usually,
            // but the original 'url' field in Attachment is primarily for display/access)
            if (mimeType.startsWith('image/') && res.data.thumbnailLink) {
                finalUrl = res.data.thumbnailLink.replace(/=s\d+.*$/, '=s3000');
            }

            console.log(`[Sync] File uploaded successfully. Name: ${fileName}, ID: ${res.data.id}`);

            cleanAttachments.push({ 
              ...att, 
              driveId: res.data.id, 
              url: finalUrl || att.url 
            });
          } else {
            console.error("Upload returned no ID, falling back to base64");
            cleanAttachments.push(att);
          }
        } catch (fileErr: any) {
          console.error(`[Sync] File upload failed for ${att.name}:`, fileErr.message);
          cleanAttachments.push(att); // Fallback: keep original base64
        }
      } else {
        // Already a remote URL (previously synced)
        cleanAttachments.push(att);
      }
    }
  }

  // Create the object to save to JSON file. 
  const logToSave = { 
    ...log, 
    attachments: cleanAttachments, 
    syncStatus: 'synced' as const 
  };

  const logContent = JSON.stringify(logToSave, null, 2);
  
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
    
    // Helper to gracefully handle missing folders
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
