import { Drill, Route } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { ProductionSplit } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * Plow against bore for the week.
 *
 * A single "footage this week" number hides the thing a superintendent
 * actually plans around: plow and bore run at completely different day-rates
 * and bill at different money. Splitting them turns one number into a
 * decision. The contributing codes are listed under each so a total can be
 * checked against the sheets rather than taken on faith.
 */
export function ProductionSplitPanel({ split }: { split: ProductionSplit }) {
  const combined = split.plow.feet + split.bore.feet;
  const plowShare = combined > 0 ? split.plow.feet / combined : 0;
  const peak = Math.max(1, ...split.byDay.map((d) => d.plow + d.bore));

  return (
    <Panel>
      <PanelHeader
        title="Production by method"
        description="Last 7 days · plow separated from bore and missile"
        icon={<Route className="size-3.5" />}
        action="All dailies"
        actionHref="/dailies"
      />

      <PanelBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Method
            label="Plow"
            hint="BFO cable & duct placement"
            feet={split.plow.feet}
            tone="text-success"
            bar="bg-success"
            share={plowShare}
            icon={<Route className="size-4" />}
          />
          <Method
            label="Bore & missile"
            hint="BM60 / BM61 crossings"
            feet={split.bore.feet}
            tone="text-brand-bright"
            bar="bg-brand"
            share={1 - plowShare}
            icon={<Drill className="size-4" />}
          />
        </div>

        {/* One stacked bar per day — where the week's work actually landed. */}
        <div>
          <div className="flex items-end gap-1.5" style={{ height: 72 }}>
            {split.byDay.map((d) => {
              const total = d.plow + d.bore;
              return (
                <div key={d.day} className="flex flex-1 flex-col justify-end gap-px" title={`${d.day}: ${formatNumber(total)} ft`}>
                  {d.bore > 0 ? (
                    <div className="rounded-t bg-brand" style={{ height: `${(d.bore / peak) * 100}%` }} />
                  ) : null}
                  {d.plow > 0 ? (
                    <div className={cn("bg-success", d.bore > 0 ? "" : "rounded-t")} style={{ height: `${(d.plow / peak) * 100}%` }} />
                  ) : null}
                  {total === 0 ? <div className="h-px rounded bg-foreground/[0.08]" /> : null}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
            <span>{split.byDay[0]?.day.slice(5)}</span>
            <span className="num">{formatNumber(combined)} ft total</span>
            <span>{split.byDay[split.byDay.length - 1]?.day.slice(5)}</span>
          </div>
        </div>

        {/* The codes behind each number, so a total can be verified. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CodeList title="Plow codes" codes={split.plow.codes} />
          <CodeList title="Bore codes" codes={split.bore.codes} />
        </div>

        {split.other.feet > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            <span className="num">{formatNumber(split.other.feet)}</span> on units that are
            neither plow nor bore ({split.other.codes.length} codes) — not counted above.
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

function Method({
  label,
  hint,
  feet,
  tone,
  bar,
  share,
  icon,
}: {
  label: string;
  hint: string;
  feet: number;
  tone: string;
  bar: string;
  share: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <span className={cn("shrink-0", tone)}>{icon}</span>
        <p className="eyebrow">{label}</p>
      </div>
      <p className={cn("num mt-1 text-[22px] font-semibold tracking-[-0.02em]", tone)}>
        {formatNumber(feet)}
        <span className="ml-1 text-[12px] font-normal text-muted-foreground">ft</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function CodeList({ title, codes }: { title: string; codes: { code: string; feet: number }[] }) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{title}</p>
      {codes.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground">Nothing billed this week.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {codes.slice(0, 6).map((c) => (
            <li key={c.code} className="flex items-baseline justify-between gap-2">
              <span className="num truncate text-[11.5px] font-medium uppercase text-foreground">
                {c.code}
              </span>
              <span className="num shrink-0 text-[11.5px] text-muted-foreground">
                {formatNumber(c.feet)}
              </span>
            </li>
          ))}
          {codes.length > 6 ? (
            <li className="text-[11px] text-muted-foreground/70">+{codes.length - 6} more</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
