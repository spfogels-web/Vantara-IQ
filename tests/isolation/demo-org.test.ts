/**
 * Step 4: what a demonstration organisation is not allowed to do.
 *
 * The rule is narrow and absolute. There is one Twilio account, one number and
 * one A2P registration, and they belong to the real business — so a text sent
 * "as" the demo would arrive on a real handset from the real company's number,
 * under its brand, quoting invented work. A model request is the same shape of
 * problem: it carries records to somebody else's computer.
 *
 * The fixture is built to make these assertions mean something. The demo
 * organisation has texting **on** and the assistant **on** in its settings.
 * If it still cannot send, the demonstration flag is what stopped it — not a
 * feature that happened to be switched off, which is what a test with
 * everything disabled would actually be proving.
 */
import { describe, expect, it } from "vitest";

import { TEST_SCHEMA, TEST_SCHEMA_B, testClient, testDatabaseUrl } from "../support/test-db";

process.env.DATABASE_URL = testDatabaseUrl(TEST_SCHEMA);
process.env.APEX_DATABASE_URL = testDatabaseUrl(TEST_SCHEMA_B);

// Enough to look configured, so nothing below passes merely for want of a key.
process.env.SMS_ENABLED = "true";
process.env.TWILIO_ACCOUNT_SID = "AC_test_not_a_real_account";
process.env.TWILIO_AUTH_TOKEN = "test_token";
process.env.TWILIO_FROM_NUMBER = "+15555550100";

const { runWithOrg } = await import("@/lib/org-context");
const { orgSettings } = await import("@/lib/org-settings");
const { aiClient, aiAvailable } = await import("@/lib/ai-client");
const { smsProvider } = await import("@/lib/sms-provider");

const dbA = testClient(TEST_SCHEMA);
const dbB = testClient(TEST_SCHEMA_B);

describe("the fixture says what it is", () => {
  it("has both switches on for the demonstration organisation", async () => {
    const row = await dbB.orgSettings.findFirst();
    expect(row?.isDemo, "the demo organisation is not marked as one").toBe(true);
    expect(
      row?.smsEnabled,
      "texting is off in the fixture, so a refusal below would prove nothing",
    ).toBe(true);
    expect(
      row?.assistantEnabled,
      "the assistant is off in the fixture, so a refusal below would prove nothing",
    ).toBe(true);
  });

  it("has the ordinary organisation permitted to do both", async () => {
    const row = await dbA.orgSettings.findFirst();
    expect(row?.isDemo).toBe(false);
    expect(row?.smsEnabled).toBe(true);
    expect(row?.assistantEnabled).toBe(true);
  });
});

describe("texting", () => {
  it("is refused for the demonstration organisation, both switches notwithstanding", async () => {
    const settings = await runWithOrg("apex", () => orgSettings());
    expect(settings.isDemo).toBe(true);
    expect(
      settings.smsAllowed,
      "a demonstration organisation was cleared to send text messages",
    ).toBe(false);
  });

  it("is allowed for the ordinary organisation", async () => {
    const settings = await runWithOrg("fortitude", () => orgSettings());
    expect(settings.smsAllowed, "the fixture cannot send, so nothing above is a contrast").toBe(
      true,
    );
  });

  it("refuses at the messaging hub's own exit, not only the alerts one", async () => {
    // Two different modules reach Twilio directly. A rule applied at one of
    // two exits is not a rule, so the second one is checked by name.
    const result = await runWithOrg("apex", () => smsProvider.send("+15555550123", "hello"));
    expect(result.ok, "the messaging hub sent a text for a demonstration organisation").toBe(false);
    expect(result.errorCode).toBe("ORG_SMS_OFF");
  });
});

describe("outbound model requests", () => {
  it("are refused for the demonstration organisation", async () => {
    expect(await runWithOrg("apex", () => aiAvailable())).toBe(false);
    await expect(runWithOrg("apex", () => aiClient())).rejects.toThrow(/demonstration/i);
  });

  it("are allowed for the ordinary organisation", async () => {
    expect(
      await runWithOrg("fortitude", () => aiAvailable()),
      "the fixture cannot use a model either, so nothing above is a contrast",
    ).toBe(true);
  });

  it("have exactly one place that constructs a client", async () => {
    // Six call sites used to build their own. The guard against a seventh is
    // that the constructor appears in one file, and this is that guard.
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    walk("src");

    const GATE = join("src", "lib", "ai-client.ts");
    expect(files, "the gate moved — this exclusion now hides everything").toContain(GATE);

    const offenders = files
      .filter((f) => f !== GATE)
      .filter((f) => readFileSync(f, "utf8").includes("new Anthropic("));

    expect(
      offenders,
      `a model client is constructed outside the gate in:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("an organisation with no settings row", () => {
  it("permits nothing rather than borrowing the other one's", async () => {
    // Deleted and restored, because "unconfigured" is a state a real
    // deployment passes through and the safe direction matters more than the
    // convenient one.
    const saved = await dbB.orgSettings.findFirst();
    expect(saved).not.toBeNull();
    await dbB.orgSettings.deleteMany({});
    try {
      const settings = await runWithOrg("apex", () => orgSettings());
      expect(settings.configured).toBe(false);
      expect(settings.smsAllowed, "an unconfigured organisation could send texts").toBe(false);
      expect(settings.aiAllowed, "an unconfigured organisation could call a model").toBe(false);
      expect(
        settings.legalName,
        "an unconfigured organisation borrowed a name — whose, is the question",
      ).toBe("");
    } finally {
      const { id: _id, updatedAt: _updatedAt, ...rest } = saved!;
      await dbB.orgSettings.create({ data: rest });
    }
  });
});

describe("the settings belong to the organisation asking", () => {
  it("reads different terms either side of a switch", async () => {
    const a = await runWithOrg("fortitude", () => orgSettings());
    const b = await runWithOrg("apex", () => orgSettings());

    expect(a.customerTerms).not.toBe(b.customerTerms);
    // The office number a crew is told to ring: one company's is not another's.
    expect(a.supportPhone).not.toBe(b.supportPhone);
    expect(a.supportPhone, "the incumbent has no office number to contrast").not.toBe("");
    expect(a.locateProvider).not.toBe(b.locateProvider);
    expect(a.defaultState).not.toBe(b.defaultState);
    expect(a.legalName).not.toBe(b.legalName);
  });
});
