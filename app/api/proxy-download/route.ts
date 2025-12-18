
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

  if (!fileId) {
    return new NextResponse('Missing fileId', { status: 400 });
  }

  try {
    const drive = getOAuth2Client();

    // 3. Get Metadata (Filename & MIME)
    const meta = await drive.files.get({
        fileId: fileId,
        fields: 'name, mimeType, size'
    });

    // 4. Get File Stream
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // 5. Create Response
    const headers = new Headers();
    headers.set('Content-Type', meta.data.mimeType || 'application/octet-stream');
    
    // Force download with correct filename
    const filename = encodeURIComponent(meta.data.name || 'download');
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    
    if (meta.data.size) {
        headers.set('Content-Length', meta.data.size);
    }

    // Convert Node stream to Web stream for Next.js
    const stream = response.data as any; // Cast because googleapis types vs web streams mismatch
    
    // Create a ReadableStream from the Node stream
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
