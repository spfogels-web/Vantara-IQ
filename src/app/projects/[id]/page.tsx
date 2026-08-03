import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Calendar, ClipboardList, TrendingUp } from "lucide-react";

import {
  getCustomers,
  getDailies,
  getMaterials,
  getProject,
} from "@/data/queries";
import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import {
  formatCompactCurrency,
  formatCurrency,
  formatFeet,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { PageShell } from "@/components/common/page-shell";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { HealthRing } from "@/components/common/health-ring";
import { StatusPill } from "@/components/common/status-pill";
import { Meter } from "@/components/common/metric";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, customers, dailies, materials] = await Promise.all([
    getProject(id),
    getCustomers(),
    getDailies(),
    getMaterials(),
  ]);

  if (!project) notFound();

  const customer = customers.find((c) => c.name === project.client);
  const rateItems = customer?.rateSheet.filter((r) => r.unit === "ft") ?? [];
  const avgRate = rateItems.length
    ? rateItems.reduce((s, r) => s + r.rate, 0) / rateItems.length
    : 12;

  // Derived project economics from footage + the customer's blended unit rate.
  const totalFt = Math.round(project.remainingFt / (1 - project.pctComplete / 100));
  const installedFt = totalFt - project.remainingFt;
  const contractValue = Math.round(totalFt * avgRate);
  const customerBilling = Math.round(installedFt * avgRate);
  const subPay = Math.round(customerBilling * 0.68);
  const profit = customerBilling - subPay;
  const margin = customerBilling > 0 ? profit / customerBilling : 0;
  const daysToFinish = Math.ceil(project.remainingFt / Math.max(project.actualFtPerDay, 1));

  const projectDailies = dailies.filter((d) => d.projectId === project.id);
  const projectMaterials = materials.filter((m) => m.project === project.name);

  return (
    <PageShell
      eyebrow="Project"
      title={project.name}
      description={`${project.client} · ${project.location}`}
    >
      <div className="mb-3">
        <Link
          href="/projects"
          className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All projects
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Left: status + economics */}
        <div className="flex flex-col gap-3 xl:col-span-8">
          <Panel>
            <PanelBody className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-4">
                <HealthRing score={project.health} size={72} stroke={5} />
                <div>
                  <p className="eyebrow">Project health</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusPill label={project.status} tone={project.tone} />
                  </div>
                  <p className={cn("mt-1.5 text-[12.5px] font-medium", toneStyles[project.forecastTone].text)}>
                    Forecast: {project.forecast}
                  </p>
                </div>
              </div>

              <div className="ml-auto grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                <KeyStat label="Complete" value={`${project.pctComplete}%`} />
                <KeyStat label="Remaining" value={formatFeet(project.remainingFt)} />
                <KeyStat label="Est. finish" value={`${daysToFinish} days`} />
                <KeyStat label="Actual pace" value={`${formatNumber(project.actualFtPerDay)} ft/day`} />
                <KeyStat label="Required pace" value={`${formatNumber(project.requiredFtPerDay)} ft/day`} />
                <KeyStat label="Crew" value={project.crew} />
              </div>
            </PanelBody>
            <div className="border-t border-border/70 px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between text-[11.5px]">
                <span className="text-muted-foreground">Progress</span>
                <span className="num text-muted-foreground">
                  {formatFeet(installedFt)} of {formatFeet(totalFt)}
                </span>
              </div>
              <Meter value={project.pctComplete / 100} tone={project.tone} className="mt-1.5" />
            </div>
          </Panel>

          {/* Economics — the "brain" numbers */}
          <Panel>
            <PanelHeader
              title="Project economics"
              description="Derived from installed footage and the customer's blended unit rate"
              icon={<TrendingUp className="size-3.5" />}
            />
            <PanelBody className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Economic label="Contract value" value={formatCompactCurrency(contractValue)} />
              <Economic label="Customer billing" value={formatCompactCurrency(customerBilling)} hint="Installed to date" />
              <Economic label="Subcontractor pay" value={formatCompactCurrency(subPay)} hint="~68% of billing" />
              <Economic label="Gross profit" value={formatCompactCurrency(profit)} tone="text-success" />
              <Economic label="Margin" value={formatPercent(margin)} tone={margin >= 0.25 ? "text-success" : "text-warning"} />
              <Economic label="Blended rate" value={`${formatCurrency(avgRate)}/ft`} />
            </PanelBody>
          </Panel>

          {/* Dailies for this project */}
          <Panel>
            <PanelHeader
              title="Recent dailies"
              count={projectDailies.length}
              icon={<ClipboardList className="size-3.5" />}
              action="All dailies"
              actionHref="/dailies"
            />
            {projectDailies.length === 0 ? (
              <PanelBody className="py-8 text-center text-[12.5px] text-muted-foreground">
                No dailies submitted for this project yet.
              </PanelBody>
            ) : (
              <ul className="p-2">
                {projectDailies.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/dailies?sheet=${d.id}`}
                      className="focus-ring flex items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-white/[0.03]"
                    >
                      <span className="num shrink-0 text-[11px] text-muted-foreground">{d.workDate}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                        {d.subcontractor} · {d.crew}
                      </span>
                      <span className="num shrink-0 text-[12px] font-medium text-foreground">
                        {formatFeet(d.totalFt)}
                      </span>
                      <StatusPill label={d.status} tone={d.tone} className="shrink-0 text-[10px]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Right: customer + materials */}
        <div className="flex flex-col gap-3 xl:col-span-4">
          <Panel>
            <PanelHeader title="Customer" icon={<Calendar className="size-3.5" />} />
            <PanelBody className="flex flex-col gap-2.5">
              <p className="text-[14px] font-semibold text-foreground">{project.client}</p>
              {customer ? (
                <>
                  <Row label="Payment terms" value={customer.paymentTerms} />
                  <Row label="Retainage" value={formatPercent(customer.retainagePct)} />
                  <Row label="Avg days to pay" value={String(customer.avgDaysToPay)} />
                  <Link
                    href="/customers"
                    className="focus-ring mt-1 inline-flex items-center gap-1 rounded text-[12px] font-medium text-brand-bright hover:underline"
                  >
                    View customer →
                  </Link>
                </>
              ) : (
                <p className="text-[12px] text-muted-foreground">Customer record not linked.</p>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Material on project"
              count={projectMaterials.length}
              icon={<Boxes className="size-3.5" />}
              action="Materials"
              actionHref="/materials"
            />
            {projectMaterials.length === 0 ? (
              <PanelBody className="py-8 text-center text-[12.5px] text-muted-foreground">
                No material tracked here yet.
              </PanelBody>
            ) : (
              <ul className="p-2">
                {projectMaterials.map((m) => {
                  const used = m.issued > 0 ? m.installed / m.issued : 0;
                  return (
                    <li key={m.id} className="rounded-lg px-2.5 py-2.5 hover:bg-white/[0.03]">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{m.item}</span>
                        <span className={cn("num shrink-0 text-[11.5px] font-medium", toneStyles[m.tone].text)}>
                          {formatNumber(m.installed)}/{formatNumber(m.issued)} {m.unit}
                        </span>
                      </div>
                      <Meter value={used} tone={m.tone} className="mt-1.5 h-1" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}

function KeyStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="num mt-0.5 text-[14px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Economic({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white/[0.02] px-3.5 py-3">
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground", tone)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-2 text-[12.5px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
