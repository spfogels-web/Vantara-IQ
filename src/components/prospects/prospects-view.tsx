"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  Check,
  Globe2,
  HardHat,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  TrendingUp,
  UserRound,
  UserSearch,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { Prospect, ProspectKind, ProspectStage, Tone } from "@/lib/types";
import type { ProspectSummary } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { ProspectForm } from "@/components/prospects/prospect-form";
import {
  convertProspectToSubcontractor,
  deleteProspect,
  logProspectActivity,
  setProspectStage,
} from "@/app/actions";

const STAGES: ProspectStage[] = [
  "New",
  "Contacted",
  "Qualifying",
  "In discussion",
  "Won",
  "Lost",
  "Dormant",
];

const STAGE_TONE: Record<ProspectStage, Tone> = {
  New: "neutral",
  Contacted: "info",
  Qualifying: "info",
  "In discussion": "warning",
  Won: "success",
  Lost: "critical",
  Dormant: "neutral",
};

const KIND_META: Record<
  ProspectKind,
  { label: string; plural: string; icon: React.ElementType; blurb: string }
> = {
  Worker: {
    label: "Worker",
    plural: "Workers",
    icon: UserRound,
    blurb: "Individuals we'd hire directly",
  },
  Crew: {
    label: "Crew",
    plural: "Crews",
    icon: HardHat,
    blurb: "Companies that could run production for us",
  },
  Prime: {
    label: "Prime",
    plural: "Primes",
    icon: Building2,
    blurb: "Contractors we'd work for — future business",
  },
};

const today = () => new Date().toISOString().slice(0, 10);

/** A next step is only late once it has a date and that date has passed. */
const isOverdue = (p: Prospect) => !!p.nextStep && !!p.nextStepDue && p.nextStepDue < today();

export function ProspectsView({
  prospects,
  summary,
}: {
  prospects: Prospect[];
  summary: ProspectSummary;
}) {
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<ProspectKind | "All">("All");
  const [stage, setStage] = React.useState<ProspectStage | "All">("All");
  const [state, setState] = React.useState("All");
  const [market, setMarket] = React.useState("All");
  const [onlyOverdue, setOnlyOverdue] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Prospect | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return prospects.filter((p) => {
      if (kind !== "All" && p.kind !== kind) return false;
      if (stage !== "All" && p.stage !== stage) return false;
      if (onlyOverdue && !isOverdue(p)) return false;
      if (state !== "All" && p.homeState !== state && !p.states.includes(state)) return false;
      if (market !== "All" && !p.markets.includes(market)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.contactName.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.trades.some((t) => t.toLowerCase().includes(q)) ||
        p.markets.some((m) => m.toLowerCase().includes(q)) ||
        p.states.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [prospects, query, kind, stage, state, market, onlyOverdue]);

  const selected = filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <SummaryTiles
        summary={summary}
        onlyOverdue={onlyOverdue}
        onToggleOverdue={() => setOnlyOverdue((v) => !v)}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-5 xl:col-span-4">
          <Panel>
            <PanelHeader
              title="Pipeline"
              count={filtered.length}
              icon={<UserSearch className="size-3.5" />}
            >
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="h-8 gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </PanelHeader>

            <div className="flex flex-col gap-2 border-b border-border/70 p-2.5">
              <label className="flex items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 py-1.5 ring-1 ring-inset ring-foreground/[0.06] focus-within:ring-brand/40">
                <Search className="size-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, contact, trade, market…"
                  className="w-full bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </label>

              {/* Kind first — it is the one distinction that changes what the
                  record means, so it gets buttons rather than a dropdown. */}
              <div className="flex items-center gap-1">
                <KindTab label="All" active={kind === "All"} onClick={() => setKind("All")} />
                {(Object.keys(KIND_META) as ProspectKind[]).map((k) => (
                  <KindTab
                    key={k}
                    label={KIND_META[k].plural}
                    active={kind === k}
                    onClick={() => setKind(k)}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <Select value={stage} onChange={setStage as (v: string) => void} label="Stage">
                  <option value="All">Any stage</option>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
                <Select value={state} onChange={setState} label="State">
                  <option value="All">Any state</option>
                  {summary.states.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.count})
                    </option>
                  ))}
                </Select>
                <Select value={market} onChange={setMarket} label="Market">
                  <option value="All">Any market</option>
                  {summary.markets.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.count})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <ul className="max-h-[70vh] flex-1 overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <li className="px-3 py-10 text-center">
                  <UserSearch className="mx-auto size-5 text-muted-foreground/50" />
                  <p className="mt-2 text-[12.5px] font-medium text-foreground">
                    {prospects.length === 0 ? "No prospects yet" : "Nothing matches"}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {prospects.length === 0
                      ? "Add the crews, workers and primes you already know."
                      : "Try a wider filter."}
                  </p>
                </li>
              ) : (
                filtered.map((p) => (
                  <ProspectRow
                    key={p.id}
                    p={p}
                    active={selected?.id === p.id}
                    onSelect={() => setSelectedId(p.id)}
                  />
                ))
              )}
            </ul>
          </Panel>
        </div>

        <div className="lg:col-span-7 xl:col-span-8">
          {selected ? (
            <ProspectDetail
              p={selected}
              onEdit={() => {
                setEditing(selected);
                setFormOpen(true);
              }}
            />
          ) : (
            <Panel>
              <PanelBody>
                <p className="py-10 text-center text-[12.5px] text-muted-foreground">
                  Pick somebody from the pipeline.
                </p>
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>

      {formOpen ? (
        <ProspectForm
          prospect={editing}
          knownStates={summary.states.map((s) => s.name)}
          knownMarkets={summary.markets.map((m) => m.name)}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </div>
  );
}

function KindTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring h-7 flex-1 rounded-lg text-[11.5px] font-medium transition",
        active
          ? "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30"
          : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus-ring h-7 w-full rounded-lg border border-border bg-foreground/[0.04] px-1.5 text-[11.5px] text-foreground"
    >
      {children}
    </select>
  );
}

function SummaryTiles({
  summary,
  onlyOverdue,
  onToggleOverdue,
}: {
  summary: ProspectSummary;
  onlyOverdue: boolean;
  onToggleOverdue: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {summary.byKind.map((k) => {
        const meta = KIND_META[k.kind];
        const Icon = meta.icon;
        return (
          <Panel key={k.kind}>
            <PanelBody className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="num text-[19px] font-semibold leading-none text-foreground">
                  {k.count}
                </p>
                <p className="mt-1 text-[11.5px] font-medium text-foreground">{meta.plural}</p>
                <p className="truncate text-[10.5px] text-muted-foreground">{meta.blurb}</p>
              </div>
            </PanelBody>
          </Panel>
        );
      })}

      {/* Overdue is the only tile that does anything, because it is the only
          one that is a to-do list rather than a count. */}
      <button
        type="button"
        onClick={onToggleOverdue}
        className="focus-ring text-left"
        aria-pressed={onlyOverdue}
      >
        <Panel
          className={cn(
            "transition",
            onlyOverdue ? "ring-1 ring-inset ring-warning/50" : "hover:border-warning/40",
          )}
        >
          <PanelBody className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                summary.overdue > 0 ? "bg-warning/15 text-warning" : "bg-foreground/[0.05] text-muted-foreground",
              )}
            >
              <CalendarClock className="size-4" />
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "num text-[19px] font-semibold leading-none",
                  summary.overdue > 0 ? "text-warning" : "text-foreground",
                )}
              >
                {summary.overdue}
              </p>
              <p className="mt-1 text-[11.5px] font-medium text-foreground">Next steps due</p>
              <p className="truncate text-[10.5px] text-muted-foreground">
                {onlyOverdue ? "Showing these only" : `${summary.open} still open`}
              </p>
            </div>
          </PanelBody>
        </Panel>
      </button>
    </div>
  );
}

function ProspectRow({
  p,
  active,
  onSelect,
}: {
  p: Prospect;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = KIND_META[p.kind].icon;
  const where = [p.city, p.homeState].filter(Boolean).join(", ");
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition",
          active ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]",
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[11px] font-semibold text-foreground">
          {initials(p.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-medium text-foreground">{p.name}</span>
            {isOverdue(p) ? <span className="size-1.5 shrink-0 rounded-full bg-warning" /> : null}
          </div>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {[p.contactName, where].filter(Boolean).join(" · ") || "No contact on file"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill label={p.stage} tone={STAGE_TONE[p.stage]} />
          <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Icon className="size-3" /> {KIND_META[p.kind].label}
          </span>
        </div>
      </button>
    </li>
  );
}

function ProspectDetail({ p, onEdit }: { p: Prospect; onEdit: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteKind, setNoteKind] = React.useState("call");

  React.useEffect(() => {
    setConfirmDelete(false);
    setError(null);
    setNote("");
  }, [p.id]);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "That didn't work.");
    else router.refresh();
  }

  const where = [p.city, p.homeState].filter(Boolean).join(", ");
  const Icon = KIND_META[p.kind].icon;

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <PanelBody className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/12 text-[13px] font-semibold text-brand">
                {initials(p.name)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="truncate text-[15px] font-semibold text-foreground">{p.name}</h2>
                  <StatusPill label={p.stage} tone={STAGE_TONE[p.stage]} />
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-[3px] text-[10.5px] text-muted-foreground">
                    <Icon className="size-3" /> {KIND_META[p.kind].label}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {[p.contactName, p.contactRole, where].filter(Boolean).join(" · ") ||
                    "No contact details yet"}
                </p>
                {p.rating > 0 ? (
                  <div className="mt-1 flex items-center gap-0.5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "size-3",
                          i < p.rating ? "fill-warning text-warning" : "text-muted-foreground/40",
                        )}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
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
                    disabled={busy}
                    onClick={() => void run(() => deleteProspect(p.id))}
                    className="focus-ring inline-flex h-8 items-center rounded-lg bg-critical px-2.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Deleting…" : "Confirm"}
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
                  title="Delete this prospect"
                  className="focus-ring grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:border-critical/50 hover:text-critical"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {p.phone ? (
              <a
                href={`tel:${p.phone}`}
                className="focus-ring inline-flex items-center gap-1.5 rounded text-[12px] text-muted-foreground hover:text-foreground"
              >
                <Phone className="size-3.5" /> {p.phone}
              </a>
            ) : null}
            {p.email ? (
              <a
                href={`mailto:${p.email}`}
                className="focus-ring inline-flex items-center gap-1.5 rounded text-[12px] text-muted-foreground hover:text-foreground"
              >
                <Mail className="size-3.5" /> {p.email}
              </a>
            ) : null}
            {p.website ? (
              <a
                href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-1.5 rounded text-[12px] text-muted-foreground hover:text-foreground"
              >
                <Globe2 className="size-3.5" /> {p.website}
              </a>
            ) : null}
            {p.source ? (
              <span className="text-[12px] text-muted-foreground">Found via {p.source}</span>
            ) : null}
          </div>

          {/* Stage is a decision, so it is one press rather than a form. */}
          <div className="flex flex-wrap items-center gap-1">
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || s === p.stage}
                onClick={() => void run(() => setProspectStage(p.id, s))}
                className={cn(
                  "focus-ring h-7 rounded-lg px-2.5 text-[11.5px] font-medium transition disabled:cursor-default",
                  s === p.stage
                    ? "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30"
                    : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40",
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {p.kind !== "Prime" ? (
            p.convertedSubcontractorId ? (
              <p className="inline-flex items-center gap-1.5 text-[12px] text-success">
                <Check className="size-3.5" /> Already on the subcontractor roster.
              </p>
            ) : (
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => convertProspectToSubcontractor(p.id))}
                  className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  <TrendingUp className="size-3.5" /> Move to subcontractors
                </button>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Creates their roster record and starts onboarding. This stays here as history.
                </p>
              </div>
            )
          ) : null}

          {error ? <p className="text-[12px] text-critical">{error}</p> : null}
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Where they work" icon={<MapPin className="size-3.5" />} />
          <PanelBody className="flex flex-col gap-2.5">
            <Chips label="States" values={p.states.length ? p.states : p.homeState ? [p.homeState] : []} />
            <Chips label="Markets" values={p.markets} />
            <Chips label="Trades" values={p.trades} />
            {p.kind !== "Prime" ? (
              <>
                <Chips label="Equipment" values={p.equipment} />
                {p.crewSize > 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    Crew size <span className="num text-foreground">{p.crewSize}</span>
                  </p>
                ) : null}
              </>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Next step" icon={<CalendarClock className="size-3.5" />} />
          <PanelBody className="flex flex-col gap-2">
            {p.nextStep ? (
              <>
                <p className="text-[12.5px] text-foreground">{p.nextStep}</p>
                <p
                  className={cn(
                    "num text-[11.5px]",
                    isOverdue(p) ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {p.nextStepDue ? `Due ${p.nextStepDue}` : "No date set"}
                  {isOverdue(p) ? " · overdue" : ""}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Nothing scheduled. Set one on Edit so this does not go quiet.
              </p>
            )}
            {p.owner ? (
              <p className="text-[11.5px] text-muted-foreground">Owned by {p.owner}</p>
            ) : null}
            {p.lastContact ? (
              <p className="num text-[11.5px] text-muted-foreground">
                Last contact {p.lastContact}
              </p>
            ) : null}
            {p.notes ? (
              <p className="mt-1 whitespace-pre-wrap border-t border-border/60 pt-2 text-[12px] text-muted-foreground">
                {p.notes}
              </p>
            ) : null}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="History"
          count={p.activities.length}
          icon={<CalendarClock className="size-3.5" />}
        />
        <PanelBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 sm:flex-row">
            <select
              aria-label="Kind of contact"
              value={noteKind}
              onChange={(e) => setNoteKind(e.target.value)}
              className="focus-ring h-9 rounded-lg border border-border bg-foreground/[0.04] px-2 text-[12px] text-foreground sm:w-32"
            >
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="note">Note</option>
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was said?"
              className="focus-ring h-9 flex-1 rounded-lg border border-border bg-foreground/[0.04] px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="button"
              disabled={busy || !note.trim()}
              onClick={() =>
                void run(async () => {
                  const res = await logProspectActivity(p.id, noteKind, note);
                  if (res.ok) setNote("");
                  return res;
                })
              }
              className="focus-ring h-9 shrink-0 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
            >
              Log it
            </button>
          </div>

          {p.activities.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">
              Nothing logged yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {p.activities.map((a) => (
                <li key={a.id} className="flex gap-2.5 border-t border-border/50 py-2 first:border-t-0">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand/60" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-foreground">{a.body}</p>
                    <p className="num text-[10.5px] text-muted-foreground">
                      {a.kind} · {a.createdAt.slice(0, 10)}
                      {a.author ? ` · ${a.author}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

function Chips({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {values.length === 0 ? (
        <p className="mt-0.5 text-[12px] text-muted-foreground/70">Not recorded</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="rounded-md border border-border bg-foreground/[0.04] px-1.5 py-0.5 text-[11px] text-foreground"
            >
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
