"use client";

import * as React from "react";

import { orgBlobPrefix } from "@/lib/blob-paths";

/**
 * Which organisation the screens on this page belong to.
 *
 * Needed on the client for exactly one thing: an upload has to say which
 * organisation's folder it is going into, and the browser is what builds that
 * path. Everything else about the organisation is decided on the server and
 * never travels.
 *
 * Carrying the id here is not a disclosure — it is the name of the workspace
 * the user is already looking at — and it is not authority either. The upload
 * route checks the path against the organisation on the *request* and refuses
 * anything else, so a browser that lies about this gets a 403 rather than
 * somebody else's folder.
 */

const OrgContext = React.createContext<string | null>(null);

export function OrgProvider({
  orgId,
  children,
}: {
  orgId: string | null;
  children: React.ReactNode;
}) {
  return <OrgContext.Provider value={orgId}>{children}</OrgContext.Provider>;
}

export function useOrgId(): string | null {
  return React.useContext(OrgContext);
}

/**
 * `upload` from `@vercel/blob/client`, with this organisation's folder in
 * front of the path.
 *
 * Returned as a function with the same shape as the one it replaces, so a call
 * site changes by one line at the top of the component and not at all where
 * the upload happens.
 */
export function useBlobUpload() {
  const orgId = useOrgId();

  return React.useCallback(
    async (
      pathname: string,
      file: Blob | File,
      options: Parameters<typeof import("@vercel/blob/client").upload>[2],
    ) => {
      const { upload } = await import("@vercel/blob/client");
      if (!orgId) {
        // No organisation means no session, and every upload surface sits
        // behind one. Refusing here is clearer than sending a path the server
        // is going to reject anyway.
        throw new Error("Not signed in to an organisation, so there is nowhere to put this file.");
      }
      return upload(orgBlobPrefix(orgId) + pathname, file, options);
    },
    [orgId],
  );
}
