"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  Loader2,
  Plus,
  Search,
  Send,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { LocateSummary, LocateTicketRow } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import {
  askLocates,
  closeLocateTicket,
  importLocateNumbers,
  importLocateText,
  saveLocateTicket,
  setLocateResponse,
} from "@/app/actions";

/**
 * The locate board.
 *
 * Sorted by what runs out first, because that is the only order in which this
 * list is ever read. Everything on a row is a fact with a date behind it: no
 * ticket is described as clear unless a utility said so, and no ticket is
 * described as usable unless its own expiry says it still is.
 */

const STANDING_STYLE: Record<string, string> = {
  active: "bg-success/12 text-success",
  due: "bg-warning/15 text-warning",
  expired: "bg-critical/15 text-critical",
  waiting: "bg-info/12 text-info",
  cancelled: "bg-foreground/[0.08] text-muted-foreground line-through",
  unknown: "bg-foreground/[0.08] text-muted-foreground",
};

const RESPONSE_STYLE: Record<string, string> = {
  MARKED: "bg-success/12 text-success",
  CLEAR: "bg-success/12 text-success",
  NOT_COMPLETE: "bg-warning/15 text-warning",
  DELAYED: "bg-warning/15 text-warning",
  UNKNOWN: "bg-foreground/[0.08] text-muted-foreground",
};

const RESPONSE_LABEL: Record<string, string> = {
  MARKED: "Marked",
  CLEAR: "Clear / no conflict",
  NOT_COMPLETE: "Not complete",
  DELAYED: "Delayed",
  UNKNOWN: "No response",
};

export function LocatesView({
  tickets,
  summary,
  projects,
  chatReady,
}: {
  tickets: LocateTicketRow[];
  summary: LocateSummary;
  projects: { id: string; name: string }[];
  chatReady: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [only, setOnly] = React.useState<"all" | "due" | "expired" | "awaiting">("all");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (t.closedOn) return false;
      if (only === "due" && t.standing !== "due") return false;
      if (only === "expired" && t.standing !== "expired") return false;
      if (only === "awaiting" && t.awaiting.length === 0) return false;
      if (!q) return true;
      return (
        t.number.toLowerCase().includes(q) ||
        t.street.toLowerCase().includes(q) ||
        t.crossStreet.toLowerCase().includes(q) ||
        t.city.toLowerCase().includes(q) ||
        t.projectName.toLowerCase().includes(q)
      );
    });
  }, [tickets, query, only]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Open tickets" value={summary.total} />
        <Stat label="In force" value={summary.active} tone={summary.active ? "text-success" : undefined} />
        <Stat label="Need updating" value={summary.due} tone={summary.due ? "text-warning" : undefined} onClick={() => setOnly("due")} />
        <Stat label="Expired" value={summary.expired} tone={summary.expired ? "text-critical" : undefined} onClick={() => setOnly("expired")} />
        <Stat
          label="Awaiting a utility"
          value={summary.awaitingResponses}
          tone={summary.awaitingResponses ? "text-warning" : undefined}
          onClick={() => setOnly("awaiting")}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <TicketBoard
            tickets={filtered}
            projects={projects}
            query={query}
            setQuery={setQuery}
            only={only}
            setOnly={setOnly}
          />
        </div>
        <div className="xl:col-span-5">
          <LocateChat ready={chatReady} count={tickets.length} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: string;
  onClick?: () => void;
}) {
  const body = (
    <div className="rounded-xl border border-border/70 bg-foreground/[0.02] px-3 py-2.5 text-left">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-[18px] font-semibold text-foreground", tone)}>{value}</p>
    </div>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="focus-ring rounded-xl">
      {body}
    </button>
  ) : (
    body
  );
}

function TicketBoard({
  tickets,
  projects,
  query,
  setQuery,
  only,
  setOnly,
}: {
  tickets: LocateTicketRow[];
  projects: { id: string; name: string }[];
  query: string;
  setQuery: (v: string) => void;
  only: string;
  setOnly: (v: "all" | "due" | "expired" | "awaiting") => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <Panel>
      <PanelHeader
        title="Locate tickets"
        description="Sorted by what runs out first"
        count={tickets.length}
        icon={<CalendarClock className="size-3.5" />}
      >
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
        >
          <Plus className="size-3.5" /> Add tickets
        </button>
      </PanelHeader>

      {adding ? <AddTickets projects={projects} onDone={() => setAdding(false)} /> : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-2.5">
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 py-1.5 ring-1 ring-inset ring-foreground/[0.06] focus-within:ring-brand/40">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ticket number, street, city, job…"
            className="w-full bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </label>
        {(["all", "due", "expired", "awaiting"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setOnly(k)}
            className={cn(
              "focus-ring h-7 rounded-lg px-2.5 text-[11.5px] font-medium transition",
              only === k
                ? "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30"
                : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
            )}
          >
            {k === "all" ? "All" : k === "due" ? "Needs updating" : k === "expired" ? "Expired" : "Awaiting"}
          </button>
        ))}
      </div>

      <ul className="max-h-[62vh] overflow-y-auto">
        {tickets.length === 0 ? (
          <li className="px-4 py-10 text-center">
            <CalendarClock className="mx-auto size-5 text-muted-foreground/50" />
            <p className="mt-2 text-[12.5px] font-medium text-foreground">No tickets here</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Paste a list of ticket numbers to start the board.
            </p>
          </li>
        ) : (
          tickets.map((t) => (
            <TicketRow
              key={t.id}
              t={t}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              projects={projects}
            />
          ))
        )}
      </ul>
    </Panel>
  );
}

function TicketRow({
  t,
  open,
  onToggle,
  projects,
}: {
  t: LocateTicketRow;
  open: boolean;
  onToggle: () => void;
  projects: { id: string; name: string }[];
}) {
  return (
    <li className="border-b border-border/40 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left hover:bg-foreground/[0.02]"
      >
        <span className="num text-[12.5px] font-semibold text-brand-bright">
          {t.number}
          {t.revision ? `-${t.revision}` : ""}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
            STANDING_STYLE[t.standing] ?? STANDING_STYLE.unknown,
          )}
        >
          {t.standingLabel}
        </span>
        {/* A cancel is not a locate, and the word has to be on the row rather
            than buried in notes where it reads as an ordinary ticket. */}
        {t.ticketType && t.ticketType !== "NORMAL" ? (
          <span className="rounded bg-foreground/[0.08] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
            {t.ticketType}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
          {[t.street, t.crossStreet, t.city].filter(Boolean).join(" · ") || "No address on the ticket"}
          {t.projectName ? ` — ${t.projectName}` : ""}
        </span>

        {/* The number the board exists for. */}
        <span className="num shrink-0 text-right text-[11.5px]">
          {t.expiresOn ? (
            <>
              <span
                className={cn(
                  t.standing === "expired"
                    ? "text-critical"
                    : t.standing === "due"
                      ? "text-warning"
                      : "text-muted-foreground",
                )}
              >
                {t.daysToExpiry !== null && t.daysToExpiry >= 0
                  ? `${t.daysToExpiry}d left`
                  : `${Math.abs(t.daysToExpiry ?? 0)}d ago`}
              </span>
              <span className="ml-1.5 text-muted-foreground/70">{t.expiresOn}</span>
              {!t.datesStated ? (
                <span className="ml-1 text-[10px] text-warning" title="Computed from the standard window, not stated on the ticket">
                  est
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-warning">no date</span>
          )}
        </span>
      </button>

      {open ? <TicketDetail t={t} projects={projects} /> : null}
    </li>
  );
}

function TicketDetail({
  t,
  projects,
}: {
  t: LocateTicketRow;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [f, setF] = React.useState({
    street: t.street,
    crossStreet: t.crossStreet,
    city: t.city,
    county: t.county,
    workType: t.workType,
    calledInOn: t.calledInOn,
    workToBeginOn: t.workToBeginOn,
    responseBy: t.responseBy,
    updateBy: t.datesStated ? t.updateBy : "",
    expiresOn: t.datesStated ? t.expiresOn : "",
    projectId: t.projectId ?? "",
    notes: t.notes,
  });
  const [member, setMember] = React.useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const box =
    "w-full rounded-lg border border-border/70 bg-foreground/[0.03] px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-brand/60 focus:outline-none";

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "That didn't work.");
    else router.refresh();
  }

  return (
    <div className="border-t border-border/40 bg-foreground/[0.02] px-4 py-3">
      {/* The verdict, in words, before any of the fields. */}
      <p
        className={cn(
          "mb-2.5 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[12px]",
          t.dig.ok ? "bg-success/[0.07] text-success" : "bg-critical/[0.07] text-critical",
        )}
      >
        {t.dig.ok ? <Check className="mt-px size-3.5 shrink-0" /> : <TriangleAlert className="mt-px size-3.5 shrink-0" />}
        <span>
          <span className="font-semibold">{t.dig.ok ? "Clear to work" : "Do not dig"}</span> — {t.dig.because}
          {t.awaiting.length > 0 ? ` Still awaiting: ${t.awaiting.join(", ")}.` : ""}
        </span>
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Street"><input value={f.street} onChange={set("street")} className={box} /></Field>
        <Field label="Cross street"><input value={f.crossStreet} onChange={set("crossStreet")} className={box} /></Field>
        <Field label="City"><input value={f.city} onChange={set("city")} className={box} /></Field>
        <Field label="County"><input value={f.county} onChange={set("county")} className={box} /></Field>
        <Field label="Called in"><input type="date" value={f.calledInOn} onChange={set("calledInOn")} className={cn(box, "num")} /></Field>
        <Field label="Work may begin"><input type="date" value={f.workToBeginOn} onChange={set("workToBeginOn")} className={cn(box, "num")} /></Field>
        <Field label="Response by" hint="members owe an answer">
          <input type="date" value={f.responseBy} onChange={set("responseBy")} className={cn(box, "num")} />
        </Field>
        <Field label="Update by" hint="as stated by 811">
          <input type="date" value={f.updateBy} onChange={set("updateBy")} className={cn(box, "num")} />
        </Field>
        <Field label="Expires" hint="as stated by 811">
          <input type="date" value={f.expiresOn} onChange={set("expiresOn")} className={cn(box, "num")} />
        </Field>
        <Field label="Job" className="sm:col-span-2">
          <select value={f.projectId} onChange={set("projectId")} className={cn(box, "appearance-none")}>
            <option value="">Not linked to a job</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Work type"><input value={f.workType} onChange={set("workType")} placeholder="Bore, trench…" className={box} /></Field>
        <Field label="Notes"><input value={f.notes} onChange={set("notes")} className={box} /></Field>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => saveLocateTicket({ id: t.id, number: t.number, revision: t.revision, ...f }))}
          className="focus-ring h-8 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => closeLocateTicket(t.id, ""))}
          className="focus-ring h-8 rounded-lg border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Close ticket
        </button>
        {!t.datesStated && t.expiresOn ? (
          <span className="text-[11px] text-warning">
            Expiry is estimated from a {30}-day window — enter the date 811 gave to make it definite.
          </span>
        ) : null}
      </div>

      {t.locateInstructions ? (
        <div className="mt-2.5 rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-2">
          <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Locate instructions</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-foreground">{t.locateInstructions}</p>
        </div>
      ) : null}

      {/* Per-utility responses. */}
      <div className="mt-3 border-t border-border/50 pt-2.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Utility responses</p>
        {t.responses.length === 0 ? (
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Nothing recorded. Until a utility answers, this ticket is not clear.
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1">
            {t.responses.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="min-w-[9rem] text-foreground">{r.member}</span>
                {r.facilityType ? (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      /gas/i.test(r.facilityType)
                        ? "bg-critical/12 text-critical"
                        : /electric/i.test(r.facilityType)
                          ? "bg-warning/12 text-warning"
                          : "bg-foreground/[0.06] text-muted-foreground",
                    )}
                  >
                    {r.facilityType}
                  </span>
                ) : null}
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", RESPONSE_STYLE[r.status])}>
                  {RESPONSE_LABEL[r.status] ?? r.status}
                </span>
                {r.respondedOn ? <span className="num text-[11px] text-muted-foreground">{r.respondedOn}</span> : null}
                {r.note ? <span className="text-[11px] text-muted-foreground">{r.note}</span> : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder="Utility (Georgia Power, Atlanta Gas…)"
            className={cn(box, "w-56")}
          />
          {(["MARKED", "CLEAR", "NOT_COMPLETE", "UNKNOWN"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || !member.trim()}
              onClick={() =>
                void run(async () => {
                  const res = await setLocateResponse({
                    ticketId: t.id,
                    member,
                    status: s,
                    respondedOn: new Date().toISOString().slice(0, 10),
                  });
                  if (res.ok) setMember("");
                  return res;
                })
              }
              className="focus-ring h-7 rounded-lg border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              {RESPONSE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-2 text-[11.5px] text-critical">{error}</p> : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 normal-case text-muted-foreground/70">({hint})</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/**
 * Getting tickets in.
 *
 * Two ways, and pasting the ticket itself is the one that matters. Everything
 * 811 states — called in, work may begin, update by, expires, the street, and
 * what each utility answered — is read off the text, leaving only the job to
 * link, which is the one thing the ticket does not know.
 *
 * A field the ticket does not state is left empty rather than filled in. That
 * is the whole discipline here: a blank expiry shows as "no date on file" and
 * refuses digging, where a guessed one would read as a clearance.
 */
function AddTickets({
  projects,
  onDone,
}: {
  projects: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"paste" | "numbers">("paste");
  const [text, setText] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
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
      const res = await importLocateText(text, projectId || null);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setNote(
        `${res.created} ticket${res.created === 1 ? "" : "s"} read` +
          (res.updated ? `, ${res.updated} updated` : "") +
          (res.responses ? `, ${res.responses} utility response${res.responses === 1 ? "" : "s"} recorded` : "") +
          ".",
      );
      // Named rather than buried: a ticket read without an expiry is exactly
      // the one somebody will assume came through complete.
      if (res.incomplete.length > 0) {
        setWarn(
          `No expiry stated on ${res.incomplete.join(", ")} — ${
            res.incomplete.length === 1 ? "it reads" : "they read"
          } as "no date on file" and will refuse digging until you enter it.`,
        );
      }
    } else {
      const res = await importLocateNumbers(text, projectId || null);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setNote(`${res.created} added${res.existing ? `, ${res.existing} already on the board` : ""}.`);
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
              "focus-ring h-7 rounded-lg px-2.5 text-[11.5px] font-medium transition",
              mode === m
                ? "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30"
                : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
            )}
          >
            {m === "paste" ? "Paste the ticket" : "Numbers only"}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {mode === "paste" ? (
          <>
            Paste the whole 811 email or ticket. It reads the dates off it — called in, work may
            begin, update by, expires — along with the street and what each utility answered.
            Anything the ticket does not state is left blank rather than guessed. The only thing you
            need to set is the job.
          </>
        ) : (
          <>
            Just the numbers, when you want them on the board before the detail arrives. They land
            with no dates, so each reads &quot;no date on file&quot; until you fill in what 811 said.
          </>
        )}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={mode === "paste" ? 8 : 3}
        placeholder={
          mode === "paste"
            ? "Paste the ticket or the whole email here…"
            : "20260809-00123  20260809-00124 …"
        }
        className="mt-2 w-full rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-brand/60 focus:outline-none"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-8 rounded-lg border border-border bg-foreground/[0.03] px-2 text-[12px] text-foreground"
        >
          <option value="">No job</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void submit()}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {busy ? (mode === "paste" ? "Reading…" : "Adding…") : mode === "paste" ? "Read ticket" : "Add"}
        </button>
        <button type="button" onClick={onDone} className="focus-ring h-8 rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground">
          Done
        </button>
      </div>

      {note ? <p className="mt-1.5 text-[11.5px] text-success">{note}</p> : null}
      {warn ? (
        <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>{warn}</span>
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-[11.5px] text-critical">{error}</p> : null}
    </div>
  );
}


/**
 * Ask the board a question.
 *
 * The answer comes from the tickets, and the model is told it may not call
 * anything clear that a utility has not cleared. What it is good at is finding
 * the right rows — "what have we got on Thompson", "what runs out this week" —
 * which is exactly the part that is painful in an inbox.
 */
function LocateChat({ ready, count }: { ready: boolean; count: number }) {
  const [messages, setMessages] = React.useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setBusy(true);
    const res = await askLocates(text, messages);
    setBusy(false);
    setMessages([
      ...next,
      { role: "assistant", content: res.ok ? res.answer : `I couldn't answer: ${res.error}` },
    ]);
  }

  const suggestions = [
    "What expires this week?",
    "Which tickets are still waiting on a utility?",
    "What have we got on Thompson Rd?",
    "Anything expired that a crew is on?",
  ];

  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader
        title="Ask the board"
        description={`${count} ticket${count === 1 ? "" : "s"} — answers come from the record, with dates`}
        icon={<Sparkles className="size-3.5" />}
      />

      {!ready ? (
        <PanelBody>
          <p className="text-[12px] text-warning">
            The assistant needs ANTHROPIC_API_KEY set on this environment. The board above works
            without it.
          </p>
        </PanelBody>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div>
                <p className="text-[12px] text-muted-foreground">
                  It reads the ticket board and answers from it. It will not call anything clear that
                  a utility has not cleared, and every answer carries its dates.
                </p>
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void ask(s)}
                      className="focus-ring rounded-lg border border-border/70 px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:border-brand/40 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {messages.map((m, i) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded-xl px-3 py-2 text-[12.5px] leading-relaxed",
                      m.role === "user"
                        ? "ml-6 bg-brand/12 text-foreground"
                        : "mr-2 whitespace-pre-wrap bg-foreground/[0.04] text-foreground",
                    )}
                  >
                    {m.content}
                  </li>
                ))}
                {busy ? (
                  <li className="mr-2 flex items-center gap-1.5 rounded-xl bg-foreground/[0.04] px-3 py-2 text-[12px] text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Reading the board…
                  </li>
                ) : null}
              </ul>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border/70 p-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(q);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="What's clear on Charles Hart?"
                className="h-9 flex-1 rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-brand/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !q.trim()}
                className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-white hover:bg-brand-bright disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
              {messages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  title="Clear"
                  className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </form>
          </div>
        </>
      )}
    </Panel>
  );
}
