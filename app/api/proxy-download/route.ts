
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOAuth2Client } from '@/lib/drive';

export async function GET(req: NextRequest) {
  // 1. Security Check
  const session = await getSession();
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 2. Parse Query
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('fileId');
  // Optimization: Accept metadata from client to skip an API round-trip
  const clientFilename = searchParams.get('filename');
  const clientMimeType = searchParams.get('contentType');

  if (!fileId) {
    return new NextResponse('Missing fileId', { status: 400 });
  }

  try {
    const drive = getOAuth2Client();

    let filename = clientFilename;
    let mimeType = clientMimeType;
    let size = undefined;

    // Only fetch metadata if client didn't provide it (Backward compatibility or direct link usage)
    if (!filename) {
        const meta = await drive.files.get({
            fileId: fileId,
            fields: 'name, mimeType, size'
        });
        filename = meta.data.name;
        mimeType = meta.data.mimeType;
        size = meta.data.size;
    }

    // 3. Get File Stream
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // 4. Create Response
    const headers = new Headers();
    headers.set('Content-Type', mimeType || 'application/octet-stream');
    
    // Force download with correct filename
    const encodedFilename = encodeURIComponent(filename || 'download');
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    
    if (size) {
        headers.set('Content-Length', String(size));
    }

    // Convert Node stream to Web stream for Next.js
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
    return new NextResponse(`Download Failed: ${error.message}`, { status: 500 });
  }
}
