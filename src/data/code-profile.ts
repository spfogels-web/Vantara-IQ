import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { EMPTY_CODE_PROFILE, type CodeProfile } from "@/lib/unit-codes";

/**
 * This organisation's unit-code vocabulary, from this organisation's database.
 *
 * Read once per request: the rate card asks which codes price together, and the
 * material summary asks which to sort first — both of the same row.
 *
 * Presentation only. Which codes a daily sheet *offers* is not decided here —
 * that is the project's rate card narrowed to the scope in MAIN_BILLABLE_CODES,
 * and a profile that is missing or empty must never be able to take a code off
 * a sheet the customer will be invoiced for. See getBillableCodes.
 *
 * An organisation that has not set one gets the empty profile: no code is a
 * priority and nothing groups. Sorting falls back to plain order, which is
 * unhelpful but honest — the alternative is arranging their card by another
 * contractor's priorities and reading as if the software knows a business it
 * has never seen.
 */
export const getCodeProfile = cache(async (): Promise<CodeProfile> => {
  const row = await prisma.orgCodeProfile.findFirst().catch(() => null);
  if (!row) return EMPTY_CODE_PROFILE;

  // `families` is JSON, so it is whatever was written. Anything that is not a
  // map of string arrays is ignored rather than trusted into a price.
  const families: Record<string, string[]> = {};
  const raw = row.families as unknown;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [family, members] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(members) && members.every((m) => typeof m === "string")) {
        families[family] = members as string[];
      }
    }
  }

  return {
    priorityCodes: row.priorityCodes,
    families,
  };
});
