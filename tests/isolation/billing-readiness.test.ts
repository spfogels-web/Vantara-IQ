/**
 * Whether production can be invoiced, and the rules that decide.
 *
 * The thing being protected is the customer's bill, and everything below is
 * some version of one question: can the same foot be billed twice, and can a
 * foot nobody documented be billed at all.
 *
 * Production is never the answer to either. A crew that built a thousand feet
 * built a thousand feet, and the daily keeps them whatever the paperwork says.
 *
 * The readiness functions are called for real rather than reimplemented here,
 * so DATABASE_URL is pointed at this run's disposable schema before they are
 * imported — the same approach org-proxy.test.ts uses, and the only way to run
 * a module that resolves its own connection without handing it production's.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { TEST_SCHEMA, testClient, testDatabaseUrl } from "../support/test-db";

process.env.DATABASE_URL = testDatabaseUrl(TEST_SCHEMA);

const { readinessForDaily, billableQuantities, needsTickMarks, requirementsFor } = await import(
  "@/lib/billing-readiness"
);
const { runWithOrg } = await import("@/lib/org-context");

/** Run a readiness call against the test schema rather than the incumbent. */
const onTestSchema = <T>(fn: () => Promise<T>) => runWithOrg("fortitude", fn);

const db = testClient();

const HOLD_ACTIONS = readFileSync("src/app/billing/hold-actions.ts", "utf8");
const AUTO_INVOICE = readFileSync("src/lib/auto-invoice.ts", "utf8");
const QUERIES = readFileSync("src/data/queries.ts", "utf8");

/**
 * The crew's own queue, as the query seam defines it.
 *
 * Bounded at the next export. The first version sliced to the end of the file
 * and so read the accessor that follows as though it were part of this one,
 * which failed on that neighbour's word "invoices" — a test that was looking at
 * the wrong function and saying so about the right one.
 */
const CREW_QUEUE = (() => {
  const start = QUERIES.indexOf("export async function getMyDocumentationRequests");
  const next = QUERIES.indexOf("export async function", start + 1);
  return QUERIES.slice(start, next === -1 ? undefined : next);
})();
/** The office queue, which is the one that carries money. */
const OFFICE_QUEUE = QUERIES.slice(
  QUERIES.indexOf("export async function getBillingReadiness"),
  QUERIES.indexOf("export async function getMyDocumentationRequests"),
);

/**
 * The file with its comments taken out.
 *
 * An assertion that a name is absent passes or fails on the prose as readily
 * as on the code. hold-actions.ts names SubInvoice in its header comment
 * precisely to say it never touches it, and the first version of the test
 * below failed on that sentence — proving nothing either way. So these
 * assertions read the code.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

let projectId = "";
let customerId = "";

beforeAll(async () => {
  projectId = (await db.project.findFirst({ select: { id: true } }))!.id;
  customerId = (await db.customer.findFirst({ select: { id: true } }))!.id;
}, 240_000);

afterAll(async () => {
  await db.$disconnect();
});

/** A daily carrying known production, removed again afterwards. */
async function withDaily<T>(
  lineItems: { code: string; quantity: number }[],
  fn: (dailyId: string) => Promise<T>,
): Promise<T> {
  const daily = await db.daily.create({
    data: {
      projectId,
      projectName: "Billing readiness fixture",
      workDate: "2026-09-27",
      status: "Approved",
      lineItems,
    },
    select: { id: true },
  });
  try {
    return await fn(daily.id);
  } finally {
    await db.billingHold.deleteMany({ where: { dailyId: daily.id } }).catch(() => undefined);
    await db.invoiceLine.deleteMany({ where: { dailyId: daily.id } }).catch(() => undefined);
    await db.daily.delete({ where: { id: daily.id } }).catch(() => undefined);
  }
}

/** A draft invoice carrying one line, removed again afterwards. */
async function withInvoiceLine<T>(
  dailyId: string,
  line: { code: string; quantity: number },
  fn: (invoiceId: string) => Promise<T>,
): Promise<T> {
  const invoice = await db.invoice.create({
    data: {
      number: `TST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      customerId,
      status: "DRAFT",
    },
    select: { id: true },
  });
  try {
    await db.invoiceLine.create({
      data: { invoiceId: invoice.id, dailyId, code: line.code, quantity: line.quantity },
    });
    return await fn(invoice.id);
  } finally {
    await db.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } }).catch(() => undefined);
    await db.invoice.delete({ where: { id: invoice.id } }).catch(() => undefined);
  }
}

describe("the codes Fortitude will not bill without tick marks", () => {
  const CODES = ["BF048I", "BF024I", "BFO72I", "BFO144I", "BFO12RI", "BFO24RI"];

  it("is all six of them", () => {
    for (const code of CODES) {
      expect(needsTickMarks(code), `${code} does not require tick marks`).toBe(true);
    }
  });

  it("is not every code with a similar name", () => {
    for (const code of ["BFO12", "BF048", "DROP1", "REST4", ""]) {
      expect(needsTickMarks(code), `${code} wrongly requires tick marks`).toBe(false);
    }
  });

  it("is a Fortitude rule, and is never attributed to the customer", () => {
    // The QCC manual does not ask for this. Putting Windstream's name on one of
    // our own billing controls would invent a contractual requirement.
    const reqs = requirementsFor("BFO12RI");
    expect(reqs).toHaveLength(1);
    expect(reqs[0].source).toBe("FORTITUDE");
    expect(JSON.stringify(reqs)).not.toMatch(/kinetic|windstream|qcc/i);
  });

  it("says what the crew actually has to send", () => {
    const missing = requirementsFor("BFO12RI")[0].missing.join(" ").toLowerCase();
    expect(missing).toMatch(/photograph/);
    expect(missing).toMatch(/in and out/);
  });
});

describe("a held quantity cannot be billed", () => {
  it("takes the hold out of what may be invoiced", async () => {
    await withDaily([{ code: "BFO12RI", quantity: 1000 }], async (dailyId) => {
      await db.billingHold.create({
        data: {
          dailyId,
          code: "BFO12RI",
          quantity: 400,
          status: "NEEDS_DOCUMENTATION",
          requirement: "Tick-mark documentation",
        },
      });
      const billable = await onTestSchema(() =>
        billableQuantities(dailyId, new Map([["BFO12RI", 1000]])),
      );
      expect(billable.get("BFO12RI"), "the held 400 was offered for billing").toBe(600);
    });
  });

  it("takes out what is already on an invoice as well", async () => {
    await withDaily([{ code: "BFO12RI", quantity: 1000 }], async (dailyId) => {
      await withInvoiceLine(dailyId, { code: "BFO12RI", quantity: 600 }, async () => {
        await db.billingHold.create({
          data: { dailyId, code: "BFO12RI", quantity: 400, status: "NEEDS_DOCUMENTATION" },
        });
        const billable = await onTestSchema(() =>
          billableQuantities(dailyId, new Map([["BFO12RI", 1000]])),
        );
        // 1000 produced − 600 billed − 400 held = 0. This is the double-billing
        // guard: the six hundred on an invoice cannot be billed a second time.
        expect(billable.get("BFO12RI") ?? 0, "the billed 600 was offered again").toBe(0);
      });
    });
  });

  it("releases exactly the held quantity when it is accepted", async () => {
    await withDaily([{ code: "BFO12RI", quantity: 1000 }], async (dailyId) => {
      const hold = await db.billingHold.create({
        data: { dailyId, code: "BFO12RI", quantity: 400, status: "NEEDS_DOCUMENTATION" },
      });
      await db.billingHold.update({ where: { id: hold.id }, data: { status: "ACCEPTED" } });
      const billable = await onTestSchema(() =>
        billableQuantities(dailyId, new Map([["BFO12RI", 1000]])),
      );
      expect(billable.get("BFO12RI"), "accepting did not release the 400").toBe(1000);
    });
  });

  it("bills the remainder later rather than stranding it", async () => {
    // The failure the subtraction exists to prevent: under the old rule the
    // daily was "already filed", so a quantity released a week after the first
    // invoice went out could never be billed at all.
    await withDaily([{ code: "BFO12RI", quantity: 1000 }], async (dailyId) => {
      const hold = await db.billingHold.create({
        data: { dailyId, code: "BFO12RI", quantity: 400, status: "NEEDS_DOCUMENTATION" },
      });
      await withInvoiceLine(dailyId, { code: "BFO12RI", quantity: 600 }, async () => {
        await db.billingHold.update({ where: { id: hold.id }, data: { status: "ACCEPTED" } });
        const billable = await onTestSchema(() =>
          billableQuantities(dailyId, new Map([["BFO12RI", 1000]])),
        );
        expect(billable.get("BFO12RI"), "the released 400 was stranded").toBe(400);
      });
    });
  });

  it("never offers more than was produced", async () => {
    await withDaily([{ code: "BFO12RI", quantity: 100 }], async (dailyId) => {
      const billable = await onTestSchema(() =>
        billableQuantities(dailyId, new Map([["BFO12RI", 100]])),
      );
      expect(billable.get("BFO12RI")!).toBeLessThanOrEqual(100);
    });
  });

  it("behaves as it always did on a daily with no holds", async () => {
    await withDaily([{ code: "DROP1", quantity: 12 }], async (dailyId) => {
      const billable = await onTestSchema(() =>
        billableQuantities(dailyId, new Map([["DROP1", 12]])),
      );
      expect(billable.get("DROP1"), "a job with no requirements did not bill in full").toBe(12);
    });
  });
});

describe("what the office is shown", () => {
  it("reports production, held and billable as three separate numbers", async () => {
    await withDaily([{ code: "BFO12RI", quantity: 160 }], async (dailyId) => {
      await db.billingHold.create({
        data: {
          dailyId,
          code: "BFO12RI",
          quantity: 160,
          status: "NEEDS_DOCUMENTATION",
          requirement: "Tick-mark documentation",
          missing: ["Tick-mark photograph with the count readable"],
        },
      });
      const [row] = await onTestSchema(() => readinessForDaily(dailyId));
      // BFO12RI — 160 FT, tick marks missing: needs documentation.
      expect(row.code).toBe("BFO12RI");
      expect(row.produced, "the reported production was reduced by the hold").toBe(160);
      expect(row.held).toBe(160);
      expect(row.billable).toBe(0);
      expect(row.status).toBe("NEEDS_DOCUMENTATION");
      expect(row.requirement).toMatch(/tick-mark/i);
      expect(row.missing.join(" ")).toMatch(/photograph/i);
    });
  });

  it("calls a line on a draft staged, and a line on a sent invoice billed", async () => {
    await withDaily([{ code: "DROP1", quantity: 10 }], async (dailyId) => {
      await withInvoiceLine(dailyId, { code: "DROP1", quantity: 10 }, async (invoiceId) => {
        let [row] = await onTestSchema(() => readinessForDaily(dailyId));
        expect(row.status, "a line on a draft is not staged").toBe("STAGED");

        await db.invoice.update({ where: { id: invoiceId }, data: { status: "SENT" } });
        [row] = await onTestSchema(() => readinessForDaily(dailyId));
        expect(row.status, "a line on a sent invoice is not billed").toBe("BILLED");
        expect(row.invoices[0]?.number, "the invoice it landed on is not named").toBeTruthy();
      });
    });
  });

  it("distinguishes an override from documentation that arrived", async () => {
    await withDaily([{ code: "BFO12RI", quantity: 160 }], async (dailyId) => {
      await db.billingHold.create({
        data: {
          dailyId,
          code: "BFO12RI",
          quantity: 160,
          status: "OVERRIDDEN",
          requirement: "Tick-mark documentation",
          overrideReason: "Customer PM approved by email",
        },
      });
      const [row] = await onTestSchema(() => readinessForDaily(dailyId));
      // Released for billing, without ever pretending the paperwork came in.
      expect(row.status).toBe("READY_OVERRIDE");
      expect(row.billable).toBe(160);
      expect(row.requirement, "the unmet requirement was erased").toMatch(/tick-mark/i);
      expect(row.overrideReason).toMatch(/approved by email/i);
    });
  });

  it("keeps a code that is not customer billable off the invoice", async () => {
    await withDaily([{ code: "BFO12RI", quantity: 80 }], async (dailyId) => {
      await db.billingHold.create({
        data: {
          dailyId,
          code: "BFO12RI",
          quantity: 80,
          status: "NOT_BILLABLE",
          requirement: "Not billable to the customer",
        },
      });
      const [row] = await onTestSchema(() => readinessForDaily(dailyId));
      expect(row.status).toBe("NOT_BILLABLE");
      expect(row.billable).toBe(0);
      expect(row.produced, "production was erased along with the billing").toBe(80);
    });
  });
});

describe("who may do what", () => {
  it("keeps every billing control to an administrator", () => {
    for (const fn of [
      "requestDocumentation",
      "acceptDocumentation",
      "rejectDocumentation",
      "overrideHold",
      "markNotBillable",
    ]) {
      const start = HOLD_ACTIONS.indexOf(`export async function ${fn}`);
      expect(start, `${fn} is missing`).toBeGreaterThan(-1);
      const body = HOLD_ACTIONS.slice(start, start + 700);
      expect(body, `${fn} is not administrator-only`).toMatch(/requireAdmin\(\)/);
    }
  });

  it("lets a crew answer a request and nothing else", () => {
    const crewPath = codeOnly(
      HOLD_ACTIONS.slice(
        HOLD_ACTIONS.indexOf("export async function submitDocumentation"),
        HOLD_ACTIONS.indexOf("export async function acceptDocumentation"),
      ),
    );
    // Reading a status in order to refuse a second answer is fine; writing one
    // is not. So this asks what the crew path *assigns*, not what it mentions —
    // the first version asked the looser question and failed on the guard that
    // refuses an already-cleared hold.
    const written = [...crewPath.matchAll(/status:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(written, "the crew path writes a status that is not its own").toEqual([
      "CREW_RESPONDED",
    ]);
  });

  it("checks the crew's assignment on the server, not in the interface", () => {
    // A hold id typed into the request is refused here rather than by a button
    // that did not render.
    const crewPath = HOLD_ACTIONS.slice(
      HOLD_ACTIONS.indexOf("export async function submitDocumentation"),
    );
    expect(crewPath).toMatch(/assertProjectAccess\(hold\.daily\.projectId\)/);
  });

  it("requires a reason to override, and records who gave it", () => {
    const fn = HOLD_ACTIONS.slice(
      HOLD_ACTIONS.indexOf("export async function overrideHold"),
      HOLD_ACTIONS.indexOf("export async function markNotBillable"),
    );
    expect(fn).toMatch(/An override needs a reason/);
    expect(fn).toMatch(/accessLog/);
    expect(fn).toMatch(/billing\.override/);
    expect(fn, "the override does not keep what was waived").toMatch(/overrideReason/);
  });
});

describe("customer billing is not crew pay", () => {
  it("never reaches into what the crew is owed", () => {
    expect(codeOnly(HOLD_ACTIONS), "a billing hold touches crew pay").not.toMatch(
      /subInvoice|SubInvoice/,
    );
  });

  it("shows a crew no rate, no amount and no invoice", () => {
    // What the crew's accessor selects is the whole contract with their portal.
    const selected = codeOnly(
      CREW_QUEUE.slice(CREW_QUEUE.indexOf("select:"), CREW_QUEUE.indexOf("orderBy")),
    ).toLowerCase();
    for (const term of ["rate", "amount", "invoice", "subtotal", "margin", "price"]) {
      expect(selected, `the crew is shown ${term}`).not.toContain(term);
    }
    // And the shape handed back carries none of it either.
    const returned = codeOnly(CREW_QUEUE.slice(CREW_QUEUE.indexOf("return holds.map"))).toLowerCase();
    for (const term of ["rate", "amount", "invoice", "margin"]) {
      expect(returned, `the crew is handed ${term}`).not.toContain(term);
    }
  });

  it("scopes a crew's queue to their own assignments", () => {
    // Through the project relation, so renaming a company cannot widen it.
    expect(CREW_QUEUE).toMatch(/subcontractorId: me\.subcontractorId/);
    expect(CREW_QUEUE, "staff would be served the crew queue").toMatch(/isStaff\(me\.role\)/);
  });

  it("gates the office queue rather than filtering it", () => {
    // The office rows carry the customer's rate, so there must be no shape of
    // this data a crew can receive. requireStaff throws; it does not narrow.
    expect(OFFICE_QUEUE).toMatch(/await requireStaff\(\)/);
    const guard = OFFICE_QUEUE.indexOf("await requireStaff()");
    const firstRead = OFFICE_QUEUE.indexOf("prisma.");
    expect(guard, "the office queue reads before it checks who is asking").toBeLessThan(firstRead);
    expect(OFFICE_QUEUE).toMatch(/heldAmount/);
  });
});

describe("the invoice filer", () => {
  it("bills what is left rather than skipping a daily it has touched", () => {
    expect(AUTO_INVOICE).toMatch(/billableQuantities\(daily\.id, byCode/);
    expect(AUTO_INVOICE).toMatch(/held for documentation/);
  });

  it("prices only what may be billed", () => {
    // A foot that cannot be billed should never acquire a rate or an amount.
    // The allowance is per code, because that is what a hold is; allocateSpans
    // turns it back into the daily's own spans before anything is priced, so
    // the held footage is gone before a rate is ever looked up.
    expect(AUTO_INVOICE).toMatch(/priceQuantities\(\s*allocateSpans\(spans, billable\)/);
    const priceCall = AUTO_INVOICE.slice(AUTO_INVOICE.indexOf("const priced = priceQuantities"));
    expect(
      priceCall.slice(0, 200),
      "the filer prices the daily's raw spans rather than the billable ones",
    ).not.toMatch(/priceQuantities\(\s*spans\b/);
  });
});
