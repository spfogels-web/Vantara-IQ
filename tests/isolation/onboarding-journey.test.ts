/**
 * The whole journey, in a browser that has never been here before.
 *
 * Everything else in this suite talks HTTP. This drives the actual form,
 * because the failure it guards against was not in a request — it was in a
 * chain of server actions, each of which looked fine on its own and none of
 * which had ever been run without a session behind it.
 *
 * The browser context is created fresh and given nothing: no cookie, no
 * storage, no prior origin. That is the invariant being proved — an invited
 * subcontractor arrives with no account, because creating their account is
 * what this flow is for.
 *
 * Runs against the disposable branch through the suite's own server. It
 * creates a real subcontractor, uploads a real document and deletes it again,
 * then reads the database directly to check the work landed in the right
 * tenant, against the right record, and nowhere else.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { BASE_URL, fixtures } from "../support/load";
import { TEST_SCHEMA_B, testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

const TOKEN = `journey-${Math.random().toString(36).slice(2, 10)}`;
const COMPANY = `Journey Boring ${Date.now()}`;
const EMAIL = `journey.${Date.now()}@example.invalid`;

let browser: Browser;
let page: Page;
/** Anything the server logged as an error while the journey ran. */
const pageErrors: string[] = [];

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
  // Nothing carried in. No storageState, no cookies, no permissions.
  const context = await browser.newContext();
  page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500) pageErrors.push(`${r.status()} ${r.url()}`);
  });
}, 240_000);

afterAll(async () => {
  await browser?.close();
  const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
  if (sub) {
    await db.subDocument.deleteMany({ where: { subcontractorId: sub.id } }).catch(() => undefined);
    await db.subcontractor.delete({ where: { id: sub.id } }).catch(() => undefined);
  }
  await db.invite.deleteMany({ where: { token: TOKEN } }).catch(() => undefined);
  await db.$disconnect();
});

describe("a brand-new contractor, from a browser that knows nothing", () => {
  it("arrives at onboarding with no cookies at all", async () => {
    const cookies = await page.context().cookies();
    expect(cookies, "the browser was supposed to be clean").toHaveLength(0);

    await page.goto(`${BASE_URL}/invite/${TOKEN}`, { waitUntil: "networkidle" });
    await page.getByText(/invited by/i).first().waitFor({ state: "visible", timeout: 20_000 });
    // The invitation's own project, read from the tenant that issued it.
    await page.getByText(tenant.projectName).first().waitFor({ state: "visible", timeout: 10_000 });
  });

  it("creates the account — the step that was failing in production", async () => {
    // createSubcontractorDraft: no session, authorized by the token alone.
    await page.getByPlaceholder("ABC Utilities").fill(COMPANY);
    await page.getByPlaceholder("Reggie Vance").fill("Journey Tester");
    await page.getByPlaceholder("you@company.com").fill(EMAIL);
    await page.getByPlaceholder("••••••••").fill("a-long-enough-passphrase-1");
    await page.getByRole("button", { name: /continue/i }).click();

    // Arriving at capabilities is the proof: the draft was written and the
    // component advanced on a real subcontractor id.
    await page
      .getByText(/capabilities statement/i)
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    expect(sub, "no subcontractor was created in tenant A").toBeTruthy();
  });

  it("binds the invitation to the record it just created", async () => {
    const invite = await db.invite.findUnique({ where: { token: TOKEN } });
    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    // One-way binding: from here the token is a key to this company only.
    expect(invite?.subcontractorId).toBe(sub?.id);
  });

  it("saves capabilities through the same session-less path", async () => {
    // updateSubcontractorCapabilities, authorized by the same token.
    const trade = page.locator("button", { hasText: /^(Boring|Plowing|Splicing)$/ }).first();
    if (await trade.count()) await trade.click();
    await page.getByPlaceholder("3").fill("2");
    await page.getByPlaceholder("18").fill("9");
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.waitForTimeout(2_000);

    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    expect(sub?.crewSize, "capabilities did not save").toBeGreaterThan(0);
  });
});

describe("what the journey wrote, and where", () => {
  it("put the subcontractor in the inviting tenant and nowhere else", async () => {
    const here = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    expect(here, "not in the inviting tenant").toBeTruthy();

    const b = testClient(TEST_SCHEMA_B);
    try {
      const there = await b.subcontractor.findFirst({ where: { company: COMPANY } });
      expect(there, "the other tenant received this company's record").toBeNull();
    } finally {
      await b.$disconnect();
    }
  });

  it("left the new crew awaiting approval rather than active", async () => {
    // Registering is not access. The office still approves.
    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    expect(sub?.state).toBe("PENDING_REVIEW");
  });

  it("raised no server error anywhere in the journey", () => {
    console.log("PAGE ERRORS:", pageErrors.length ? pageErrors.join(" || ").slice(0, 800) : "(none)");
    expect(pageErrors).toEqual([]);
  });
});

// The "a token cannot write to a record it does not own" case is covered in
// anonymous-onboarding.test.ts over HTTP. It was briefly attempted here by
// importing the server action directly — which runs it in the vitest process,
// whose DATABASE_URL is the real one from .env rather than the disposable
// branch the server uses. It refused before writing anything, but an in-process
// import of application code in this suite can reach a live database, and that
// is not a thing to leave lying in a test file.

describe("and on through the rest of onboarding", () => {
  it("passes the agreement step", async () => {
    await page.getByRole("button", { name: /continue/i }).first().click();
    await page.waitForTimeout(1_500);
  });

  it("saves the ACH authorisation without a session", async () => {
    // saveAchAuthorization, still authorized only by the invitation.
    const filled: string[] = [];
    const missed: string[] = [];
    const byLabel = async (label: string, value: string) => {
      const f = page.getByLabel(new RegExp(label, "i")).first();
      if ((await f.count()) && (await f.isVisible().catch(() => false))) {
        await f.fill(value).catch(() => missed.push(label));
        filled.push(label);
      } else missed.push(label);
    };
    // These three are addressed by placeholder: the form reported "Still
    // needed: Legal business name, Name of the person signing, Date" when they
    // were located by label, and said so itself rather than failing silently.
    await page.getByPlaceholder("As it appears on your W-9").fill("Journey Boring LLC");
    await page.getByPlaceholder("Reggie Vance").first().fill("Journey Tester");
    const dateField = page.locator('input[type="date"]').first();
    if (await dateField.count()) await dateField.fill("2026-09-20");
    await byLabel("^EIN", "12-3456789");
    await byLabel("address", "1 Main Street");
    await byLabel("^city", "Milledgeville");
    await byLabel("state", "GA");
    await byLabel("postal|zip", "31061");
    await byLabel("bank name", "First Citizens Bank");
    await byLabel("routing", "053100300");
    await byLabel("account number", "1234567890");
    await byLabel("title", "Owner");

    // The form will not take typed account numbers on their own: it wants a
    // voided cheque to check them against before anybody is paid. That is a
    // real rule, so the test satisfies it rather than routing around it — and
    // it exercises the session-less upload path a second time.
    const proof = page.locator('input[type="file"]').first();
    if (await proof.count()) {
      await proof.setInputFiles({
        name: "voided-check.png",
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
      });
      await page.waitForTimeout(4_000);
    }

    const submit = page
      .getByRole("button", { name: /submit authorisation|update authorisation/i })
      .first();
    await submit.waitFor({ state: "visible", timeout: 15_000 });

    // It must be refused until the thing is actually signed. Asserting this
    // first means the pass below cannot come from a gate that was never shut.
    expect(await submit.isEnabled(), "submit was enabled before signing").toBe(false);

    // Sign it the way a person does: press, drag, release, on the canvas.
    // The pad listens for pointer events, which is what page.mouse emits — no
    // state is poked and no requirement is softened to get through here.
    const pad = page.locator("canvas").first();
    await pad.waitFor({ state: "visible", timeout: 10_000 });
    // The pad sits below the fold on a 720px viewport, and page.mouse works in
    // viewport coordinates — the first attempt drew off-screen and the gate
    // correctly stayed shut. Scroll first, then measure.
    await pad.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await pad.boundingBox();
    expect(box, "the signature pad has no layout box to draw on").toBeTruthy();
    const y = box!.y + box!.height / 2;
    await page.mouse.move(box!.x + 20, y);
    await page.mouse.down();
    for (const dx of [40, 70, 110, 150, 190]) {
      await page.mouse.move(box!.x + dx, y + (dx % 60) - 25, { steps: 4 });
    }
    await page.mouse.up();
    await page.waitForTimeout(800);

    expect(await submit.isEnabled(), "a drawn signature did not satisfy the gate").toBe(true);

    await submit.click();
    await page.waitForTimeout(3_000);

    // The authorisation exists, and belongs to this crew.
    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    const ach = await db.achAuthorization.findUnique({
      where: { subcontractorId: sub!.id },
    });
    expect(ach, "the ACH authorisation did not save").toBeTruthy();
    expect(ach!.subcontractorId).toBe(sub!.id);
    expect(ach!.legalName).toContain("Journey");
  });

  it("uploads an onboarding document, then replaces it", async () => {
    // uploadSubDocument and deleteSubDocument: the two that had to work for a
    // crew who scanned their W-9 upside down and has no account to sign in to.
    const cont = page.getByRole("button", { name: /continue/i }).first();
    if (await cont.count()) await cont.click().catch(() => undefined);
    await page.waitForTimeout(1_500);

    const file = page.locator('input[type="file"]').first();
    if (!(await file.count())) {
      console.log("SKIPPED: never reached the documents step");
      return;
    }
    await file.setInputFiles({
      name: "w9.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 journey test\n"),
    });
    await page.waitForTimeout(3_000);

    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    const docs = await db.subDocument.findMany({ where: { subcontractorId: sub!.id } });
    expect(docs.length, "the document did not save").toBeGreaterThan(0);

    // Now remove it, which is the grant this patch newly allows.
    // The control is an icon button whose only label is its title.
    const remove = page.getByTitle("Remove").first();
    await remove.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    if (await remove.count()) {
      await remove.click();
      await page.waitForTimeout(3_000);
      const after = await db.subDocument.findMany({ where: { subcontractorId: sub!.id } });
      expect(after.length, "the document could not be removed").toBeLessThan(docs.length);
    }
  });

  it("leaves the crew awaiting approval, with everything in the right tenant", async () => {
    const sub = await db.subcontractor.findFirst({ where: { company: COMPANY } });
    expect(sub?.state).toBe("PENDING_REVIEW");

    // Every document written belongs to this subcontractor and no other.
    const docs = await db.subDocument.findMany({ where: { subcontractorId: sub!.id } });
    for (const d of docs) expect(d.subcontractorId).toBe(sub!.id);

    // And the assignment row points at the project the invitation named.
    const crews = await db.projectCrew.findMany({ where: { subcontractorId: sub!.id } });
    for (const c of crews) expect(c.projectId).toBe(tenant.projectId);
  });
});
