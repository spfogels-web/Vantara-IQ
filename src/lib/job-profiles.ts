import { isAerialCode, isPriorityCode, type CodeProfile } from "@/lib/unit-codes";
import type { Market } from "@/lib/markets";

/**
 * Standing rules for customers whose paperwork always looks the same.
 *
 * Work coming through a regular prime arrives as the same shape of unit
 * summary every single time, carrying the same code set. Making someone review
 * and approve those identically on every upload is busywork that will
 * eventually get skipped, and a step that gets skipped is worse than no step.
 *
 * So a profile can auto-approve the codes it recognises. It is deliberately
 * narrow: a row only auto-approves when its code is one this organisation
 * bills *and* the extraction was confident. Anything unrecognised,
 * low-confidence, or aerial still waits for a human — the profile removes
 * repetition, not judgement.
 *
 * ## Why this is built rather than listed
 *
 * There was one profile here and it was written out by name: Windstream,
 * Kinetic, Uniti, Globe, and Globe's "USS_" file naming. Those are one
 * contractor's customers. Under any other organisation the rule still ran —
 * matching their uploads against somebody else's primes, and auto-approving
 * rows against somebody else's code list.
 *
 * A profile is now derived from what the organisation has already told us: the
 * primes it bills through and the customer names that point at each market.
 * Same behaviour for the organisation that had it, nothing at all for one that
 * has named no markets.
 */

export interface ProfileMatchInput {
  /** The project's customer/client name. */
  client: string;
  /** Uploaded file name. */
  fileName: string;
  /** The extraction's own summary line, if any. */
  summary?: string;
}

export interface JobProfile {
  id: string;
  label: string;
  /** Auto-approve recognised underground codes on upload. */
  autoApprove: boolean;
  /** Push those approved codes straight onto the project's tracked material. */
  autoTrack: boolean;
  /** Confidence floor for auto-approval. */
  minConfidence: number;
  matches(input: ProfileMatchInput): boolean;
  /** Whether this specific row qualifies for hands-off approval. */
  approves(row: { code: string; confidence: number }): boolean;
}

const MIN_CONFIDENCE = 0.7;

/** One profile per market, matching that market's prime and customer names. */
export function buildJobProfiles(markets: Market[], codes: CodeProfile): JobProfile[] {
  return markets.map((market) => {
    // The prime, plus whatever customer names the organisation has said point
    // at this market. Short or empty names are dropped: a one-letter needle
    // matches every upload anybody ever makes.
    const needles = [market.prime, ...market.customers]
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length >= 3);

    return {
      id: `market-${market.id}`,
      label: `${market.label} — ${market.prime}`,
      autoApprove: true,
      autoTrack: true,
      minConfidence: MIN_CONFIDENCE,

      matches({ client, fileName, summary }) {
        if (!needles.length) return false;
        const hay = `${client} ${fileName} ${summary ?? ""}`.toLowerCase();
        return needles.some((n) => hay.includes(n));
      },

      approves(row) {
        if (row.confidence < MIN_CONFIDENCE) return false;
        // Aerial units are real but out of scope for an underground crew — they
        // stay pending so someone consciously decides to bill them.
        if (isAerialCode(row.code)) return false;
        return isPriorityCode(codes, row.code);
      },
    };
  });
}

/** The first profile that recognises this upload, or none. */
export function findJobProfile(
  markets: Market[],
  codes: CodeProfile,
  input: ProfileMatchInput,
): JobProfile | null {
  return buildJobProfiles(markets, codes).find((p) => p.matches(input)) ?? null;
}
