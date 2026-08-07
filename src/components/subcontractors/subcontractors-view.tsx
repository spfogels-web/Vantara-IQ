"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Check,
  FileText,
  FolderKanban,
  HardHat,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import type { ComplianceStatus, Project, Subcontractor } from "@/lib/types";
import { formatNumber, formatPercent, initials } from "@/lib/format";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { LogoUpload } from "@/components/common/logo-upload";
import { Button } from "@/components/ui/button";
import { AssignProjects } from "@/components/subcontractors/assign-projects";
import { PacketSummary } from "@/components/subcontractors/packet-summary";
import { SubFileUpload } from "@/components/subcontractors/sub-file-upload";
import { InviteDialog } from "@/components/subcontractors/invite-dialog";
import { SubcontractorForm } from "@/components/subcontractors/subcontractor-form";
import { SubRateCard } from "@/components/subcontractors/sub-rate-card";
import { DocumentCenter, type SubDoc } from "@/components/subcontractors/document-center";
import { approveSubcontractor, deleteSubcontractor, listSubDocuments } from "@/app/actions";

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

/**
 * Work-eligibility gate. A subcontractor cannot be assigned a project — and so
 * cannot receive dailies or perform any work — until every required onboarding
 * item is satisfied AND Fortitude has approved the account. This is the single
 * source of truth the assignment action reads from.
 */
function workReadiness(s: Subcontractor) {
  const items = [
    // Each required compliance doc: present and not lapsed.
    ...s.compliance.map((d) => ({
      label: d.label,
      ok: d.status === "valid" || d.status === "expiring",
    })),
    { label: "Capabilities statement (crews & equipment)", ok: s.equipment.length > 0 },
    { label: "Fortitude review & approval", ok: s.state === "Active" },
  ];
  const outstanding = items.filter((i) => !i.ok);
  return { items, outstanding, eligible: outstanding.length === 0 };
}

export function SubcontractorsView({
  subs,
  projects,
}: {
  subs: Subcontractor[];
  projects: Project[];
}) {
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(subs[0]?.id ?? null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteCompany, setInviteCompany] = React.useState<string | undefined>();
  const [formOpen, setFormOpen] = React.useState(false);
  /** null = adding a new one; a sub = editing that one. */
  const [editing, setEditing] = React.useState<Subcontractor | null>(null);

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

  /**
   * Where every crew sits in onboarding.
   *
   * Buckets are mutually exclusive and read in the order work actually
   * progresses, so the counts add up to the roster and nobody is counted twice.
   * "Not started" is separated from "in progress" on purpose — chasing a crew
   * who has never opened the form is a different conversation from chasing one
   * stuck on a single field.
   */
  const onboarding = React.useMemo(() => {
    const ready: Subcontractor[] = [];
    const packetDone: Subcontractor[] = [];
    const inProgress: Subcontractor[] = [];
    const notStarted: Subcontractor[] = [];

    for (const s of subs) {
      const gate = workReadiness(s);
      if (!s.packet.started) notStarted.push(s);
      else if (!s.packet.complete) inProgress.push(s);
      else if (!gate.eligible) packetDone.push(s);
      else ready.push(s);
    }

    // What is holding people up, most common first — the office's call list.
    const tally = new Map<string, number>();
    for (const s of subs) {
      if (s.packet.complete && workReadiness(s).eligible) continue;
      for (const b of s.packet.blocking) tally.set(b, (tally.get(b) ?? 0) + 1);
      for (const o of workReadiness(s).outstanding) tally.set(o.label, (tally.get(o.label) ?? 0) + 1);
    }
    const topMissing = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { ready, packetDone, inProgress, notStarted, topMissing };
  }, [subs]);

  return (
    <div className="flex flex-col gap-3">
      <OnboardingTiles data={onboarding} total={subs.length} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="lg:col-span-5 xl:col-span-4">
        <Panel>
          <PanelHeader title="Subcontractors" count={filtered.length} icon={<ShieldCheck className="size-3.5" />}>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="h-8 gap-1.5 rounded-lg border border-border bg-transparent px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05]"
            >
              <Plus className="size-3.5" /> Add
            </Button>
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
            {/* An empty roster and an empty search result are different problems
                and deserve different sentences. */}
            {filtered.length === 0 ? (
              <li className="px-3 py-8 text-center">
                <HardHat className="mx-auto size-5 text-muted-foreground/50" />
                <p className="mt-2 text-[12.5px] font-medium text-foreground">
                  {subs.length === 0 ? "No subcontractors yet" : "No matches"}
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {subs.length === 0
                    ? "Add a crew you work with, or send an invite and let them onboard themselves."
                    : `Nothing matches “${query}”.`}
                </p>
              </li>
            ) : null}
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
                    {/* Onboarding state, so the queue is visible without
                        opening every crew in turn. */}
                    <PacketChip sub={s} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="lg:col-span-7 xl:col-span-8">
        {selected ? (
          <SubDetail
            sub={selected}
            projects={projects}
            onEdit={() => {
              setEditing(selected);
              setFormOpen(true);
            }}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <Panel className="grid min-h-[320px] place-items-center p-8 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-11 place-items-center rounded-xl bg-brand/10 text-brand-bright ring-1 ring-inset ring-brand/20">
                <HardHat className="size-5" />
              </span>
              <h3 className="mt-3 text-[14px] font-semibold text-foreground">
                {subs.length === 0 ? "Build your crew list" : "Pick a subcontractor"}
              </h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {subs.length === 0
                  ? "Every sub you add gets a compliance file, a rate card and a place to submit dailies. Add one directly, or invite them to onboard themselves."
                  : "Choose a company on the left to see compliance, assignments and their rate card."}
              </p>
              {subs.length === 0 ? (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                    className="h-8 gap-1.5 rounded-lg border border-border bg-transparent px-3 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05]"
                  >
                    <Plus className="size-3.5" /> Add a subcontractor
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openInvite()}
                    className="h-8 gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright"
                  >
                    <UserPlus className="size-3.5" /> Send an invite
                  </Button>
                </div>
              ) : null}
            </div>
          </Panel>
        )}
      </div>
      </div>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        projects={projects}
        company={inviteCompany}
      />
      <SubcontractorForm open={formOpen} onOpenChange={setFormOpen} sub={editing} />
    </div>
  );
}

function SubDetail({
  sub: s,
  projects,
  onEdit,
  onDeleted,
}: {
  sub: Subcontractor;
  projects: Project[];
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const sc = s.scorecard;
  const active = s.state === "Active";
  const gate = workReadiness(s);
  const pending = s.state === "Pending review";
  const router = useRouter();
  const [approving, setApproving] = React.useState(false);
  const [docs, setDocs] = React.useState<SubDoc[] | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Reset the confirm state when switching subs, so an armed delete on one
  // can't carry over to the next.
  React.useEffect(() => {
    setConfirmDelete(false);
    setDeleteError(null);
  }, [s.id]);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteSubcontractor(s.id);
    setDeleting(false);
    if (res.ok) {
      setConfirmDelete(false);
      onDeleted();
      router.refresh();
    } else {
      setDeleteError(res.error);
      setConfirmDelete(false);
    }
  }

  React.useEffect(() => {
    let active = true;
    setDocs(null);
    listSubDocuments(s.id).then((d) => {
      if (active) setDocs(d);
    });
    return () => {
      active = false;
    };
  }, [s.id]);

  async function approve() {
    if (approving) return;
    setApproving(true);
    try {
      await approveSubcontractor(s.id);
      router.refresh();
    } finally {
      setApproving(false);
    }
  }

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
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onEdit}
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05]"
              >
                <Pencil className="size-3.5" /> Edit
              </button>
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={deleting}
                    className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-critical px-2.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Confirm delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="focus-ring rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  title="Delete this subcontractor"
                  className="focus-ring grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:border-critical/40 hover:text-critical"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
            <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-brand-bright">
              <Mail className="size-3.5" /> {s.email}
            </a>
            <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-brand-bright">
              <Phone className="size-3.5" /> {s.phone}
            </a>
          </div>
        </PanelBody>
        {deleteError ? (
          <p className="border-t border-border/70 px-4 py-2 text-[12px] text-critical sm:px-5">
            {deleteError}
          </p>
        ) : null}
      </Panel>

      {/* Work-eligibility gate — must pass before this crew can be given work */}
      <Panel
        className={cn(
          gate.eligible ? "ring-1 ring-inset ring-success/25" : "ring-1 ring-inset ring-warning/25",
        )}
      >
        <PanelBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                gate.eligible ? "bg-success/12 text-success" : "bg-warning/12 text-warning",
              )}
            >
              {gate.eligible ? <ShieldCheck className="size-5" /> : <Lock className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-foreground">
                {gate.eligible
                  ? "Eligible to receive dailies"
                  : `Not eligible — ${gate.outstanding.length} item${gate.outstanding.length > 1 ? "s" : ""} outstanding`}
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                {gate.eligible
                  ? "Onboarding complete and approved. This crew can be assigned to projects and submit production."
                  : "This crew cannot be assigned a project or submit dailies until every item below is complete and Fortitude-approved."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {pending ? (
                <Button
                  size="sm"
                  onClick={approve}
                  disabled={approving}
                  className="h-8 gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
                >
                  {approving ? "Approving…" : "Approve account"}
                </Button>
              ) : null}
              <StatusPill
                label={gate.eligible ? "Cleared for work" : pending ? "Pending review" : "Blocked"}
                tone={gate.eligible ? "success" : "warning"}
              />
            </div>
          </div>

          <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {gate.items.map((it) => (
              <li key={it.label} className="flex items-center gap-2 text-[12px]">
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full",
                    it.ok ? "bg-success/15 text-success" : "bg-critical/15 text-critical",
                  )}
                >
                  {it.ok ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                <span className={it.ok ? "text-muted-foreground" : "font-medium text-foreground"}>
                  {it.label}
                </span>
              </li>
            ))}
          </ul>
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
            <AssignProjects
              subcontractorId={s.id}
              assigned={s.assignedProjects}
              projects={projects}
              disabled={!gate.eligible}
              disabledReason="Complete onboarding before assigning work"
            />
            {!gate.eligible ? (
              <p className="mt-1.5 text-center text-[10.5px] text-warning">
                Blocked until onboarding is complete &amp; approved
              </p>
            ) : null}
          </PanelBody>
        </Panel>
      </div>

      {/* The asterisk on this crew — why their numbers differ. Staff only, and
          it sits above the rate card because that is usually what it explains. */}
      {s.notes.trim() ? (
        <Panel className="border-warning/25 bg-warning/[0.05]">
          <PanelBody className="flex items-start gap-2.5">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Internal note
              </p>
              <p className="mt-0.5 text-[12.5px] text-foreground">{s.notes}</p>
            </div>
          </PanelBody>
        </Panel>
      ) : null}

      {/* The vendor packet the sub filled in from their own portal */}
      <PacketSummary key={`packet-${s.id}`} subcontractorId={s.id} />

      {/* What we pay them, per code — drives pay applications and real margin */}
      <SubRateCard key={s.id} subcontractorId={s.id} />

      <SubFileUpload key={`upload-${s.id}`} subcontractorId={s.id} company={s.company} />

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

      {/* Documents — onboarding & compliance files, review + download */}
      <Panel>
        <PanelHeader
          title="Documents"
          description="Onboarding & compliance files — review, download, or upload on the sub's behalf"
          icon={<FileText className="size-3.5" />}
        />
        <PanelBody>
          {docs === null ? (
            <p className="text-[12px] text-muted-foreground">Loading documents…</p>
          ) : (
            <DocumentCenter key={s.id} subcontractorId={s.id} initialDocs={docs} uploadedBy="contractor" />
          )}
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

/* ------------------------------------------------------------------ *
 * Onboarding at a glance.
 * ------------------------------------------------------------------ */

interface OnboardingData {
  ready: Subcontractor[];
  packetDone: Subcontractor[];
  inProgress: Subcontractor[];
  notStarted: Subcontractor[];
  topMissing: [string, number][];
}

/**
 * Where the crew list stands, as four counts that add up to the roster.
 *
 * The point of this strip is the call list underneath it. A count tells you
 * how many are stuck; the tally tells you what to chase, and chasing "eight
 * crews need a COI" is one email rather than eight.
 */
function OnboardingTiles({ data, total }: { data: OnboardingData; total: number }) {
  if (total === 0) return null;

  const tiles = [
    {
      label: "Ready to work",
      count: data.ready.length,
      hint: "Packet complete, compliant, approved",
      tone: "text-success",
      ring: "ring-success/25 bg-success/[0.06]",
    },
    {
      label: "Packet done, not cleared",
      count: data.packetDone.length,
      hint: "Waiting on docs or approval",
      tone: "text-info",
      ring: "ring-info/25 bg-info/[0.06]",
    },
    {
      label: "In progress",
      count: data.inProgress.length,
      hint: "Started their packet, not finished",
      tone: "text-warning",
      ring: "ring-warning/25 bg-warning/[0.06]",
    },
    {
      label: "Not started",
      count: data.notStarted.length,
      hint: "Nothing filled in yet",
      tone: "text-muted-foreground",
      ring: "ring-foreground/[0.08] bg-foreground/[0.03]",
    },
  ];

  return (
    <Panel>
      <PanelBody className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles.map((t) => (
            <div
              key={t.label}
              className={cn("rounded-xl px-3.5 py-3 ring-1 ring-inset", t.ring)}
            >
              <p className={cn("num text-[22px] font-semibold tracking-tight", t.tone)}>
                {t.count}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-foreground">{t.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t.hint}</p>
            </div>
          ))}
        </div>

        {data.topMissing.length > 0 ? (
          <div className="border-t border-border/60 pt-2.5">
            <p className="eyebrow mb-1.5">Most common gaps</p>
            <ul className="flex flex-wrap gap-1.5">
              {data.topMissing.map(([label, count]) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[11.5px] text-muted-foreground"
                >
                  {label}
                  <span className="num rounded-full bg-foreground/10 px-1.5 text-[10.5px] font-semibold text-foreground">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="border-t border-border/60 pt-2.5 text-[12px] text-muted-foreground">
            Every crew on the roster is cleared to work.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}

/** One word on where a crew stands, on the roster row itself. */
function PacketChip({ sub }: { sub: Subcontractor }) {
  const gate = workReadiness(sub);
  const { complete, started, blocking } = sub.packet;

  const state = !started
    ? { label: "Not started", cls: "border-border/70 text-muted-foreground", title: "Vendor packet not begun" }
    : !complete
      ? {
          label: "In progress",
          cls: "border-warning/30 bg-warning/10 text-warning",
          title: `Vendor packet outstanding: ${blocking.join(", ")}`,
        }
      : !gate.eligible
        ? {
            label: "Review",
            cls: "border-info/30 bg-info/10 text-info",
            title: `Packet complete. Still outstanding: ${gate.outstanding.map((o) => o.label).join(", ")}`,
          }
        : { label: "Ready", cls: "border-success/30 bg-success/10 text-success", title: "Cleared to work" };

  return (
    <span
      title={state.title}
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        state.cls,
      )}
    >
      {state.label}
    </span>
  );
}
