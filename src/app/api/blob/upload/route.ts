import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Client-direct upload endpoint. The browser uploads the file straight to
// Vercel Blob (bypassing the ~4.5 MB serverless request-body limit), and this
// route only mints the short-lived upload token. Requires BLOB_READ_WRITE_TOKEN.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/webp",
          "image/gif",
          "image/heic",
          "application/pdf",
        ],
        maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB — plenty for large map PDFs
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // No-op: the client saves the returned URL via saveProjectMapUrl.
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Blob storage is not configured." },
      { status: 400 },
    );
  }
}
