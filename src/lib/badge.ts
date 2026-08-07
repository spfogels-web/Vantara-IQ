/**
 * Yard badges — who is cleared to collect material.
 *
 * The yard's question is narrow: is the person in front of me the person on the
 * list. So a badge needs a photo ID that can be held up against a face, and a
 * second document that proves the name on it. Nothing more is asked for, and
 * nothing more should be kept.
 */

export type BadgeDocKind = "LICENSE_FRONT" | "LICENSE_BACK" | "SSN_CARD" | "PASSPORT";

export interface BadgeDocSpec {
  kind: BadgeDocKind;
  label: string;
  hint: string;
}

/** Both sides of the licence. The back carries the endorsements and the barcode. */
export const LICENSE_DOCS: BadgeDocSpec[] = [
  { kind: "LICENSE_FRONT", label: "Driver's licence — front", hint: "Photo side, all four corners in frame" },
  { kind: "LICENSE_BACK", label: "Driver's licence — back", hint: "The barcode side" },
];

/** One of these, not both — either proves the name. */
export const IDENTITY_DOCS: BadgeDocSpec[] = [
  { kind: "SSN_CARD", label: "Social Security card", hint: "Or a passport instead" },
  { kind: "PASSPORT", label: "Passport", hint: "Photo page. Or a Social Security card instead" },
];

export const ALL_BADGE_DOCS = [...LICENSE_DOCS, ...IDENTITY_DOCS];

export function badgeDocLabel(kind: string): string {
  return ALL_BADGE_DOCS.find((d) => d.kind === kind)?.label ?? kind;
}

export interface BadgeReadiness {
  hasLicenseFront: boolean;
  hasLicenseBack: boolean;
  /** A Social Security card *or* a passport satisfies this. */
  hasIdentity: boolean;
  /** Everything the yard needs is on file. */
  complete: boolean;
  /** What is still outstanding, in words a crew can act on. */
  missing: string[];
  /** Licence expiry has passed. A badge behind an expired licence is not valid. */
  expired: boolean;
  /** Inside 30 days of expiry — time to chase it before it lapses. */
  expiringSoon: boolean;
}

/**
 * Whether a badge is ready to be looked at.
 *
 * Deliberately does not decide approval. Somebody at Fortitude looks at the
 * face on the licence and says yes; this only reports whether there is enough
 * on file for that to be possible.
 */
export function badgeReadiness(
  docs: { kind: string }[],
  licenseExpires: string,
  today = new Date(),
): BadgeReadiness {
  const has = (k: BadgeDocKind) => docs.some((d) => d.kind === k);

  const hasLicenseFront = has("LICENSE_FRONT");
  const hasLicenseBack = has("LICENSE_BACK");
  const hasIdentity = has("SSN_CARD") || has("PASSPORT");

  const missing: string[] = [];
  if (!hasLicenseFront) missing.push("Front of driver's licence");
  if (!hasLicenseBack) missing.push("Back of driver's licence");
  if (!hasIdentity) missing.push("Social Security card or passport");

  // Expiry is optional to record; absent means unknown, never expired.
  let expired = false;
  let expiringSoon = false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(licenseExpires.trim());
  if (m) {
    const exp = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const now = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const days = Math.round((exp.getTime() - now.getTime()) / 86_400_000);
    expired = days < 0;
    expiringSoon = days >= 0 && days <= 30;
    if (expired) missing.push("Driver's licence has expired");
  }

  return {
    hasLicenseFront,
    hasLicenseBack,
    hasIdentity,
    complete: hasLicenseFront && hasLicenseBack && hasIdentity && !expired,
    missing,
    expired,
    expiringSoon,
  };
}

/** What the yard should see at a glance. */
export function badgeStatusLabel(status: string, r: BadgeReadiness): { label: string; tone: string } {
  if (status === "APPROVED" && r.expired) return { label: "Licence expired", tone: "critical" };
  switch (status) {
    case "APPROVED":
      return r.expiringSoon
        ? { label: "Cleared — licence expiring", tone: "warning" }
        : { label: "Cleared for pickup", tone: "success" };
    case "SUBMITTED":
      return { label: "Waiting on Fortitude", tone: "info" };
    case "REJECTED":
      return { label: "Not accepted", tone: "critical" };
    case "REVOKED":
      return { label: "Revoked", tone: "critical" };
    default:
      return r.complete
        ? { label: "Ready to submit", tone: "info" }
        : { label: "Incomplete", tone: "muted" };
  }
}
