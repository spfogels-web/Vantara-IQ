"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { PanelBody } from "@/components/common/panel";
import { removeProjectLocateRule, setProjectLocateRule } from "@/app/locates/locate-actions";

/**
 * Who locates what on this job.
 *
 * The one piece of configuration the whole locate module turns on. A utility
 * marked as ours stops holding up 811 readiness — nobody is waiting on a
 * response that is never coming — and starts holding up field readiness, which
 * is the flag that decides whether a crew digs.
 *
 * Per project rather than global, because Fortitude locates Windstream on the
 * Windstream builds and nowhere else. A global "Windstream never blocks" would
 * quietly clear a ticket on a job where Windstream really is sending somebody.
 */
export function ProjectLocateRules({
  projectId,
  rules,
  summary,
}: {
  projectId: string;
  rules: {
    id: string;
    utilityName: string;
    utilityCode: string;
    performedBy: string;
  }[];
  summary: {
    total: number;
    fieldReady: number;
    ready811: number;
    contractorRequired: number;
    waiting: number;
    expiring: number;
    expired: number;
  };
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [who, setWho] = React.useState<"CONTRACTOR" | "THIRD_PARTY" | "MEMBER">("CONTRACTOR");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const ours = rules.filter((r) => r.performedBy !== "MEMBER");

  return (
    <PanelBody>
      {/* The counts, each one a link into the board already filtered. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Count label="Tickets" value={summary.total} href={`/locates?project=${projectId}`} />
        <Count label="Field ready" value={summary.fieldReady} tone="success" href={`/locates?project=${projectId}`} />
        <Count label="811 ready" value={summary.ready811} tone="success" href={`/locates?project=${projectId}`} />
        <Count label="Our locate" value={summary.contractorRequired} tone="warning" href={`/locates?project=${projectId}`} />
        <Count label="Waiting" value={summary.waiting} tone="warning" href={`/locates?project=${projectId}`} />
        <Count label="Expired" value={summary.expired} tone="critical" href={`/locates?project=${projectId}`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Locate responsibilities
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {ours.length === 0
              ? "Every utility on this job is located by its own 811 member."
              : `${ours.map((r) => r.utilityName).join(", ")} ${ours.length === 1 ? "is" : "are"} ours to locate. Tickets stay off field-ready until each one is walked and signed off.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.04]"
        >
          <Plus className="size-3.5" /> Add a utility
        </button>
      </div>

      {adding ? (
        <div className="mt-2 flex flex-wrap items-end gap-1.5 rounded-lg border border-border bg-foreground/[0.02] p-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Utility</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="WINDSTREAM"
              className="focus-ring h-8 w-[180px] rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">811 code (optional)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WIN01"
              className="focus-ring h-8 w-[120px] rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Located by</span>
            <select
              value={who}
              onChange={(e) => setWho(e.target.value as typeof who)}
              className="focus-ring h-8 rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground"
            >
              <option value="CONTRACTOR">Fortitude</option>
              <option value="THIRD_PARTY">Another contractor</option>
              <option value="MEMBER">The 811 member</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              setMsg(null);
              const res = await setProjectLocateRule({
                projectId,
                utilityName: name,
                utilityCode: code,
                performedBy: who,
              });
              setBusy(false);
              if (!res.ok) return setErr(res.error);
              setMsg(`Saved. ${res.tickets} ticket(s) on this job re-judged.`);
              setName("");
              setCode("");
              setAdding(false);
              router.refresh();
            }}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Save
          </button>
        </div>
      ) : null}

      {rules.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-foreground/[0.02] px-2.5 py-1.5"
            >
              <span className="text-[12.5px] font-medium text-foreground">{r.utilityName}</span>
              {r.utilityCode ? (
                <span className="num text-[11.5px] text-muted-foreground">{r.utilityCode}</span>
              ) : null}
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase",
                  r.performedBy === "MEMBER"
                    ? "border-border bg-foreground/[0.04] text-muted-foreground"
                    : "border-warning/40 bg-warning/10 text-warning",
                )}
              >
                {r.performedBy === "CONTRACTOR"
                  ? "We locate this"
                  : r.performedBy === "THIRD_PARTY"
                    ? "Another contractor"
                    : "811 member"}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await removeProjectLocateRule(r.id);
                  router.refresh();
                }}
                aria-label={`Remove the ${r.utilityName} rule`}
                className="focus-ring ml-auto rounded-md p-1 text-muted-foreground hover:text-critical"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {err ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-critical">
          <AlertTriangle className="size-3.5" /> {err}
        </p>
      ) : null}
      {msg ? <p className="mt-2 text-[12px] text-success">{msg}</p> : null}
    </PanelBody>
  );
}

function Count({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "critical";
  href: string;
}) {
  return (
    <Link
      href={href}
      className="focus-ring rounded-lg border border-border bg-foreground/[0.02] px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]"
    >
      <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "num mt-0.5 text-[17px] font-semibold",
          value === 0
            ? "text-muted-foreground"
            : tone === "success"
              ? "text-success"
              : tone === "warning"
                ? "text-warning"
                : tone === "critical"
                  ? "text-critical"
                  : "text-foreground",
        )}
      >
        {value}
      </p>
    </Link>
  );
}
