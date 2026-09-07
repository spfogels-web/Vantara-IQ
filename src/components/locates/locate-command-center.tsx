"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/common/panel";
import type { LocateRow } from "@/data/locates-ops";
import type { LocateOverview } from "@/data/locates-ops";
import {
  EXTERNAL_LABEL,
  FIELD_LABEL,
  externalTone,
  fieldTone,
  type ExternalReadiness,
  type FieldReadiness,
} from "@/lib/locate-readiness";
import { addLocateTickets, importLocatePaste, refreshLocateTicket } from "@/app/locates/locate-actions";

/**
 * The locate board.
 *
 * Rows, expanding in place, like the dailies. The collapsed row answers the
 * only question a dispatcher has at 7am — can this crew work here, and if not,
 * who is holding it up.
 *
 * Two badges, never one. "811 ready" and "field ready" are different claims and
 * a row that showed a single green tick would be lying on every Windstream job.
 */

type Quick =
  | "ALL"
  | "FIELD_READY"
  | "READY_811"
  | "WAITING"
  | "CONTRACTOR"
  | "ATTENTION"
  | "EXPIRING"
  | "EXPIRED";

const TONE_CLASS = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  critical: "border-critical/40 bg-critical/10 text-critical",
  muted: "border-border bg-foreground/[0.04] text-muted-foreground",
} as const;

export function LocateCommandCenter({
  rows,
  overview,
  projects,
  crews,
  canManage,
  providerReady,
  providerDetail,
  initialProject = "",
  initialCrew = "",
  initialQuick = "",
}: {
  rows: LocateRow[];
  overview: LocateOverview;
  projects: { id: string; name: string }[];
  crews: { id: string; company: string }[];
  canManage: boolean;
  providerReady: boolean;
  providerDetail: string;
  initialProject?: string;
  initialCrew?: string;
  initialQuick?: string;
}) {
  const QUICKS = [
    "ALL", "FIELD_READY", "READY_811", "WAITING", "CONTRACTOR", "ATTENTION", "EXPIRING", "EXPIRED",
  ];
  const [quick, setQuick] = React.useState<Quick>(
    QUICKS.includes(initialQuick.toUpperCase()) ? (initialQuick.toUpperCase() as Quick) : "ALL",
  );
  const [query, setQuery] = React.useState("");
  const [project, setProject] = React.useState(initialProject);
  const [crew, setCrew] = React.useState(initialCrew);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (project && r.projectId !== project) return false;
      if (crew && r.crewId !== crew) return false;

      switch (quick) {
        case "FIELD_READY":
          if (r.field !== "FIELD_READY") return false;
          break;
        case "READY_811":
          if (r.external !== "READY") return false;
          break;
        case "WAITING":
          if (r.external !== "WAITING_ON_811") return false;
          break;
        case "CONTRACTOR":
          if (
            r.field !== "CONTRACTOR_LOCATE_REQUIRED" &&
            r.field !== "CONTRACTOR_LOCATE_IN_PROGRESS"
          )
            return false;
          break;
        case "ATTENTION":
          if (
            r.field !== "CONTRACTOR_LOCATE_ISSUE" &&
            r.external !== "LOOKUP_ERROR" &&
            r.external !== "NEEDS_REVIEW"
          )
            return false;
          break;
        case "EXPIRING":
          if (r.urgency !== "warning" && r.urgency !== "critical") return false;
          break;
        case "EXPIRED":
          if (r.urgency !== "expired") return false;
          break;
      }

      if (!q) return true;
      return [
        r.number,
        r.street,
        r.crossStreet,
        r.city,
        r.county,
        r.projectName,
        r.crewName,
        r.blockingReason,
        ...r.waitingOn,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, quick, query, project, crew]);

  return (
    <div className="flex flex-col gap-3">
      {/* What is true right now. Every card is a filter — a number you cannot
          click is a number you have to go and find by hand. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Field ready" value={overview.fieldReady} hint="work can begin"
          tone="success" active={quick === "FIELD_READY"} onClick={() => setQuick(quick === "FIELD_READY" ? "ALL" : "FIELD_READY")} />
        <Kpi label="811 ready" value={overview.ready811} hint="utilities done"
          tone="success" active={quick === "READY_811"} onClick={() => setQuick(quick === "READY_811" ? "ALL" : "READY_811")} />
        <Kpi label="Our locate needed" value={overview.contractorRequired} hint="before digging"
          tone="warning" active={quick === "CONTRACTOR"} onClick={() => setQuick(quick === "CONTRACTOR" ? "ALL" : "CONTRACTOR")} />
        <Kpi label="Waiting on utilities" value={overview.waiting} hint="no answer yet"
          tone="warning" active={quick === "WAITING"} onClick={() => setQuick(quick === "WAITING" ? "ALL" : "WAITING")} />
        <Kpi label="Needs attention" value={overview.needsAttention} hint="issue or unverified"
          tone="critical" active={quick === "ATTENTION"} onClick={() => setQuick(quick === "ATTENTION" ? "ALL" : "ATTENTION")} />
        <Kpi label="Expiring < 72h" value={overview.expiring72} hint="update soon"
          tone="warning" active={quick === "EXPIRING"} onClick={() => setQuick(quick === "EXPIRING" ? "ALL" : "EXPIRING")} />
        <Kpi label="Expired" value={overview.expired} hint="marks are stale"
          tone="critical" active={quick === "EXPIRED"} onClick={() => setQuick(quick === "EXPIRED" ? "ALL" : "EXPIRED")} />
      </div>

      {/* Said once, plainly, rather than discovered when a lookup does nothing. */}
      {canManage && !providerReady ? (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.06] px-3 py-2.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-[12px] leading-relaxed text-warning">
            <span className="font-semibold">Automatic lookups are off.</span> {providerDetail}
          </p>
        </div>
      ) : null}

      <Panel>
        <PanelHeader
          title="Locate tickets"
          count={shown.length}
          icon={<MapPin className="size-3.5 text-gold" />}
        >
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ticket, street, crew, utility…"
              aria-label="Search locate tickets"
              className="focus-ring h-8 w-[210px] rounded-lg bg-foreground/[0.05] pl-7 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </label>
          {canManage ? (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand/90"
            >
              <Plus className="size-3.5" /> Add tickets
            </button>
          ) : null}
        </PanelHeader>

        {adding ? (
          <AddTickets
            projects={projects}
            crews={crews}
            providerReady={providerReady}
            onDone={() => setAdding(false)}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-2.5 py-2">
          {(
            [
              ["ALL", "All"],
              ["FIELD_READY", "Field ready"],
              ["READY_811", "811 ready"],
              ["CONTRACTOR", "Our locate"],
              ["WAITING", "Waiting"],
              ["ATTENTION", "Attention"],
              ["EXPIRING", "Expiring"],
              ["EXPIRED", "Expired"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setQuick(v)}
              className={cn(
                "focus-ring rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                quick === v
                  ? "bg-brand text-white"
                  : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              aria-label="Project"
              className="focus-ring h-7 rounded-lg border border-border bg-transparent px-2 text-[11.5px] text-foreground outline-none"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={crew}
              onChange={(e) => setCrew(e.target.value)}
              aria-label="Crew"
              className="focus-ring h-7 rounded-lg border border-border bg-transparent px-2 text-[11.5px] text-foreground outline-none"
            >
              <option value="">All crews</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>{c.company}</option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <MapPin className="mx-auto size-7 text-muted-foreground/40" />
            <p className="mt-2 text-[13px] font-medium text-foreground">
              {rows.length === 0 ? "No locate tickets yet" : "Nothing matches."}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
              {rows.length === 0
                ? "Add ticket numbers, or paste a ticket to bring its dates and utility responses in with it."
                : "Try a different filter."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {shown.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "border-b border-border/50 last:border-0",
                  openId === r.id && "bg-foreground/[0.02]",
                )}
              >
                <Row
                  row={r}
                  open={openId === r.id}
                  onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                />
                {openId === r.id ? <Expanded row={r} canManage={canManage} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Kpi({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "success" | "warning" | "critical";
  active: boolean;
  onClick: () => void;
}) {
  const colour =
    value === 0
      ? "text-muted-foreground"
      : tone === "success"
        ? "text-success"
        : tone === "warning"
          ? "text-warning"
          : "text-critical";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring surface px-3 py-2.5 text-left transition-colors",
        active ? "border-brand/50 bg-brand/[0.06]" : "hover:bg-foreground/[0.03]",
      )}
    >
      <p className="eyebrow truncate">{label}</p>
      <p className={cn("num mt-0.5 text-[20px] font-semibold tracking-[-0.02em]", colour)}>{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
    </button>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "critical" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]",
        TONE_CLASS[tone],
      )}
    >
      {label}
    </span>
  );
}

function Row({ row: r, open, onToggle }: { row: LocateRow; open: boolean; onToggle: () => void }) {
  const where = [r.street, r.crossStreet].filter(Boolean).join(" · ") || "No street on the ticket";
  const expiry =
    r.urgency === "expired"
      ? `Expired ${r.expiresOn}`
      : r.daysToExpiry === null
        ? "No date on file"
        : `${r.daysToExpiry}d left`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="focus-ring flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="num text-[13px] font-semibold text-brand-bright">
            {r.number}
            {r.revision ? `-${r.revision}` : ""}
          </span>
          <Badge label={EXTERNAL_LABEL[r.external as ExternalReadiness]} tone={externalTone(r.external)} />
          <Badge label={FIELD_LABEL[r.field as FieldReadiness]} tone={fieldTone(r.field)} />
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-foreground">{where}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {[r.projectName, r.crewName || "No crew", r.city].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* The one sentence that matters when the answer is no. */}
      <div className="hidden min-w-0 max-w-[300px] flex-1 md:block">
        <p className="truncate text-[11.5px] text-muted-foreground">{r.blockingReason}</p>
        {r.externalRequired > 0 ? (
          <p className="text-[11px] text-muted-foreground/80">
            {r.externalCleared}/{r.externalRequired} utilities cleared
          </p>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "num text-[12px] font-semibold",
            r.urgency === "expired" || r.urgency === "critical"
              ? "text-critical"
              : r.urgency === "warning"
                ? "text-warning"
                : "text-muted-foreground",
          )}
        >
          {expiry}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {r.expiresOn || "—"}
          {r.expiryEstimated ? <span className="text-muted-foreground/70"> est</span> : null}
        </p>
      </div>

      <ChevronDown
        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
      />
    </button>
  );
}

function Expanded({ row: r, canManage }: { row: LocateRow; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  return (
    <div className="border-t border-border/60 bg-background/40 px-3 py-3">
      <div
        className={cn(
          "mb-3 flex items-start gap-2 rounded-lg border px-3 py-2",
          r.field === "FIELD_READY"
            ? "border-success/35 bg-success/[0.06]"
            : r.field === "CONTRACTOR_LOCATE_ISSUE" || r.urgency === "expired"
              ? "border-critical/35 bg-critical/[0.06]"
              : "border-warning/35 bg-warning/[0.06]",
        )}
      >
        {r.field === "FIELD_READY" ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        )}
        <p
          className={cn(
            "text-[12.5px] leading-relaxed",
            r.field === "FIELD_READY"
              ? "text-success"
              : r.field === "CONTRACTOR_LOCATE_ISSUE" || r.urgency === "expired"
                ? "text-critical"
                : "text-warning",
          )}
        >
          {r.blockingReason}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Where">
          <Line label="Street" value={r.street || "—"} />
          <Line label="Cross" value={r.crossStreet || "—"} />
          <Line label="City" value={[r.city, r.county].filter(Boolean).join(", ") || "—"} />
          <Line label="Centre" value={`${r.provider} · ${r.state}`} />
        </Card>

        <Card title="Who">
          <Line label="Project" value={r.projectName || "Not assigned"} />
          <Line label="Crew" value={r.crewName || "Not assigned"} />
          <Line label="Owner" value={r.assignedToName || "Nobody"} />
        </Card>

        <Card title="Clock">
          <Line
            label="Expires"
            value={`${r.expiresOn || "No date"}${r.expiryEstimated ? " (estimated)" : ""}`}
          />
          <Line
            label="Last checked"
            value={r.lastCheckedAt ? new Date(r.lastCheckedAt).toLocaleString() : "Never"}
          />
          <Line
            label="Next check"
            value={r.nextCheckAt ? new Date(r.nextCheckAt).toLocaleString() : "Not scheduled"}
          />
          <Line label="Monitoring" value={r.monitoringEnabled ? "On" : "Off"} />
        </Card>
      </div>

      {r.waitingOn.length > 0 ? (
        <div className="mt-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Waiting on
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {r.waitingOn.map((w) => (
              <li key={w} className="rounded-md border border-warning/30 bg-warning/[0.06] px-2 py-0.5 text-[11.5px] text-warning">
                {w}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.contractorOutstanding.length > 0 ? (
        <div className="mt-3 rounded-lg border border-warning/35 bg-warning/[0.05] p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-warning">
            Pre-work required — we locate these
          </p>
          <p className="mt-1 text-[12px] text-warning">
            {r.contractorOutstanding.join(", ")} must be located and signed off before excavation.
          </p>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-[12px] text-muted-foreground">{msg}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Link
          href={`/locates/${r.id}`}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand/90"
        >
          Open ticket
        </Link>
        {canManage ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              const res = await refreshLocateTicket(r.id);
              setBusy(false);
              setMsg(res.ok ? `Checked. ${res.changes} change(s).` : res.error);
              if (res.ok) router.refresh();
            }}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">{children}</dl>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </>
  );
}

/* ------------------------------------------------------------------ */

function AddTickets({
  projects,
  crews,
  providerReady,
  onDone,
}: {
  projects: { id: string; name: string }[];
  crews: { id: string; company: string }[];
  providerReady: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  // Paste first when lookups are off: entering a bare number produces a ticket
  // nobody may dig on, and offering that as the default sets somebody up to
  // wonder why the board went amber.
  const [mode, setMode] = React.useState<"paste" | "numbers">(providerReady ? "numbers" : "paste");
  const [text, setText] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [crewId, setCrewId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [warn, setWarn] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNote(null);
    setWarn(null);

    if (mode === "paste") {
      const res = await importLocatePaste({ text, projectId: projectId || null, crewId: crewId || null });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setNote(
        `${res.created} added, ${res.updated} updated, ${res.changes} change(s) recorded.`,
      );
      if (res.noExpiry.length) {
        setWarn(
          `No expiry stated on ${res.noExpiry.join(", ")} — ${
            res.noExpiry.length === 1 ? "it reads" : "they read"
          } as "no date on file" and will refuse digging until you enter it.`,
        );
      }
    } else {
      const res = await addLocateTickets({ text, projectId: projectId || null, crewId: crewId || null });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setNote(
        `${res.created.length} added` +
          (res.existing.length ? `, ${res.existing.length} already on the board` : "") +
          ".",
      );
      const bits: string[] = [];
      if (res.rejected.length) bits.push(res.rejected.join(" "));
      if (res.created.length && !providerReady) {
        bits.push(
          "A number on its own carries no dates and no utility responses, so these read as waiting until you paste the ticket.",
        );
      }
      if (bits.length) setWarn(bits.join(" "));
    }

    setText("");
    router.refresh();
  }

  return (
    <div className="border-b border-border/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["paste", "numbers"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "focus-ring rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
              mode === m
                ? "bg-brand text-white"
                : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "paste" ? "Paste a ticket" : "Numbers only"}
          </button>
        ))}
        <span className="text-[11.5px] text-muted-foreground">
          {mode === "paste"
            ? "The ticket email, or the positive-response screen — both work, and neither erases the other."
            : "Creates the ticket with nothing on it yet."}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={mode === "paste" ? 7 : 3}
        placeholder={
          mode === "paste"
            ? "Paste the whole ticket or response screen here…"
            : "260904-001234\n260904-001235"
        }
        className="focus-ring mt-2 w-full rounded-lg border border-border bg-foreground/[0.03] p-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Project"
          className="focus-ring h-8 rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground outline-none"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={crewId}
          onChange={(e) => setCrewId(e.target.value)}
          aria-label="Crew"
          className="focus-ring h-8 rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground outline-none"
        >
          <option value="">No crew</option>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>{c.company}</option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={submit}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {mode === "paste" ? "Read tickets" : "Add"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="focus-ring h-8 rounded-lg px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      {error ? <p className="mt-2 text-[12px] text-critical">{error}</p> : null}
      {note ? <p className="mt-2 text-[12px] text-success">{note}</p> : null}
      {warn ? (
        <p className="mt-1 flex items-start gap-1.5 text-[12px] text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {warn}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** What a crew can work, for a dispatcher choosing where to send people. */
export function CrewReadiness({
  groups,
}: {
  groups: {
    fieldReady: LocateRow[];
    needsOurLocate: LocateRow[];
    waiting: LocateRow[];
    attention: LocateRow[];
  };
}) {
  const sections = [
    {
      key: "fieldReady",
      title: "Field ready",
      hint: "Work can begin.",
      rows: groups.fieldReady,
      tone: "success" as const,
    },
    {
      key: "needsOurLocate",
      title: "811 ready — our locate required",
      hint: "Outside utilities are done. Complete and sign off our locate before excavation.",
      rows: groups.needsOurLocate,
      tone: "warning" as const,
    },
    {
      key: "waiting",
      title: "Waiting on utilities",
      hint: "An outside utility has not answered.",
      rows: groups.waiting,
      tone: "warning" as const,
    },
    {
      key: "attention",
      title: "Needs attention",
      hint: "Verify before anybody is sent.",
      rows: groups.attention,
      tone: "critical" as const,
    },
  ].filter((s) => s.rows.length > 0);

  if (sections.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-6 text-center text-[12.5px] text-muted-foreground">
        No locate tickets on this crew&rsquo;s jobs yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((s) => (
        <div key={s.key} className="rounded-lg border border-border bg-foreground/[0.02] p-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <p
              className={cn(
                "text-[12px] font-bold uppercase tracking-[0.06em]",
                s.tone === "success" ? "text-success" : s.tone === "warning" ? "text-warning" : "text-critical",
              )}
            >
              {s.title}
            </p>
            <span className="num text-[12px] text-muted-foreground">{s.rows.length}</span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{s.hint}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {s.rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/locates/${r.id}`}
                  className="focus-ring flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-foreground/[0.04]"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                    {r.street || r.number}
                  </span>
                  <span className="truncate text-[11.5px] text-muted-foreground">
                    {r.projectName}
                  </span>
                  <Clock className="size-3 shrink-0 text-muted-foreground" />
                  <span className="num shrink-0 text-[11.5px] text-muted-foreground">
                    {r.daysToExpiry === null ? "—" : `${r.daysToExpiry}d`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Unused import guard — Users is referenced by the crew view header upstream. */
export const CREW_ICON = Users;
