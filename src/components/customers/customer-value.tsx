"use client";

import * as React from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/format";
import { customerRollup, setPriorBilled } from "@/app/actions";

/**
 * What the relationship is worth, added up from the jobs themselves.
 *
 * Nobody types the contract value. Each project's material list is priced at
 * this customer's signed rate card and the totals are summed, so landing
 * another project grows the number on its own. The sub side is the same lists
 * at the crews' cards, and the difference is the baseline net the book carries
 * before overhead, fuel, restoration and damages.
 *
 * The tiles this replaced were seeded figures — a contract value, an open AR
 * and an average days-to-pay that no record in the system supported. There are
 * no payment records yet, so AR and days-to-pay are not shown at all rather
 * than shown wrong.
 */

type Rollup = Awaited<ReturnType<typeof customerRollup>>;

export function CustomerValueTiles({ customerId }: { customerId: string }) {
  const [data, setData] = React.useState<Rollup | null>(null);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(() => {
    setFailed(false);
    customerRollup(customerId).then(setData).catch(() => setFailed(true));
  }, [customerId]);

  React.useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (failed) {
    return (
      <p className="rounded-lg border border-border/70 px-3 py-4 text-[12.5px] text-muted-foreground">
        Couldn&apos;t work out this customer&apos;s value.
      </p>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[68px] animate-pulse rounded-xl border border-border/70 bg-foreground/[0.03]" />
        ))}
      </div>
    );
  }

  const billedPct = data.contractValue > 0 ? data.billedToDate / data.contractValue : null;

  // Say so when the total is assembled from only some of the jobs. A figure
  // built from three of five material lists isn't a smaller number, it's a
  // wrong one, and it should never read as finished.
  const coverage =
    data.projects === 0
      ? "no projects yet"
      : data.projectsValued < data.projects
        ? `${data.projectsValued} of ${data.projects} projects priced`
        : `${data.projects} project${data.projects === 1 ? "" : "s"}`;

  const ar = data.ar;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          label="Contract value"
          value={data.contractValue > 0 ? formatCompactCurrency(data.contractValue) : "—"}
          exact={data.contractValue > 0 ? formatCurrency(data.contractValue) : undefined}
          hint={coverage}
        />
        <BilledTile
          customerId={customerId}
          data={data}
          billedPct={billedPct}
          onSaved={load}
        />
        {/* What is sold and still to invoice. The figure that answers "how much
            work is in the ground that we haven't been paid a cent for yet". */}
        <Tile
          label="Left to bill"
          value={data.leftToBill > 0 ? formatCompactCurrency(data.leftToBill) : "—"}
          exact={data.leftToBill > 0 ? formatCurrency(data.leftToBill) : undefined}
          hint={
            ar.draftValue > 0
              ? `${formatCompactCurrency(ar.draftValue)} staged as drafts`
              : data.leftToBill > 0
                ? "sold, not yet invoiced"
                : "everything sold is billed"
          }
        />

        <Tile
          label="Open AR"
          value={ar.openAr > 0 ? formatCompactCurrency(ar.openAr) : "—"}
          exact={ar.openAr > 0 ? formatCurrency(ar.openAr) : undefined}
          tone={ar.pastDue > 0 ? "text-critical" : ar.openAr > 0 ? "text-warning" : undefined}
          hint={
            ar.pastDue > 0
              ? `${formatCompactCurrency(ar.pastDue)} past due on ${ar.counts.pastDue}`
              : ar.counts.open > 0
                ? `${ar.counts.open} invoice${ar.counts.open === 1 ? "" : "s"} outstanding`
                : ar.counts.paid > 0
                  ? "all invoices settled"
                  : "nothing invoiced yet"
          }
        />
        {/* Money earned and withheld under the contract. Outside AR on purpose:
            it is owed but not collectable until release, and counting it as AR
            makes the position look healthier than the bank will. */}
        <Tile
          label="Retainage held"
          value={ar.retainageHeld > 0 ? formatCompactCurrency(ar.retainageHeld) : "—"}
          exact={ar.retainageHeld > 0 ? formatCurrency(ar.retainageHeld) : undefined}
          hint={ar.retainageHeld > 0 ? "earned, held until release" : "none withheld yet"}
        />
        <Tile
          label="Baseline net profit"
          value={data.baselineNetProfit !== null ? formatCompactCurrency(data.baselineNetProfit) : "—"}
          exact={data.baselineNetProfit !== null ? formatCurrency(data.baselineNetProfit) : undefined}
          hint={
            data.baselineNetProfitPct === null
              ? "needs a crew rate card"
              : data.projectsCosted < data.projectsValued
                ? // Only the jobs with a crew on them are in this figure. Say
                  // so, or it reads as the margin on the whole book.
                  `${formatPercent(data.baselineNetProfitPct, 1)} on ${data.projectsCosted} of ${data.projectsValued} jobs`
                : `${formatCompactCurrency(data.baselineSubCost ?? 0)} sub cost · ${formatPercent(data.baselineNetProfitPct, 1)}`
          }
          tone={
            data.baselineNetProfit === null
              ? undefined
              : data.baselineNetProfit > 0
                ? "text-success"
                : "text-critical"
          }
        />
      </div>

      {data.unpricedCodes > 0 ? (
        <p className="text-[11.5px] text-warning">
          {data.unpricedCodes} material code{data.unpricedCodes === 1 ? " has" : "s have"} no rate on
          the card — that work is missing from the contract value, not counted at zero.
        </p>
      ) : null}

      {/* Work already in the ground that no rate card can price. Louder than
          the material-list warning above, because this is production that has
          happened and cannot be invoiced until the code is right. */}
      {data.unbillable.length > 0 ? (
        <div className="rounded-lg border border-critical/30 bg-critical/[0.06] px-3 py-2">
          <p className="text-[11.5px] font-medium text-critical">
            Reported on approved dailies but not billable — no matching code on the rate card:
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {data.unbillable.map((u) => (
              <li key={u.code} className="num text-[11.5px] text-critical/90">
                {u.code} · {u.quantity.toLocaleString()}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Fix the code on the daily, or add the rate — this work is excluded from billing, not
            billed at zero.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  exact,
  tone,
  action,
  footer,
}: {
  label: string;
  value: string;
  hint?: string;
  exact?: string;
  tone?: string;
  /** Small control in the label row — an edit pencil, nothing larger. */
  action?: React.ReactNode;
  /** Replaces the hint line when the tile is being edited. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-foreground/[0.02] px-3 py-2.5">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {action}
      </div>
      {/* The compact figure is for the tile; the exact one is one hover away,
          because a rounded total is fine to glance at and never fine to bill. */}
      <p
        className={cn("num mt-0.5 text-[19px] font-semibold tracking-[-0.02em] text-foreground", tone)}
        title={exact}
      >
        {value}
      </p>
      {footer ?? (hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null)}
    </div>
  );
}

/**
 * Billed to date, with the one number on this row anyone types.
 *
 * Everything billed inside the system is priced off approved dailies. Work
 * invoiced before that starts at zero unless it's entered, which would make the
 * running total read as though the business began the day the app did — so the
 * opening balance is editable and the computed part never is.
 */
function BilledTile({
  customerId,
  data,
  billedPct,
  onSaved,
}: {
  customerId: string;
  data: Rollup;
  billedPct: number | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(data.priorBilled));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await setPriorBilled(customerId, Number(draft));
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      onSaved();
    } else {
      setError(res.error);
    }
  }

  return (
    <Tile
      label="Billed to date"
      value={data.billedToDate > 0 ? formatCompactCurrency(data.billedToDate) : "—"}
      exact={data.billedToDate > 0 ? formatCurrency(data.billedToDate) : undefined}
      hint={
        editing
          ? undefined
          : data.priorBilled > 0
            ? `${formatCompactCurrency(data.priorBilled)} prior + ${formatCompactCurrency(data.billedFromDailies)} on dailies`
            : billedPct !== null
              ? `${formatPercent(billedPct)} of contract`
              : "from approved dailies"
      }
      action={
        !editing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(String(data.priorBilled));
              setEditing(true);
            }}
            title="Enter billing from before this system"
            className="focus-ring -mr-1 -mt-0.5 grid size-6 place-items-center rounded text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <Pencil className="size-3" />
          </button>
        ) : null
      }
      footer={
        editing ? (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-[10.5px] text-muted-foreground">prior&nbsp;$</span>
              <input
                type="number"
                min={0}
                step="1"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="num w-20 rounded border border-border/70 bg-foreground/[0.04] px-1.5 py-0.5 text-right text-[11.5px] text-foreground outline-none focus:border-brand/60"
              />
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                title="Save"
                className="focus-ring grid size-5 place-items-center rounded text-success hover:bg-foreground/[0.06]"
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                title="Cancel"
                className="focus-ring grid size-5 place-items-center rounded text-muted-foreground hover:bg-foreground/[0.06]"
              >
                <X className="size-3" />
              </button>
            </div>
            {error ? <span className="text-[10.5px] text-critical">{error}</span> : null}
          </div>
        ) : undefined
      }
    />
  );
}
