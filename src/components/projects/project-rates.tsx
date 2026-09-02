"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Plus, Tags } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent, formatRate } from "@/lib/format";
import type { ProjectRates } from "@/data/queries";
import {
  addSubRate,
  applyCustomerRateCard,
  copyRatesToProject,
  setProjectRate,
  updateSubRate,
} from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * The rates that apply to this job, and nothing else.
 *
 * A full card runs to thousands of lines; a job uses twenty. Sending a crew
 * their rates — or moving one before you do — means working from the codes on
 * this material list, so that is all this shows: what the customer pays, what
 * the crew is paid, and the spread between them on the same code.
 *
 * Staff only, and gated on the server rather than hidden here. This is the
 * margin on the crew's own work, which is the one number they must never see.
 */

export type RateCardOption = {
  key: string;
  customerName: string;
  marketLabel: string;
  count: number;
};

export function ProjectRatesPanel({
  projectId,
  rates,
  crews,
  rateCards = [],
}: {
  projectId: string;
  rates: ProjectRates;
  /** Every customer card on file, so the bill side can be filled from one. */
  rateCards?: RateCardOption[];
  /** Crews with a card on file, to seed a budget from. */
  crews: { id: string; company: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cardNote, setCardNote] = React.useState<string | null>(null);

  const { crew, lines, totals } = rates;

  /**
   * Move what we pay on one code.
   *
   * Writes to whichever card the column is showing. With a crew on the job that
   * is their signed card — the number they actually get paid. Without one it is
   * the job's own budget, which exists so a job can be costed before anyone is
   * assigned. Editing must never quietly cross from one to the other.
   */
  async function setPay(line: ProjectRates["lines"][number], raw: string) {
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0 || next === line.subRate) return;

    setBusy(line.code);
    setError(null);

    const res =
      crew && rates.source === "crew"
        ? line.subRateId
          ? await updateSubRate(line.subRateId, { rate: next })
          : await addSubRate(crew.id, {
              code: line.code,
              description: line.description,
              unit: line.unit,
              rate: next,
            })
        : await setProjectRate(projectId, {
            code: line.code,
            rate: next,
            description: line.description,
            unit: line.unit,
          });

    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  /**
   * Fill the bill side from a card we already hold.
   *
   * The result is reported rather than just refreshed: which codes the card
   * did not carry is the useful part, because those are the lines that will
   * still read "no rate" afterwards.
   */
  async function applyCard(key: string) {
    if (!key) return;
    setBusy("card");
    setError(null);
    setCardNote(null);
    const res = await applyCustomerRateCard(projectId, key);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCardNote(
      `Priced ${res.written} of the codes on this job` +
        (res.alreadySet > 0 ? `, left ${res.alreadySet} already set` : "") +
        (res.notOnCard.length > 0
          ? `. Not on that card: ${res.notOnCard.join(", ")}`
          : "."),
    );
    router.refresh();
  }

  /** Start the budget from a crew's existing card, then move what differs. */
  async function copyFrom(subcontractorId: string) {
    if (!subcontractorId) return;
    setBusy("copy");
    setError(null);
    const res = await copyRatesToProject(projectId, subcontractorId);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  const marginPct =
    totals.margin !== null && totals.revenue > 0 ? totals.margin / totals.revenue : null;

  return (
    <Panel>
      <PanelHeader
        title="Rates on this job"
        description={
          crew
            ? `What Globe pays us and what ${crew.company} is paid, on the ${lines.length} codes this job uses`
            : `What the customer pays us on the ${lines.length} codes this job uses`
        }
        count={lines.length}
        icon={<Tags className="size-3.5" />}
      >
        {/* Built from the rates as they stand, so a figure edited here is
            already right on the sheet you send — no second copy to keep in
            step. */}
        <a
          href={crew ? `/api/rate-sheet/${crew.id}` : undefined}
          className={cn(
            "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright",
            !crew && "pointer-events-none opacity-40",
          )}
        >
          <Download className="size-3.5" /> Rate sheet to send
        </a>
      </PanelHeader>

      {lines.length === 0 ? (
        <PanelBody className="py-8 text-center text-[12.5px] text-muted-foreground">
          No material list on this job yet — rates follow the codes it uses.
        </PanelBody>
      ) : (
        <>
          {/* Whose numbers these are. A budget and a signed card price the job
              identically and mean completely different things, so the column
              never leaves it ambiguous. */}
          {rates.source === "planned" ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
              <p className="text-[11.5px] text-muted-foreground">
                <span className="font-medium text-warning">Budgeted rates</span> — what this job is
                planned to cost. Nobody is being paid these.
                {rates.ambiguous
                  ? " Two crews with cards are on this job, so neither is assumed."
                  : rates.unratedCrews.length > 0
                    ? ` No card on file for ${rates.unratedCrews.join(", ")}.`
                    : ""}
              </p>
              {/* The bill side. Sits before the crew picker because a job with
                  no billing rates has no margin to judge a cost against, and
                  that is the column somebody opens this panel for. */}
              {rateCards.length > 0 && rates.missingCustomerRates > 0 ? (
                <select
                  defaultValue=""
                  disabled={busy === "card"}
                  onChange={(e) => void applyCard(e.target.value)}
                  className="ml-auto h-7 rounded-lg border border-gold/45 bg-gold/[0.08] px-2 text-[11.5px] text-foreground outline-none focus:border-gold"
                >
                  <option value="">Price it from a rate card…</option>
                  {rateCards.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.customerName} · {c.marketLabel} ({c.count})
                    </option>
                  ))}
                </select>
              ) : null}
              {crews.length > 0 ? (
                <select
                  defaultValue=""
                  disabled={busy === "copy"}
                  onChange={(e) => void copyFrom(e.target.value)}
                  className={cn(
                    "h-7 rounded-lg border border-border bg-foreground/[0.03] px-2 text-[11.5px] text-foreground outline-none focus:border-brand/60",
                    rateCards.length > 0 && rates.missingCustomerRates > 0 ? "" : "ml-auto",
                  )}
                >
                  <option value="">Start from a crew&apos;s card…</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company}
                    </option>
                  ))}
                </select>
              ) : null}
              {busy === "copy" || busy === "card" ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </div>
          ) : (
            <p className="border-b border-border/70 px-3 py-2 text-[11.5px] text-muted-foreground">
              <span className="font-medium text-success">{crew?.company}&apos;s signed card</span> —
              editing here changes what they are actually paid.
            </p>
          )}
          {error ? (
            <p className="border-b border-border/70 px-3 py-2 text-[11.5px] text-critical">{error}</p>
          ) : null}
          {cardNote ? (
            <p className="border-b border-border/70 px-3 py-2 text-[11.5px] text-foreground">
              {cardNote}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium sm:px-5">Code</th>
                  <th className="px-3 py-2 font-medium">Work</th>
                  <th className="px-3 py-2 text-right font-medium">Planned</th>
                  <th className="px-3 py-2 text-right font-medium">We bill</th>
                  <th className="px-3 py-2 text-right font-medium">We pay</th>
                  <th className="px-3 py-2 text-right font-medium">Spread</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Job margin</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const lineMargin =
                    l.plannedRevenue !== null && l.plannedCost !== null
                      ? l.plannedRevenue - l.plannedCost
                      : null;
                  return (
                    <tr
                      key={l.code}
                      className="border-b border-border/40 last:border-0 hover:bg-foreground/[0.02]"
                    >
                      <td className="num px-4 py-2 text-[12px] font-semibold uppercase text-brand-bright sm:px-5">
                        {l.code}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-[12px] text-muted-foreground">
                        {l.description}
                      </td>
                      <td className="num px-3 py-2 text-right text-[12px] text-muted-foreground">
                        {formatNumber(l.planned)} {l.unit}
                      </td>
                      <td className="num px-3 py-2 text-right text-[12.5px] text-foreground">
                        {l.customerRate !== null ? (
                          formatRate(l.customerRate)
                        ) : (
                          <span className="text-warning">no rate</span>
                        )}
                      </td>
                      {/* Editable with or without a crew: this is the number
                          you move before sending the sheet, and the one that
                          costs the job before anyone is picked. */}
                      <td className="px-3 py-1.5 text-right">
                        <span className="inline-flex items-center gap-1">
                          {busy === l.code ? (
                            <Loader2 className="size-3 animate-spin text-muted-foreground" />
                          ) : l.subRate === null ? (
                            <Plus className="size-3 text-warning" />
                          ) : null}
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            defaultValue={l.subRate ?? ""}
                            placeholder="set"
                            onBlur={(e) => void setPay(l, e.target.value)}
                            className={cn(
                              "num w-20 rounded border bg-foreground/[0.03] px-1.5 py-1 text-right text-[12.5px] text-foreground outline-none focus:border-brand/60 focus:bg-brand/[0.06]",
                              l.subRate === null ? "border-warning/40" : "border-border/70",
                            )}
                          />
                        </span>
                      </td>
                      <td
                        className={cn(
                          "num px-3 py-2 text-right text-[12.5px] font-medium",
                          l.spread === null
                            ? "text-muted-foreground"
                            : l.spread > 0
                              ? "text-success"
                              : "text-critical",
                        )}
                      >
                        {l.spread !== null ? formatRate(l.spread) : "—"}
                      </td>
                      <td className="num px-4 py-2 text-right text-[12.5px] text-foreground sm:px-5">
                        {lineMargin !== null ? formatCurrency(lineMargin) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/70 bg-foreground/[0.02]">
                  <td colSpan={3} className="px-4 py-2.5 text-[11.5px] text-muted-foreground sm:px-5">
                    {rates.missingCustomerRates > 0 ? (
                      <span className="text-warning">
                        {rates.missingCustomerRates} code
                        {rates.missingCustomerRates === 1 ? "" : "s"} with no customer rate — that
                        work is not in the revenue, not counted at zero.
                      </span>
                    ) : rates.missingSubRates > 0 ? (
                      <span className="text-warning">
                        {rates.missingSubRates} code{rates.missingSubRates === 1 ? "" : "s"} with no
                        pay rate — set them before sending the sheet.
                      </span>
                    ) : (
                      "Every code on this job is priced on both sides."
                    )}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-[12.5px] font-semibold text-foreground">
                    {formatCurrency(totals.revenue)}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-[12.5px] font-semibold text-foreground">
                    {crew ? formatCurrency(totals.cost) : "—"}
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className="num px-4 py-2.5 text-right text-[12.5px] font-semibold sm:px-5">
                    {totals.margin !== null ? (
                      <span className={totals.margin > 0 ? "text-success" : "text-critical"}>
                        {formatCurrency(totals.margin)}
                        {marginPct !== null ? (
                          <span className="ml-1 font-normal text-muted-foreground">
                            {formatPercent(marginPct, 1)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
