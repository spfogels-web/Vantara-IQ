import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// Client-direct upload endpoint. The browser uploads the file straight to
// Vercel Blob (bypassing the ~4.5 MB serverless request-body limit), and this
// route only mints the short-lived upload token. Requires BLOB_READ_WRITE_TOKEN.
//
// The token is minted only for a signed-in user. Without that check this route
// hands anyone on the internet a 500 MB write credential for the store — and
// because the store is public-read, whatever they put there is served from a
// fortitude-infra URL. Every caller is behind login, so nothing legitimate is
// lost by requiring one.
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
  }

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
