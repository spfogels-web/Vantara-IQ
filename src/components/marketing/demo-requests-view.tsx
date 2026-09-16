"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Mail, Phone, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/common/panel";
import { setDemoRequestStatus } from "@/app/demo-requests/actions";

export type DemoRequestRow = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  role: string;
  crews: string;
  message: string;
  status: string;
  note: string;
  handledBy: string;
  createdAt: string;
};

const STAGES: [string, string][] = [
  ["NEW", "New"],
  ["CONTACTED", "Contacted"],
  ["DEMOED", "Demoed"],
  ["WON", "Won"],
  ["LOST", "Lost"],
];

/**
 * The leads, as rows that open — the same shape as the dailies and the
 * prospects, because somebody moving between these boards should not have to
 * learn a third way of reading a list.
 *
 * Sorted newest first and nothing else: a demo request has a short useful life,
 * and the one that came in this morning is the one to ring.
 */
export function DemoRequestsView({ rows }: { rows: DemoRequestRow[] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("ALL");

  const shown = rows.filter((r) => (tab === "ALL" ? true : r.status === tab));
  const newCount = rows.filter((r) => r.status === "NEW").length;

  return (
    <Panel>
      <PanelHeader
        title="Demo requests"
        count={shown.length}
        icon={<Sparkles className="size-3.5 text-gold" />}
      >
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          {([["ALL", `All ${rows.length}`], ...STAGES] as [string, string][]).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={cn(
                "focus-ring rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                tab === v
                  ? "bg-brand text-white"
                  : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
              {v === "NEW" && newCount > 0 ? ` ${newCount}` : ""}
            </button>
          ))}
        </div>
      </PanelHeader>

      {shown.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <Sparkles className="mx-auto size-7 text-muted-foreground/40" />
          <p className="mt-2 text-[13px] font-medium text-foreground">
            {rows.length === 0 ? "No demo requests yet" : "Nothing in that stage."}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
            {rows.length === 0
              ? "They arrive from the form on vantaraiq.com and land here the moment somebody submits."
              : "Try another stage."}
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
              <button
                type="button"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                aria-expanded={openId === r.id}
                className="focus-ring flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">
                    {r.company}
                  </p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {[r.name, r.role, r.crews ? `${r.crews} crews` : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase",
                    r.status === "NEW"
                      ? "border-brand/40 bg-brand/10 text-brand-bright"
                      : r.status === "WON"
                        ? "border-success/40 bg-success/10 text-success"
                        : r.status === "LOST"
                          ? "border-border bg-foreground/[0.04] text-muted-foreground"
                          : "border-warning/40 bg-warning/10 text-warning",
                  )}
                >
                  {r.status}
                </span>
                <span className="hidden shrink-0 text-[11.5px] text-muted-foreground sm:inline">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    openId === r.id && "rotate-180",
                  )}
                />
              </button>

              {openId === r.id ? <Expanded row={r} /> : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Expanded({ row: r }: { row: DemoRequestRow }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState(r.note);

  async function move(status: string) {
    setBusy(true);
    await setDemoRequestStatus({ id: r.id, status, note });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="border-t border-border/60 bg-background/40 px-3 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`mailto:${r.email}`}
          className="focus-ring inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-bright hover:underline"
        >
          <Mail className="size-3.5" /> {r.email}
        </a>
        {r.phone ? (
          <a
            href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
            className="focus-ring inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-bright hover:underline"
          >
            <Phone className="size-3.5" /> {r.phone}
          </a>
        ) : null}
        <span className="text-[11.5px] text-muted-foreground">
          {new Date(r.createdAt).toLocaleString()}
          {r.handledBy ? ` · last touched by ${r.handledBy}` : ""}
        </span>
      </div>

      {r.message ? (
        <p className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-[12.5px] text-foreground">
          {r.message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened on the call"
          className="focus-ring h-8 min-w-[220px] flex-1 rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground"
        />
        {STAGES.filter(([v]) => v !== r.status).map(([v, l]) => (
          <button
            key={v}
            type="button"
            disabled={busy}
            onClick={() => void move(v)}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : null}
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
