import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * What this organisation is called, how it bills, and what it may do.
 *
 * Read once per request. `cache` is React's per-request memo, so the twenty
 * screens and PDFs that each want the company's name share one query and a
 * setting changed between requests still takes effect on the next one.
 *
 * ## When there is no row
 *
 * A database whose settings have never been written is an organisation nobody
 * has finished creating. That is not a reason to guess, and it is emphatically
 * not a reason to reach for the values the first contractor happened to use —
 * printing one company's payment terms on another's invoice is the whole
 * failure this table exists to prevent.
 *
 * So the fallback names nothing and permits nothing: no assistant, no texting,
 * and a company name that reads as unset rather than as somebody else. The
 * screens stay up, the outside world stays untouched, and the missing row is
 * visible on the first page anyone opens.
 */

export type OrgSettingsView = {
  legalName: string;
  shortName: string;
  isDemo: boolean;
  /** Already accounts for `isDemo`. Nothing else should re-derive this. */
  smsAllowed: boolean;
  assistantEnabled: boolean;
  /**
   * Whether this organisation may call a model at all — the assistant, rate
   * extraction, map reading, daily import.
   *
   * Already accounts for `isDemo`. A demonstration organisation makes no
   * outbound calls of any kind: a model request carries its data to somebody
   * else's computer, which is the thing a demo tenant must never do, and
   * Phase One has no AI in it regardless.
   */
  aiAllowed: boolean;
  customerTerms: string;
  subTerms: string;
  retainagePct: number;
  locateProvider: string;
  defaultState: string;
  /** The number a crew is told to ring. Empty when unset. */
  supportPhone: string;
  /** False when no settings row exists, so callers can say so plainly. */
  configured: boolean;
};

/** Permits nothing, claims to be nobody. See the note above. */
const UNCONFIGURED: OrgSettingsView = {
  legalName: "",
  shortName: "",
  isDemo: false,
  smsAllowed: false,
  assistantEnabled: false,
  aiAllowed: false,
  customerTerms: "",
  subTerms: "",
  retainagePct: 0,
  locateProvider: "",
  defaultState: "",
  supportPhone: "",
  configured: false,
};

export const orgSettings = cache(async (): Promise<OrgSettingsView> => {
  const row = await prisma.orgSettings.findFirst().catch(() => null);
  if (!row) return UNCONFIGURED;

  return {
    legalName: row.legalName,
    shortName: row.shortName,
    isDemo: row.isDemo,
    // The one place the two switches are combined, so no caller can get it
    // wrong by checking only one of them.
    smsAllowed: row.smsEnabled && !row.isDemo,
    assistantEnabled: row.assistantEnabled,
    aiAllowed: row.assistantEnabled && !row.isDemo,
    customerTerms: row.customerTerms,
    subTerms: row.subTerms,
    retainagePct: row.retainagePct,
    locateProvider: row.locateProvider,
    defaultState: row.defaultState,
    supportPhone: row.supportPhone,
    configured: true,
  };
});

/**
 * The name to print on this organisation's paperwork.
 *
 * `fallback` is for the handful of places that would otherwise render an empty
 * string into a document — a product name, never another company's name.
 */
export async function orgName(fallback = "Vantara IQ"): Promise<string> {
  const s = await orgSettings();
  return s.legalName.trim() || fallback;
}

/** The short form, for buttons and column headings. */
export async function orgShortName(fallback = "the office"): Promise<string> {
  const s = await orgSettings();
  return s.shortName.trim() || s.legalName.trim() || fallback;
}
