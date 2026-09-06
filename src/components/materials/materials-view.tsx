"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ClipboardCheck,
  Loader2,
  MapPin,
  Package,
  PackagePlus,
  Search,
  Truck,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatNumber, formatWhen } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/common/panel";
import { MessageButton } from "@/components/messages/message-button";
import type { InstanceRow } from "@/data/materials-ops";
import {
  issueAction,
  receiveAction,
  returnAction,
  transferAction,
  verifyAction,
} from "@/app/materials/actions";

/**
 * The material operation, on one screen.
 *
 * Built around the question a prime contractor actually asks — who has it —
 * rather than around a count. Every row names the company, the crew and the
 * person answerable for it, and every figure on it is derived from movements
 * rather than typed by anybody.
 */

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "bg-success/12 text-success",
  RECEIVED: "bg-foreground/[0.08] text-muted-foreground",
  RESERVED: "bg-brand/15 text-brand-bright",
  CHECKED_OUT: "bg-brand/15 text-brand-bright",
  ACTIVE: "bg-brand/15 text-brand-bright",
  IN_TRANSIT: "bg-warning/15 text-warning",
  LOW: "bg-warning/15 text-warning",
  NEARLY_EMPTY: "bg-warning/20 text-warning",
  RETURNED: "bg-foreground/[0.08] text-muted-foreground",
  DAMAGED: "bg-critical/15 text-critical",
  QUARANTINED: "bg-critical/15 text-critical",
  RECONCILE: "bg-critical/18 text-critical",
  CLOSED: "bg-foreground/[0.06] text-muted-foreground",
  DISPOSED: "bg-foreground/[0.06] text-muted-foreground",
};

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

type Filter = "ALL" | "ON_HAND" | "OUT" | "LOW" | "FLAGGED" | "UNVERIFIED";

export function MaterialsView({
  rows,
  overview,
  activity,
  custody,
  reasons,
  crews,
  projects,
  canManage,
}: {
  rows: InstanceRow[];
  overview: { total: number; onHand: number; checkedOut: number; low: number; flagged: number; unverified: number; issuedToday: number };
  activity: { id: string; kind: string; code: string; quantity: number; unit: string; at: string; reelNumber: string; crew: string; person: string; actor: string; fromDaily: boolean }[];
  custody: { id: string; name: string; items: number; issued: number; installed: number; returned: number; unexplained: number; flagged: number; lastVerified: string | null }[];
  reasons: { label: string; needsComment: boolean }[];
  crews: { id: string; company: string }[];
  projects: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<InstanceRow | null>(null);
  const [receiving, setReceiving] = React.useState(false);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "ON_HAND" && !["AVAILABLE", "RECEIVED", "RESERVED"].includes(r.status)) return false;
      if (filter === "OUT" && !["CHECKED_OUT", "ACTIVE", "IN_TRANSIT"].includes(r.status)) return false;
      if (filter === "LOW" && !["LOW", "NEARLY_EMPTY"].includes(r.status)) return false;
      if (filter === "FLAGGED" && r.risks.length === 0) return false;
      if (filter === "UNVERIFIED" && !(["CHECKED_OUT", "ACTIVE"].includes(r.status) && (r.daysSinceVerified ?? 999) >= 14))
        return false;
      if (
        q &&
        ![r.code, r.description, r.reelNumber, r.manufacturer, r.custodianName, r.crew, r.responsibleName, r.projectName, r.locationLabel, r.vehicle, r.trailer]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [rows, filter, query]);

  return (
    <div className="flex flex-col gap-3">
      {/* Seven figures, each one the filter for itself. A count that makes you
          go and find the thing it counted is half a feature. */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Tracked" value={overview.total} hint="reels and instances" active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        <Stat label="In the yard" value={overview.onHand} hint="available to issue" active={filter === "ON_HAND"} onClick={() => setFilter("ON_HAND")} />
        <Stat label="Checked out" value={overview.checkedOut} hint="with a crew" active={filter === "OUT"} onClick={() => setFilter("OUT")} />
        <Stat label="Low" value={overview.low} hint="running out" tone="warning" active={filter === "LOW"} onClick={() => setFilter("LOW")} />
        <Stat label="Flagged" value={overview.flagged} hint="needs reconciling" tone="critical" active={filter === "FLAGGED"} onClick={() => setFilter("FLAGGED")} />
        <Stat label="Unverified" value={overview.unverified} hint="14+ days uncounted" tone="warning" active={filter === "UNVERIFIED"} onClick={() => setFilter("UNVERIFIED")} />
        <Stat label="Issued today" value={overview.issuedToday} hint="movements" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel>
            <PanelHeader
              title="Material"
              count={shown.length}
              icon={<Package className="size-3.5 text-gold" />}
            >
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Reel, crew, person, truck…"
                  aria-label="Search material"
                  className="focus-ring h-8 w-[190px] rounded-lg bg-foreground/[0.05] pl-7 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70"
                />
              </label>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setReceiving(true)}
                  className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
                >
                  <PackagePlus className="size-3.5" /> Receive
                </button>
              ) : null}
            </PanelHeader>

            {shown.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <Package className="mx-auto size-7 text-muted-foreground/40" />
                <p className="mt-2 text-[13px] font-medium text-foreground">
                  {rows.length === 0 ? "No material tracked yet" : filter === "FLAGGED" ? "Everything balances." : "Nothing matches."}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
                  {rows.length === 0
                    ? "Receive a reel or a shipment and every movement after it — who took it, what went in the ground, what came back — is recorded against it."
                    : filter === "ALL"
                      ? "Try a different search."
                      : "Nothing in this state."}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {shown.map((r) => (
                  <li key={r.id}>
                    <InstanceRowItem row={r} onOpen={() => setOpen(r)} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          {/* Who is holding what. The prime-contractor question. */}
          <Panel>
            <PanelHeader title="Who has material" count={custody.length} icon={<Truck className="size-3.5" />} />
            {custody.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                All tracked material is in the yard.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {custody.map((c) => (
                  <li key={c.id} className="px-3 py-2.5">
                    <p className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand">
                        {c.name}
                      </span>
                      <span className="num text-[11.5px] text-muted-foreground">{c.items} items</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-muted-foreground">
                      <span>issued <span className="num text-foreground/80">{formatNumber(c.issued)}</span></span>
                      <span>installed <span className="num text-foreground/80">{formatNumber(c.installed)}</span></span>
                      {c.unexplained > 0 ? (
                        <span className="text-warning">
                          unexplained <span className="num">{formatNumber(c.unexplained)}</span>
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                      {c.lastVerified ? `Last counted ${formatWhen(c.lastVerified)}` : "Never counted"}
                      {c.flagged > 0 ? ` · ${c.flagged} flagged` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recent movement" count={activity.length} icon={<ArrowLeftRight className="size-3.5" />} />
            {activity.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                Nothing has moved yet.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {activity.slice(0, 12).map((a) => (
                  <li key={a.id} className="px-3 py-2 text-[12px]">
                    <p className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="font-semibold text-foreground">{label(a.kind)}</span>
                      <span className="num gold-figure">{formatNumber(a.quantity)} {a.unit}</span>
                      <span className="text-muted-foreground">{a.code}</span>
                      {a.reelNumber ? <span className="num text-muted-foreground">· {a.reelNumber}</span> : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {[a.crew, a.person].filter(Boolean).join(" · ")}
                      {a.fromDaily ? " · from a daily" : a.actor ? ` · ${a.actor}` : ""}
                      {" · "}
                      {formatWhen(a.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {open ? (
        <InstanceDrawer
          row={open}
          reasons={reasons}
          crews={crews}
          projects={projects}
          canManage={canManage}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {receiving ? <ReceiveDialog projects={projects} onClose={() => setReceiving(false)} /> : null}
    </div>
  );
}

function Stat({
  label: text,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "warning" | "critical";
  active?: boolean;
  onClick?: () => void;
}) {
  const hot = value > 0 && tone;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-left transition-colors",
        active ? "border-brand/60 bg-brand/[0.1]" : "border-border/70 bg-foreground/[0.02]",
        onClick && "focus-ring hover:border-brand/40",
      )}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{text}</p>
      <p
        className={cn(
          "num mt-0.5 text-[20px] font-bold tracking-[-0.02em]",
          hot === "critical" ? "text-critical" : hot === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[10.5px] text-muted-foreground">{hint}</p> : null}
    </Tag>
  );
}

function InstanceRowItem({ row: r, onOpen }: { row: InstanceRow; onOpen: () => void }) {
  const custody = [r.custodianName, r.crew, r.responsibleName].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "focus-ring flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 px-3 py-3 text-left transition-colors last:border-0 hover:bg-foreground/[0.03]",
        r.risks.length > 0 && "bg-critical/[0.03]",
      )}
    >
      <span className="flex min-w-[190px] flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[14px] font-semibold text-foreground">{r.code}</span>
          {r.reelNumber ? (
            <span className="num rounded bg-foreground/[0.06] px-1.5 py-px text-[10.5px] text-muted-foreground">
              {r.reelNumber}
            </span>
          ) : null}
        </span>
        <span className="truncate text-[12px] text-muted-foreground">
          {r.description || r.category}
          {r.manufacturer ? ` · ${r.manufacturer}` : ""}
        </span>
        <span className="flex items-center gap-1.5 truncate text-[12.5px]">
          {custody ? (
            <span className="truncate font-medium text-brand">{custody}</span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="size-3" /> {r.locationLabel || "Yard"}
            </span>
          )}
        </span>
      </span>

      <span className="flex w-[92px] shrink-0 flex-col">
        <span className="num gold-figure text-[15px] font-semibold leading-none">
          {formatNumber(r.expectedRemaining)}
        </span>
        <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Expected {r.unit}
        </span>
      </span>

      <span className="hidden w-[92px] shrink-0 flex-col sm:flex">
        <span className="num text-[13px] font-medium leading-none text-foreground/85">
          {r.actualRemaining == null ? "—" : formatNumber(r.actualRemaining)}
        </span>
        <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Verified
        </span>
      </span>

      <span className="hidden w-[80px] shrink-0 flex-col lg:flex">
        <span
          className={cn(
            "num text-[13px] font-semibold leading-none",
            r.variance == null ? "text-muted-foreground" : r.variance < 0 ? "text-critical" : "text-success",
          )}
        >
          {r.variance == null ? "—" : `${r.variance > 0 ? "+" : ""}${formatNumber(r.variance)}`}
        </span>
        <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Variance
        </span>
      </span>

      <span className="flex w-[130px] shrink-0 flex-col gap-1">
        <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS_TONE[r.status] ?? "")}>
          {label(r.status)}
        </span>
        {r.risks.length > 0 ? (
          <span className="flex items-start gap-1 text-[10.5px] font-medium text-critical">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            {r.risks.length} to check
          </span>
        ) : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The record, and the things you can do to it.
 * ------------------------------------------------------------------ */

function InstanceDrawer({
  row: r,
  reasons,
  crews,
  projects,
  canManage,
  onClose,
}: {
  row: InstanceRow;
  reasons: { label: string; needsComment: boolean }[];
  crews: { id: string; company: string }[];
  projects: { id: string; name: string }[];
  canManage: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<"issue" | "count" | "return" | "transfer">("count");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 border-b border-border px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold text-foreground">{r.code}</span>
            <span className="block truncate text-[12.5px] text-muted-foreground">
              {r.reelNumber ? `Reel ${r.reelNumber} · ` : ""}
              {r.description || r.category}
            </span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="focus-ring grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {r.risks.length > 0 ? (
          <div className="border-b border-critical/25 bg-critical/[0.06] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-critical">
              <AlertTriangle className="size-3.5" /> Reconciliation required
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {r.risks.map((why) => (
                <li key={why} className="text-[12.5px] leading-relaxed text-critical/90">
                  {why}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Custody, which is the whole point of the record. */}
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Current custody
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
            <Row k="Organization" v={r.custodianName || "Fortitude (yard)"} />
            <Row k="Crew" v={r.crew || "—"} />
            <Row k="Responsible" v={r.responsibleName || "—"} />
            <Row k="Project" v={r.projectName || "—"} />
            <Row k="Location" v={[r.vehicle, r.trailer].filter(Boolean).join(" / ") || r.locationLabel || "Yard"} />
            <Row k="Checked out" v={r.checkedOutAt ? formatWhen(r.checkedOutAt) : "—"} />
            <Row k="Issued by" v={r.issuedByName || "—"} />
            <Row
              k="Last counted"
              v={r.lastVerifiedAt ? `${formatWhen(r.lastVerifiedAt)}${r.lastVerifiedBy ? ` · ${r.lastVerifiedBy}` : ""}` : "Never"}
            />
          </dl>
        </div>

        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Position</p>
          <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1.5 text-[12.5px]">
            <Row k="Original" v={`${formatNumber(r.originalQty)} ${r.unit}`} />
            <Row k="Issued" v={formatNumber(r.issued)} />
            <Row k="Installed" v={formatNumber(r.installed)} />
            <Row k="Returned" v={formatNumber(r.returned)} />
            <Row k="Damaged" v={formatNumber(r.damaged)} />
            <Row k="Used" v={`${r.usedPct}%`} />
          </dl>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-border/60 pt-2 text-[13px]">
            <span className="text-muted-foreground">
              Expected <span className="num gold-figure font-semibold">{formatNumber(r.expectedRemaining)}</span>
            </span>
            <span className="text-muted-foreground">
              Verified{" "}
              <span className="num font-semibold text-foreground">
                {r.actualRemaining == null ? "—" : formatNumber(r.actualRemaining)}
              </span>
            </span>
            {r.variance != null ? (
              <span className="text-muted-foreground">
                Variance{" "}
                <span className={cn("num font-semibold", r.variance < 0 ? "text-critical" : "text-success")}>
                  {r.variance > 0 ? "+" : ""}
                  {formatNumber(r.variance)}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Actions. Counting and returning are open to whoever holds it; the
            rest are the office's. */}
        <div className="flex flex-wrap gap-1.5 border-b border-border/60 px-4 py-2.5">
          {(
            [
              ["count", "Count"],
              ["return", "Return"],
              ...(canManage ? ([["issue", "Issue"], ["transfer", "Transfer"]] as const) : []),
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v as typeof tab)}
              className={cn(
                "focus-ring rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                tab === v ? "bg-brand text-white" : "bg-foreground/[0.05] text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
          <span className="ml-auto">
            {r.custodianSubId ? (
              <MessageButton subcontractorId={r.custodianSubId} title={r.custodianName} label="Message crew" />
            ) : null}
          </span>
        </div>

        <div className="p-4">
          <ActionForm tab={tab} row={r} reasons={reasons} crews={crews} projects={projects} onDone={onClose} />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate font-medium text-foreground">{v}</dd>
    </>
  );
}

function ActionForm({
  tab,
  row: r,
  reasons,
  crews,
  projects,
  onDone,
}: {
  tab: "issue" | "count" | "return" | "transfer";
  row: InstanceRow;
  reasons: { label: string; needsComment: boolean }[];
  crews: { id: string; company: string }[];
  projects: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [qty, setQty] = React.useState("");
  const [person, setPerson] = React.useState("");
  const [crew, setCrew] = React.useState("");
  const [subId, setSubId] = React.useState(r.custodianSubId ?? "");
  const [projectId, setProjectId] = React.useState(r.projectId ?? "");
  const [vehicle, setVehicle] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const needsComment = reasons.find((x) => x.label === reason)?.needsComment ?? false;

  async function go() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const n = Number.parseFloat(qty);

    let res: { ok: boolean; error?: string; data?: unknown };
    if (tab === "issue") {
      res = await issueAction({
        instanceId: r.id,
        quantity: n,
        unit: r.unit,
        projectId: projectId || undefined,
        custodianSubId: subId || undefined,
        crew,
        personName: person,
        vehicle,
      });
    } else if (tab === "transfer") {
      res = await transferAction({
        instanceId: r.id,
        quantity: n,
        toSubId: subId || undefined,
        toCrew: crew,
        toPerson: person,
        vehicle,
      });
    } else if (tab === "return") {
      res = await returnAction({
        instanceId: r.id,
        actualQty: n,
        varianceReason: reason || undefined,
        comment,
      });
    } else {
      res = await verifyAction({
        instanceId: r.id,
        actualQty: n,
        varianceReason: reason || undefined,
        comment,
      });
    }

    setBusy(false);
    if (!res.ok) return setError(res.error ?? "That didn't go through.");
    const d = res.data as { variance?: number; flagged?: boolean } | undefined;
    if (d?.flagged) {
      setNote(`Recorded, and flagged: ${d.variance! > 0 ? "+" : ""}${d.variance} against the ledger.`);
      window.setTimeout(() => { onDone(); router.refresh(); }, 2200);
      return;
    }
    onDone();
    router.refresh();
  }

  const field =
    "h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand";

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {tab === "count" ? "Actual counted" : tab === "return" ? "Actual returned" : "Quantity"} ({r.unit})
        </span>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          placeholder={
            tab === "count" || tab === "return" ? String(r.expectedRemaining) : String(r.originalQty)
          }
          className={`num ${field}`}
        />
        {tab === "count" || tab === "return" ? (
          <span className="text-[11px] text-muted-foreground">
            The ledger expects {formatNumber(r.expectedRemaining)} {r.unit}. A difference outside
            tolerance needs a reason.
          </span>
        ) : null}
      </label>

      {tab === "issue" || tab === "transfer" ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {tab === "issue" ? "Picked up by" : "Accepted by"}
            </span>
            <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Mike Johnson" className={field} />
            <span className="text-[11px] text-muted-foreground">
              The name that settles the argument eight weeks from now.
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Crew / company</span>
              <select value={subId} onChange={(e) => setSubId(e.target.value)} className={field}>
                <option value="">Choose…</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.company}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Crew number</span>
              <input value={crew} onChange={(e) => setCrew(e.target.value)} placeholder="Crew 3" className={field} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={field}>
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Truck / trailer</span>
              <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Truck 12" className={field} />
            </label>
          </div>
        </>
      ) : null}

      {tab === "count" || tab === "return" ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Variance reason
            </span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
              <option value="">Not needed / balances</option>
              {reasons.map((x) => (
                <option key={x.label} value={x.label}>{x.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Comment {needsComment ? "(required)" : "(optional)"}
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className={`${field} h-auto py-2`}
            />
          </label>
        </>
      ) : null}

      {error ? <p className="text-[12px] text-critical">{error}</p> : null}
      {note ? <p className="text-[12px] text-warning">{note}</p> : null}

      <button
        type="button"
        onClick={() => void go()}
        disabled={busy || !qty.trim() || (needsComment && !comment.trim())}
        className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand text-[13px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {tab === "issue" ? "Issue it" : tab === "transfer" ? "Transfer it" : tab === "return" ? "Return it" : "Record the count"}
      </button>
    </div>
  );
}

function ReceiveDialog({ projects, onClose }: { projects: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [reel, setReel] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState("ft");
  const [manufacturer, setManufacturer] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [po, setPo] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const field =
    "h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand";

  async function go() {
    setBusy(true);
    setError(null);
    const res = await receiveAction({
      code,
      description,
      unit,
      quantity: Number.parseFloat(qty),
      reelNumber: reel,
      manufacturer,
      supplier,
      poNumber: po,
      projectId: projectId || undefined,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[15px] font-semibold text-foreground">Receive material</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          A reel number makes this a tracked instance. Without one it is a quantity of unit
          material and only the ledger moves.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Material code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="BFO288I" className={field} />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="288ct SM fiber" className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Reel / lot</span>
            <input value={reel} onChange={(e) => setReel(e.target.value)} placeholder="R-88142" className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Manufacturer</span>
            <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Corning" className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Quantity</span>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="48000" className={`num ${field}`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={field}>
              {["ft", "ea", "reel", "roll", "bundle", "stick", "box", "pallet", "lb", "yd"].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Supplier</span>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Graybar" className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">PO</span>
            <input value={po} onChange={(e) => setPo(e.target.value)} placeholder="PO-4831" className={field} />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Project (optional)</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={field}>
              <option value="">Unallocated</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="mt-2 text-[12px] text-critical">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="focus-ring h-9 rounded-lg border border-border px-3 text-[12.5px] font-medium text-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void go()}
            disabled={busy || !code.trim() || !qty.trim()}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ClipboardCheck className="size-3.5" />}
            Receive
          </button>
        </div>
      </div>
    </div>
  );
}
