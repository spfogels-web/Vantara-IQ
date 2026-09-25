"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  BadgeCheck,
  CheckCircle2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
  Hourglass,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
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
  Users,
  Wrench,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { MessageButton } from "@/components/messages/message-button";
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
import {
  SubPeople,
  type SubUser,
  type SubUserInviteRow,
} from "@/components/subcontractors/sub-people";
import { SubcontractorForm } from "@/components/subcontractors/subcontractor-form";
import { SubRateCard } from "@/components/subcontractors/sub-rate-card";
import { DocumentCenter, type SubDoc } from "@/components/subcontractors/document-center";
import { BadgeSection } from "@/components/subcontractors/badge-section";
import { SubPayPanel } from "@/components/subcontractors/sub-pay-panel";
import { listCrewContacts, setCrewOwnerDetailsVisibility, setCrewPayVisibility, setSubcontractorProjects, approveSubcontractor, deleteSubcontractor, listCrewBadges, listSubDocuments, listSubInvoices } from "@/app/actions";
import { useOrgName } from "@/components/layout/org-provider";

const complianceTone: Record<ComplianceStatus, "success" | "warning" | "critical" | "neutral"> = {
  valid: "success",
  expiring: "warning",
  expired: "critical",
  missing: "neutral",
  // Amber, not green. A waiver is a crew working on a promise, and it should
  // not sit on the page looking like a filed certificate.
  waived: "warning",
};

const complianceLabel: Record<ComplianceStatus, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
  missing: "Missing",
  waived: "Waived",
};

/** How many crews a page of the roster holds. */
const PER_PAGE = 8;

/**
 * The four places a crew can be in onboarding, in the order work progresses.
 *
 * Mutually exclusive on purpose: the tiles across the top are counts of these
 * and must add up to the roster, or the office is looking at a page that
 * cannot be reconciled with itself.
 */
type Stage = "ready" | "pending" | "progress" | "notStarted";

const STAGE_LABEL: Record<Stage, string> = {
  ready: "Ready",
  pending: "Pending",
  progress: "In progress",
  notStarted: "Not started",
};

const STAGE_TONE: Record<Stage, "success" | "info" | "warning" | "neutral"> = {
  ready: "success",
  pending: "info",
  progress: "warning",
  notStarted: "neutral",
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
      required: true,
    })),
    // Useful to have, not a reason to stop a crew working. What is on this list
    // should be the paperwork that carries legal or financial consequence if it
    // is absent — a list of trucks does not.
    {
      label: "Capabilities statement (crews & equipment)",
      ok: s.equipment.length > 0,
      required: false,
    },
    { label: "Office review & approval", ok: s.state === "Active", required: true },
  ];
  const outstanding = items.filter((i) => i.required && !i.ok);
  return { items, outstanding, eligible: outstanding.length === 0 };
}

export function SubcontractorsView({
  subs,
  projects,
  people,
}: {
  subs: Subcontractor[];
  projects: Project[];
  /** Logins and outstanding invitations, keyed by subcontractor id. */
  people: Record<string, { users: SubUser[]; invites: SubUserInviteRow[] }>;
}) {
  const [query, setQuery] = React.useState("");
  /** Which crew is open, or null. A row toggles rather than only selecting. */
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteCompany, setInviteCompany] = React.useState<string | undefined>();
  const [formOpen, setFormOpen] = React.useState(false);
  /** null = adding a new one; a sub = editing that one. */
  const [editing, setEditing] = React.useState<Subcontractor | null>(null);
  /** Which onboarding bucket the roster is narrowed to, or all of them. */
  const [stage, setStage] = React.useState<Stage | "all">("all");
  const [view, setView] = React.useState<"list" | "grid">("list");
  /** Which way the company column is sorted. */
  const [dir, setDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);
  /** Ticked crews, for assigning several to a job in one go. */
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  function openInvite(company?: string) {
    setInviteCompany(company);
    setInviteOpen(true);
  }

  /** Where each crew sits, computed once and read by the tiles and the rows. */
  const stageOf = React.useMemo(() => {
    const m = new Map<string, Stage>();
    for (const s of subs) m.set(s.id, stageFor(s));
    return m;
  }, [subs]);

  const searched = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter(
      (s) =>
        s.company.toLowerCase().includes(q) ||
        s.lead.toLowerCase().includes(q) ||
        s.trades.some((t) => t.toLowerCase().includes(q)),
    );
  }, [subs, query]);

  const filtered = React.useMemo(() => {
    const rows = stage === "all" ? searched : searched.filter((s) => stageOf.get(s.id) === stage);
    // Sorted by company, which is how somebody looks for a crew they already
    // have a name for. localeCompare so "Ó" files where a person expects it.
    return [...rows].sort((a, b) =>
      dir === "asc" ? a.company.localeCompare(b.company) : b.company.localeCompare(a.company),
    );
  }, [searched, stage, stageOf, dir]);

  // Narrowing or searching changes what page 1 even means, so go back to it
  // rather than leaving somebody on an empty page 3.
  React.useEffect(() => {
    setPage(1);
  }, [query, stage, view]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const shown = React.useMemo(
    () => (view === "grid" ? filtered : filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE)),
    [filtered, current, view],
  );

  // A crew ticked and then filtered out of sight would still be assigned by a
  // bulk action nobody could see the target of.
  const pickedHere = React.useMemo(
    () => filtered.filter((s) => picked.has(s.id)),
    [filtered, picked],
  );

  // A crew filtered out of the list closes with it, rather than staying open
  // behind a search that no longer matches it.
  const openId = filtered.some((s) => s.id === selectedId) ? selectedId : null;

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

  const counts: Record<Stage | "all", number> = {
    all: subs.length,
    ready: onboarding.ready.length,
    pending: onboarding.packetDone.length,
    progress: onboarding.inProgress.length,
    notStarted: onboarding.notStarted.length,
  };

  return (
    <div className="flex flex-col gap-4">
      <Hero
        onAdd={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        onInvite={() => openInvite()}
      />

      <StageTiles counts={counts} total={subs.length} />

      {/* The office's call list, kept from the old layout. The tiles say how
          many crews are stuck; this says what on, which is the thing somebody
          actually picks up the phone about. */}
      {subs.length > 0 ? <CommonGaps gaps={onboarding.topMissing} /> : null}

      <Panel>
        {/* One bar: narrow by stage, search within it, change how it is laid
            out. The chips and the tiles above are the same four buckets, so
            pressing a tile's worth of the roster is one click from reading it. */}
        <div className="flex flex-col gap-2.5 border-b border-border/70 p-2.5 xl:flex-row xl:items-center">
          <div className="-mx-0.5 flex flex-1 flex-wrap items-center gap-1.5">
            {(["all", "ready", "pending", "progress", "notStarted"] as const).map((k) => (
              <StageChip
                key={k}
                label={k === "all" ? "All" : STAGE_LABEL[k]}
                count={counts[k]}
                active={stage === k}
                tone={k === "all" ? undefined : STAGE_TONE[k]}
                onClick={() => setStage(k)}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 ring-1 ring-inset ring-foreground/[0.06] focus-within:ring-brand/40 xl:w-[280px] xl:flex-none">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search company, contact, or trade…"
                aria-label="Search subcontractors"
                className="w-full min-w-0 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="focus-ring shrink-0 rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </label>

            {/* Two ways to read the same roster: a table to compare down a
                column, cards to take in one crew at a time. */}
            <div className="flex shrink-0 items-center rounded-lg border border-border p-0.5">
              {(
                [
                  ["list", ListIcon, "Table view"],
                  ["grid", LayoutGrid, "Card view"],
                ] as const
              ).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "focus-ring grid size-8 place-items-center rounded-md transition-colors",
                    view === mode
                      ? "bg-brand/[0.14] text-brand-bright"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Only once something is ticked. A bar that is always there, offering
            an action on nothing, is noise on every other visit. */}
        {pickedHere.length > 0 ? (
          <BulkBar
            picked={pickedHere}
            projects={projects}
            onClear={() => setPicked(new Set())}
          />
        ) : null}

        {filtered.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <HardHat className="mx-auto size-5 text-muted-foreground/50" />
            <p className="mt-2 text-[12.5px] font-medium text-foreground">
              {subs.length === 0 ? "No subcontractors yet" : "No matches"}
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {subs.length === 0
                ? "Add a crew you work with, or send an invite and let them onboard themselves."
                : query
                  ? `Nothing matches “${query}”${stage === "all" ? "" : ` in ${STAGE_LABEL[stage as Stage]}`}.`
                  : `No crew is ${STAGE_LABEL[stage as Stage].toLowerCase()}.`}
            </p>
          </div>
        ) : view === "grid" ? (
          <SubGrid
            rows={shown}
            people={people}
            stageOf={stageOf}
            openId={openId}
            onOpen={(id) => setSelectedId(openId === id ? null : id)}
          />
        ) : (
          <>
            {/* Eight columns do not fit a phone, and a table somebody has to
                drag sideways to read is not a table they will read. Below md
                the roster is cards whichever view is selected; the toggle is
                a desktop choice. */}
            <div className="md:hidden">
              <SubGrid
                rows={shown}
                people={people}
                stageOf={stageOf}
                openId={openId}
                onOpen={(id) => setSelectedId(openId === id ? null : id)}
              />
            </div>
            <div className="hidden md:block">
          <SubTable
            dir={dir}
            onSort={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
            rows={shown}
            people={people}
            stageOf={stageOf}
            openId={openId}
            picked={picked}
            onPick={(id, on) =>
              setPicked((prev) => {
                const next = new Set(prev);
                if (on) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            onPickAll={(on) =>
              setPicked((prev) => {
                const next = new Set(prev);
                for (const s of shown) {
                  if (on) next.add(s.id);
                  else next.delete(s.id);
                }
                return next;
              })
            }
            onOpen={(id) => setSelectedId(openId === id ? null : id)}
            onEdit={(s) => {
              setEditing(s);
              setFormOpen(true);
            }}
            onInvite={(company) => openInvite(company)}
            renderDetail={(s) => (
              <SubDetailBlock
                sub={s}
                projects={projects}
                crew={people[s.id] ?? { users: [], invites: [] }}
                onEdit={() => {
                  setEditing(s);
                  setFormOpen(true);
                }}
                onDeleted={() => setSelectedId(null)}
              />
            )}
          />
            </div>
          </>
        )}

        {view === "list" && filtered.length > 0 ? (
          <Pagination
            page={current}
            pageCount={pageCount}
            from={(current - 1) * PER_PAGE + 1}
            to={Math.min(current * PER_PAGE, filtered.length)}
            total={filtered.length}
            onPage={setPage}
          />
        ) : null}
      </Panel>

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
  const orgName = useOrgName();
  const sc = s.scorecard;
  const active = s.state === "Active";
  const gate = workReadiness(s);
  const pending = s.state === "Pending review";
  const router = useRouter();
  const [approving, setApproving] = React.useState(false);
  const [docs, setDocs] = React.useState<SubDoc[] | null>(null);
  const [badges, setBadges] = React.useState<Awaited<ReturnType<typeof listCrewBadges>> | null>(null);
  const [payStatements, setPayStatements] = React.useState<Awaited<ReturnType<typeof listSubInvoices>>>([]);
  const [people, setPeople] = React.useState<Awaited<ReturnType<typeof listCrewContacts>>>([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  /** Jobs this delete would pull them off, once the server has told us. */
  const [unassigns, setUnassigns] = React.useState<string[] | null>(null);

  // Reset the confirm state when switching subs, so an armed delete on one
  // can't carry over to the next.
  React.useEffect(() => {
    setConfirmDelete(false);
    setDeleteError(null);
    setUnassigns(null);
  }, [s.id]);

  async function remove(force = false) {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteSubcontractor(s.id, force);
    setDeleting(false);
    if (res.ok) {
      setConfirmDelete(false);
      onDeleted();
      router.refresh();
      return;
    }
    // An assignment is not a reason to refuse — it is something to say first.
    // Keep the delete armed so the second press goes through knowing the cost.
    if ("needsConfirm" in res && res.needsConfirm) {
      setDeleteError(res.error);
      setConfirmDelete(true);
      setUnassigns(res.projects);
      return;
    }
    setDeleteError(res.error);
    setConfirmDelete(false);
    setUnassigns(null);
  }

  React.useEffect(() => {
    let active = true;
    setDocs(null);
    setBadges(null);
    listSubDocuments(s.id).then((d) => {
      if (active) setDocs(d);
    });
    // Who actually works there. The office had no way to see this at all —
    // the roster was collected on the crew's own page and went nowhere.
    setPeople([]);
    listCrewContacts(s.id).then((p) => {
      if (active) setPeople(p);
    });
    listCrewBadges(s.id).then((b) => {
      if (active) setBadges(b);
    });
    listSubInvoices().then((p) => {
      if (active) setPayStatements(p);
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
                    onClick={() => void remove(true)}
                    disabled={deleting}
                    className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-critical px-2.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Confirm delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDelete(false);
                      setDeleteError(null);
                      setUnassigns(null);
                    }}
                    className="focus-ring rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void remove(false)}
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
          <div
            className={cn(
              "border-t border-border/70 px-4 py-2 text-[12px] sm:px-5",
              // A warning you can act on reads differently from a refusal.
              unassigns ? "text-warning" : "text-critical",
            )}
          >
            <p>{deleteError}</p>
            {unassigns ? (
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Press Confirm delete to go ahead.
              </p>
            ) : null}
          </div>
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
                  : `This crew cannot be assigned a project or submit dailies until every item below is complete and approved by ${orgName}.`}
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
                {/* An outstanding optional item is greyed rather than crossed.
                    A red cross beside something that stops nothing teaches
                    people to read past the red ones that do. */}
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full",
                    it.ok
                      ? "bg-success/15 text-success"
                      : it.required
                        ? "bg-critical/15 text-critical"
                        : "bg-foreground/[0.06] text-muted-foreground",
                  )}
                >
                  {it.ok ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                <span
                  className={
                    it.ok || !it.required
                      ? "text-muted-foreground"
                      : "font-medium text-foreground"
                  }
                >
                  {it.label}
                  {!it.required && !it.ok ? (
                    <span className="ml-1.5 text-[10.5px] text-muted-foreground/70">optional</span>
                  ) : null}
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
            {/* Two separate gates, reported separately. Compliance is about
                documents lapsing; the packet is about who this company legally
                is. Merging them into one "not eligible" would leave the office
                guessing which to chase. */}
            <AssignProjects
              subcontractorId={s.id}
              assigned={s.assignedProjects}
              projects={projects}
              disabled={!gate.eligible || !s.packet.complete}
              disabledReason={
                !s.packet.complete
                  ? `Vendor packet incomplete — still needed: ${s.packet.blocking.join(", ")}`
                  : "Complete onboarding before assigning work"
              }
            />
            {!s.packet.complete ? (
              <p className="mt-1.5 text-center text-[10.5px] text-warning">
                Vendor packet incomplete — {s.packet.blocking.length} item
                {s.packet.blocking.length === 1 ? "" : "s"} outstanding
              </p>
            ) : !gate.eligible ? (
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
            <DocumentCenter key={s.id} subcontractorId={s.id} initialDocs={docs} />
          )}
        </PanelBody>
      </Panel>

      {/* Who this crew can send to the yard. Fortitude clears them; the crew
          only supplies the documents. */}
      {/* Who works there. Read-only here: the crew maintains their own
          roster, and the office needs to know who to ring rather than to
          edit somebody else's staff list. */}
      <Panel>
        <PanelHeader
          title="Their people"
          count={people.length}
          description="Foreman, owner, office — who to contact and what alerts reach them"
          icon={<Users className="size-3.5" />}
        />
        <PanelBody>
          {people.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              Nobody listed yet. The crew adds their people at the top of their
              company profile — until they do, this company is one phone number.
            </p>
          ) : (
            <ul className="space-y-2">
              {people.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border/70 px-3 py-2"
                >
                  <span className="text-[13px] font-medium text-foreground">
                    {p.name || "Unnamed"}
                  </span>
                  {p.role ? (
                    <span className="text-[11.5px] text-muted-foreground">{p.role}</span>
                  ) : null}
                  {p.primary ? (
                    <span className="rounded-full border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-bright">
                      Primary
                    </span>
                  ) : null}
                  <span className="num ml-auto text-[12px] text-muted-foreground">
                    {p.phone || "no phone"}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {p.email || "no email"}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      p.smsConsentAt
                        ? "bg-success/15 text-success"
                        : "bg-foreground/[0.05] text-muted-foreground",
                    )}
                  >
                    {p.smsConsentAt ? "Texts ok" : "No SMS consent"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      {/* What we owe them, and their answer to it. */}
      <SubPayPanel subcontractorId={s.id} invoices={payStatements} />

      {/* Whether the crew's own login can see any of the above. Off by
          default: several owners have their own people fill in the billing
          and would rather no rate card was in front of them. It hides the
          page, it does not change what they are owed. */}
      <PayVisibilityToggle subcontractorId={s.id} show={s.showPayToCrew} company={s.company} />

      {/* The owner's own paperwork — EIN, banking, signatory, addresses.
          A foreman entering dailies uses the same login, so this is closed
          unless the owner needs to change something. */}
      <OwnerDetailsToggle
        subcontractorId={s.id}
        show={s.showOwnerDetailsToCrew}
        company={s.company}
      />

      {badges === null ? null : (
        <BadgeSection subcontractorId={s.id} badges={badges} canReview />
      )}

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

/** Sign-ins across everybody on the account. */
/**
 * Which bucket a crew is in. The same order the tiles read in, and the same
 * test the roster grouping already used — kept in one function so the tile
 * count and the row's own badge cannot drift apart.
 */
function stageFor(s: Subcontractor): Stage {
  if (!s.packet.started) return "notStarted";
  if (!s.packet.complete) return "progress";
  return workReadiness(s).eligible ? "ready" : "pending";
}

/**
 * How much of the required paperwork is in hand, as a count and a fraction.
 *
 * Expiring counts as held: the certificate is on file and the crew is covered
 * today. It is surfaced as a warning elsewhere; it is not a missing document.
 */
function complianceScore(s: Subcontractor): { held: number; total: number; pct: number } {
  const total = s.compliance.length;
  const held = s.compliance.filter((d) => d.status === "valid" || d.status === "expiring").length;
  return { held, total, pct: total === 0 ? 0 : Math.round((held / total) * 100) };
}

/**
 * When anybody on the account was last in — the short form and the date.
 *
 * Both, because they answer different questions: "3 days ago" is how stale
 * this is, and "Sep 16" is the thing somebody repeats down a phone.
 */
function lastActive(crew: { users: { lastLoginAt: string | null }[] }): {
  relative: string;
  exact: string | null;
} {
  const times = crew.users
    .map((u) => u.lastLoginAt)
    .filter((x): x is string => Boolean(x))
    .map((x) => new Date(x).getTime());
  if (times.length === 0) return { relative: "Never", exact: null };

  const at = new Date(Math.max(...times));
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  const exact = at.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (days <= 0) {
    return {
      relative: "Today",
      exact: at.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }),
    };
  }
  if (days === 1) return { relative: "Yesterday", exact };
  if (days < 30) return { relative: `${days} days ago`, exact };
  const months = Math.floor(days / 30);
  return { relative: `${months} ${months === 1 ? "month" : "months"} ago`, exact };
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



/**
 * Show or hide a crew's own pay page.
 *
 * Optimistic, because the answer is a boolean the server always accepts —
 * waiting on a round trip to move a switch reads as a broken switch.
 */
function PayVisibilityToggle({
  subcontractorId,
  show,
  company,
}: {
  subcontractorId: string;
  show: boolean;
  company: string;
}) {
  const router = useRouter();
  const [on, setOn] = React.useState(show);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setOn(show), [show]);

  async function flip() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    const res = await setCrewPayVisibility(subcontractorId, next);
    setBusy(false);
    if (!res.ok) setOn(!next);
    else router.refresh();
  }

  return (
    <Panel>
      <PanelBody className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            Pay statements in {company.trim()}&rsquo;s own portal
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {on
              ? "Their login can see what they are owed and the rates behind it."
              : "Hidden. Their login sees dailies and documents, no rates and no pay. Nothing is deleted — turn it back on and the statements are where they were."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void flip()}
          disabled={busy}
          role="switch"
          aria-checked={on}
          className={cn(
            "focus-ring relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50",
            on ? "bg-brand" : "bg-foreground/15",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white transition-all",
              on ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </PanelBody>
    </Panel>
  );
}
/** Show or hide the owner's EIN, banking and signatory in the crew's portal. */
function OwnerDetailsToggle({
  subcontractorId,
  show,
  company,
}: {
  subcontractorId: string;
  show: boolean;
  company: string;
}) {
  const router = useRouter();
  const [on, setOn] = React.useState(show);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setOn(show), [show]);

  async function flip() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    const res = await setCrewOwnerDetailsVisibility(subcontractorId, next);
    setBusy(false);
    if (!res.ok) setOn(!next);
    else router.refresh();
  }

  return (
    <Panel>
      <PanelBody className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            Company details and banking in {company.trim()}&rsquo;s own portal
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {on
              ? "Their login can see and edit the vendor packet and bank details."
              : "Hidden. A foreman signing in to file dailies sees no EIN, no bank details, no signatory and no addresses. Documents and badges still work, so he can still upload a certificate."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void flip()}
          disabled={busy}
          role="switch"
          aria-checked={on}
          className={cn(
            "focus-ring relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50",
            on ? "bg-brand" : "bg-foreground/15",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white transition-all",
              on ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </PanelBody>
    </Panel>
  );
}
/* ─────────────────────────────────────────────────────────────────────────
   The roster, as the office reads it.

   A banner that says what the page is for, five counts that add up to the
   roster, one bar to narrow it, and a table built to be scanned down a
   column. Opening a crew still happens in place, underneath its own row —
   the detail below is the same one this page has always shown.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The page's own header.
 *
 * Deliberately not a photograph. There is no hero image in this project and
 * inventing one would mean shipping a stock excavator that has nothing to do
 * with the work — so the depth here is drawn, from the brand's own colours,
 * and a real photo can replace the background later without touching the
 * layout.
 */
function Hero({ onAdd, onInvite }: { onAdd: () => void; onInvite: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/70">
      {/* Drawn, not photographed: a wash from the brand into the page's own
          ground, with a faint grid so the panel has some texture at width. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_140%_at_85%_0%,rgba(var(--brand-rgb,99_102_241)/0.30),transparent_58%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:44px_44px] text-foreground"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-transparent"
      />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Subcontractors</p>
          <h1 className="section-title mt-0.5 text-[24px] font-semibold leading-tight tracking-[-0.025em] sm:text-[30px]">
            Subcontractors
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Manage your subcontractor network — compliance, assignments, and
            performance all in one place.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 lg:items-end">
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.34em] text-muted-foreground/70 lg:block">
            Build smarter together
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAdd}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 text-[12.5px] font-medium text-foreground hover:bg-foreground/[0.05]"
            >
              <Plus className="size-3.5" /> Add subcontractor
            </button>
            <button
              type="button"
              onClick={onInvite}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-bright"
            >
              <UserPlus className="size-3.5" /> Invite a crew
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Five counts that reconcile: the four stages plus the roster they came from.
 *
 * Each carries its share of the total, because "6 not started" means something
 * different across thirteen crews than across ninety.
 */
function StageTiles({
  counts,
  total,
}: {
  counts: Record<Stage | "all", number>;
  total: number;
}) {
  if (total === 0) return null;
  const share = (n: number) => (total === 0 ? "—" : `${Math.round((n / total) * 100)}% of total`);

  const tiles = [
    {
      key: "all" as const,
      label: "Total subcontractors",
      value: counts.all,
      hint: "On your network",
      icon: <Users className="size-4" />,
      ring: "ring-foreground/[0.08] bg-foreground/[0.04]",
      tone: "text-foreground",
    },
    {
      key: "ready" as const,
      label: "Ready to work",
      value: counts.ready,
      hint: share(counts.ready),
      icon: <CheckCircle2 className="size-4" />,
      ring: "ring-success/25 bg-success/[0.08]",
      tone: "text-success",
    },
    {
      key: "pending" as const,
      label: "Packet pending",
      value: counts.pending,
      hint: share(counts.pending),
      icon: <Clock className="size-4" />,
      ring: "ring-info/25 bg-info/[0.08]",
      tone: "text-info",
    },
    {
      key: "progress" as const,
      label: "In progress",
      value: counts.progress,
      hint: share(counts.progress),
      icon: <Hourglass className="size-4" />,
      ring: "ring-warning/25 bg-warning/[0.08]",
      tone: "text-warning",
    },
    {
      key: "notStarted" as const,
      label: "Not started",
      value: counts.notStarted,
      hint: share(counts.notStarted),
      icon: <CircleSlash className="size-4" />,
      ring: "ring-foreground/[0.08] bg-foreground/[0.03]",
      tone: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.key} className="surface flex items-start gap-3 px-4 py-3.5">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
              t.ring,
              t.tone,
            )}
          >
            {t.icon}
          </span>
          <span className="min-w-0">
            {/* Wraps rather than truncates. "TOTAL SUBCONTRACTO…" is not a
                label, and at two columns on a phone every one of these was
                being cut off. */}
            <span className="block text-[10.5px] font-bold uppercase leading-tight tracking-[0.09em] text-muted-foreground">
              {t.label}
            </span>
            <span className={cn("num mt-0.5 block text-[22px] font-semibold leading-none", t.tone)}>
              {t.value}
            </span>
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">{t.hint}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** One stage in the filter bar, carrying its own count. */
function StageChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: "success" | "info" | "warning" | "neutral";
  onClick: () => void;
}) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "info"
        ? "bg-info"
        : tone === "warning"
          ? "bg-warning"
          : tone === "neutral"
            ? "bg-muted-foreground/60"
            : "";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors",
        active
          ? "border-brand/60 bg-brand/[0.12] text-foreground"
          : "border-border text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", dot)} /> : null}
      {label}
      <span className="num text-[11.5px] text-muted-foreground">({count})</span>
    </button>
  );
}

/** How much of the required paperwork is in, at a glance. */
function ComplianceMeter({ sub }: { sub: Subcontractor }) {
  const { held, total, pct } = complianceScore(sub);
  const tone =
    total === 0
      ? "text-muted-foreground"
      : pct >= 75
        ? "text-success"
        : pct >= 40
          ? "text-warning"
          : pct > 0
            ? "text-critical"
            : "text-muted-foreground";
  const bar =
    total === 0
      ? "bg-foreground/[0.12]"
      : pct >= 75
        ? "bg-success"
        : pct >= 40
          ? "bg-warning"
          : pct > 0
            ? "bg-critical"
            : "bg-foreground/[0.12]";

  return (
    <span className="flex w-[110px] flex-col gap-1.5">
      <span className={cn("num text-[12.5px] font-semibold leading-none", tone)}>
        {held}/{total}
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
        <span
          className={cn("block h-full rounded-full transition-[width]", bar)}
          style={{ width: total === 0 ? "0%" : pct + "%" }}
        />
      </span>
    </span>
  );
}

/** The row's own overflow menu. Closes on an outside click and on Escape. */
function RowMenu({
  onOpen,
  onEdit,
  onInvite,
  isOpen,
}: {
  onOpen: () => void;
  onEdit: () => void;
  onInvite: () => void;
  isOpen: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-foreground hover:bg-foreground/[0.05]";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="focus-ring grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onOpen();
            }}
          >
            <FolderKanban className="size-3.5 text-muted-foreground" />
            {isOpen ? "Close details" : "Open details"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Pencil className="size-3.5 text-muted-foreground" />
            Edit company
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onInvite();
            }}
          >
            <UserPlus className="size-3.5 text-muted-foreground" />
            Invite to a project
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The roster as a table.
 *
 * A real table, so a screen reader announces which column a cell belongs to.
 * The row opens the crew underneath it, with the usual guard: a click that
 * landed on a control belongs to that control and not to the row.
 */
function SubTable({
  dir,
  onSort,
  rows,
  people,
  stageOf,
  openId,
  picked,
  onPick,
  onPickAll,
  onOpen,
  onEdit,
  onInvite,
  renderDetail,
}: {
  dir: "asc" | "desc";
  onSort: () => void;
  rows: Subcontractor[];
  people: Record<string, { users: SubUser[]; invites: SubUserInviteRow[] }>;
  stageOf: Map<string, Stage>;
  openId: string | null;
  picked: Set<string>;
  onPick: (id: string, on: boolean) => void;
  onPickAll: (on: boolean) => void;
  onOpen: (id: string) => void;
  onEdit: (s: Subcontractor) => void;
  onInvite: (company: string) => void;
  renderDetail: (s: Subcontractor) => React.ReactNode;
}) {
  const allOnPage = rows.length > 0 && rows.every((s) => picked.has(s.id));
  const th =
    "px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-border/70">
            <th scope="col" className="w-10 px-3 py-2.5">
              <input
                type="checkbox"
                checked={allOnPage}
                onChange={(e) => onPickAll(e.target.checked)}
                aria-label="Select every crew on this page"
                className="size-3.5 accent-[var(--brand)]"
              />
            </th>
            <th scope="col" className={th} aria-sort={dir === "asc" ? "ascending" : "descending"}>
              <button
                type="button"
                onClick={onSort}
                className="focus-ring inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground hover:text-foreground"
              >
                Company / Contact
                <ArrowUpDown className="size-3" />
              </button>
            </th>
            <th scope="col" className={cn(th, "w-[120px]")}>
              Status
            </th>
            <th scope="col" className={cn(th, "w-[180px]")}>
              Trade / Services
            </th>
            <th scope="col" className={cn(th, "w-[110px]")}>
              Assignments
            </th>
            <th scope="col" className={cn(th, "w-[130px]")}>
              Compliance
            </th>
            <th scope="col" className={cn(th, "w-[130px]")}>
              Last active
            </th>
            <th scope="col" className={cn(th, "w-[150px] text-right")}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const crew = people[s.id] ?? { users: [], invites: [] };
            const stage = stageOf.get(s.id) ?? "notStarted";
            const active = lastActive(crew);
            const open = openId === s.id;
            return (
              <React.Fragment key={s.id}>
                <tr
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button,a,input,select,textarea")) return;
                    onOpen(s.id);
                  }}
                  aria-expanded={open}
                  className={cn(
                    "cursor-pointer border-b border-border/50 transition-colors",
                    open ? "bg-brand/[0.05]" : "hover:bg-foreground/[0.03]",
                  )}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={picked.has(s.id)}
                      onChange={(e) => onPick(s.id, e.target.checked)}
                      aria-label={"Select " + s.company}
                      className="size-3.5 accent-[var(--brand)]"
                    />
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[11.5px] font-semibold text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                        {initials(s.company)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-foreground">
                          {s.company}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {s.lead || "no contact named"}
                        </span>
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <StatusPill tone={STAGE_TONE[stage]} label={STAGE_LABEL[stage]} />
                  </td>

                  <td className="px-3 py-3">
                    <span className="block text-[12.5px] leading-snug text-foreground/85">
                      {s.trades.length > 0 ? s.trades.slice(0, 2).join(", ") : "—"}
                    </span>
                    {s.trades.length > 2 ? (
                      <span className="text-[11px] text-muted-foreground">
                        +{s.trades.length - 2} more
                      </span>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    <span className="num text-[12.5px] text-foreground">
                      {s.assignedProjects.length}
                    </span>
                    <span className="ml-1 text-[12px] text-muted-foreground">
                      {s.assignedProjects.length === 1 ? "project" : "projects"}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    <ComplianceMeter sub={s} />
                  </td>

                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "block text-[12.5px]",
                        active.exact ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {active.relative}
                    </span>
                    {active.exact ? (
                      <span className="num block text-[11px] text-muted-foreground">
                        {active.exact}
                      </span>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <MessageButton subcontractorId={s.id} title={s.company} label="Message" />
                      <RowMenu
                        isOpen={open}
                        onOpen={() => onOpen(s.id)}
                        onEdit={() => onEdit(s)}
                        onInvite={() => onInvite(s.company)}
                      />
                    </div>
                  </td>
                </tr>

                {open ? (
                  <tr className="border-b border-border/50 bg-background/40">
                    <td colSpan={8} className="px-3 py-3">
                      {renderDetail(s)}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The same roster as cards.
 *
 * For reading one crew at a time rather than comparing down a column — and it
 * is what the table becomes on a narrow screen, where eight columns cannot
 * honestly fit.
 */
function SubGrid({
  rows,
  people,
  stageOf,
  openId,
  onOpen,
}: {
  rows: Subcontractor[];
  people: Record<string, { users: SubUser[]; invites: SubUserInviteRow[] }>;
  stageOf: Map<string, Stage>;
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 p-2.5 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((s) => {
        const crew = people[s.id] ?? { users: [], invites: [] };
        const stage = stageOf.get(s.id) ?? "notStarted";
        const active = lastActive(crew);
        const open = openId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            aria-expanded={open}
            className={cn(
              "focus-ring flex flex-col gap-3 rounded-xl border p-3.5 text-left transition-colors",
              open ? "border-brand/60 bg-brand/[0.05]" : "border-border/60 hover:border-border",
            )}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[12px] font-semibold text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                {initials(s.company)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-foreground">
                  {s.company}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {s.lead || "no contact named"}
                </span>
              </span>
              <StatusPill tone={STAGE_TONE[stage]} label={STAGE_LABEL[stage]} />
            </div>

            <p className="truncate text-[12px] text-foreground/80">
              {s.trades.length > 0 ? s.trades.join(", ") : "No trades recorded"}
            </p>

            <div className="flex items-end justify-between gap-3">
              <span className="flex flex-col gap-1">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
                  Compliance
                </span>
                <ComplianceMeter sub={s} />
              </span>
              <span className="text-right">
                <span className="block text-[12px] text-foreground">
                  {s.assignedProjects.length}{" "}
                  {s.assignedProjects.length === 1 ? "project" : "projects"}
                </span>
                <span className="block text-[11px] text-muted-foreground">{active.relative}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * What to do with several crews at once.
 *
 * Only assignment, because it is the one bulk action that is safe: the server
 * re-checks every crew's packet and approval and refuses the ones that are not
 * eligible, so a careless tick cannot put an uncleared crew on a job. What it
 * refused is reported rather than swallowed.
 */
function BulkBar({
  picked,
  projects,
  onClear,
}: {
  picked: Subcontractor[];
  projects: Project[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ done: number; refused: string[] } | null>(null);

  async function assign() {
    if (!projectId || busy) return;
    setBusy(true);
    setResult(null);
    let done = 0;
    const refused: string[] = [];
    for (const s of picked) {
      const next = [...new Set([...s.assignedProjects.map((p) => p.id), projectId])];
      const res = await setSubcontractorProjects(s.id, next);
      if (res && res.ok === false) refused.push(s.company);
      else done++;
    }
    setBusy(false);
    setResult({ done, refused });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border/70 bg-brand/[0.05] p-2.5 sm:flex-row sm:items-center">
      <p className="text-[12.5px] font-semibold text-foreground">
        {picked.length} {picked.length === 1 ? "crew" : "crews"} selected
      </p>

      <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Project to assign the selected crews to"
          className="focus-ring h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground"
        >
          <option value="">Assign to a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!projectId || busy}
          onClick={assign}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
        >
          {busy ? "Assigning…" : "Assign"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] text-foreground hover:bg-foreground/[0.05]"
        >
          <X className="size-3.5" /> Clear
        </button>
      </div>

      {result ? (
        <p className="w-full text-[12px] text-muted-foreground sm:w-auto sm:basis-full sm:text-right">
          {result.done > 0 ? result.done + " assigned. " : ""}
          {result.refused.length > 0
            ? "Refused for " +
              result.refused.join(", ") +
              " — their packet is not complete or the office has not approved them."
            : ""}
        </p>
      ) : null}
    </div>
  );
}

/** Which slice of the roster is on screen, and how to move through it. */
function Pagination({
  page,
  pageCount,
  from,
  to,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onPage: (n: number) => void;
}) {
  const nav =
    "focus-ring grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-3 py-2.5">
      <p className="text-[12px] text-muted-foreground">
        Showing {from}–{to} of {total} {total === 1 ? "subcontractor" : "subcontractors"}
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className={nav}
          >
            <ChevronLeft className="size-4" />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "focus-ring grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-[12px] font-medium transition-colors",
                n === page
                  ? "border-brand/60 bg-brand/[0.12] text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
            className={nav}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The crew's own detail, unchanged.
 *
 * Their people first — it is the question an office opens a crew to settle —
 * and then everything this page has always shown about them.
 */
function SubDetailBlock({
  sub,
  projects,
  crew,
  onEdit,
  onDeleted,
}: {
  sub: Subcontractor;
  projects: Project[];
  crew: { users: SubUser[]; invites: SubUserInviteRow[] };
  onEdit: () => void;
  onDeleted: () => void;
}) {
  return (
    <>
      <Panel className="mb-3">
        <SubPeople subcontractorId={sub.id} users={crew.users} invites={crew.invites} />
      </Panel>
      <SubDetail sub={sub} projects={projects} onEdit={onEdit} onDeleted={onDeleted} />
    </>
  );
}

/**
 * What is holding crews up, most common first.
 *
 * Carried over from the layout this replaced. The tiles count how many crews
 * are stuck; this names what on, which is the difference between knowing
 * there is a problem and knowing who to ring about what.
 */
function CommonGaps({ gaps }: { gaps: [string, number][] }) {
  if (gaps.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/[0.06] px-3.5 py-2.5 text-[12.5px] text-success">
        <CheckCircle2 className="size-3.5 shrink-0" />
        Every crew on the roster is cleared to work.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 px-3.5 py-2.5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
        Most common gaps
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {gaps.map(([label, count]) => (
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
  );
}
