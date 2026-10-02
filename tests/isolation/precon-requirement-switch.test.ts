/**
 * The pre-construction requirement, and the switch that turns it off.
 *
 * The rule is that production cannot be filed against a route nobody
 * photographed first. It is right, and it is also absolute, and on 2 October
 * thirteen live projects could not accept a production daily because of it —
 * several of them carrying sixty and seventy pre-construction photographs that
 * simply had nobody press the button saying the route was documented.
 *
 * So there is now a company-wide switch. What these hold is the shape of it:
 * that it fails safe, that only an admin can throw it, that throwing it costs a
 * sentence of explanation, and above all that it never claims the documentation
 * exists.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const SETTINGS = codeOnly(readFileSync("src/lib/org-settings.ts", "utf8"));
const ACTIONS = codeOnly(readFileSync("src/app/actions.ts", "utf8"));
const ADMIN_ACTION = codeOnly(readFileSync("src/app/settings/alerts-actions.ts", "utf8"));
const PANEL = codeOnly(readFileSync("src/components/settings/precon-switch-panel.tsx", "utf8"));
const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");
const MIGRATION = readFileSync("prisma/pending/013-precon-requirement.sql", "utf8");

describe("the requirement fails safe", () => {
  it("defaults to ON in the database", () => {
    const org = /model OrgSettings \{([\s\S]*?)\n\}/.exec(SCHEMA);
    expect(org).toBeTruthy();
    expect(org![1]).toMatch(/preConRequired\s+Boolean\s+@default\(true\)/);
  });

  it("defaults to ON in the migration", () => {
    expect(MIGRATION).toMatch(/"preConRequired"\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+true/i);
    // A migration that defaulted this to false would have removed a safety rule
    // from every tenant silently, which is the one outcome it must not have.
    expect(MIGRATION).not.toMatch(/"preConRequired"[^;]*DEFAULT\s+false/i);
  });

  it("is ON even when there is no settings row to read", () => {
    /**
     * Every other field in UNCONFIGURED fails closed by permitting nothing.
     * This one is a requirement rather than a permission, so failing closed
     * means leaving it on — an unreadable settings row must not quietly delete
     * a rule.
     */
    const unconfigured = /const UNCONFIGURED: OrgSettingsView = \{([\s\S]*?)\n\};/.exec(SETTINGS);
    expect(unconfigured, "UNCONFIGURED moved").toBeTruthy();
    expect(unconfigured![1]).toMatch(/preConRequired:\s*true/);
    expect(unconfigured![1], "the requirement defaults off with no settings row").not.toMatch(
      /preConRequired:\s*false/,
    );
  });
});

describe("only an admin throws it", () => {
  it("refuses anybody else", () => {
    expect(ADMIN_ACTION).toContain('if (me.role !== "ADMIN")');
  });

  it("will not switch off without a reason", () => {
    expect(ADMIN_ACTION).toContain("if (!input.required && !reason)");
  });

  it("clears the reason when the requirement comes back", () => {
    // A stale reason sitting beside a live requirement would read as though it
    // were still off.
    expect(ADMIN_ACTION).toContain('preConWaivedBy: input.required ? "" : me.name || me.email');
    expect(ADMIN_ACTION).toContain("preConWaivedAt: input.required ? null : new Date()");
  });

  it("records the change either way", () => {
    expect(ADMIN_ACTION).toContain('action: "settings.precon.required"');
  });
});

describe("what the switch does not do", () => {
  it("never writes a project's pre-construction status", () => {
    /**
     * The whole distinction this feature rests on. Marking a route documented
     * when it was not is inventing compliance; saying the requirement does not
     * apply is a decision somebody owns. Only the second is on offer here.
     */
    expect(ADMIN_ACTION).not.toMatch(/preConStatus/);
    expect(ADMIN_ACTION).not.toMatch(/project\.update|projectRate|daily\.update/);
  });

  it("leaves every project still showing what was actually photographed", () => {
    expect(PANEL).toContain("Each project still shows whether its own route was documented");
  });

  it("touches nothing that bills or pays", () => {
    for (const banned of [/prisma\.invoice\b/, /prisma\.subInvoice\b/, /prisma\.daily\b/]) {
      expect(ADMIN_ACTION, `the switch reaches into ${banned}`).not.toMatch(banned);
    }
  });
});

describe("the gate honours it", () => {
  it("reads the setting before refusing a daily", () => {
    expect(ACTIONS).toContain("const { preConRequired } = await orgSettings();");
    expect(ACTIONS).toContain("if (preConRequired && !sheet.dailyId && producedSomething");
  });

  it("still refuses when the requirement is on", () => {
    // The refusal itself is untouched — this adds a condition in front of it
    // rather than softening it.
    expect(ACTIONS).toContain("needsPreCon: true as const");
    expect(ACTIONS).toContain("Pre-construction documentation required.");
  });

  it("is read per submission, not cached in the client", () => {
    // So putting the requirement back takes effect on the next submission
    // rather than the next deploy.
    expect(ACTIONS).toMatch(/await orgSettings\(\);/);
  });
});
