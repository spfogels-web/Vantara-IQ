"use client";

import * as React from "react";

import { orgBlobPrefix } from "@/lib/blob-paths";
import { labelOf, type Market } from "@/lib/markets";
import { EMPTY_CODE_PROFILE, type CodeProfile } from "@/lib/unit-codes";

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

type OrgValue = {
  orgId: string | null;
  /**
   * This organisation's markets.
   *
   * Carried here rather than passed down because the pickers that need them —
   * the project form, the market filter, the rate-sheet uploader, two rate
   * cards — sit five and six levels deep behind client components that have no
   * other reason to know about markets. Threading a prop through all of them
   * would put "which markets exist" into the signature of half the component
   * tree, and every one of those signatures would be a place to forget it.
   *
   * Always this organisation's own, because the layout that fills it runs per
   * request and reads the request's own database.
   */
  markets: Market[];
  /** This organisation's code vocabulary, for the rate card's ordering. */
  codes: CodeProfile;
  /**
   * What this organisation is called, for the screens that address a crew on
   * its behalf — "approved by", "send to", "reviews every document".
   *
   * Roughly a hundred of those said one contractor's name outright. Under any
   * other organisation they were simply wrong: the crew is not waiting on
   * Fortitude, and Fortitude is not paying them.
   */
  name: string;
  shortName: string;
  /** The mark this organisation has uploaded, if any. */
  logoUrl: string | null;
};

const OrgContext = React.createContext<OrgValue>({
  orgId: null,
  markets: [],
  codes: EMPTY_CODE_PROFILE,
  name: "",
  shortName: "",
  logoUrl: null,
});

export function OrgProvider({
  orgId,
  markets,
  codes,
  name,
  shortName,
  logoUrl,
  children,
}: {
  orgId: string | null;
  markets: Market[];
  codes: CodeProfile;
  name: string;
  shortName: string;
  logoUrl: string | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ orgId, markets, codes, name, shortName, logoUrl }),
    [orgId, markets, codes, name, shortName, logoUrl],
  );
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgId(): string | null {
  return React.useContext(OrgContext).orgId;
}

/**
 * What to call this organisation on screen.
 *
 * Falls back to "the office" rather than to a company name. A crew reading
 * "waiting on the office" is told the truth; a crew reading the wrong
 * contractor's name is told something false about who owes them money.
 */
export function useOrgName(fallback = "the office"): string {
  const { name } = React.useContext(OrgContext);
  return name.trim() || fallback;
}

/** The mark this organisation has uploaded, if any. */
export function useOrgLogo(): string | null {
  return React.useContext(OrgContext).logoUrl;
}

/** The short form, for buttons and inline mentions. */
export function useOrgShortName(fallback = "the office"): string {
  const { shortName, name } = React.useContext(OrgContext);
  return shortName.trim() || name.trim() || fallback;
}

/** This organisation's code vocabulary. Empty when it has not set one. */
export function useCodeProfile(): CodeProfile {
  return React.useContext(OrgContext).codes;
}

/** This organisation's markets. Empty when it has not said where it works. */
export function useMarkets(): Market[] {
  return React.useContext(OrgContext).markets;
}

/** The label for a market id, or empty. */
export function useMarketLabel(): (id: string | null | undefined) => string {
  const markets = useMarkets();
  return React.useCallback((id) => labelOf(markets, id), [markets]);
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
