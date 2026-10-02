/**
 * What an incident is, and the two or three rules about it that must not be
 * restated anywhere else.
 *
 * The numbering, the definition of a safety incident and the definition of a
 * clean streak all live here because each of them is a claim the company makes
 * to somebody outside it — a crew, a customer, a utility owner, an insurer —
 * and a claim made in two places eventually gets made two different ways.
 */

import { table } from "@/lib/db-schema";

export type IncidentTypeValue =
  | "UTILITY_STRIKE"
  | "PROPERTY_DAMAGE"
  | "SAFETY"
  | "NEAR_MISS"
  | "VEHICLE"
  | "ENVIRONMENTAL"
  | "OTHER";

export type IncidentSeverityValue = "MINOR" | "MODERATE" | "SERIOUS" | "CRITICAL";

export type IncidentStatusValue =
  | "REPORTED"
  | "UNDER_REVIEW"
  | "REPAIR_IN_PROGRESS"
  | "REPAIRED"
  | "RESOLVED"
  | "CLOSED"
  | "VOID";

export const INCIDENT_TYPES: IncidentTypeValue[] = [
  "UTILITY_STRIKE",
  "PROPERTY_DAMAGE",
  "SAFETY",
  "NEAR_MISS",
  "VEHICLE",
  "ENVIRONMENTAL",
  "OTHER",
];

export const INCIDENT_TYPE_LABEL: Record<IncidentTypeValue, string> = {
  UTILITY_STRIKE: "Utility strike",
  PROPERTY_DAMAGE: "Property damage",
  SAFETY: "Safety / injury",
  NEAR_MISS: "Near miss",
  VEHICLE: "Vehicle",
  ENVIRONMENTAL: "Environmental",
  OTHER: "Other",
};

/** What a crew sees on the phone, in the words they would use. */
export const INCIDENT_TYPE_HINT: Record<IncidentTypeValue, string> = {
  UTILITY_STRIKE: "A line was hit — gas, fiber, water, electric",
  PROPERTY_DAMAGE: "Driveway, lawn, irrigation, fence, mailbox",
  SAFETY: "Somebody was hurt or made ill",
  NEAR_MISS: "Nearly went wrong. Nobody hurt, nothing damaged",
  VEHICLE: "A truck or machine was in a collision",
  ENVIRONMENTAL: "A spill or a release",
  OTHER: "Something else worth a record",
};

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverityValue, string> = {
  MINOR: "Minor",
  MODERATE: "Moderate",
  SERIOUS: "Serious",
  CRITICAL: "Critical",
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatusValue, string> = {
  REPORTED: "Reported",
  UNDER_REVIEW: "Under review",
  REPAIR_IN_PROGRESS: "Repair in progress",
  REPAIRED: "Repaired",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  VOID: "Void",
};

/**
 * Status colour, from the reserved status tokens.
 *
 * Not the chart ramp. These are states, and green/amber/red mean here what they
 * mean everywhere else in the product.
 */
export const INCIDENT_STATUS_TONE: Record<IncidentStatusValue, string> = {
  REPORTED: "critical",
  UNDER_REVIEW: "warning",
  REPAIR_IN_PROGRESS: "warning",
  REPAIRED: "info",
  RESOLVED: "success",
  CLOSED: "neutral",
  VOID: "neutral",
};

/** Statuses that still want a person. */
export const OPEN_INCIDENT_STATUSES: IncidentStatusValue[] = [
  "REPORTED",
  "UNDER_REVIEW",
  "REPAIR_IN_PROGRESS",
  "REPAIRED",
];

export function isOpenStatus(status: IncidentStatusValue): boolean {
  return OPEN_INCIDENT_STATUSES.includes(status);
}

// ── the safety definition ───────────────────────────────────────────────────

/**
 * The incident types that are, in themselves, safety incidents.
 *
 * Only SAFETY. Everything else qualifies through the `injury` flag instead,
 * which is the point of keeping the two separate: a gas strike that put
 * somebody in hospital is a safety incident, and a gas strike that frightened
 * everybody and damaged a main is not.
 */
export const SAFETY_INCIDENT_TYPES: IncidentTypeValue[] = ["SAFETY"];

/**
 * Whether an incident counts toward the company's safety record.
 *
 * Deliberately narrow, and deliberately excludes NEAR_MISS even when somebody
 * files one with a fright. A company whose published streak resets because a
 * crew reported a near miss has taught that crew, once, not to report the next
 * one — and the near misses are the cheapest information about safety anybody
 * ever gets.
 *
 * VOID never counts. A report filed in error is not a safety event, and the
 * record of the mistake stays on the incident's own timeline rather than in the
 * company's figures.
 */
export function isQualifyingSafetyIncident(incident: {
  type: IncidentTypeValue;
  injury: boolean;
  status: IncidentStatusValue;
}): boolean {
  if (incident.status === "VOID") return false;
  return SAFETY_INCIDENT_TYPES.includes(incident.type) || incident.injury === true;
}

/**
 * How long the company has gone without a qualifying safety incident.
 *
 * Measured from `occurredAt`, never from when the report was filed. A daily
 * filed three weeks late must not be able to flatter the streak, and an
 * incident filed promptly must not shorten it by more than it should.
 *
 * The honest answers are three, not one:
 *
 *   `since`     there is a qualifying incident, and this is the whole days
 *               since it happened.
 *   `none`      there are records, and none of them qualify. The streak is
 *               bounded by how far back the records go — saying "412 days"
 *               when the system has held data for thirty is a claim about a
 *               period nobody was watching.
 *   `unknown`   there is nothing to measure from at all.
 *
 * Returning a discriminated union rather than `number | null` because the
 * caller has to render three genuinely different sentences, and a null would
 * let one of them quietly become a zero.
 */
export type SafetyStreak =
  | { kind: "since"; days: number; occurredAt: Date; incidentNumber: string }
  | { kind: "none"; recordStart: Date; days: number }
  | { kind: "unknown" };

export function safetyStreak(input: {
  latestQualifying: { occurredAt: Date; number: string } | null;
  /** The earliest date the records themselves begin. */
  recordStart: Date | null;
  now?: Date;
}): SafetyStreak {
  const now = input.now ?? new Date();

  if (input.latestQualifying) {
    return {
      kind: "since",
      days: wholeDaysBetween(input.latestQualifying.occurredAt, now),
      occurredAt: input.latestQualifying.occurredAt,
      incidentNumber: input.latestQualifying.number,
    };
  }

  if (input.recordStart) {
    return {
      kind: "none",
      recordStart: input.recordStart,
      // Bounded by the record, so this is "nothing in the N days we have been
      // keeping records", which is a true statement, rather than a streak.
      days: wholeDaysBetween(input.recordStart, now),
    };
  }

  return { kind: "unknown" };
}

/** Whole days from a to b, never negative. */
export function wholeDaysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

// ── numbering ───────────────────────────────────────────────────────────────

/** The first number issued to any organisation. */
export const FIRST_INCIDENT_SEQ = 1000;

/** INC-1000. Zero-padded only insofar as the sequence starts at four digits. */
export function formatIncidentNumber(seq: number): string {
  return `INC-${seq}`;
}

/**
 * Take the next incident number for an organisation.
 *
 * Must be called inside a transaction, with the client for that transaction —
 * the lock the UPDATE takes is what makes this safe, and a lock is only held
 * for the life of its transaction.
 *
 * Two statements:
 *
 *   The INSERT creates the counter the first time anybody reports an incident
 *   in this organisation, at one below the first number. ON CONFLICT DO NOTHING
 *   so a second concurrent reporter does not fail on it.
 *
 *   The UPDATE increments and returns in one statement, which takes a row lock.
 *   A second transaction reaching it waits, then reads the already-incremented
 *   value — so two crews reporting a strike in the same minute get 1000 and
 *   1001, never 1000 twice.
 *
 * A transaction that rolls back releases the lock and gives the value back. The
 * next reporter takes it. That is correct: no incident was created, so no
 * number was consumed. What must never happen is two *existing* incidents
 * sharing a number, and the unique index on (organizationId, seq) is the
 * backstop for that.
 */
export async function nextIncidentNumber(
  tx: {
    $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
    $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  },
  organizationId: string,
): Promise<{ seq: number; number: string }> {
  /**
   * Schema-qualified, because raw SQL that is not resolves through
   * `search_path` — and a pooled Neon connection does not reliably keep the
   * one it opened with. That was a real outage on 16 September, not a
   * theoretical risk: two unqualified raw queries answered
   * `relation "Project" does not exist` in production while every model query
   * on the same request succeeded. An unqualified counter would have failed
   * the same way, on the first incident anybody reported from a cold lambda.
   */
  const counter = table("Counter");

  await tx.$executeRawUnsafe(
    `INSERT INTO ${counter} ("organizationId", "name", "value")
     VALUES ($1, 'incident', $2)
     ON CONFLICT ("organizationId", "name") DO NOTHING`,
    organizationId,
    FIRST_INCIDENT_SEQ - 1,
  );

  const rows = await tx.$queryRawUnsafe<{ value: number }[]>(
    `UPDATE ${counter}
        SET "value" = "value" + 1
      WHERE "organizationId" = $1 AND "name" = 'incident'
      RETURNING "value"`,
    organizationId,
  );

  const value = rows?.[0]?.value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    // Loudly, rather than numbering the incident zero. A missing counter row
    // means the INSERT above did not run, which means something is wrong with
    // the transaction rather than with this incident.
    throw new Error(`Could not take an incident number for organisation "${organizationId}"`);
  }

  return { seq: value, number: formatIncidentNumber(value) };
}
