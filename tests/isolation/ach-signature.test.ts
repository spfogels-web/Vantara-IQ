/**
 * Both ways of signing an ACH authorisation, and the ways that are not signing.
 *
 * The form offers two: draw it, or type your full name. The typed one exists
 * for the case the code itself names — "a phone in a truck", where a canvas and
 * a steady hand are not available — but the submit gate only ever consulted the
 * drawing pad, so typing a name rendered, accepted the name, and left the
 * button dead. A crew who could not draw could not finish onboarding.
 *
 * These drive the real form in a clean browser, the same way the journey does.
 * What matters is as much what stays refused as what now works: an unsigned
 * authorisation, and a signature made of spaces, must still be turned away.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { BASE_URL, fixtures } from "../support/load";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

const TOKEN = `sig-${Math.random().toString(36).slice(2, 10)}`;
const COMPANY = `Signature Boring ${Date.now()}`;
const EMAIL = `sig.${Date.now()}@example.invalid`;

let browser: Browser;
let page: Page;

/** Walk a fresh contractor as far as the ACH step. */
async function reachAchStep() {
  await page.goto(`${BASE_URL}/invite/${TOKEN}`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("ABC Utilities").fill(COMPANY);
  await page.getByPlaceholder("Reggie Vance").first().fill("Signature Tester");
  await page.getByPlaceholder("you@company.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill("a-long-enough-passphrase-1");
  await page.getByRole("button", { name: /continue/i }).click();
  await page
    .getByText(/capabilities statement/i)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });

  const trade = page.locator("button", { hasText: /^(Boring|Plowing|Splicing)$/ }).first();
  if (await trade.count()) await trade.click();
  await page.getByPlaceholder("3").fill("2");
  await page.getByPlaceholder("18").fill("9");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForTimeout(2_000);
  // agreement -> payment
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.waitForTimeout(1_500);
}

/** Everything the authorisation needs except the signature itself. */
async function fillEverythingBarTheSignature() {
  const byLabel = async (label: string, value: string) => {
    const f = page.getByLabel(new RegExp(label, "i")).first();
    if ((await f.count()) && (await f.isVisible().catch(() => false))) {
      await f.fill(value).catch(() => undefined);
    }
  };
  await page.getByPlaceholder("As it appears on your W-9").fill("Signature Boring LLC");
  await page.getByPlaceholder("Reggie Vance").first().fill("Signature Tester");
  const date = page.locator('input[type="date"]').first();
  if (await date.count()) await date.fill("2026-09-20");
  await byLabel("^EIN", "12-3456789");
  await byLabel("address", "1 Main Street");
  await byLabel("^city", "Milledgeville");
  await byLabel("state", "GA");
  await byLabel("postal|zip", "31061");
  await byLabel("bank name", "First Citizens Bank");
  await byLabel("routing", "053100300");
  await byLabel("account number", "1234567890");
  await byLabel("title", "Owner");

  // The voided cheque stays required. A typed signature is an alternative
  // signature, not a way past any other rule on this form.
  const proof = page.locator('input[type="file"]').first();
  if (await proof.count()) {
    await proof.setInputFiles({
      name: "voided-check.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await page.waitForTimeout(4_000);
  }
}

const submitButton = () =>
  page.getByRole("button", { name: /submit authorisation|update authorisation/i }).first();

beforeAll(async () => {
  await db.invite.create({
    data: {
      token: TOKEN,
      projectId: tenant.projectId,
      projectName: tenant.projectName,
      customer: tenant.customerName,
    },
  });
  browser = await chromium.launch();
  page = await browser.newContext().then((c) => c.newPage());
  await reachAchStep();
  await fillEverythingBarTheSignature();
}, 240_000);

afterAll(async () => {
  await browser?.close();
  const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
  if (sub) {
    await db.achAuthorization.deleteMany({ where: { subcontractorId: sub.id } }).catch(() => undefined);
    await db.subDocument.deleteMany({ where: { subcontractorId: sub.id } }).catch(() => undefined);
    await db.subcontractor.delete({ where: { id: sub.id } }).catch(() => undefined);
  }
  await db.invite.deleteMany({ where: { token: TOKEN } }).catch(() => undefined);
  await db.$disconnect();
});

describe("an unsigned authorisation cannot be submitted", () => {
  it("refuses when nothing has been drawn and nothing typed", async () => {
    await submitButton().waitFor({ state: "visible", timeout: 20_000 });
    expect(await submitButton().isEnabled()).toBe(false);
  });

  it("refuses a signature made of whitespace", async () => {
    // A space is not a name. The renderer trims it away to nothing, and the
    // gate has to agree rather than letting an empty image through.
    await page.getByPlaceholder("Jonathan D Hunter").fill("   ");
    await page.waitForTimeout(300);
    expect(await submitButton().isEnabled()).toBe(false);
  });
});

describe("either way of signing is a signature", () => {
  it("accepts a typed full name, and the authorisation saves", async () => {
    await page.getByPlaceholder("Jonathan D Hunter").fill("Signature Tester");
    await page.waitForTimeout(300);
    expect(await submitButton().isEnabled(), "typing a name left the button dead").toBe(true);

    await submitButton().click();
    await page.waitForTimeout(3_500);

    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    const ach = await db.achAuthorization.findUnique({ where: { subcontractorId: sub!.id } });
    expect(ach, "a typed signature did not produce an authorisation").toBeTruthy();
    expect(ach!.signatureDataUrl.length, "no signature image was stored").toBeGreaterThan(0);
  });

  it("accepts a drawn signature too", async () => {
    // Clear the typed name so only the drawing can be what satisfies it.
    await page.getByPlaceholder("Jonathan D Hunter").fill("");
    await page.waitForTimeout(300);

    const pad = page.locator("canvas").first();
    await pad.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await pad.boundingBox();
    expect(box).toBeTruthy();
    const y = box!.y + box!.height / 2;
    await page.mouse.move(box!.x + 20, y);
    await page.mouse.down();
    for (const dx of [40, 80, 130, 180]) {
      await page.mouse.move(box!.x + dx, y + (dx % 50) - 20, { steps: 4 });
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect(await submitButton().isEnabled(), "a drawn signature left the button dead").toBe(true);
    await submitButton().click();
    await page.waitForTimeout(3_500);

    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    const ach = await db.achAuthorization.findUnique({ where: { subcontractorId: sub!.id } });
    expect(ach).toBeTruthy();
  });
});
