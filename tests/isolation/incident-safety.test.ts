/**
 * What the company is allowed to claim about its own safety record.
 *
 * Two figures on two screens asserted a clean record on no evidence: a
 * "Safety incidents" score hardcoded to 0 on every crew's scorecard, and
 * "145 days incident free" written into the dashboard footer. Both read as
 * facts on pages full of real ones.
 *
 * These hold the replacements. The definitions are the point — a safety metric
 * that is merely present is worse than none, because somebody will quote it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  isQualifyingSafetyIncident,
  safetyStreak,
  wholeDaysBetween,
  SAFETY_INCIDENT_TYPES,

} from "@/lib/incidents";

/**
 * Source with its comments removed.
 *
 * Every assertion below is about what the code does, and a comment explaining
 * what the code used to do contains the very string these tests ban. Without
 * this, the file that documents the fix fails the test for the fix — which is
 * exactly what happened the first time these were run.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const STATUS_BAR = codeOnly(readFileSync("src/components/dashboard/status-bar.tsx", "utf8"));
const SUBS_VIEW = codeOnly(readFileSync("src/components/subcontractors/subcontractors-view.tsx", "utf8"));
const QUERIES = codeOnly(readFileSync("src/data/queries.ts", "utf8"));
const ACTIONS = codeOnly(readFileSync("src/app/actions.ts", "utf8"));
const INCIDENT_ACTIONS = codeOnly(readFileSync("src/app/incidents/incident-actions.ts", "utf8"));
const MIDDLEWARE = codeOnly(readFileSync("src/middleware.ts", "utf8"));

const open = { status: "REPORTED" as const };

describe("which incidents count as safety incidents", () => {
  it("counts an incident filed as SAFETY", () => {
    expect(isQualifyingSafetyIncident({ type: "SAFETY", injury: false, ...open })).toBe(true);
  });

  it("counts anything that hurt somebody, whatever it was filed as", () => {
    // The case the separate `injury` flag exists for: a struck gas main that
    // put a man in hospital is a strike AND a safety incident.
    expect(isQualifyingSafetyIncident({ type: "UTILITY_STRIKE", injury: true, ...open })).toBe(true);
    expect(isQualifyingSafetyIncident({ type: "VEHICLE", injury: true, ...open })).toBe(true);
    expect(isQualifyingSafetyIncident({ type: "PROPERTY_DAMAGE", injury: true, ...open })).toBe(true);
  });

  it("does not count damage where nobody was hurt", () => {
    expect(isQualifyingSafetyIncident({ type: "UTILITY_STRIKE", injury: false, ...open })).toBe(false);
    expect(isQualifyingSafetyIncident({ type: "PROPERTY_DAMAGE", injury: false, ...open })).toBe(false);
    expect(isQualifyingSafetyIncident({ type: "ENVIRONMENTAL", injury: false, ...open })).toBe(false);
  });

  it("does not count a near miss, which is the whole point of near misses", () => {
    /**
     * A company whose published streak resets because a crew reported a near
     * miss has taught that crew, once, not to report the next one. The near
     * misses are the cheapest safety information anybody ever gets, and this
     * line is what keeps them cheap.
     */
    expect(isQualifyingSafetyIncident({ type: "NEAR_MISS", injury: false, ...open })).toBe(false);
  });

  it("counts a near miss that somehow hurt somebody, because then it was not one", () => {
    expect(isQualifyingSafetyIncident({ type: "NEAR_MISS", injury: true, ...open })).toBe(true);
  });

  it("never counts a voided report", () => {
    expect(isQualifyingSafetyIncident({ type: "SAFETY", injury: true, status: "VOID" })).toBe(false);
  });

  it("keeps the type list narrow, so widening it is a deliberate act", () => {
    expect(SAFETY_INCIDENT_TYPES).toEqual(["SAFETY"]);
  });

  it("asks the same question in SQL as it does in TypeScript", () => {
    // The KPI counts in the database and the predicate above must agree, or the
    // dashboard and the record disagree about the same incident.
    expect(QUERIES).toContain('status: { not: "VOID" }');
    expect(QUERIES).toContain("OR: [{ type: { in: SAFETY_INCIDENT_TYPES } }, { injury: true }]");
  });
});

describe("how long the company has gone without one", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("measures from when it happened, not when it was filed", () => {
    const streak = safetyStreak({
      latestQualifying: { occurredAt: new Date("2026-09-02T12:00:00Z"), number: "INC-1004" },
      recordStart: null,
      now,
    });
    expect(streak.kind).toBe("since");
    if (streak.kind === "since") {
      expect(streak.days).toBe(30);
      expect(streak.incidentNumber).toBe("INC-1004");
    }
  });

  it("does not claim a streak longer than the records", () => {
    /**
     * The failure the hardcoded 145 was: a number nobody could have known. With
     * no qualifying incident the honest statement is bounded by how long there
     * has been anything to look at.
     */
    const streak = safetyStreak({
      latestQualifying: null,
      recordStart: new Date("2026-09-02T12:00:00Z"),
      now,
    });
    expect(streak.kind).toBe("none");
    if (streak.kind === "none") expect(streak.days).toBe(30);
  });

  it("says it does not know, rather than saying zero", () => {
    const streak = safetyStreak({ latestQualifying: null, recordStart: null, now });
    expect(streak.kind).toBe("unknown");
    // A zero here would render as "0 days since a safety incident", which is a
    // statement that one happened today.
    expect(streak).not.toHaveProperty("days");
  });

  it("never goes negative on a clock skew", () => {
    const streak = safetyStreak({
      latestQualifying: { occurredAt: new Date("2026-10-03T12:00:00Z"), number: "INC-1" },
      recordStart: null,
      now,
    });
    if (streak.kind === "since") expect(streak.days).toBe(0);
    expect(wholeDaysBetween(new Date("2026-10-03"), new Date("2026-10-02"))).toBe(0);
  });
});

describe("the fabricated figures are gone", () => {
  it("does not hardcode a day count in the status bar", () => {
    expect(STATUS_BAR, "the invented 145 is back").not.toMatch(/>\s*145\s*</);
    expect(STATUS_BAR).not.toContain("days incident free");
    // It takes the figure instead of inventing one.
    expect(STATUS_BAR).toContain("safety: SafetyStreak");
  });

  it("renders all three honest states", () => {
    expect(STATUS_BAR).toContain("No safety incidents in");
    expect(STATUS_BAR).toContain("No incident history yet");
    expect(STATUS_BAR).toContain("since a safety incident");
  });

  it("does not report a crew's safety score as a green zero with no history", () => {
    expect(QUERIES, "safetyIncidents is hardcoded to 0 again").not.toMatch(
      /safetyIncidents:\s*0\b/,
    );
    expect(ACTIONS, "safetyIncidents is hardcoded to 0 again").not.toMatch(
      /safetyIncidents:\s*0\b/,
    );
    expect(SUBS_VIEW).toContain("no incident history");
  });
});

describe("an incident never moves anybody's money", () => {
  it("touches no billing model", () => {
    /**
     * The boundary the whole feature was specified around. An incident costs
     * money; what it costs is settled by people, in writing, later. A status
     * column moving must never move a figure on an invoice or a pay statement.
     */
    const banned: [string, RegExp][] = [
      ["invoice", /\btx\.invoice\b|\bprisma\.invoice\b/],
      ["subInvoice", /\btx\.subInvoice\b|\bprisma\.subInvoice\b/],
      ["daily", /\btx\.daily\b|\bprisma\.daily\b/],
      ["billingHold", /\btx\.billingHold\b|\bprisma\.billingHold\b/],
      ["projectRate", /\btx\.projectRate\b|\bprisma\.projectRate\b/],
      ["payment", /\btx\.payment\b|\bprisma\.payment\b/],
    ];
    for (const [name, pattern] of banned) {
      expect(INCIDENT_ACTIONS, `incident actions reach into ${name}`).not.toMatch(pattern);
    }
  });

  it("never requires a daily to exist", () => {
    expect(INCIDENT_ACTIONS).not.toContain("dailyId");
  });
});

describe("the employee boundary", () => {
  it("opens incidents to employees and nothing else", () => {
    const block = /const EMPLOYEE_ALLOWED_PREFIXES = \[([\s\S]*?)\];/.exec(MIDDLEWARE);
    expect(block, "the employee allowlist moved").toBeTruthy();
    const prefixes = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    // If this fails because a line was added, that is the point: adding one
    // grants real access and nothing else re-checks it.
    expect(prefixes).toEqual([
      "/incidents",
      "/my-timesheets",
      "/settings",
      "/support",
      "/time-clock",
    ]);
  });

  it("gives a non-staff, non-crew account only what it reported", () => {
    expect(QUERIES).toContain("return { reportedByUserId: user.id };");
  });

  it("still gates reporting on being on the job", () => {
    expect(INCIDENT_ACTIONS).toContain("await assertProjectAccess(input.projectId);");
  });
});

describe("the timeline is append-only", () => {
  it("never updates or deletes an event", () => {
    expect(INCIDENT_ACTIONS).not.toMatch(/incidentEvent\.(update|delete|updateMany|deleteMany)/);
  });

  it("records a correction as a new entry that names what moved", () => {
    expect(INCIDENT_ACTIONS).toContain('type: "FIELD_CORRECTED"');
    expect(INCIDENT_ACTIONS).toContain("fromValue");
  });

  it("voids rather than deletes", () => {
    expect(INCIDENT_ACTIONS).not.toMatch(/incident\.delete\b|incident\.deleteMany\b/);
    expect(INCIDENT_ACTIONS).toContain('data: { status: "VOID" }');
  });

  it("writes the event in the same transaction as the change", () => {
    // Not afterwards and not best-effort: an incident whose status moved and
    // whose history does not say so must not be a reachable state.
    const transactions = INCIDENT_ACTIONS.match(/prisma\.\$transaction\(async \(tx\) => \{/g) ?? [];
    expect(transactions.length).toBeGreaterThanOrEqual(6);
    expect(INCIDENT_ACTIONS).toContain("await writeEvent(tx, {");
  });
});

describe("incident numbering", () => {
  it("is unique within an organisation, never across the platform", async () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const model = /model Incident \{([\s\S]*?)\n\}/.exec(schema);
    expect(model).toBeTruthy();
    const body = model![1];

    // The correction that matters: a formatted number unique across every
    // tenant would mean one contractor's INC-1000 blocked another's.
    expect(body).toContain("@@unique([organizationId, number])");
    expect(body).toContain("@@unique([organizationId, seq])");
    expect(body, "number is globally unique again").not.toMatch(/^\s*number\s+String\s+@unique/m);
  });

  it("takes the number with a locking update, inside the transaction", async () => {
    const lib = readFileSync("src/lib/incidents.ts", "utf8");
    expect(lib).toContain('SET "value" = "value" + 1');
    expect(lib).toContain('RETURNING "value"');
    expect(lib).toContain("ON CONFLICT");
  });

  it("starts at INC-1000", async () => {
    const { FIRST_INCIDENT_SEQ, formatIncidentNumber } = await import("@/lib/incidents");
    expect(FIRST_INCIDENT_SEQ).toBe(1000);
    expect(formatIncidentNumber(1000)).toBe("INC-1000");
    expect(formatIncidentNumber(1004)).toBe("INC-1004");
  });
});
