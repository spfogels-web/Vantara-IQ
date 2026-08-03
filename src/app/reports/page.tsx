import { Download } from "lucide-react";

import { getReportDefinitions } from "@/data/queries";
import { getIcon } from "@/lib/icons";
import type { ReportDefinition } from "@/lib/types";
import { PageShell } from "@/components/common/page-shell";
import { Panel, PanelBody } from "@/components/common/panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports · Vantara IQ" };

const CATEGORY_ORDER: ReportDefinition["category"][] = [
  "Production",
  "Financial",
  "Compliance",
  "Customer",
];

export default async function ReportsPage() {
  const reports = await getReportDefinitions();

  return (
    <PageShell
      eyebrow="Intelligence"
      title="Reports"
      description="One-click packages built from the same data the dashboard runs on — production, financial, compliance and customer-ready."
    >
      <div className="flex flex-col gap-6">
        {CATEGORY_ORDER.map((category) => {
          const group = reports.filter((r) => r.category === category);
          if (group.length === 0) return null;
          return (
            <section key={category}>
              <p className="eyebrow mb-2">{category}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.map((r) => {
                  const Icon = getIcon(r.icon);
                  return (
                    <Panel key={r.id} className="group cursor-pointer transition-colors hover:bg-foreground/[0.04]">
                      <PanelBody className="flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-brand-bright ring-1 ring-inset ring-foreground/[0.06]">
                            <Icon className="size-4" strokeWidth={1.8} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[13.5px] font-semibold text-foreground">{r.title}</h3>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{r.cadence}</p>
                          </div>
                          <Download className="size-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                        </div>
                        <p className="text-[12px] leading-relaxed text-muted-foreground">{r.description}</p>
                      </PanelBody>
                    </Panel>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
