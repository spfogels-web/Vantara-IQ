"use client";

import * as React from "react";
import {
  BadgeCheck,
  FolderKanban,
  HardHat,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Star,
  UserPlus,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import type { ComplianceStatus, Project, Subcontractor } from "@/lib/types";
import { formatNumber, formatPercent, initials } from "@/lib/format";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { LogoUpload } from "@/components/common/logo-upload";
import { Button } from "@/components/ui/button";
import { InviteDialog } from "@/components/subcontractors/invite-dialog";

const complianceTone: Record<ComplianceStatus, "success" | "warning" | "critical" | "neutral"> = {
  valid: "success",
  expiring: "warning",
  expired: "critical",
  missing: "neutral",
};

const complianceLabel: Record<ComplianceStatus, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
  missing: "Missing",
};

export function SubcontractorsView({
  subs,
  projects,
}: {
  subs: Subcontractor[];
  projects: Project[];
}) {
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(subs[0]?.id ?? null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteCompany, setInviteCompany] = React.useState<string | undefined>();

  function openInvite(company?: string) {
    setInviteCompany(company);
    setInviteOpen(true);
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter(
      (s) =>
        s.company.toLowerCase().includes(q) ||
        s.lead.toLowerCase().includes(q) ||
        s.trades.some((t) => t.toLowerCase().includes(q)),
    );
  }, [subs, query]);

  const selected = subs.find((s) => s.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="lg:col-span-5 xl:col-span-4">
        <Panel>
          <PanelHeader title="Subcontractors" count={filtered.length} icon={<ShieldCheck className="size-3.5" />}>
            <Button
              size="sm"
              onClick={() => openInvite()}
              className="h-8 gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
            >
              <UserPlus className="size-3.5" /> Invite
            </Button>
          </PanelHeader>
          <div className="border-b border-border/70 p-2.5">
            <label className="flex items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 py-1.5 ring-1 ring-inset ring-foreground/[0.06] focus-within:ring-brand/40">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search company, lead or trade…"
                className="w-full bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </label>
          </div>
          <ul className="max-h-[70vh] flex-1 overflow-y-auto p-1.5">
            {filtered.map((s) => {
              const active = selected?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "focus-ring flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                      active ? "bg-foreground/[0.055]" : "hover:bg-foreground/[0.03]",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                      {initials(s.company)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="truncate text-[13px] font-medium text-foreground">{s.company}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Stars rating={s.scorecard.rating} />
                        <span className="text-muted-foreground/40">·</span>
                        {s.lead}
                      </span>
                    </span>
                    <span className={cn("size-2 shrink-0 rounded-full", toneStyles[s.complianceTone].dot)} title="Compliance" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="lg:col-span-7 xl:col-span-8">
        {selected ? <SubDetail sub={selected} onInvite={() => openInvite(selected.company)} /> : null}
      </div>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        projects={projects}
        company={inviteCompany}
      />
    </div>
  );
}

function SubDetail({ sub: s, onInvite }: { sub: Subcontractor; onInvite: () => void }) {
  const sc = s.scorecard;
  const active = s.state === "Active";

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <PanelBody className="flex flex-wrap items-start gap-4">
          <LogoUpload key={s.id} fallback={initials(s.company)} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">{s.company}</h2>
              <StatusPill label={s.state} tone={s.tone} />
              {active ? <Stars rating={sc.rating} /> : null}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span>{s.lead}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {s.location}</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{s.crewSize} on crew</span>
              <span className="text-muted-foreground/40">·</span>
              <span>Since {s.since}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.trades.map((t) => (
                <span key={t} className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-brand-bright">
              <Mail className="size-3.5" /> {s.email}
            </a>
            <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-brand-bright">
              <Phone className="size-3.5" /> {s.phone}
            </a>
          </div>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* Compliance */}
        <Panel>
          <PanelHeader title="Compliance" description="Documents block work when lapsed" icon={<BadgeCheck className="size-3.5" />} />
          <ul className="flex-1 p-2">
            {s.compliance.map((doc) => {
              const tone = complianceTone[doc.status];
              return (
                <li key={doc.label} className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-foreground/[0.02]">
                  <span className={cn("size-2 shrink-0 rounded-full", toneStyles[tone].dot)} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{doc.label}</span>
                  <span className="shrink-0 text-[11.5px] text-muted-foreground">{doc.expires}</span>
                  <StatusPill label={complianceLabel[doc.status]} tone={tone} dot={false} className="shrink-0 text-[10px]" />
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Assigned projects — what the manager controls */}
        <Panel>
          <PanelHeader
            title="Assigned projects"
            description="Manager-controlled — a sub only sees what they're assigned"
            count={s.assignedProjects.length}
            icon={<FolderKanban className="size-3.5" />}
          />
          <PanelBody>
            {s.assignedProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-[12px] text-muted-foreground">
                No active assignments. Assign a project to grant this sub portal access to it.
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {s.assignedProjects.map((p) => (
                  <li key={p} className="flex items-center gap-2 rounded-lg bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground">
                    <FolderKanban className="size-3.5 text-muted-foreground" />
                    {p}
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onInvite}
              className="mt-3 h-8 w-full rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12px] text-muted-foreground hover:text-foreground"
            >
              Assign to project
            </Button>
          </PanelBody>
        </Panel>
      </div>

      {/* Capabilities statement — required at onboarding */}
      <Panel>
        <PanelHeader
          title="Capabilities & equipment"
          description="From the required capabilities statement"
          icon={<Wrench className="size-3.5" />}
        >
          <StatusPill
            label={s.equipment.length > 0 ? "On file" : "Not submitted"}
            tone={s.equipment.length > 0 ? "success" : "neutral"}
            dot={s.equipment.length > 0}
            className="text-[10px]"
          />
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <HardHat className="size-3.5" /> {s.crewSize} field staff
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FolderKanban className="size-3.5" /> {s.trades.length} trades
            </span>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Trades</p>
            <div className="flex flex-wrap gap-1.5">
              {s.trades.map((t) => (
                <span key={t} className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-bright ring-1 ring-inset ring-brand/20">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Equipment</p>
            {s.equipment.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {s.equipment.map((e) => (
                  <span key={e} className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                    {e}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Awaiting capabilities statement from onboarding.
              </p>
            )}
          </div>
        </PanelBody>
      </Panel>

      {/* Scorecard */}
      {active ? (
        <Panel>
          <PanelHeader
            title="Crew scorecard"
            description="A running history that tells you who to call for the next project"
            icon={<Star className="size-3.5 text-warning" />}
          />
          <PanelBody className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Score label="Projects completed" value={String(sc.projectsCompleted)} />
            <Score label="Avg approval time" value={`${sc.avgApprovalDays} days`} />
            <Score label="Avg daily production" value={`${formatNumber(sc.avgDailyFt)} ft`} />
            <Score label="Doc accuracy" value={formatPercent(sc.docAccuracy)} tone={sc.docAccuracy >= 0.98 ? "text-success" : "text-warning"} />
            <Score label="Safety incidents" value={String(sc.safetyIncidents)} tone={sc.safetyIncidents === 0 ? "text-success" : "text-critical"} />
            <Score label="Disputes" value={String(sc.disputes)} tone={sc.disputes === 0 ? "text-success" : "text-warning"} />
            <Score label="Avg production" value={formatPercent(sc.avgProductionPct)} tone={sc.avgProductionPct >= 1 ? "text-success" : "text-warning"} />
            <Score label="Rating" value={`${sc.rating}.0 / 5`} tone="text-warning" />
          </PanelBody>
        </Panel>
      ) : (
        <Panel>
          <PanelBody className="py-8 text-center text-[12.5px] text-muted-foreground">
            {s.state === "Onboarding"
              ? "Onboarding in progress — scorecard begins once the first project is completed."
              : "Invitation sent — awaiting company registration and compliance documents."}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}

function Score({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-foreground/[0.02] px-3.5 py-3">
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground", tone)}>{value}</p>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  if (rating <= 0) return <span className="text-[11px] text-muted-foreground/70">Unrated</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("size-3", i < rating ? "fill-warning text-warning" : "text-muted-foreground/30")}
        />
      ))}
    </span>
  );
}
