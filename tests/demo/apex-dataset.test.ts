/**
 * The Apex demo, checked before a single row of it is written.
 *
 * The dataset is pure — quantities, rates, invoices and payments are derived in
 * memory from the rate cards — so everything that could be wrong about it can
 * be caught here rather than discovered in a seeded database that then has to
 * be torn down. Nothing in this file touches Apex or Fortitude.
 */
import { describe, expect, it } from "vitest";

import {
  buildRateCard,
  CUSTOMERS,
  MARKET_ONLY,
  MARKETS,
  PRICE_PROOF,
  rateFor,
} from "../../prisma/demo/apex/catalog";
import { anchorOf, isWorkday } from "../../prisma/demo/apex/dates";
import { buildApexDataset, datasetCounts } from "../../prisma/demo/apex/dataset";
import { IN_HOUSE_CREWS, ORG, SUBS } from "../../prisma/demo/apex/org";
import { PROJECTS, REQUIRED_STORYLINES, projectsWith } from "../../prisma/demo/apex/projects";

const anchor = anchorOf(new Date("2026-09-19T12:00:00Z"));
const data = buildApexDataset(anchor);
const rates = data.rates;

/** Everything Fortitude's database is identified by. None may appear here. */
const FORTITUDE_TERMS = [
  "Fortitude", "GLOBE COMMUNICATIONS", "Globe", "Trawick", "24208171927-A27-311",
  "North Georgia", "South Georgia", "GA811", "BFOV", "BMFAF", "BD5MPF", "BM61", "BHF(",
];

describe("Apex is nobody else", () => {
  it("carries no Fortitude identity anywhere in the dataset", () => {
    const blob = JSON.stringify({
      ORG, CUSTOMERS, MARKETS, PROJECTS, SUBS, IN_HOUSE_CREWS,
      rates, dailies: data.dailies, invoices: data.invoices, subInvoices: data.subInvoices,
    });
    for (const term of FORTITUDE_TERMS) {
      expect(blob.includes(term), `the Apex dataset contains "${term}"`).toBe(false);
    }
  });

  it("is a demonstration organisation with the outside world switched off", () => {
    expect(ORG.isDemo).toBe(true);
    expect(ORG.smsEnabled).toBe(false);
    expect(ORG.assistantEnabled).toBe(false);
  });
});

describe("the rate architecture is customer and market, and nothing else", () => {
  it("prices the same code differently in two of one customer's markets", () => {
    const tampa = rateFor(rates, PRICE_PROOF.customer, "tampa-bay", PRICE_PROOF.code);
    const gulf = rateFor(rates, PRICE_PROOF.customer, "gulf-coast", PRICE_PROOF.code);

    expect(tampa, "Tampa Bay did not price AFO144I as designed").toBe(PRICE_PROOF.tampaBay);
    expect(gulf, "Gulf Coast did not price AFO144I as designed").toBe(PRICE_PROOF.gulfCoast);
    expect(tampa, "both markets resolved the same price").not.toBe(gulf);
  });

  it("does not let one market's price stand in for the other's", () => {
    // A code only one market prices must not resolve in the other.
    expect(rateFor(rates, "calderon", "gulf-coast", MARKET_ONLY.tampaBayOnly)).toBeNull();
    expect(rateFor(rates, "calderon", "tampa-bay", MARKET_ONLY.gulfCoastOnly)).toBeNull();
    // And each does resolve where it belongs, or the nulls above prove nothing.
    expect(rateFor(rates, "calderon", "tampa-bay", MARKET_ONLY.tampaBayOnly)).not.toBeNull();
    expect(rateFor(rates, "calderon", "gulf-coast", MARKET_ONLY.gulfCoastOnly)).not.toBeNull();
  });

  it("still applies a rate that names no market", () => {
    // The legitimate fallback: one price wherever the job is.
    expect(rateFor(rates, "calderon", "tampa-bay", "SPLTST")).not.toBeNull();
    expect(rateFor(rates, "calderon", "gulf-coast", "SPLTST")).not.toBeNull();
  });

  it("never prices one customer's code from another customer's card", () => {
    const calderon = rateFor(rates, "calderon", "tampa-bay", "AFO144I");
    const mereside = rateFor(rates, "mereside", "orlando-metro", "AFO144I");
    expect(calderon).not.toBeNull();
    expect(mereside).not.toBeNull();
    expect(calderon, "two customers resolved the same price for the same code").not.toBe(mereside);
  });

  it("gives every rate row a customer and a code", () => {
    for (const r of rates) {
      expect(r.customer, "a rate row has no customer").toBeTruthy();
      expect(r.code, "a rate row has no code").toBeTruthy();
      expect(r.rate, `${r.code} is priced at zero`).toBeGreaterThan(0);
    }
  });
});

describe("every daily is priced by its own job's card", () => {
  it("uses the rate its project's customer and market actually price", () => {
    for (const d of data.dailies) {
      const p = PROJECTS.find((x) => x.key === d.projectKey)!;
      for (const line of d.lines) {
        const expected = rateFor(rates, p.customer, p.market, line.code);
        expect(
          line.rate,
          `${p.name} billed ${line.code} at ${line.rate}, but its card says ${expected}`,
        ).toBe(expected);
      }
    }
  });

  it("adds up to its own total", () => {
    for (const d of data.dailies) {
      const sum = Math.round(d.lines.reduce((s, l) => s + l.quantity * l.rate, 0) * 100) / 100;
      expect(Math.abs(sum - d.billableAmount), `${d.key} does not reconcile`).toBeLessThan(0.02);
    }
  });

  it("falls only on working days", () => {
    for (const d of data.dailies) {
      expect(isWorkday(new Date(d.workDate + "T12:00:00Z")), `${d.key} is on a weekend`).toBe(true);
    }
  });
});

describe("the money reconciles from the bottom up", () => {
  it("builds every invoice out of its own dailies", () => {
    for (const inv of data.invoices) {
      const covered = data.dailies.filter((d) => inv.dailyKeys.includes(d.key));
      const sum = Math.round(covered.reduce((s, d) => s + d.billableAmount, 0) * 100) / 100;
      expect(Math.abs(sum - inv.subtotal), `${inv.number} does not equal the work it covers`).toBeLessThan(0.02);

      const held = Math.round(inv.subtotal * inv.retainagePct * 100) / 100;
      expect(Math.abs(held - inv.retainageHeld), `${inv.number} retainage is not its own percentage`).toBeLessThan(0.02);

      const due = Math.round((inv.subtotal - inv.retainageHeld - inv.paidAmount) * 100) / 100;
      expect(Math.abs(due - inv.amountDue), `${inv.number} amount due does not follow`).toBeLessThan(0.02);
    }
  });

  it("invoices only work that was approved", () => {
    const approved = new Set(data.dailies.filter((d) => d.status === "Approved").map((d) => d.key));
    for (const inv of data.invoices) {
      for (const k of inv.dailyKeys) {
        expect(approved.has(k), `${inv.number} bills ${k}, which was never approved`).toBe(true);
      }
    }
  });

  it("pays subcontractors less than it bills for the same work", () => {
    for (const si of data.subInvoices) {
      const covered = data.dailies.filter((d) => si.dailyKeys.includes(d.key));
      const billed = covered.reduce((s, d) => s + d.billableAmount, 0);
      expect(si.subtotal, `${si.number} pays more than the work billed`).toBeLessThan(billed);
      const sum = Math.round(covered.reduce((s, d) => s + (d.subCost ?? 0), 0) * 100) / 100;
      expect(Math.abs(sum - si.subtotal), `${si.number} does not reconcile`).toBeLessThan(0.02);
    }
  });

  it("claims no cost for self-perform work, because the schema holds none", () => {
    // The honest limit: no labour, equipment or burden cost exists here, so a
    // self-perform margin would be a number the database cannot support.
    const selfPerform = PROJECTS.filter((p) => p.performedBy.kind === "crew").map((p) => p.key);
    for (const d of data.dailies) {
      if (!selfPerform.includes(d.projectKey)) continue;
      expect(d.subCost, `${d.key} is self-perform but carries a cost`).toBeNull();
    }
    for (const si of data.subInvoices) {
      expect(selfPerform.includes(si.projectKey), `${si.number} pays a crew that is on payroll`).toBe(false);
    }
  });
});

describe("the storylines are real conditions, not labels", () => {
  it("contains every storyline it promises", () => {
    for (const s of REQUIRED_STORYLINES) {
      expect(projectsWith(s).length, `no project demonstrates "${s}"`).toBeGreaterThan(0);
    }
  });

  it("makes a behind-schedule job behind in its own production history", () => {
    for (const p of projectsWith("behind-production")) {
      const mine = data.dailies.filter((d) => d.projectKey === p.key);
      const perDay = mine.reduce((s, d) => s + d.totalFt, 0) / mine.length;
      expect(
        perDay,
        `${p.name} is tagged behind but produced ${Math.round(perDay)} ft/day against ${p.requiredFtPerDay}`,
      ).toBeLessThan(p.requiredFtPerDay);
    }
  });

  it("makes a healthy job actually keep pace", () => {
    for (const p of projectsWith("healthy")) {
      const mine = data.dailies.filter((d) => d.projectKey === p.key);
      if (!mine.length || p.requiredFtPerDay === 0) continue;
      const perDay = mine.reduce((s, d) => s + d.totalFt, 0) / mine.length;
      expect(perDay, `${p.name} is tagged healthy but is behind`).toBeGreaterThan(p.requiredFtPerDay * 0.85);
    }
  });

  it("makes a missing daily a genuine gap in the dates", () => {
    for (const p of projectsWith("missing-daily")) {
      const mine = data.dailies.filter((d) => d.projectKey === p.key);
      expect(
        mine.length,
        `${p.name} is tagged missing-daily but has a complete history`,
      ).toBeLessThan(p.historyDays);
    }
  });

  it("leaves ready-to-bill work genuinely uninvoiced", () => {
    for (const p of projectsWith("ready-to-bill")) {
      const approved = data.dailies.filter((d) => d.projectKey === p.key && d.status === "Approved");
      const invoiced = new Set(data.invoices.filter((i) => i.projectKey === p.key).flatMap((i) => i.dailyKeys));
      const outstanding = approved.filter((d) => !invoiced.has(d.key));
      expect(outstanding.length, `${p.name} is tagged ready-to-bill but everything is invoiced`).toBeGreaterThan(0);
    }
  });

  it("leaves work awaiting verification unapproved and therefore unbillable", () => {
    for (const p of projectsWith("awaiting-verification")) {
      const submitted = data.dailies.filter((d) => d.projectKey === p.key && d.status === "Submitted");
      expect(submitted.length, `${p.name} has nothing awaiting verification`).toBeGreaterThan(0);
    }
  });

  it("makes an unpaid invoice overdue by its dates", () => {
    const unpaid = data.invoices.filter((i) => i.status === "SENT" && i.dueDays !== null && i.dueDays < 0);
    expect(unpaid.length, "no invoice is genuinely past due").toBeGreaterThan(0);
    for (const i of unpaid) expect(i.amountDue, `${i.number} is overdue but owes nothing`).toBeGreaterThan(0);
  });

  it("leaves a subcontractor payment genuinely outstanding", () => {
    const pending = data.subInvoices.filter((s) => s.status === "ACCEPTED" && s.paidAmount === 0);
    expect(pending.length, "no subcontractor payment is pending").toBeGreaterThan(0);
  });

  it("leaves documentation genuinely missing where that is the story", () => {
    for (const p of projectsWith("missing-asbuilt")) {
      const mine = data.dailies.filter((d) => d.projectKey === p.key);
      expect(mine.some((d) => !d.hasAsBuilt), `${p.name} has as-builts on every daily`).toBe(true);
    }
  });
});

describe("the dataset is the size it says it is", () => {
  it("reports counts that match what was built", () => {
    const c = datasetCounts(data);
    expect(c.customers).toBe(5);
    expect(c.projects).toBe(18);
    expect(c.inHouseCrews).toBe(4);
    expect(c.subcontractors).toBe(7);
    expect(c.dailies).toBeGreaterThan(200);
    expect(c.invoices).toBeGreaterThan(8);
    expect(c.subInvoices).toBeGreaterThan(8);
    console.log("  planned counts:", JSON.stringify(c));
  });

  it("is identical on two builds from the same anchor", () => {
    // An idempotent seed depends on this: re-running must not renumber or
    // re-price anything, or every invoice already written stops reconciling.
    const again = buildApexDataset(anchorOf(new Date("2026-09-19T12:00:00Z")));
    expect(JSON.stringify(again.dailies)).toBe(JSON.stringify(data.dailies));
    expect(JSON.stringify(again.invoices)).toBe(JSON.stringify(data.invoices));
  });

  it("produces the same shape from a different anchor", () => {
    const later = buildApexDataset(anchorOf(new Date("2027-03-04T12:00:00Z")));
    expect(later.dailies.length).toBe(data.dailies.length);
    expect(later.invoices.length).toBe(data.invoices.length);
    // And the dates really did move with the anchor.
    expect(later.dailies[0].workDate).not.toBe(data.dailies[0].workDate);
  });
});
