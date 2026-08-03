import { isAerialCode, isPriorityCode } from "@/lib/unit-codes";

/**
 * Job profiles — standing rules for customers whose paperwork always looks the
 * same.
 *
 * Windstream work coming through Globe arrives as a Uniti unit summary sheet
 * every single time, carrying the same underground code set. Making someone
 * review and approve those identically on every upload is busywork that will
 * eventually get skipped, and a step that gets skipped is worse than no step.
 *
 * So a profile can auto-approve the codes it recognises. It is deliberately
 * narrow: a row only auto-approves when its code is one this system already
 * classifies as underground *and* the extraction was confident. Anything
 * unrecognised, low-confidence, or aerial still waits for a human — the
 * profile removes repetition, not judgement.
 */

export interface ProfileMatchInput {
  /** The project's customer/client name. */
  client: string;
  /** Uploaded file name, e.g. USS_70415285800000.pdf. */
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

const WINDSTREAM_GLOBE: JobProfile = {
  id: "windstream-globe",
  label: "Windstream / Globe underground",
  autoApprove: true,
  autoTrack: true,
  minConfidence: 0.7,
  matches({ client, fileName, summary }) {
    const hay = `${client} ${fileName} ${summary ?? ""}`.toLowerCase();
    // Windstream's fiber business trades as Kinetic and the construction units
    // come from Uniti, so any of the three names the same paperwork.
    if (/windstream|kinetic|uniti/.test(hay)) return true;
    // Globe's unit summary sheets are named USS_<work order>.
    return /(^|[^a-z])uss[_-]?\d/i.test(fileName);
  },
  approves(row) {
    if (row.confidence < 0.7) return false;
    // Aerial units are real but out of scope for an underground crew — they
    // stay pending so someone consciously decides to bill them.
    if (isAerialCode(row.code)) return false;
    return isPriorityCode(row.code);
  },
};

const PROFILES: JobProfile[] = [WINDSTREAM_GLOBE];

export function findJobProfile(input: ProfileMatchInput): JobProfile | null {
  return PROFILES.find((p) => p.matches(input)) ?? null;
}
