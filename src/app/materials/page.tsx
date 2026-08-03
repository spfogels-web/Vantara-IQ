import { AlertTriangle, Package } from "lucide-react";

import { getMaterials } from "@/data/queries";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { PageShell, StatStrip } from "@/components/common/page-shell";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Meter } from "@/components/common/metric";

export const dynamic = "force-dynamic";
export const metadata = { title: "Materials · Vantara IQ" };

export default async function MaterialsPage() {
  const materials = await getMaterials();

  const overages = materials.filter((m) => m.installed > m.issued);
  const categories = [...new Set(materials.map((m) => m.category))];

  return (
    <PageShell
      eyebrow="Network"
      title="Materials"
      description="Every reel, vault, ped and marker tracked issued-vs-installed. Overage means installed footage exceeds material issued — a billing flag and a reconciliation task."
    >
      <div className="flex flex-col gap-3">
        <StatStrip
          stats={[
            { label: "Tracked items", value: String(materials.length) },
            { label: "Categories", value: String(categories.length) },
            { label: "Overage flags", value: String(overages.length), tone: overages.length ? "text-critical" : "text-success" },
            { label: "Reels active", value: String(materials.filter((m) => m.reelNumber !== "—").length) },
          ]}
        />

        {overages.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-critical/25 bg-critical/10 px-4 py-3 text-[12.5px] text-critical">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">{overages.length} item{overages.length > 1 ? "s" : ""}</span> installed
              beyond material issued. Verify before the affected dailies are billed — this is where duplicate or
              over-billing hides.
            </span>
          </div>
        ) : null}

        <Panel>
          <PanelHeader title="Material reconciliation" count={materials.length} icon={<Package className="size-3.5" />} action="Export CSV" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium sm:px-5">Item</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Reel / lot</th>
                  <th className="px-3 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 text-right font-medium">Issued</th>
                  <th className="px-3 py-2.5 text-right font-medium">Installed</th>
                  <th className="px-3 py-2.5 font-medium">Used</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">On hand</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => {
                  const used = m.issued > 0 ? m.installed / m.issued : 0;
                  const over = m.installed > m.issued;
                  return (
                    <tr key={m.id} className="border-b border-border/40 last:border-0 hover:bg-foreground/[0.02]">
                      <td className="px-4 py-3 sm:px-5">
                        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                          {m.item}
                          {over ? <AlertTriangle className="size-3.5 text-critical" /> : null}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[12px] text-muted-foreground">{m.category}</td>
                      <td className="num px-3 py-3 text-[12px] text-muted-foreground">{m.reelNumber}</td>
                      <td className="px-3 py-3 text-[12px] text-muted-foreground">{m.project}</td>
                      <td className="num px-3 py-3 text-right text-[12.5px] text-foreground">
                        {formatNumber(m.issued)} {m.unit}
                      </td>
                      <td className="num px-3 py-3 text-right text-[12.5px] text-foreground">
                        {formatNumber(m.installed)} {m.unit}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Meter value={Math.min(used, 1)} tone={over ? "critical" : used > 0.9 ? "warning" : "info"} className="h-1 w-16" />
                          <span className="num text-[11px] text-muted-foreground">{Math.round(used * 100)}%</span>
                        </div>
                      </td>
                      <td className={cn("num px-4 py-3 text-right text-[12.5px] font-medium sm:px-5", m.onHand < 0 ? "text-critical" : "text-foreground")}>
                        {formatNumber(m.onHand)} {m.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
