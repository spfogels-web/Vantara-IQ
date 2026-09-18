import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { EMPTY_CODE_PROFILE, type CodeProfile } from "@/lib/unit-codes";

/**
 * This organisation's unit-code vocabulary, from this organisation's database.
 *
 * Read once per request: the daily sheet asks which codes to offer, the rate
 * card asks which price together, and the material summary asks which to sort
 * first — all of the same row.
 *
 * An organisation that has not set one gets the empty profile: no code is a
 * priority, nothing groups, and the daily sheet offers nothing. That is not a
 * pleasant blank screen, but the alternative is offering another contractor's
 * code list, which prices work they do not do and reads as if the software
 * knows their business when it does not.
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
    billableCodes: row.billableCodes,
    families,
  };
});
