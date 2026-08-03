import { Check, Receipt, Zap } from "lucide-react";

import { getPayApplications } from "@/data/queries";
import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { PageShell, StatStrip } from "@/components/common/page-shell";
import { Panel, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay applications · Vantara IQ" };

export default async function PayApplicationsPage() {
  const payApps = await getPayApplications();

  const pending = payApps.filter((p) => p.status === "Pending review");
  const pendingTotal = pending.reduce((s, p) => s + p.amount, 0);
  const approvedTotal = payApps
    .filter((p) => p.status === "Approved" || p.status === "Scheduled")
    .reduce((s, p) => s + p.amount, 0);
  const retainageHeld = payApps.reduce((s, p) => s + p.retainage, 0);

  return (
    <PageShell
      eyebrow="Financials"
      title="Pay applications"
      description="Subcontractor pay, driven by approved dailies. Retainage, Fast Pay and ACH export handled in one register with a full audit trail."
      actions={
        <Button size="sm" className="h-9 gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright">
          Export ACH batch
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <StatStrip
          stats={[
            { label: "Pending review", value: formatCompactCurrency(pendingTotal), hint: `${pending.length} pay apps`, tone: "text-warning" },
            { label: "Approved / scheduled", value: formatCompactCurrency(approvedTotal), tone: "text-success" },
            { label: "Retainage held", value: formatCompactCurrency(retainageHeld) },
            { label: "Total pay apps", value: String(payApps.length) },
          ]}
        />

        <Panel>
          <PanelHeader title="Pay application register" count={payApps.length} icon={<Receipt className="size-3.5" />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium sm:px-5">Pay app</th>
                  <th className="px-3 py-2.5 font-medium">Subcontractor</th>
                  <th className="px-3 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 font-medium">Period</th>
                  <th className="px-3 py-2.5 text-right font-medium">Retainage</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">Action</th>
                </tr>
              </thead>
              <tbody>
                {payApps.map((p) => (
                  <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 sm:px-5">
                      <span className="num flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                        {p.number}
                        {p.fastPayEligible ? (
                          <span title="Fast Pay eligible">
                            <Zap className="size-3 text-warning" />
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground">{p.submitted}</span>
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-foreground">{p.subcontractor}</td>
                    <td className="px-3 py-3 text-[12px] text-muted-foreground">{p.project}</td>
                    <td className="px-3 py-3 text-[12px] text-muted-foreground">{p.period}</td>
                    <td className="num px-3 py-3 text-right text-[12px] text-muted-foreground">{formatCurrency(p.retainage)}</td>
                    <td className={cn("num px-3 py-3 text-right text-[12.5px] font-medium", toneStyles[p.tone].text)}>
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill label={p.status} tone={p.tone} dot={false} className="text-[10px]" />
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      {p.status === "Pending review" ? (
                        <Button size="sm" className="h-8 gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright">
                          <Check className="size-3.5" /> Approve
                        </Button>
                      ) : (
                        <span className="text-[11.5px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
