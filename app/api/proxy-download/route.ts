
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOAuth2Client } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // 1. Security Check
  const session = await getSession();
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 2. Parse Query
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('fileId');
  const clientFilename = searchParams.get('filename');
  const clientMimeType = searchParams.get('contentType');

  if (!fileId) {
    return new NextResponse('Missing fileId', { status: 400 });
  }

  try {
    const drive = getOAuth2Client();

    let filename: string | null | undefined = clientFilename;
    let mimeType: string | null | undefined = clientMimeType;
    let size: string | null | undefined = undefined;

    // Only fetch metadata if client didn't provide it
    if (!filename) {
        try {
            const meta = await drive.files.get({
                fileId: fileId,
                fields: 'name, mimeType, size'
            });
            filename = meta.data.name || null;
            mimeType = meta.data.mimeType || null;
            size = meta.data.size || undefined;
        } catch (e) {
            console.error("Failed to fetch metadata, proceeding with defaults", e);
        }
    }

    // 3. Get File Stream
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // 4. Create Response Headers
    const headers = new Headers();
    headers.set('Content-Type', mimeType || 'application/octet-stream');
    
    // Force download with correct filename (RFC 5987)
    const encodedFilename = encodeURIComponent(filename || 'download');
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    
    if (size) {
        headers.set('Content-Length', String(size));
    }

    // 5. Stream Handling (Convert Node Stream to Web Stream)
    const stream = response.data as any; 
    
    const webStream = new ReadableStream({
        start(controller) {
            stream.on('data', (chunk: any) => controller.enqueue(chunk));
            stream.on('end', () => controller.close());
            stream.on('error', (err: any) => controller.error(err));
        }
    });

    return new NextResponse(webStream, { headers });

  } catch (error: any) {
    console.error('Proxy Download Error:', error);
    // Return text response on error so browser displays it
    return new NextResponse(`Download Failed: ${error.message}`, { status: 500 });
  }
}
