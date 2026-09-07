"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/common/panel";
import type { LocateRow } from "@/data/locates-ops";
import { submitCrewLocateTickets } from "@/app/locates/locate-actions";

/**
 * A crew's own locate tickets.
 *
 * They can send tickets in and read what came back, and that is all. Nothing
 * here files, assigns, refreshes or overrides — a crew's question is "where
 * can we work", not "how is this board maintained", and a control that
 * answered the second would only be a way to get the first one wrong.
 *
 * What they see is scoped by the query, not by this component: tickets filed
 * to their company and no others. Our working notes, whoever in the office is
 * chasing a ticket, and the whole provider check log are stripped before the
 * data ever reaches the browser.
 */
export function CrewLocates({
  rows,
  company,
  projects,
}: {
  rows: LocateRow[];
  company: string;
  projects: { id: string; name: string }[];
}) {
  const [query, setQuery] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const groups = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (r: LocateRow) =>
      !q ||
      [r.number, r.street, r.crossStreet, r.city, r.projectName].join(" ").toLowerCase().includes(q);

    const list = rows.filter(match);
    return {
      ready: list.filter((r) => r.field === "FIELD_READY"),
      ourLocate: list.filter(
        (r) =>
          r.field === "CONTRACTOR_LOCATE_REQUIRED" || r.field === "CONTRACTOR_LOCATE_IN_PROGRESS",
      ),
      blocked: list.filter(
        (r) =>
          r.field !== "FIELD_READY" &&
          r.field !== "CONTRACTOR_LOCATE_REQUIRED" &&
          r.field !== "CONTRACTOR_LOCATE_IN_PROGRESS" &&
          r.urgency !== "expired",
      ),
      expired: list.filter((r) => r.urgency === "expired"),
      count: list.length,
    };
  }, [rows, query]);

  if (rows.length === 0) {
    return (
      <Panel>
        {adding ? (
          <SendTickets projects={projects} onDone={() => setAdding(false)} />
        ) : null}
        <div className="px-4 py-14 text-center">
          <MapPin className="mx-auto size-7 text-muted-foreground/40" />
          <p className="mt-2 text-[13px] font-medium text-foreground">
            No locate tickets are filed to {company} yet.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-muted-foreground">
            Send your ticket numbers to the office and they will appear here with their dates and
            utility responses. An empty list is not a clearance — if you called a ticket in and it
            is not here, ask before you dig.
          </p>
          {projects.length > 0 ? (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="focus-ring mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand/90"
            >
              <Plus className="size-4" /> Send your tickets
            </button>
          ) : null}
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Counts, not filters. Three numbers a foreman reads standing up. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Ready to dig" value={groups.ready.length} tone="success" />
        <Stat label="Your locate first" value={groups.ourLocate.length} tone="warning" />
        <Stat label="Waiting" value={groups.blocked.length} tone="warning" />
        <Stat label="Expired" value={groups.expired.length} tone="critical" />
      </div>

      <Panel>
        <PanelHeader
          title="Your locate tickets"
          count={groups.count}
          icon={<MapPin className="size-3.5 text-gold" />}
        >
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ticket or street…"
              aria-label="Search your tickets"
              className="focus-ring h-8 w-[190px] rounded-lg bg-foreground/[0.05] pl-7 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </label>
          {projects.length > 0 ? (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand/90"
            >
              <Plus className="size-3.5" /> Send tickets
            </button>
          ) : null}
        </PanelHeader>

        {adding ? <SendTickets projects={projects} onDone={() => setAdding(false)} /> : null}

        <div className="flex flex-col">
          <Section
            title="Expired — do not dig"
            hint="The marks on the ground are out of date. Tell the office before working these."
            tone="critical"
            rows={groups.expired}
            openId={openId}
            setOpenId={setOpenId}
          />
          <Section
            title="Your locate first"
            hint="811 is clear here, but a locate you are responsible for has to be walked and signed off before excavation."
            tone="warning"
            rows={groups.ourLocate}
            openId={openId}
            setOpenId={setOpenId}
          />
          <Section
            title="Waiting on a utility"
            hint="A utility has not given an acceptable response yet."
            tone="warning"
            rows={groups.blocked}
            openId={openId}
            setOpenId={setOpenId}
          />
          <Section
            title="Ready to dig"
            hint="Utilities cleared and every locate signed off."
            tone="success"
            rows={groups.ready}
            openId={openId}
            setOpenId={setOpenId}
          />
        </div>
      </Panel>

      <p className="flex items-start gap-1.5 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-[12px] text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        This list shows only tickets filed to {company}. If a ticket you called in is missing, it has
        not reached the office yet — and a ticket that is not on this list has not been checked.
      </p>
    </div>
  );
}

/**
 * A crew sends their own tickets in.
 *
 * Pasting is offered first and set as the default. A bare number creates a
 * ticket with no dates and no utility responses, which reads as "nobody may
 * dig" until the office fills it in — accurate, but not what somebody
 * expects when they have just told the system about a live ticket. Pasting
 * the 811 email brings the dates and the responses with it.
 */
function SendTickets({
  projects,
  onDone,
}: {
  projects: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"paste" | "numbers">("paste");
  const [text, setText] = React.useState("");
  const [projectId, setProjectId] = React.useState(projects.length === 1 ? projects[0].id : "");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [warn, setWarn] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div className="border-b border-border/70 bg-brand/[0.04] p-3 text-left">
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
            {m === "paste" ? "Paste the 811 email" : "Ticket numbers only"}
          </button>
        ))}
        <span className="text-[11.5px] text-muted-foreground">
          {mode === "paste"
            ? "Brings the dates and the utility responses with it."
            : "The office will have to fill in the dates before this ticket can clear."}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={mode === "paste" ? 7 : 3}
        placeholder={
          mode === "paste"
            ? "Paste the whole 811 email or the response screen here…"
            : "260907-001234\n260907-001235"
        }
        className="focus-ring mt-2 w-full rounded-lg border border-border bg-background p-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Job"
          className="focus-ring h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground"
        >
          <option value="">Which job?</option>
          {projects.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !text.trim() || !projectId}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            setNote(null);
            setWarn(null);
            const res = await submitCrewLocateTickets({ text, projectId, mode });
            setBusy(false);
            if (!res.ok) return setErr(res.error);

            setNote(
              `${res.created} sent to the office` +
                (res.updated ? `, ${res.updated} updated` : "") +
                ".",
            );

            // Everything that did not land, said out loud. A submission that
            // silently dropped half of what was typed is worse than one that
            // failed, because nobody goes looking for it.
            const bits: string[] = [];
            if (res.alreadyFiled.length) {
              bits.push(
                `${res.alreadyFiled.join(", ")} ${res.alreadyFiled.length === 1 ? "is" : "are"} already on file with the office — check the number, and call them if it should be yours.`,
              );
            }
            if (res.rejected.length) bits.push(res.rejected.join(" "));
            if (res.noExpiry.length) {
              bits.push(
                `No expiry date came through on ${res.noExpiry.join(", ")}, so ${res.noExpiry.length === 1 ? "it will read" : "they will read"} as "no date on file" until the office enters it. Do not dig on those.`,
              );
            }
            if (bits.length) setWarn(bits.join(" "));

            setText("");
            router.refresh();
          }}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Send to the office
        </button>
        <button
          type="button"
          onClick={onDone}
          className="focus-ring h-8 rounded-lg px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      {err ? <p className="mt-2 text-[12px] text-critical">{err}</p> : null}
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "critical";
}) {
  return (
    <div className="surface px-3 py-2.5">
      <p className="eyebrow truncate">{label}</p>
      <p
        className={cn(
          "num mt-0.5 text-[22px] font-semibold tracking-[-0.02em]",
          value === 0
            ? "text-muted-foreground"
            : tone === "success"
              ? "text-success"
              : tone === "warning"
                ? "text-warning"
                : "text-critical",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  tone,
  rows,
  openId,
  setOpenId,
}: {
  title: string;
  hint: string;
  tone: "success" | "warning" | "critical";
  rows: LocateRow[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <section>
      <div className="border-b border-border/70 bg-foreground/[0.03] px-3 py-2">
        <p
          className={cn(
            "text-[12px] font-bold uppercase tracking-[0.06em]",
            tone === "success"
              ? "text-success"
              : tone === "warning"
                ? "text-warning"
                : "text-critical",
          )}
        >
          {title} <span className="num text-muted-foreground">{rows.length}</span>
        </p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{hint}</p>
      </div>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-border/50 last:border-0">
            <button
              type="button"
              onClick={() => setOpenId(openId === r.id ? null : r.id)}
              aria-expanded={openId === r.id}
              className="focus-ring flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-foreground">
                  {r.street || r.number}
                </p>
                <p className="num truncate text-[11.5px] text-muted-foreground">
                  {r.number}
                  {r.revision ? `-${r.revision}` : ""}
                  {r.projectName ? ` · ${r.projectName}` : ""}
                </p>
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
                  {r.urgency === "expired"
                    ? "Expired"
                    : r.daysToExpiry === null
                      ? "No date"
                      : `${r.daysToExpiry}d left`}
                </p>
                <p className="text-[11px] text-muted-foreground">{r.expiresOn || "—"}</p>
              </div>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  openId === r.id && "rotate-180",
                )}
              />
            </button>

            {openId === r.id ? (
              <div className="border-t border-border/60 bg-background/40 px-3 py-3">
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2",
                    r.field === "FIELD_READY"
                      ? "border-success/35 bg-success/[0.06]"
                      : r.urgency === "expired" || r.field === "CONTRACTOR_LOCATE_ISSUE"
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
                        : r.urgency === "expired" || r.field === "CONTRACTOR_LOCATE_ISSUE"
                          ? "text-critical"
                          : "text-warning",
                    )}
                  >
                    {r.blockingReason}
                  </p>
                </div>

                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                  <dt className="text-muted-foreground">Street</dt>
                  <dd className="text-foreground">{r.street || "—"}</dd>
                  <dt className="text-muted-foreground">Cross street</dt>
                  <dd className="text-foreground">{r.crossStreet || "—"}</dd>
                  <dt className="text-muted-foreground">City</dt>
                  <dd className="text-foreground">
                    {[r.city, r.county].filter(Boolean).join(", ") || "—"}
                  </dd>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd className="text-foreground">
                    {r.expiresOn || "No date on file"}
                    {r.expiryEstimated ? (
                      <span className="text-muted-foreground"> — estimated, not stated on the ticket</span>
                    ) : null}
                  </dd>
                </dl>

                {r.waitingOn.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Still to answer
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {r.waitingOn.map((w) => (
                        <li
                          key={w}
                          className="rounded-md border border-warning/30 bg-warning/[0.06] px-2 py-0.5 text-[11.5px] text-warning"
                        >
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {r.contractorOutstanding.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-warning/35 bg-warning/[0.05] px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-warning">
                      Before you dig
                    </p>
                    <p className="mt-0.5 text-[12px] text-warning">
                      {r.contractorOutstanding.join(", ")} has to be located and signed off. Tell the
                      office when it is walked so this ticket can be cleared.
                    </p>
                  </div>
                ) : null}

                <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Clock className="size-3.5" />
                  {r.lastCheckedAt
                    ? `Last updated ${new Date(r.lastCheckedAt).toLocaleString()}`
                    : "The office has not checked this ticket since it was entered."}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
