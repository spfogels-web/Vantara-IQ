import { Check, FileStack, Wallet } from "lucide-react";

import { getInvoices } from "@/data/queries";
import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { PageShell, StatStrip } from "@/components/common/page-shell";
import { Panel, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing · Vantara IQ" };

export default async function BillingPage() {
  const invoices = await getInvoices();

  const ready = invoices.filter((i) => i.status === "Ready to bill");
  const readyTotal = ready.reduce((s, i) => s + i.amount, 0);
  const openAr = invoices
    .filter((i) => i.status === "Submitted" || i.status === "Approved" || i.status === "Past due")
    .reduce((s, i) => s + i.amount, 0);
  const pastDue = invoices.filter((i) => i.status === "Past due").reduce((s, i) => s + i.amount, 0);
  const pipeline = invoices.filter((i) => i.status !== "Ready to bill");

  return (
    <PageShell
      eyebrow="Financials"
      title="Billing"
      description="The billing engine. Approved dailies price themselves against each customer's rate sheet — the office reviews and sends, it doesn't calculate."
    >
      <div className="flex flex-col gap-3">
        <StatStrip
          stats={[
            { label: "Ready to bill", value: formatCompactCurrency(readyTotal), hint: `${ready.length} invoices staged`, tone: "text-warning" },
            { label: "Open AR", value: formatCompactCurrency(openAr) },
            { label: "Past due", value: formatCompactCurrency(pastDue), tone: pastDue ? "text-critical" : undefined },
            { label: "Invoices", value: String(invoices.length) },
          ]}
        />

        {/* Ready to bill queue */}
        <Panel>
          <PanelHeader
            title="Ready to bill"
            description="Backup packages assembled — generate and send in one click"
            count={ready.length}
            icon={<Wallet className="size-3.5 text-warning" />}
          >
            <Button size="sm" className="h-8 gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright">
              <Check className="size-3.5" /> Generate all
            </Button>
          </PanelHeader>
          <ul className="p-2">
            {ready.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-foreground/[0.02]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num text-[12px] font-semibold text-foreground">{inv.number}</span>
                    <span className="truncate text-[12.5px] text-muted-foreground">{inv.customer}</span>
                  </div>
                  <p className="truncate text-[11.5px] text-muted-foreground/80">{inv.project}</p>
                </div>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    inv.backupReady ? "bg-success/12 text-success" : "bg-warning/12 text-warning",
                  )}
                >
                  {inv.backupReady ? "Backup ready" : "Backup pending"}
                </span>
                <span className="num w-24 text-right text-[13px] font-semibold text-foreground">
                  {formatCurrency(inv.amount)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!inv.backupReady}
                  className="h-8 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Generate
                </Button>
              </li>
            ))}
          </ul>
        </Panel>

        {/* AR pipeline */}
        <Panel>
          <PanelHeader title="Receivables pipeline" count={pipeline.length} icon={<FileStack className="size-3.5" />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium sm:px-5">Invoice</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Issued</th>
                  <th className="px-3 py-2.5 font-medium">Due</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/40 last:border-0 hover:bg-foreground/[0.02]">
                    <td className="num px-4 py-3 text-[12.5px] font-medium text-foreground sm:px-5">{inv.number}</td>
                    <td className="px-3 py-3 text-[12.5px] text-muted-foreground">{inv.customer}</td>
                    <td className="px-3 py-3 text-[12px] text-muted-foreground">{inv.issued}</td>
                    <td className="px-3 py-3">
                      <span className={cn("text-[12px]", inv.status === "Past due" ? "font-medium text-critical" : "text-muted-foreground")}>
                        {inv.due}
                        {inv.status === "Past due" ? ` · ${Math.abs(inv.daysOut)}d late` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill label={inv.status} tone={inv.tone} dot={false} className="text-[10px]" />
                    </td>
                    <td className={cn("num px-4 py-3 text-right text-[12.5px] font-medium sm:px-5", toneStyles[inv.tone].text)}>
                      {formatCurrency(inv.amount)}
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
