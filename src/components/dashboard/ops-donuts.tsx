import { ClipboardList, ShieldAlert } from "lucide-react";

import { Donut, type DonutSlice } from "@/components/charts/donut";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import type { LocateSummary } from "@/data/queries";

/**
 * The two states somebody checks before they plan a day: what is waiting to be
 * reviewed, and whether the ground can legally be opened.
 *
 * Both are counts of things in one of a few states, which is what a donut is
 * for — a share of a whole where the whole is meaningful. Neither is a trend,
 * so neither is a line.
 *
 * Status colour throughout, not the categorical ramp: these are states, and
 * green/amber/red mean the same here as everywhere else in the product. Every
 * slice is named and numbered in the legend, so nothing is carried by colour
 * alone.
 */

export type DailyStatusCounts = {
  submitted: number;
  inReview: number;
  flagged: number;
  approved: number;
  denied: number;
  draft: number;
  /** Submitted and sitting for more than three days. A subset of `submitted`. */
  stale: number;
};

export function DailiesDonut({ counts }: { counts: DailyStatusCounts }) {
  /**
   * Everything that has not been settled one way or the other.
   *
   * Approved and Denied are decided; the other four are a day somebody still
   * has to deal with. This is deliberately not the "Need review" figure from
   * /dailies — that one also counts a day with no photos or an unpriced code,
   * which cannot be known without reading every row, and this panel exists on
   * the page everybody opens first. So the label says what the number is.
   */
  const open =
    counts.submitted + counts.inReview + counts.flagged + counts.draft;

  /**
   * The colours are the ones the billing sheet's own legend already teaches a
   * crew — Submitted is info, review is gold, Approved green, a rejection red.
   * A state does not change colour because it turned up on a different screen,
   * so these are taken from the status tokens rather than the chart ramp.
   *
   * The ORDER, though, is set by colour separation, not by lifecycle.
   *
   * Two of these tokens are ambers (`--vq-gold` and `--warning`) and in the
   * light theme they are both dark browns a shade apart: the palette validator
   * puts them at ΔE 0.7 for a protanope and 8.0 for everyone else, which is to
   * say indistinguishable. Lifecycle order sits them next to each other. This
   * order separates them, and was checked against the validator in both themes
   * including the wrap-around pair, because a ring's last slice touches its
   * first.
   *
   * Identity never rests on hue here regardless: every slice is in the legend
   * with its own name, count and share, which is the rule for status colour.
   *
   * Zero-count states are dropped rather than drawn, so the legend does not
   * carry two dead rows on every normal day. Filtering preserves the order, and
   * each state keeps its own colour whichever others are present — colour
   * follows the state, never its position in the list.
   */
  const slices: DonutSlice[] = (
    [
      { label: "Submitted", value: counts.submitted, color: "var(--info)" },
      { label: "Flagged", value: counts.flagged, color: "var(--warning)" },
      { label: "Not filed", value: counts.draft, color: "var(--neutral)" },
      { label: "Approved", value: counts.approved, color: "var(--success)" },
      { label: "In review", value: counts.inReview, color: "var(--vq-gold)" },
      { label: "Denied", value: counts.denied, color: "var(--critical)" },
    ] satisfies DonutSlice[]
  ).filter((s) => s.value > 0);

  return (
    <Panel>
      <PanelHeader
        title="Dailies"
        description="Every day on the books, and where it has got to"
        icon={<ClipboardList className="size-3.5 text-gold" />}
        action="Review dailies"
        actionHref="/dailies"
      />
      <PanelBody>
        <Donut slices={slices} centreValue={open.toLocaleString("en-US")} centreLabel="still open" />
        {/* The number that actually costs money: a day nobody has looked at is
            a day that cannot be invoiced and a crew that cannot be paid. */}
        {counts.stale > 0 ? (
          <p className="mt-3 border-t border-border/60 pt-2.5 text-[11.5px] text-warning">
            {counts.stale} {counts.stale === 1 ? "has" : "have"} been waiting more than three days.
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

export function LocatesDonut({ summary }: { summary: LocateSummary }) {
  const slices: DonutSlice[] = [
    { label: "Clear to dig", value: summary.active, color: "var(--success)" },
    { label: "Waiting on responses", value: summary.awaitingResponses, color: "var(--warning)" },
    { label: "Due", value: summary.due, color: "var(--info)" },
    { label: "Expired", value: summary.expired, color: "var(--critical)" },
    // Status tokens throughout, not a hue off the categorical ramp — these are
    // states, and one unnamed colour among five reserved ones reads as a sixth
    // meaning nobody has been told.
    { label: "Unknown", value: summary.unknown, color: "var(--neutral)" },
  ];

  const blocked = summary.expired + summary.unknown;

  return (
    <Panel>
      <PanelHeader
        title="Locate status"
        description="811 tickets across every open job"
        icon={<ShieldAlert className="size-3.5 text-gold" />}
        action="All tickets"
        actionHref="/locates"
      />
      <PanelBody>
        <Donut
          slices={slices}
          total={summary.total}
          centreValue={summary.total.toLocaleString("en-US")}
          centreLabel="tickets"
        />
        {blocked > 0 ? (
          <p className="mt-3 border-t border-border/60 pt-2.5 text-[11.5px] text-critical">
            {blocked} ticket{blocked === 1 ? "" : "s"} {blocked === 1 ? "is" : "are"} expired or
            unanswered — that ground is not clear to open.
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
