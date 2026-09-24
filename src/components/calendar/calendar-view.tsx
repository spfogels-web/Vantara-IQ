"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coins,
  HardHat,
  MapPin,
  Package,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/components/layout/language-provider";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { createCalendarEvent, deleteCalendarEvent } from "@/app/actions";
import type { CalendarItem } from "@/data/queries";

/**
 * The six things the office reasons in, plus the two the calendar only reads.
 *
 * Colour carries the kind, so a month can be scanned without reading a word of
 * it — and a filter turns a kind off entirely rather than dimming it, because
 * a calendar you cannot quieten is one nobody opens twice.
 */
const KINDS = [
  { id: "MILESTONE", label: "Project Milestones", dot: "bg-brand", chip: "border-brand/40 bg-brand/15 text-brand-bright", icon: MapPin },
  { id: "LOCATE", label: "Locates / Permits", dot: "bg-success", chip: "border-success/40 bg-success/15 text-success", icon: ClipboardList },
  { id: "FINANCIAL", label: "Financial Deadlines", dot: "bg-critical", chip: "border-critical/40 bg-critical/15 text-critical", icon: Coins },
  { id: "CREW", label: "Crew Assignments", dot: "bg-brand-bright", chip: "border-brand-bright/40 bg-brand-bright/15 text-brand-bright", icon: Users },
  { id: "MATERIAL", label: "Equipment & Materials", dot: "bg-warning", chip: "border-warning/40 bg-warning/15 text-warning", icon: Package },
  { id: "OTHER", label: "Meetings & Other", dot: "bg-muted-foreground", chip: "border-border bg-foreground/[0.05] text-muted-foreground", icon: CalendarDays },
  { id: "TASK", label: "Tasks", dot: "bg-gold", chip: "border-gold/40 bg-gold/15 text-gold", icon: HardHat },
] as const;

type KindId = (typeof KINDS)[number]["id"];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<
  KindId,
  (typeof KINDS)[number]
>;

/** The six a person can create. Tasks and derived kinds are not offered. */
const CREATABLE = KINDS.filter((k) => k.id !== "TASK" && k.id !== "LOCATE");

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * UTC throughout.
 *
 * Same reason weekOf gives: a day somebody typed is a day, and a local-time
 * Date built on "2026-09-25" is midnight UTC, which prints as the 24th
 * anywhere west of it. This product has already had that bug once.
 */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parse(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}
function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
/** The Sunday on or before a day. */
function weekStart(day: string): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return iso(d);
}

/** The 42 cells a month shows, Sunday-first, including the spill either side. */
function monthGrid(anchor: string): string[] {
  const a = parse(anchor);
  const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return iso(d);
  });
}

function shortDay(day: string, t: (s: string) => string): string {
  const d = parse(day);
  return `${t(DAY_NAMES[d.getUTCDay()])} ${d.getUTCDate()} ${t(MONTH_NAMES[d.getUTCMonth()]).slice(0, 3)}`;
}

export function CalendarView({
  items,
  anchor,
  today,
  projects,
  crews,
}: {
  items: CalendarItem[];
  /** Any day in the month being shown. */
  anchor: string;
  today: string;
  projects: { id: string; name: string }[];
  crews: { id: string; company: string }[];
}) {
  const t = useT();
  const router = useRouter();

  const [view, setView] = React.useState<"month" | "week" | "agenda">("month");
  const [off, setOff] = React.useState<Record<string, boolean>>({});
  const [project, setProject] = React.useState("All projects");
  const [query, setQuery] = React.useState("");
  const [composing, setComposing] = React.useState(false);
  const [openDay, setOpenDay] = React.useState<string | null>(null);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        !off[i.kind] &&
        (project === "All projects" || i.project === project) &&
        (q === "" || `${i.title} ${i.note} ${i.project}`.toLowerCase().includes(q)),
    );
  }, [items, off, project, query]);

  const byDay = React.useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const i of shown) {
      const held = m.get(i.date);
      if (held) held.push(i);
      else m.set(i.date, [i]);
    }
    return m;
  }, [shown]);

  /** The next seven days, which is the question people arrive with. */
  const upcoming = React.useMemo(() => {
    const end = addDays(today, 7);
    return shown.filter((i) => i.date >= today && i.date <= end).slice(0, 12);
  }, [shown, today]);

  const a = parse(anchor);
  const monthLabel = `${t(MONTH_NAMES[a.getUTCMonth()])} ${a.getUTCFullYear()}`;

  function go(months: number) {
    const d = parse(anchor);
    d.setUTCMonth(d.getUTCMonth() + months, 1);
    router.push(`/calendar?month=${iso(d)}`);
  }

  return (
    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white transition hover:brightness-110"
          >
            <Plus className="size-4" /> {t("New event")}
          </button>

          <div className="ml-auto inline-flex rounded-lg border border-border/60 p-0.5">
            {(["month", "week", "agenda"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "focus-ring rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                  view === v
                    ? "bg-brand/15 text-brand-bright"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(v[0].toUpperCase() + v.slice(1))}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            aria-label={t("Filter by project")}
            className="focus-ring h-8 rounded-lg border border-border/60 bg-foreground/[0.03] px-2 text-[12.5px] text-foreground outline-none"
          >
            <option>{t("All projects")}</option>
            {projects.map((p) => (
              <option key={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search events…")}
            className="focus-ring h-8 min-w-[180px] flex-1 rounded-lg border border-border/60 bg-foreground/[0.03] px-3 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70"
          />

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t("Previous month")}
              className="focus-ring grid size-8 place-items-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/calendar")}
              className="focus-ring h-8 rounded-lg border border-border/60 px-3 text-[12.5px] text-foreground"
            >
              {t("Today")}
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t("Next month")}
              className="focus-ring grid size-8 place-items-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <Panel>
          <PanelHeader title={monthLabel} icon={<CalendarDays className="size-3.5" />} />
          <PanelBody className="p-0">
            {view === "month" ? (
              <MonthGrid anchor={anchor} today={today} byDay={byDay} onOpenDay={setOpenDay} t={t} />
            ) : view === "week" ? (
              <Agenda
                days={Array.from({ length: 7 }, (_, i) => addDays(weekStart(today), i))}
                byDay={byDay}
                today={today}
                t={t}
              />
            ) : (
              <Agenda days={[...byDay.keys()].sort()} byDay={byDay} today={today} t={t} />
            )}
          </PanelBody>
        </Panel>
      </div>

      <aside className="flex w-full flex-col gap-3 2xl:w-[300px] 2xl:shrink-0">
        <Panel>
          <PanelHeader title={t("Next 7 days")} icon={<CalendarDays className="size-3.5" />} />
          <PanelBody className="flex flex-col gap-1.5 p-2.5">
            {upcoming.length === 0 ? (
              <p className="px-1 py-3 text-center text-[12px] text-muted-foreground">
                {t("Nothing booked in the next week.")}
              </p>
            ) : (
              upcoming.map((i) => (
                <div key={i.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", KIND[i.kind].dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-foreground">{i.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {shortDay(i.date, t)}
                      {i.time ? ` · ${i.time}` : ""}
                      {i.project ? ` · ${i.project}` : ""}
                    </span>
                  </span>
                </div>
              ))
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title={t("Calendar filters")} icon={<ClipboardList className="size-3.5" />} />
          <PanelBody className="flex flex-col gap-0.5 p-2">
            {KINDS.map((k) => (
              <label
                key={k.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] text-foreground hover:bg-foreground/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={!off[k.id]}
                  onChange={() => setOff((o) => ({ ...o, [k.id]: !o[k.id] }))}
                  className="size-3.5"
                />
                <span className={cn("size-2 shrink-0 rounded-sm", k.dot)} />
                {t(k.label)}
                <span className="num ml-auto text-[11px] text-muted-foreground">
                  {items.filter((i) => i.kind === k.id).length}
                </span>
              </label>
            ))}
          </PanelBody>
        </Panel>
      </aside>

      {composing ? (
        <NewEvent
          projects={projects}
          crews={crews}
          today={today}
          t={t}
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false);
            router.refresh();
          }}
        />
      ) : null}

      {openDay ? (
        <DaySheet
          day={openDay}
          items={byDay.get(openDay) ?? []}
          t={t}
          onClose={() => setOpenDay(null)}
          onDeleted={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

/** The month, as a grid. Three to a cell, then a count — a cell that grows
    with its contents turns one busy Tuesday into a scrollbar for the month. */
function MonthGrid({
  anchor,
  today,
  byDay,
  onOpenDay,
  t,
}: {
  anchor: string;
  today: string;
  byDay: Map<string, CalendarItem[]>;
  onOpenDay: (d: string) => void;
  t: (s: string) => string;
}) {
  const cells = monthGrid(anchor);
  const month = parse(anchor).getUTCMonth();

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-border/60">
          {DAY_NAMES.map((d) => (
            <div key={d} className="eyebrow px-2 py-2 text-[10px]">
              {t(d)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day) => {
            const here = byDay.get(day) ?? [];
            const outside = parse(day).getUTCMonth() !== month;
            const isToday = day === today;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onOpenDay(day)}
                className={cn(
                  "focus-ring flex min-h-[104px] flex-col items-stretch gap-1 border-b border-r border-border/40 p-1.5 text-left transition-colors hover:bg-foreground/[0.03]",
                  outside && "opacity-40",
                )}
              >
                <span
                  className={cn(
                    "num inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                    isToday ? "bg-brand font-semibold text-white" : "text-muted-foreground",
                  )}
                >
                  {parse(day).getUTCDate()}
                </span>
                {here.slice(0, 3).map((i) => (
                  <span
                    key={i.id}
                    className={cn(
                      "truncate rounded border px-1.5 py-0.5 text-[10.5px] leading-tight",
                      KIND[i.kind].chip,
                      i.urgent && "font-semibold",
                    )}
                  >
                    {i.time ? `${i.time} ` : ""}
                    {i.title}
                  </span>
                ))}
                {here.length > 3 ? (
                  <span className="px-1 text-[10.5px] text-muted-foreground">
                    +{here.length - 3} {t("more")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A list, for the week and agenda views. Empty days are left out of both. */
function Agenda({
  days,
  byDay,
  today,
  t,
}: {
  days: string[];
  byDay: Map<string, CalendarItem[]>;
  today: string;
  t: (s: string) => string;
}) {
  const withSomething = days.filter((d) => (byDay.get(d) ?? []).length > 0);
  if (withSomething.length === 0) {
    return (
      <p className="px-4 py-14 text-center text-[13px] text-muted-foreground">
        {t("Nothing on the calendar here.")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border/40">
      {withSomething.map((day) => (
        <li key={day} className="px-3 py-2.5">
          <p className={cn("eyebrow text-[10px]", day === today && "text-brand-bright")}>
            {shortDay(day, t)}
            {day === today ? ` · ${t("Today")}` : ""}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {(byDay.get(day) ?? []).map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", KIND[i.kind].dot)} />
                <span className="num w-14 shrink-0 text-[11px] text-muted-foreground">
                  {i.time || t("All day")}
                </span>
                <span
                  className={cn(
                    "truncate text-[12.5px] text-foreground",
                    i.urgent && "font-semibold text-warning",
                  )}
                >
                  {i.title}
                </span>
                {i.project ? (
                  <span className="truncate text-[11.5px] text-muted-foreground">· {i.project}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Everything on one day, and the only place an event can be removed. */
function DaySheet({
  day,
  items,
  t,
  onClose,
  onDeleted,
}: {
  day: string;
  items: CalendarItem[];
  t: (s: string) => string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    const res = await deleteCalendarEvent(id);
    setBusy(null);
    if (res.ok) onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-border bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">{shortDay(day, t)}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-muted-foreground">
            {t("Nothing on this day.")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {items.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-2 rounded-lg border border-border/60 px-2.5 py-2"
              >
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", KIND[i.kind].dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-foreground">{i.title}</span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {i.time || t("All day")}
                    {i.project ? ` · ${i.project}` : ""}
                    {i.note ? ` · ${i.note}` : ""}
                  </span>
                </span>
                {/* Only what this calendar owns. A locate's expiry belongs to
                    the 811 centre and is not ours to delete from here. */}
                {i.editable ? (
                  <button
                    type="button"
                    onClick={() => remove(i.id)}
                    disabled={busy === i.id}
                    aria-label={t("Delete")}
                    className="focus-ring grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-critical disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Putting something on the calendar. Only the kinds a person owns. */
function NewEvent({
  projects,
  crews,
  today,
  t,
  onClose,
  onSaved,
}: {
  projects: { id: string; name: string }[];
  crews: { id: string; company: string }[];
  today: string;
  t: (s: string) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<string>("OTHER");
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [subcontractorId, setSubcontractorId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await createCalendarEvent({
      title,
      kind,
      startDate,
      endDate,
      startTime,
      note,
      projectId: projectId || null,
      subcontractorId: subcontractorId || null,
    });
    setBusy(false);
    if (res.ok) onSaved();
    else setError(res.error);
  }

  const field =
    "focus-ring h-9 w-full rounded-lg border border-border/60 bg-foreground/[0.03] px-2.5 text-[12.5px] text-foreground outline-none";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-border bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">{t("New event")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-[10px]">{t("What is it")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Crew 2 mobilise")}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="eyebrow text-[10px]">{t("Kind")}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
              {CREATABLE.map((k) => (
                <option key={k.id} value={k.id}>
                  {t(k.label)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-[10px]">{t("Date")}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-[10px]">{t("Ends")}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-[10px]">{t("Time")}</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={field}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-[10px]">{t("Project")}</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={field}
              >
                <option value="">{t("None")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-[10px]">{t("Crew")}</span>
              <select
                value={subcontractorId}
                onChange={(e) => setSubcontractorId(e.target.value)}
                className={field}
              >
                <option value="">{t("None")}</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="eyebrow text-[10px]">{t("Note")}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>

          {error ? <p className="text-[12px] text-critical">{error}</p> : null}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring h-9 rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground"
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="focus-ring h-9 rounded-lg bg-brand px-4 text-[12.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? t("Saving…") : t("Add to calendar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
