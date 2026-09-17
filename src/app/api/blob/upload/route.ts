import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getCurrentUser, getSession, isStaff } from "@/lib/auth";
import { assertOwnSubcontractor, assertProjectAccess } from "@/lib/authz";

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

/**
 * Where a signed-in user is allowed to write, and who is allowed to write there.
 *
 * Until now `onBeforeGenerateToken` ignored the pathname entirely and handed
 * back a fixed policy, so any signed-in account — a crew foreman included —
 * could mint a 500 MB write credential for *any* path in the store. Because
 * `addRandomSuffix` is on, that could not overwrite an existing object; what it
 * could do is fill the store at our expense and host arbitrary public files on
 * our own domain, with no record of who put them there.
 *
 * The scope kinds:
 *
 *   `project`  the second segment is a project id, checked against the crews
 *              assigned to that job. This is the one that matters — it is the
 *              difference between "a signed-in user" and "somebody on this job".
 *   `subOwn`   a subcontractor's own document folder, checked against the
 *              company the uploader belongs to.
 *   `staff`    office-only surfaces: the company logo, the shared document
 *              inbox.
 *   `member`   any signed-in user. Used where the uploaded file is inert until
 *              an authorised server action attaches it to a record — the write
 *              itself grants nothing. Tightening these to the owning ticket,
 *              task or thread needs entity lookups that belong with the tenant
 *              work, and is noted in the migration plan rather than guessed at
 *              here.
 */
const SCOPES: { prefix: string; kind: "project" | "subOwn" | "staff" | "member" }[] = [
  { prefix: "project-maps/", kind: "project" },
  { prefix: "project-photos/", kind: "project" },
  { prefix: "project-covers/", kind: "project" },
  { prefix: "map-markup/", kind: "project" },
  { prefix: "material-lists/", kind: "project" },
  { prefix: "daily-photos/", kind: "project" },
  // Longest prefix first: a sub's own folder is a sub-path of the shared inbox,
  // and matching the shared one first would send every crew upload to a staff
  // check it cannot pass.
  { prefix: "documents/original_upload/", kind: "subOwn" },
  { prefix: "branding/", kind: "staff" },
  { prefix: "dailies/imported/", kind: "member" },
  { prefix: "locates/", kind: "member" },
  { prefix: "task-photos/", kind: "member" },
  { prefix: "messages/", kind: "member" },
];

class UploadDenied extends Error {}

/**
 * Decide whether this user may write to this exact pathname.
 *
 * Throws `UploadDenied` rather than returning a flag, so a path that matches
 * nothing fails closed — a new upload surface has to be named here before it
 * works, which is the point.
 */
async function authorizePath(pathname: string): Promise<void> {
  // Nothing clever: no traversal, no absolute paths, no empty segments. The
  // store is flat and key-addressed, but a "../" that survives into a key makes
  // every prefix rule below meaningless.
  if (
    !pathname ||
    pathname.startsWith("/") ||
    pathname.includes("..") ||
    pathname.includes("//") ||
    pathname.includes("\\")
  ) {
    throw new UploadDenied("That upload path isn't allowed.");
  }

  const scope = SCOPES.find((s) => pathname.startsWith(s.prefix));
  if (!scope) throw new UploadDenied("That upload path isn't allowed.");

  const rest = pathname.slice(scope.prefix.length);
  const firstSegment = rest.split("/")[0] ?? "";

  if (scope.kind === "project") {
    // `assertProjectAccess` returns early for staff and checks the crew's
    // assignments otherwise, which is exactly the rule the rest of the app
    // uses for everything hanging off a project.
    if (!firstSegment || !rest.includes("/")) {
      throw new UploadDenied("That upload path isn't allowed.");
    }
    await assertProjectAccess(firstSegment);
    return;
  }

  if (scope.kind === "subOwn") {
    const me = await getCurrentUser();
    if (!me) throw new UploadDenied("Sign in to upload files.");
    // Staff use the shared inbox with no company segment; a crew must name
    // their own company and is checked against it.
    if (isStaff(me.role)) return;
    if (!firstSegment || !rest.includes("/")) {
      throw new UploadDenied("That upload path isn't allowed.");
    }
    await assertOwnSubcontractor(firstSegment);
    return;
  }

  if (scope.kind === "staff") {
    const me = await getCurrentUser();
    if (!me || !isStaff(me.role)) throw new UploadDenied("That upload path isn't allowed.");
    return;
  }

  // `member` — the session check at the call site is the whole gate.
}

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
      onBeforeGenerateToken: async (pathname) => {
        await authorizePath(pathname);
        const me = await getCurrentUser();
        return {
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
          // Comes back on the completion callback. Without it there is no
          // record anywhere of who put a file in the store.
          tokenPayload: JSON.stringify({ userId: me?.id ?? null, pathname }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // The client saves the returned URL via its own server action. This
        // only leaves a trail, and must not throw: Vercel retries a failed
        // callback and a thrown error here would strand a finished upload.
        try {
          const who = tokenPayload ? (JSON.parse(tokenPayload) as { userId?: string }) : null;
          console.info(`[blob] ${blob.pathname} uploaded by ${who?.userId ?? "unknown"}`);
        } catch {
          /* the upload succeeded either way */
        }
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    if (error instanceof UploadDenied) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // A denied path can also surface as the authz layer's own error.
    const message = (error as Error).message || "Blob storage is not configured.";
    if ((error as Error).name === "NotAuthorizedError") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
