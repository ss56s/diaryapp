
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
  const inline = searchParams.get('inline'); // New param to control Content-Disposition

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
    const mimeType = meta.data.mimeType || 'application/octet-stream';
    headers.set('Content-Type', mimeType);
    
    // Add Cache-Control for images to improve performance and reduce API calls
    if (mimeType.startsWith('image/')) {
        headers.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');
    }

    const filename = encodeURIComponent(meta.data.name || 'download');

    // Handle Inline vs Attachment
    if (inline === 'true') {
        headers.set('Content-Disposition', 'inline');
    } else {
        headers.set('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    }
    
    if (meta.data.size) {
        headers.set('Content-Length', meta.data.size);
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
