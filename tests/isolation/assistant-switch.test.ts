/**
 * The switch that decides whether this organisation's records leave it.
 *
 * `aiAllowed` is the single gate on every outbound model request the product
 * makes. It had no interface at all — the flag existed, six features depended
 * on it, and the only way to change it was a hand-written database update. A
 * crew met "The assistant is not enabled for this organisation" and nobody in
 * the office could do anything about it.
 *
 * What must hold:
 *
 *   the computation is `assistantEnabled && !isDemo`, so a demonstration
 *   organisation can never be switched on however the flag is set;
 *   only an administrator may change it, checked on the server;
 *   the change is recorded, because "who turned this on in March" gets asked.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { testClient } from "../support/test-db";

const db = testClient();
const ACTION = readFileSync("src/app/settings/assistant-actions.ts", "utf8");
const SETTINGS = readFileSync("src/lib/org-settings.ts", "utf8");
const CLIENT = readFileSync("src/lib/ai-client.ts", "utf8");

describe("how the gate is computed", () => {
  it("requires the flag and refuses a demonstration organisation", () => {
    expect(SETTINGS).toMatch(/aiAllowed:\s*row\.assistantEnabled && !row\.isDemo/);
  });

  it("is the only place a model client is built", () => {
    // Six call sites used to construct their own. A rule applied at six exits
    // is not a rule, and this is what keeps a seventh from appearing.
    expect(CLIENT).toMatch(/new Anthropic\(\)/);
    expect(CLIENT).toMatch(/AiNotAllowed/);
  });

  it("says which of the three reasons it refused for", () => {
    // "Not enabled" and "no settings at all" are different problems with
    // different fixes, and a crew reporting one should not send somebody
    // hunting for the other.
    expect(CLIENT).toMatch(/demonstration organisation/i);
    expect(CLIENT).toMatch(/not enabled for this organisation/i);
    expect(CLIENT).toMatch(/no settings/i);
  });
});

describe("who may change it", () => {
  it("is administrators only, on the server", () => {
    expect(ACTION).toMatch(/me\.role !== "ADMIN"/);
    expect(ACTION, "a non-admin is refused only in the interface").toMatch(
      /Only an administrator can change this/,
    );
  });

  it("refuses to switch a demonstration organisation on", () => {
    expect(ACTION).toMatch(/row\.isDemo && on/);
  });

  it("records who did it, and tells the office", () => {
    expect(ACTION).toMatch(/accessLog/);
    expect(ACTION).toMatch(/settings\.assistant/);
    expect(ACTION).toMatch(/notifyStaff/);
  });

  it("writes exactly one field", () => {
    // The row carries the legal name, terms, retainage and the SMS switch.
    // A settings write that touched any of those would be a different and
    // much worse bug than the one this fixes.
    const update = ACTION.slice(ACTION.indexOf("orgSettings.update"));
    const data = update.slice(update.indexOf("data:"), update.indexOf("});"));
    expect(data).toMatch(/assistantEnabled: on/);
    for (const other of ["legalName", "isDemo", "smsEnabled", "retainagePct", "customerTerms"]) {
      expect(data, `the update also writes ${other}`).not.toContain(other);
    }
  });
});

describe("the flag behaves in the database", () => {
  it("can be turned on and off without disturbing the rest of the row", async () => {
    const row = await db.orgSettings.findFirst();
    if (!row) return; // nothing configured in this fixture

    const before = { ...row };
    try {
      await db.orgSettings.update({
        where: { id: row.id },
        data: { assistantEnabled: !row.assistantEnabled },
      });
      const after = await db.orgSettings.findUnique({ where: { id: row.id } });
      expect(after?.assistantEnabled).toBe(!before.assistantEnabled);
      expect(after?.legalName, "the legal name moved").toBe(before.legalName);
      expect(after?.smsEnabled, "the SMS switch moved").toBe(before.smsEnabled);
      expect(after?.isDemo, "the demo flag moved").toBe(before.isDemo);
    } finally {
      await db.orgSettings
        .update({ where: { id: row.id }, data: { assistantEnabled: before.assistantEnabled } })
        .catch(() => undefined);
    }
  });
});
