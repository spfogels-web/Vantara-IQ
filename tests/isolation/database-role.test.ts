/**
 * The guard the spike wishes had existed.
 *
 * Row-level security was applied correctly, FORCEd, and silently ignored,
 * because the role the application connects as carries BYPASSRLS. Nothing
 * failed. Nothing logged. A policy that does nothing looks exactly like a
 * policy that works.
 *
 * So the property is asserted here rather than trusted: the connection the
 * application uses must not be able to bypass row-level security, and the
 * schema's own tenancy column must exist. Both fail today, deliberately.
 *
 * The first test is the one to keep forever. It is cheap, and it is what
 * catches the day somebody restores a connection string from a backup, or
 * Neon hands out a new owner credential, and the bottom layer of the isolation
 * design quietly stops existing.
 */
import { describe, expect, it } from "vitest";

import { testClient } from "../support/test-db";

describe("the database connection cannot bypass its own policies", () => {
  it("connects as a role without BYPASSRLS", async () => {
    const db = testClient();
    try {
      const rows = await db.$queryRawUnsafe<{ who: string; bypass: boolean | null }[]>(`
        SELECT current_user AS who,
               (SELECT bool_or(r.rolbypassrls)
                  FROM pg_roles r
                 WHERE pg_has_role(current_user, r.oid, 'USAGE')) AS bypass
      `);
      const { who, bypass } = rows[0];
      expect(
        bypass,
        `the application connects as "${who}", which can bypass row-level security — every policy would be decorative`,
      ).toBe(false);
    } finally {
      await db.$disconnect();
    }
  });
});

describe("the schema carries a tenant", () => {
  const MUST_BE_SCOPED = [
    "Project",
    "Customer",
    "Subcontractor",
    "Daily",
    "Invoice",
    "SubInvoice",
    "LocateTicket",
    "Task",
    "Document",
    "Conversation",
    // Workforce. Added with the tables themselves rather than afterwards, so
    // Phase 4 cannot finish believing it has covered everything while an
    // employee's hours and every location they reported sit outside the
    // policy. These fail today exactly like the rest of this list.
    "Employee",
    "TimeEntry",
    "TimeEntryLocation",
    "TimeEntryAudit",
    "EmployeeProject",
    // The invitation that turns an employee into a login. Listed here for the
    // same reason as the five above: it holds an email and a token bound to a
    // person, and it fails today exactly as they do.
    "EmployeeInvite",
  ];

  it("has organizationId on every root table", async () => {
    const db = testClient();
    try {
      const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND column_name = 'organizationId'`,
      );
      const scoped = new Set(rows.map((r) => r.table_name));
      const missing = MUST_BE_SCOPED.filter((t) => !scoped.has(t));
      expect(missing, `these tables have no tenant column: ${missing.join(", ")}`).toEqual([]);
    } finally {
      await db.$disconnect();
    }
  });

  it("enables row-level security on every root table", async () => {
    const db = testClient();
    try {
      const rows = await db.$queryRawUnsafe<{ relname: string }[]>(
        `SELECT c.relname
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = current_schema() AND c.relrowsecurity`,
      );
      const guarded = new Set(rows.map((r) => r.relname));
      const missing = MUST_BE_SCOPED.filter((t) => !guarded.has(t));
      expect(missing, `no row-level security on: ${missing.join(", ")}`).toEqual([]);
    } finally {
      await db.$disconnect();
    }
  });
});
