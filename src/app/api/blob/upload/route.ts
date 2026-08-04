import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// Client-direct upload endpoint. The browser uploads the file straight to
// Vercel Blob (bypassing the ~4.5 MB serverless request-body limit), and this
// route only mints the short-lived upload token. Requires BLOB_READ_WRITE_TOKEN.
//
// Two different callers hit this endpoint, and they authenticate differently:
//
//   1. The browser, asking for an upload token. That must be a signed-in user —
//      otherwise this route hands anyone on the internet a 500 MB write
//      credential for a public-read store, served from our own domain.
//
//   2. Vercel itself, calling back server-to-server once an upload finishes.
//      That request carries no session cookie and never can. It is authenticated
//      instead by a signature over the body, which handleUpload verifies against
//      BLOB_READ_WRITE_TOKEN — so requiring a session here would reject a
//      legitimate callback and strand every completed upload.
//
// Hence the session check is scoped to the token request rather than the route.
export async function POST(request: Request): Promise<NextResponse> {
  // Say which thing is missing. The generic "upload failed" that this used to
  // produce sends you looking at the file, the size, the network — anywhere
  // but the one env var that is actually absent.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN isn't set in this environment. Connect a Blob store to the project in Vercel → Storage, then redeploy; locally, put the token in .env and restart the dev server.",
      },
      { status: 501 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  if (body.type === "blob.generate-client-token") {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
    }
  }

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
