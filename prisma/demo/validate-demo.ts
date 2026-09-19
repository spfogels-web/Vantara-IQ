/**
 * Prove the seeded demo is what it claims to be. Read-only, always.
 *
 *   npx tsx prisma/demo/validate-demo.ts apex
 *
 * Run after seeding. It asks the database the questions the demo exists to
 * answer, and fails if the answer comes from a label rather than from the
 * records: a project tagged "behind" has to be behind in its own production
 * history, a missing daily has to be a real gap in the dates, a material
 * shortage has to be arithmetic over actual transactions.
 *
 * Resolves its target through the same guard as everything else — it cannot be
 * pointed at Fortitude. Fortitude is read only to show its counts did not move,
 * and that read goes through DATABASE_URL, never through a target.
 */
import { PrismaClient } from "@prisma/client";

import { identityOf, targetFor, urlFor } from "../provision/targets";
import { MARKET_ONLY, PRICE_PROOF } from "./apex/catalog";
import { ORG } from "./apex/org";
import { PROJECTS, REQUIRED_STORYLINES, projectsWith } from "./apex/projects";

/** Fortitude's counts, which this operation must not have moved. */
/**
 * Fortitude figures that are expected to hold still, and those that are not.
 *
 * This used to pin every count, dailies included. Then a crew filed a sheet
 * while a validation run was in flight, the count went 33 to 34, and the check
 * reported contamination where there was a working business. A live tenant's
 * operational tables grow — that is the system succeeding, and a test that
 * calls it a failure will eventually be silenced rather than believed.
 *
 * So only the reference rows are pinned: the organisation, its two customers,
 * their rate cards and the project list, none of which move without somebody
 * deciding they should. Dailies and invoices are reported for visibility and
 * never asserted.
 *
 * The real question — did anything of ours reach Fortitude — is answered by
 * looking for our own fingerprints there instead of by counting rows.
 */
const FORTITUDE_STABLE: Record<string, number> = {
  organizations: 1, customers: 2, rates: 2531, projects: 12,
};

/** Reported, never asserted: a live tenant is allowed to do business. */
const FORTITUDE_LIVE = ["dailies", "invoices"] as const;

let failures = 0;
function check(ok: boolean, name: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function main() {
  const key = process.argv[2] ?? "apex";
  const t = targetFor(key);
  const url = urlFor(t, "pooled");
  const id = identityOf(url);

  console.log(`\nValidating ${t.label}`);
  console.log(`  ${id.host} / ${id.database}\n`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  const fort = new PrismaClient();

  try {
    // ---- identity ---------------------------------------------------------
    console.log("identity");
    const settings = await db.orgSettings.findFirst();
    check(settings?.legalName === ORG.legalName, "the organisation is Apex", settings?.legalName ?? "none");
    check(settings?.isDemo === true, "it is marked a demonstration organisation");
    check(settings?.smsEnabled === false, "texting is off");
    check(settings?.assistantEnabled === false, "the assistant is off");

    const orgs = await db.organization.findMany({ select: { name: true } });
    const custs = await db.customer.findMany({ select: { name: true, crewNumber: true } });
    const foreign = [...orgs.map((o) => o.name), ...custs.map((c) => c.name)].filter((n) =>
      /fortitude|globe|trawick/i.test(n),
    );
    check(foreign.length === 0, "no Fortitude, Globe or Trawick identity", foreign.join(", "));
    check(
      !custs.some((c) => c.crewNumber === "24208171927-A27-311"),
      "no Fortitude crew number",
    );
    check(
      custs.some((c) => c.crewNumber === ""),
      "a customer with no crew number exists, so the no-fallback case is real",
    );

    // ---- rates ------------------------------------------------------------
    console.log("\nrate cards");
    const rateRows = await db.customerRate.findMany({
      select: { code: true, rate: true, market: true, customer: { select: { name: true } } },
    });
    check(rateRows.length > 100, "rate card is populated", `${rateRows.length} rows`);
    check(
      rateRows.every((r) => r.rate > 0),
      "every rate is priced",
    );

    const proof = rateRows.filter((r) => r.code === PRICE_PROOF.code && /Calderon/i.test(r.customer.name));
    const tampa = proof.find((r) => r.market === "tampa-bay")?.rate;
    const gulf = proof.find((r) => r.market === "gulf-coast")?.rate;
    check(tampa === PRICE_PROOF.tampaBay, `${PRICE_PROOF.code} is ${PRICE_PROOF.tampaBay} in Tampa Bay`, String(tampa));
    check(gulf === PRICE_PROOF.gulfCoast, `${PRICE_PROOF.code} is ${PRICE_PROOF.gulfCoast} on the Gulf Coast`, String(gulf));
    check(tampa !== gulf, "the two markets do not resolve the same price");

    const tampaOnly = rateRows.filter((r) => r.code === MARKET_ONLY.tampaBayOnly).map((r) => r.market);
    check(!tampaOnly.includes("gulf-coast"), "a Tampa Bay-only code is not priced on the Gulf Coast");

    // ---- dailies price from their own job's card --------------------------
    console.log("\ndailies");
    const dailies = await db.daily.findMany({
      select: { id: true, projectId: true, workDate: true, status: true, totalFt: true, billableAmount: true, lineItems: true, hasAsBuilt: true },
    });
    check(dailies.length > 200, "production history exists", `${dailies.length} dailies`);

    const projects = await db.project.findMany({
      select: { id: true, name: true, market: true, customerId: true, requiredFtPerDay: true, actualFtPerDay: true, status: true },
    });
    const byId = new Map(projects.map((p) => [p.id, p]));

    let mispriced = 0;
    for (const d of dailies) {
      const p = d.projectId ? byId.get(d.projectId) : null;
      if (!p) continue;
      for (const line of (d.lineItems as { code: string; rate: number }[]) ?? []) {
        const exact = rateRows.find(
          (r) => r.code === line.code && r.market === p.market && r.rate === line.rate,
        );
        const blank = rateRows.find((r) => r.code === line.code && r.market === "" && r.rate === line.rate);
        if (!exact && !blank) mispriced++;
      }
    }
    check(mispriced === 0, "every daily line is priced from its own customer and market", `${mispriced} wrong`);

    // ---- money reconciles -------------------------------------------------
    console.log("\nmoney");
    const invoices = await db.invoice.findMany({ select: { id: true, number: true, subtotal: true, retainagePct: true, retainageHeld: true, amountDue: true, status: true, dueAt: true, lines: { select: { amount: true } }, payments: { select: { amount: true } } } });
    let badInvoice = 0;
    for (const inv of invoices) {
      const lines = Math.round(inv.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
      const due = Math.round((inv.subtotal - inv.retainageHeld - paid) * 100) / 100;
      if (Math.abs(lines - inv.subtotal) > 0.05 || Math.abs(due - inv.amountDue) > 0.05) badInvoice++;
    }
    check(invoices.length > 8, "invoices exist", `${invoices.length}`);
    check(badInvoice === 0, "every invoice equals its lines, retainage and payments", `${badInvoice} wrong`);

    const subInvoices = await db.subInvoice.findMany({ select: { number: true, subtotal: true, status: true, lines: { select: { amount: true } }, payments: { select: { amount: true } } } });
    const badSub = subInvoices.filter((s) => Math.abs(Math.round(s.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100 - s.subtotal) > 0.05).length;
    check(badSub === 0, "every subcontractor invoice equals its lines", `${badSub} wrong`);
    check(
      subInvoices.some((s) => s.status === "ACCEPTED" && s.payments.length === 0),
      "a subcontractor payment is genuinely outstanding",
    );

    /**
     * No subcontracted job may show Apex paying out more than it billed.
     *
     * This is the check that would have caught the upsert bug on its own. The
     * rows all looked reasonable; only the arithmetic across them showed a job
     * at minus two per cent, because the invoice had been re-costed and the
     * subcontractor lines had not. A demonstration tenant losing money on its
     * own work is the kind of detail somebody notices in a sales meeting.
     *
     * Self-perform jobs are excluded deliberately: there is no labour,
     * equipment or burden cost in this schema, so their margin is not a number
     * the database can produce and must not be invented.
     */
    const margins = await db.$queryRawUnsafe<{ name: string; billed: number; paid: number }[]>(
      `select p."name",
              coalesce((select sum(il."amount") from "InvoiceLine" il
                          join "Invoice" i on i."id" = il."invoiceId"
                         where i."projectId" = p."id"), 0)::float as billed,
              coalesce((select sum(sl."amount") from "SubInvoiceLine" sl
                          join "SubInvoice" s on s."id" = sl."invoiceId"
                         where s."projectId" = p."id"), 0)::float as paid
         from "Project" p`,
    );
    const costed = margins.filter((m) => m.billed > 0 && m.paid > 0);
    const negative = costed.filter((m) => m.paid >= m.billed);
    check(costed.length > 0, "some project has both a bill and a pay side, so margin is computable", `${costed.length}`);
    check(
      negative.length === 0,
      "no subcontracted project pays out more than it bills",
      negative.map((m) => `${m.name} (${(((m.billed - m.paid) / m.billed) * 100).toFixed(1)}%)`).join(", "),
    );
    if (costed.length) {
      const worst = [...costed].sort((a, b) => (a.billed - a.paid) / a.billed - (b.billed - b.paid) / b.billed)[0];
      console.log(`  weakest margin: ${worst.name} — ${(((worst.billed - worst.paid) / worst.billed) * 100).toFixed(1)}%`);
    }

    // ---- storylines are real ----------------------------------------------
    console.log("\noperational storylines");
    for (const s of REQUIRED_STORYLINES) {
      check(projectsWith(s).length > 0, `the dataset defines "${s}"`);
    }

    for (const p of projectsWith("behind-production")) {
      const row = projects.find((x) => x.name === p.name);
      check(
        !!row && row.actualFtPerDay < row.requiredFtPerDay,
        `${p.name} is behind in its own production numbers`,
        row ? `${row.actualFtPerDay} vs ${row.requiredFtPerDay}` : "missing",
      );
    }

    for (const p of projectsWith("missing-daily")) {
      const row = projects.find((x) => x.name === p.name);
      const mine = dailies.filter((d) => d.projectId === row?.id);
      check(mine.length < p.historyDays, `${p.name} has a genuine gap in its dailies`, `${mine.length} of ${p.historyDays}`);
    }

    for (const p of projectsWith("missing-asbuilt")) {
      const row = projects.find((x) => x.name === p.name);
      const mine = dailies.filter((d) => d.projectId === row?.id);
      check(mine.some((d) => !d.hasAsBuilt), `${p.name} is genuinely missing documentation`);
    }

    // ---- locates ----------------------------------------------------------
    console.log("\nlocates");
    const locates = await db.locateTicket.findMany({ select: { lifecycle: true, expiresOn: true } });
    const states = new Set(locates.map((l) => l.lifecycle));
    check(locates.length > 15, "locate history exists", `${locates.length}`);
    for (const want of ["NEW", "ACTIVE", "EXPIRING", "EXPIRED"]) {
      check(states.has(want as never), `a locate in state ${want} exists`);
    }
    const today = new Date().toISOString().slice(0, 10);
    check(
      locates.some((l) => l.expiresOn > today && l.expiresOn <= new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)),
      "a locate genuinely expires within five days",
    );

    // ---- materials --------------------------------------------------------
    console.log("\nmaterials");
    const tx = await db.materialTransaction.findMany({ select: { kind: true, quantity: true, projectId: true } });
    check(tx.length > 20, "material movements exist", `${tx.length}`);
    const balances = new Map<string, number>();
    for (const m of tx) {
      const sign = m.kind === "RECEIVE" ? 1 : -1;
      balances.set(m.projectId, (balances.get(m.projectId) ?? 0) + sign * m.quantity);
    }
    const low = [...balances.values()].filter((v) => v < 1000).length;
    check(low > 0, "a genuine material shortage exists in the transaction balances", `${low} low`);

    // ---- tasks ------------------------------------------------------------
    console.log("\ntasks");
    const tasks = await db.task.findMany({ select: { status: true, dueDate: true } });
    check(tasks.length > 30, "tasks exist", `${tasks.length}`);
    const overdue = tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < today);
    check(overdue.length > 0, "a task is genuinely overdue by its own due date", `${overdue.length}`);
    const statuses = new Set(tasks.map((t) => t.status));
    for (const want of ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"]) {
      check(statuses.has(want as never), `a task in state ${want} exists`);
    }

    // ---- projects are internally consistent -------------------------------
    console.log("\nprojects");
    check(projects.length === PROJECTS.length, "every project was written", `${projects.length}`);
    const completed = projects.filter((p) => p.status === "Completed");
    const upcoming = projects.filter((p) => p.status === "Upcoming");
    check(completed.length > 0, "a completed project exists");
    check(upcoming.length > 0, "an upcoming project exists");
    const upcomingWithWork = upcoming.filter((p) => dailies.some((d) => d.projectId === p.id));
    check(upcomingWithWork.length === 0, "no upcoming project has production history");

    // ---- nothing was sent -------------------------------------------------
    console.log("\nexternal side effects");
    const deliveries = await db.messageDelivery.count();
    check(deliveries === 0, "no message delivery was recorded, so nothing claims to have been sent", `${deliveries}`);
    const optIns = await db.smsOptIn.count();
    check(optIns === 0, "no SMS consent records were invented", `${optIns}`);

    // ---- Fortitude did not move -------------------------------------------
    console.log("\nFortitude (read-only)");
    const f = await fort.$queryRawUnsafe<Record<string, bigint>[]>(
      `select
         (select count(*) from "public"."Organization") as organizations,
         (select count(*) from "public"."Customer")     as customers,
         (select count(*) from "public"."CustomerRate") as rates,
         (select count(*) from "public"."Project")      as projects,
         (select count(*) from "public"."Daily")        as dailies,
         (select count(*) from "public"."Invoice")      as invoices`,
    );
    for (const [k, want] of Object.entries(FORTITUDE_STABLE)) {
      const got = Number(f[0][k]);
      check(got === want, `Fortitude ${k} is still ${want}`, String(got));
    }
    for (const k of FORTITUDE_LIVE) {
      console.log(`  live    Fortitude ${k}: ${Number(f[0][k])}  (reported, not asserted — a working tenant grows)`);
    }

    /**
     * Contamination, asked directly.
     *
     * Every row this seed writes is prefixed `apex-`, so its fingerprints are
     * unmistakable. Counting rows could only ever notice contamination by
     * accident; this notices it on purpose, and says which table.
     */
    const contaminated: string[] = [];
    const prefixed: [string, () => Promise<number>][] = [
      ["Organization", () => fort.organization.count({ where: { id: { startsWith: "apex-" } } })],
      ["Customer", () => fort.customer.count({ where: { id: { startsWith: "apex-" } } })],
      ["Project", () => fort.project.count({ where: { id: { startsWith: "apex-" } } })],
      ["Daily", () => fort.daily.count({ where: { id: { startsWith: "apex-" } } })],
      ["Invoice", () => fort.invoice.count({ where: { id: { startsWith: "apex-" } } })],
      ["CustomerRate", () => fort.customerRate.count({ where: { id: { startsWith: "apex-" } } })],
      ["Subcontractor", () => fort.subcontractor.count({ where: { id: { startsWith: "apex-" } } })],
      ["Task", () => fort.task.count({ where: { id: { startsWith: "apex-" } } })],
      ["LocateTicket", () => fort.locateTicket.count({ where: { id: { startsWith: "apex-" } } })],
      ["AppSetting", () => fort.appSetting.count({ where: { key: { startsWith: "demo.seed." } } })],
    ];
    for (const [table, count] of prefixed) {
      const n = await count();
      if (n > 0) contaminated.push(`${table} (${n})`);
    }
    check(contaminated.length === 0, "no apex- seeded row exists in Fortitude", contaminated.join(", "));

    // And by name, in case something of ours ever lands without our prefix.
    const apexNames = await fort.$queryRawUnsafe<{ n: bigint }[]>(
      `select (
         (select count(*) from "public"."Organization" where "name" ilike '%apex%') +
         (select count(*) from "public"."Customer"     where "name" ilike any (array['%apex%','%calderon%','%mereside%','%halstead%','%brightwater%','%ardent%'])) +
         (select count(*) from "public"."Project"      where "number" like 'APX-%')
       )::bigint as n`,
    );
    check(Number(apexNames[0].n) === 0, "no Apex organisation, customer or project identity in Fortitude", String(apexNames[0].n));

    console.log("\n" + "=".repeat(64));
    console.log(failures === 0 ? "  VALIDATION PASSED" : `  VALIDATION FAILED — ${failures} problem(s)`);
  } finally {
    await Promise.all([db.$disconnect(), fort.$disconnect()]);
  }

  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("\nValidation failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
