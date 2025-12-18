
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAccessToken } from '@/lib/drive';

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
    // 3. Get raw access token for direct fetch
    // Using native fetch instead of googleapis library avoids double-buffering 
    // and stream serialization overhead in Node.js/Edge runtime.
    const accessToken = await getAccessToken();
    if (!accessToken) {
        throw new Error("Failed to obtain access token");
    }

    // 4. Direct Fetch from Google API
    // We request the 'media' alt directly.
    const googleRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!googleRes.ok) {
        const errorText = await googleRes.text();
        console.error("Upstream error:", googleRes.status, errorText);
        throw new Error(`Google Drive API error: ${googleRes.status}`);
    }

    // 5. Pipe the upstream stream directly to the client
    // This allows the runtime (Node/Edge) to handle piping at a lower level (C++),
    // which is significantly faster (MB/s) than JS-based piping (KB/s).
    const headers = new Headers();
    headers.set('Content-Type', clientMimeType || googleRes.headers.get('Content-Type') || 'application/octet-stream');
    
    // Check upstream length if available
    const contentLength = googleRes.headers.get('Content-Length');
    if (contentLength) {
        headers.set('Content-Length', contentLength);
    }
    
    // Force download with correct filename
    const encodedFilename = encodeURIComponent(clientFilename || 'download');
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);

    return new NextResponse(googleRes.body, { headers });

  } catch (error: any) {
    console.error('Proxy Download Error:', error);
    return new NextResponse(`Download Failed: ${error.message}`, { status: 500 });
  }
}
