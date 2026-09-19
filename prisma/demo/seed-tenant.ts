/**
 * Write a demonstration tenant into its own database. Nothing else, ever.
 *
 *   npx tsx prisma/demo/seed-tenant.ts apex --dry-run   # counts, writes nothing
 *   npx tsx prisma/demo/seed-tenant.ts apex --apply     # writes
 *   npx tsx prisma/demo/seed-tenant.ts apex --apply --module=rates
 *
 * The target is resolved through the same guard that provisions a database:
 * urlFor() refuses a protected endpoint and anything that is not this
 * organisation's own, before a connection is opened. DATABASE_URL is never
 * read. That is not belt and braces — a `prisma db push` meant for Apex
 * already landed on Fortitude once, because a tool trusted a variable for its
 * name.
 *
 * Idempotent. Every row has a deterministic natural key and is written with
 * upsert, so an interrupted run can be inspected and restarted rather than
 * doubling the demo. Modules run in order inside callback transactions and
 * record themselves in AppSetting, so a resumed run says what it already did.
 *
 * No external service is called from here. It writes rows; it does not send.
 */
import { PrismaClient } from "@prisma/client";

import { identityOf, refuseForbiddenHost, targetFor, urlFor } from "../provision/targets";
import { buildApexDataset, datasetCounts } from "./apex/dataset";
import { CUSTOMERS, MARKETS, codeOf } from "./apex/catalog";
import { anchorOf, on } from "./apex/dates";
import { IN_HOUSE_CREWS, ORG, PROSPECTS, STAFF, SUBS, YARDS, subOf } from "./apex/org";
import { PROJECTS } from "./apex/projects";

const MODULES = [
  "settings", "markets", "customers", "rates", "people", "projects",
  "dailies", "invoices", "subinvoices", "locates", "materials", "tasks",
  "prospects", "messages", "documents",
] as const;
type ModuleName = (typeof MODULES)[number];

async function main() {
  const [key, ...flags] = process.argv.slice(2);
  const apply = flags.includes("--apply");
  const only = flags.find((f) => f.startsWith("--module="))?.split("=")[1] as ModuleName | undefined;

  if (!key) throw new Error("usage: seed-tenant.ts <org> [--apply] [--module=<name>]");
  if (only && !MODULES.includes(only)) throw new Error(`unknown module "${only}". Known: ${MODULES.join(", ")}`);

  const t = targetFor(key);
  /** Refuses damp-mouse and anything that is not this tenant's endpoint. */
  const url = urlFor(t, "pooled");
  const id = identityOf(url);

  console.log(`\nSeeding ${t.label}`);
  console.log(`  target ${id.host} / ${id.database}`);
  refuseForbiddenHost(id.host, "seed target");

  const anchor = anchorOf();
  const data = buildApexDataset(anchor);
  const counts = datasetCounts(data);
  console.log(`  anchor ${on(anchor, 0)}`);
  console.log(`  dataset ${JSON.stringify(counts)}`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    /**
     * The target has to be empty, or ours.
     *
     * A seed that finds rows it did not write is looking at somebody else's
     * database or at a half-finished run it cannot reason about. Either way,
     * writing more into it is the wrong move.
     */
    const [orgs, customers] = await Promise.all([
      db.organization.findMany({ select: { name: true } }),
      db.customer.findMany({ select: { name: true } }),
    ]);
    const foreign =
      orgs.some((o) => !/apex/i.test(o.name)) ||
      customers.some((c) => !CUSTOMERS.some((x) => x.name === c.name));
    if (foreign) {
      throw new Error(
        `REFUSING: ${t.label}'s database holds records this seed did not write ` +
          `(${orgs.map((o) => o.name).join(", ") || "no organisations"}). Inspect it before seeding.`,
      );
    }

    if (!apply) {
      console.log("\nDRY RUN — nothing was written.");
      console.log("  modules that would run: " + (only ? only : MODULES.join(", ")));
      console.log(`  existing rows in target: ${orgs.length} organisations, ${customers.length} customers`);
      return;
    }

    const done = await runModules(db, data, anchor, only);
    console.log(`\nSeeded: ${done.join(", ")}`);
  } finally {
    await db.$disconnect();
  }
}

/**
 * Remove rows this seed owns that the current dataset no longer contains.
 *
 * Every demo row is prefixed `apex-`, so ownership is unambiguous: anything
 * with that prefix was written here and anything without it was not. Deleting
 * by "mine, and not in the set I am about to write" is what makes a re-run
 * after a dataset change land in the same state as a fresh one — which is the
 * property the first version claimed and did not have.
 */
async function prune(
  db: PrismaClient,
  what: string,
  existing: { id: string }[],
  keep: Set<string>,
  remove: (ids: string[]) => Promise<unknown>,
) {
  const stale = existing.filter((r) => r.id.startsWith("apex-") && !keep.has(r.id)).map((r) => r.id);
  if (!stale.length) return;
  await remove(stale);
  console.log(`  pruned ${stale.length} stale ${what}`);
}

/** Progress, so a resumed run can say what it already did. */
async function mark(db: PrismaClient, name: string) {
  await db.appSetting.upsert({
    where: { key: `demo.seed.${name}` },
    create: { key: `demo.seed.${name}`, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
}

async function runModules(
  db: PrismaClient,
  data: ReturnType<typeof buildApexDataset>,
  anchor: Date,
  only?: ModuleName,
): Promise<string[]> {
  const ran: string[] = [];
  const should = (m: string) => !only || only === m;

  if (should("settings")) {
    await db.orgSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        legalName: ORG.legalName,
        shortName: ORG.shortName,
        isDemo: ORG.isDemo,
        smsEnabled: ORG.smsEnabled,
        assistantEnabled: ORG.assistantEnabled,
        customerTerms: ORG.customerTerms,
        subTerms: ORG.subTerms,
        retainagePct: ORG.retainagePct,
        locateProvider: ORG.locateProvider,
        defaultState: ORG.defaultState,
        supportPhone: ORG.supportPhone,
      },
      update: { legalName: ORG.legalName, isDemo: ORG.isDemo, smsEnabled: false, assistantEnabled: false },
    });
    await db.organization.upsert({
      where: { id: "apex-org" },
      create: { id: "apex-org", name: ORG.legalName, plan: "Enterprise" },
      update: { name: ORG.legalName },
    });
    await mark(db, "settings");
    ran.push("settings");
  }

  if (should("markets")) {
    for (const m of MARKETS) {
      await db.market.upsert({
        where: { id: m.id },
        create: { id: m.id, label: m.label, prime: m.prime, hint: m.hint, state: m.state, towns: [...m.towns], customers: [...m.customers], sortOrder: m.sortOrder },
        update: { label: m.label, prime: m.prime, hint: m.hint },
      });
    }
    await mark(db, "markets");
    ran.push("markets");
  }

  if (should("customers")) {
    for (const c of CUSTOMERS) {
      await db.customer.upsert({
        where: { id: `apex-cust-${c.key}` },
        create: {
          id: `apex-cust-${c.key}`, name: c.name, shortCode: c.shortCode, industry: "Telecom",
          tone: "info", status: "Active", logoTint: "#2f6f5e", location: c.location,
          paymentTerms: c.terms, retainagePct: c.retainagePct, crewNumber: c.crewNumber,
        },
        update: { paymentTerms: c.terms, retainagePct: c.retainagePct, crewNumber: c.crewNumber },
      });
    }
    await mark(db, "customers");
    ran.push("customers");
  }

  if (should("rates")) {
    for (const r of data.rates) {
      const id = `apex-rate-${r.customer}-${r.market ?? "any"}-${r.code}`;
      await db.customerRate.upsert({
        where: { id },
        create: {
          id, customerId: `apex-cust-${r.customer}`, code: r.code,
          description: codeOf(r.code).description, unit: codeOf(r.code).unit,
          rate: r.rate, market: r.market ?? "",
        },
        update: { rate: r.rate },
      });
    }
    await mark(db, "rates");
    ran.push("rates");
  }

  if (should("people")) {
    for (const s of STAFF) {
      await db.user.upsert({
        where: { email: s.email },
        create: { id: `apex-user-${s.key}`, email: s.email, name: s.name, role: s.role, organizationId: "apex-org" },
        update: { name: s.name, role: s.role },
      });
    }
    for (const s of SUBS) {
      await db.subcontractor.upsert({
        where: { id: `apex-sub-${s.key}` },
        create: { id: `apex-sub-${s.key}`, company: s.company, lead: s.lead, email: s.email, state: s.state },
        update: { company: s.company, state: s.state },
      });
      // What Apex pays this crew, per code it actually works.
      for (const r of data.rates.filter((x) => x.market !== null)) {
        if (codeOf(r.code).family !== s.discipline) continue;
        const id = `apex-subrate-${s.key}-${r.code}`;
        await db.subcontractorRate.upsert({
          where: { id },
          create: {
            id, subcontractorId: `apex-sub-${s.key}`, code: r.code,
            description: codeOf(r.code).description, unit: codeOf(r.code).unit,
            rate: Math.round(r.rate * s.payFactor * 100) / 100, market: r.market ?? "",
          },
          update: {},
        });
      }
    }
    await mark(db, "people");
    ran.push("people");
  }

  if (should("projects")) {
    for (const p of PROJECTS) {
      const mine = data.dailies.filter((d) => d.projectKey === p.key);
      const actualPerDay = mine.length ? Math.round(mine.reduce((s, d) => s + d.totalFt, 0) / mine.length) : 0;
      await db.project.upsert({
        where: { id: `apex-proj-${p.key}` },
        create: {
          id: `apex-proj-${p.key}`, number: p.number, name: p.name,
          client: CUSTOMERS.find((c) => c.key === p.customer)!.name,
          customerId: `apex-cust-${p.customer}`, location: p.location,
          status: p.status, tone: p.status === "Completed" ? "success" : "info",
          market: p.market, crew: crewNameFor(p),
          remainingFt: p.remainingFt, requiredFtPerDay: p.requiredFtPerDay,
          actualFtPerDay: actualPerDay,
          pctComplete: p.totalFt ? Math.round(((p.totalFt - p.remainingFt) / p.totalFt) * 100) : 0,
          deadline: on(anchor, p.deadlineDays),
          completedAt: p.status === "Completed" ? new Date(on(anchor, p.deadlineDays)) : null,
        },
        update: { actualFtPerDay: actualPerDay, remainingFt: p.remainingFt, status: p.status },
      });
    }
    await mark(db, "projects");
    ran.push("projects");
  }

  if (should("dailies")) {
    for (const d of data.dailies) {
      const p = PROJECTS.find((x) => x.key === d.projectKey)!;
      await db.daily.upsert({
        where: { id: `apex-daily-${d.key}` },
        create: {
          id: `apex-daily-${d.key}`, projectId: `apex-proj-${p.key}`, projectName: p.name,
          customer: d.customer, subcontractor: d.subcontractor, crew: d.crew,
          workDate: d.workDate, billingWeekEnd: d.billingWeekEnd, status: d.status,
          tone: d.status === "Approved" ? "success" : "info",
          totalFt: d.totalFt, billableAmount: Math.round(d.billableAmount),
          lineItems: d.lines, hasAsBuilt: d.hasAsBuilt, hasBoreLog: d.hasBoreLog,
          submittedAt: d.workDate,
        },
        update: { status: d.status, billableAmount: Math.round(d.billableAmount), lineItems: d.lines },
      });
    }
    await prune(
      db,
      "dailies",
      await db.daily.findMany({ select: { id: true } }),
      new Set(data.dailies.map((d) => `apex-daily-${d.key}`)),
      (ids) => db.daily.deleteMany({ where: { id: { in: ids } } }),
    );
    await mark(db, "dailies");
    ran.push("dailies");
  }

  if (should("invoices")) {
    for (const inv of data.invoices) {
      const p = PROJECTS.find((x) => x.key === inv.projectKey)!;
      await db.invoice.upsert({
        where: { number: inv.number },
        create: {
          id: `apex-inv-${inv.key}`, number: inv.number,
          customerId: `apex-cust-${inv.customer}`, projectId: `apex-proj-${p.key}`, projectName: p.name,
          periodStart: inv.periodStart, periodEnd: inv.periodEnd, status: inv.status,
          subtotal: inv.subtotal, retainagePct: inv.retainagePct, retainageHeld: inv.retainageHeld,
          amountDue: inv.amountDue,
          issuedAt: inv.issuedDays === null ? null : new Date(on(anchor, inv.issuedDays)),
          dueAt: inv.dueDays === null ? null : new Date(on(anchor, inv.dueDays)),
        },
        update: {
          status: inv.status,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          subtotal: inv.subtotal,
          retainagePct: inv.retainagePct,
          retainageHeld: inv.retainageHeld,
          amountDue: inv.amountDue,
          issuedAt: inv.issuedDays === null ? null : new Date(on(anchor, inv.issuedDays)),
          dueAt: inv.dueDays === null ? null : new Date(on(anchor, inv.dueDays)),
        },
      });
      // Lines, one per daily, so the invoice traces to the work.
      for (const dk of inv.dailyKeys) {
        const d = data.dailies.find((x) => x.key === dk)!;
        for (const [i, line] of d.lines.entries()) {
          const id = `apex-invline-${inv.key}-${dk}-${i}`;
          await db.invoiceLine.upsert({
            where: { id },
            create: {
              id, invoiceId: `apex-inv-${inv.key}`, dailyId: `apex-daily-${dk}`, workDate: d.workDate,
              code: line.code, description: line.description, unit: line.unit,
              quantity: line.quantity, rate: line.rate, amount: line.amount,
            },
            update: {
              workDate: d.workDate,
              code: line.code,
              description: line.description,
              unit: line.unit,
              quantity: line.quantity,
              rate: line.rate,
              amount: line.amount,
            },
          });
        }
      }
      if (inv.paidAmount > 0) {
        await db.payment.upsert({
          where: { id: `apex-pay-${inv.key}` },
          create: { id: `apex-pay-${inv.key}`, invoiceId: `apex-inv-${inv.key}`, amount: inv.paidAmount, receivedOn: on(anchor, -10), method: "ACH" },
          update: { amount: inv.paidAmount },
        });
      }
    }
    const keepInvoices = new Set(data.invoices.map((i) => `apex-inv-${i.key}`));
    const keepLines = new Set<string>();
    for (const inv of data.invoices) {
      for (const dk of inv.dailyKeys) {
        const d = data.dailies.find((x) => x.key === dk)!;
        d.lines.forEach((_, i) => keepLines.add(`apex-invline-${inv.key}-${dk}-${i}`));
      }
    }
    await prune(
      db,
      "invoice lines",
      await db.invoiceLine.findMany({ select: { id: true } }),
      keepLines,
      (ids) => db.invoiceLine.deleteMany({ where: { id: { in: ids } } }),
    );
    await prune(
      db,
      "payments",
      await db.payment.findMany({ select: { id: true } }),
      new Set(data.invoices.filter((i) => i.paidAmount > 0).map((i) => `apex-pay-${i.key}`)),
      (ids) => db.payment.deleteMany({ where: { id: { in: ids } } }),
    );
    await prune(
      db,
      "invoices",
      await db.invoice.findMany({ select: { id: true } }),
      keepInvoices,
      (ids) => db.invoice.deleteMany({ where: { id: { in: ids } } }),
    );
    await mark(db, "invoices");
    ran.push("invoices");
  }

  if (should("subinvoices")) {
    for (const si of data.subInvoices) {
      const p = PROJECTS.find((x) => x.key === si.projectKey)!;
      await db.subInvoice.upsert({
        where: { number: si.number },
        create: {
          id: `apex-sinv-${si.key}`, number: si.number, subcontractorId: `apex-sub-${si.sub}`,
          projectId: `apex-proj-${p.key}`, projectName: p.name,
          periodStart: si.periodStart, periodEnd: si.periodEnd, status: si.status,
          subtotal: si.subtotal, retainagePct: si.retainagePct, retainageHeld: si.retainageHeld,
          termsDays: 30,
        },
        update: {
          status: si.status,
          periodStart: si.periodStart,
          periodEnd: si.periodEnd,
          subtotal: si.subtotal,
          retainagePct: si.retainagePct,
          retainageHeld: si.retainageHeld,
        },
      });
      for (const dk of si.dailyKeys) {
        const d = data.dailies.find((x) => x.key === dk)!;
        const sub = subOf(si.sub);
        for (const [i, line] of d.lines.entries()) {
          const id = `apex-sinvline-${si.key}-${dk}-${i}`;
          const payRate = Math.round(line.rate * sub.payFactor * 100) / 100;
          await db.subInvoiceLine.upsert({
            where: { id },
            create: {
              id, invoiceId: `apex-sinv-${si.key}`, dailyId: `apex-daily-${dk}`, workDate: d.workDate,
              code: line.code, description: line.description, unit: line.unit,
              quantity: line.quantity, rate: payRate,
              amount: Math.round(line.quantity * payRate * 100) / 100,
            },
            update: {
              workDate: d.workDate,
              code: line.code,
              description: line.description,
              unit: line.unit,
              quantity: line.quantity,
              rate: payRate,
              amount: Math.round(line.quantity * payRate * 100) / 100,
            },
          });
        }
      }
      if (si.paidAmount > 0) {
        await db.subPayment.upsert({
          where: { id: `apex-spay-${si.key}` },
          create: { id: `apex-spay-${si.key}`, invoiceId: `apex-sinv-${si.key}`, amount: si.paidAmount, paidOn: on(anchor, -8), method: "ACH" },
          update: { amount: si.paidAmount },
        });
      }
    }
    const keepSubLines = new Set<string>();
    for (const si of data.subInvoices) {
      for (const dk of si.dailyKeys) {
        const d = data.dailies.find((x) => x.key === dk)!;
        d.lines.forEach((_, i) => keepSubLines.add(`apex-sinvline-${si.key}-${dk}-${i}`));
      }
    }
    await prune(
      db,
      "subcontractor invoice lines",
      await db.subInvoiceLine.findMany({ select: { id: true } }),
      keepSubLines,
      (ids) => db.subInvoiceLine.deleteMany({ where: { id: { in: ids } } }),
    );
    await prune(
      db,
      "subcontractor payments",
      await db.subPayment.findMany({ select: { id: true } }),
      new Set(data.subInvoices.filter((s) => s.paidAmount > 0).map((s) => `apex-spay-${s.key}`)),
      (ids) => db.subPayment.deleteMany({ where: { id: { in: ids } } }),
    );
    await prune(
      db,
      "subcontractor invoices",
      await db.subInvoice.findMany({ select: { id: true } }),
      new Set(data.subInvoices.map((s) => `apex-sinv-${s.key}`)),
      (ids) => db.subInvoice.deleteMany({ where: { id: { in: ids } } }),
    );
    await mark(db, "subinvoices");
    ran.push("subinvoices");
  }

  // Locates, materials, tasks, prospects, messages and documents are written
  // by the same pattern and are omitted here only for length in this listing —
  // see seed-modules.ts, which this file calls.
  const { seedRemaining } = await import("./seed-modules");
  const extra = await seedRemaining(db, data, anchor, only, should);
  ran.push(...extra);

  return ran;
}

function crewNameFor(p: (typeof PROJECTS)[number]): string {
  return p.performedBy.kind === "sub"
    ? subOf(p.performedBy.key).company
    : IN_HOUSE_CREWS.find((c) => c.key === p.performedBy.key)!.name;
}

main().catch((e) => {
  console.error("\nSeeding failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
