"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import {
  EXTERNAL_LABEL,
  FIELD_LABEL,
  externalTone,
  fieldTone,
  type ExternalReadiness,
  type FieldReadiness,
} from "@/lib/locate-readiness";
import {
  assignContractorLocate,
  refreshLocateTicket,
  reportContractorLocateIssue,
  startContractorLocate,
  verifyContractorLocate,
} from "@/app/locates/locate-actions";

type Detail = {
  ticket: Record<string, unknown> & {
    id: string;
    number: string;
    revision: string;
    providerName: string;
    providerReady: boolean;
    providerDetail: string;
    street: string;
    crossStreet: string;
    city: string;
    county: string;
    workType: string;
    ticketType: string;
    locateInstructions: string;
    calledInOn: string;
    workToBeginOn: string;
    responseBy: string;
    expiresOn: string;
    expiryEstimated: boolean;
    daysToExpiry: number | null;
    urgency: string;
    sourceUrl: string;
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    projectName: string;
    crewName: string;
    assignedToName: string;
  };
  readiness: { external: string; field: string; blockingReason: string };
  responses: {
    id: string;
    member: string;
    code: string;
    facilityType: string;
    status: string;
    responseDescription: string;
    respondedOn: string;
    note: string;
    performedBy: string;
  }[];
  contractorLocates: {
    id: string;
    utilityName: string;
    status: string;
    assignedCrewName: string;
    assignedToName: string;
    locatedByName: string;
    locatedAt: string | null;
    frequencyUsed: string;
    signalQuality: string;
    notes: string;
  }[];
  changes: {
    id: string;
    kind: string;
    summary: string;
    actor: string;
    at: string;
  }[];
  checks: {
    id: string;
    checkedAt: string;
    checkType: string;
    success: boolean;
    providerStatus: string;
    errorMessage: string;
    changesDetected: number;
  }[];
};

const TONE_CLASS = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  critical: "border-critical/40 bg-critical/10 text-critical",
  muted: "border-border bg-foreground/[0.04] text-muted-foreground",
} as const;

export function LocateDetail({
  detail,
  canManage,
  crews,
  users,
}: {
  detail: Detail;
  canManage: boolean;
  crews: { id: string; company: string }[];
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const t = detail.ticket;
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/locates"
        className="focus-ring inline-flex w-fit items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All locates
      </Link>

      {/* The two claims, side by side and never merged. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <StatusPanel
          eyebrow="811 status"
          label={EXTERNAL_LABEL[detail.readiness.external as ExternalReadiness]}
          tone={externalTone(detail.readiness.external as ExternalReadiness)}
          detail={
            detail.readiness.external === "READY"
              ? "Every outside utility we need an answer from has responded."
              : detail.readiness.blockingReason
          }
        />
        <StatusPanel
          eyebrow="Field status"
          label={FIELD_LABEL[detail.readiness.field as FieldReadiness]}
          tone={fieldTone(detail.readiness.field as FieldReadiness)}
          detail={detail.readiness.blockingReason}
        />
      </div>

      <Panel>
        <PanelHeader title={`${t.number}${t.revision ? `-${t.revision}` : ""}`}>
          <a
            href={t.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] text-foreground hover:bg-foreground/[0.04]"
          >
            <ExternalLink className="size-3.5" /> Open at {t.providerName}
          </a>
          {canManage ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                setErr(null);
                const res = await refreshLocateTicket(t.id);
                setBusy(false);
                if (res.ok) {
                  setMsg(`Checked. ${res.changes} change(s).`);
                  router.refresh();
                } else setErr(res.error);
              }}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Refresh
            </button>
          ) : null}
        </PanelHeader>
        <PanelBody>
          {err ? <p className="mb-2 text-[12px] text-critical">{err}</p> : null}
          {msg ? <p className="mb-2 text-[12px] text-success">{msg}</p> : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card title="Where">
              <Line label="Street" value={t.street || "—"} />
              <Line label="Cross" value={t.crossStreet || "—"} />
              <Line label="City" value={[t.city, t.county].filter(Boolean).join(", ") || "—"} />
              <Line label="Work" value={t.workType || "—"} />
            </Card>
            <Card title="Who">
              <Line label="Project" value={t.projectName || "Not assigned"} />
              <Line label="Crew" value={t.crewName || "Not assigned"} />
              <Line label="Owner" value={t.assignedToName || "Nobody"} />
              <Line label="Type" value={t.ticketType || "—"} />
            </Card>
            <Card title="Clock">
              <Line label="Called in" value={t.calledInOn || "—"} />
              <Line label="In force" value={t.workToBeginOn || "—"} />
              <Line
                label="Expires"
                value={`${t.expiresOn || "No date"}${t.expiryEstimated ? " (est)" : ""}`}
              />
              <Line
                label="Checked"
                value={t.lastCheckedAt ? new Date(t.lastCheckedAt).toLocaleString() : "Never"}
              />
            </Card>
          </div>

          {t.locateInstructions ? (
            <div className="mt-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Locate instructions
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-foreground">
                {t.locateInstructions}
              </p>
            </div>
          ) : null}
        </PanelBody>
      </Panel>

      {/* Who owes what, and whose job each one is. */}
      <Panel>
        <PanelHeader title="Utility responses" count={detail.responses.length} />
        {detail.responses.length === 0 ? (
          <PanelBody>
            <p className="text-[12.5px] text-muted-foreground">
              Nothing recorded. Paste the ticket or its response screen to bring the utilities in.
            </p>
          </PanelBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-border/70">
                  {["Utility", "Type", "Status", "Responsibility", "Updated"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.responses.map((r) => {
                  const settled = ["MARKED", "CLEAR"].includes(r.status);
                  const ours = r.performedBy !== "MEMBER";
                  return (
                    <tr key={r.id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 text-[12.5px] text-foreground">{r.member}</td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">
                        {r.facilityType || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase",
                            ours
                              ? TONE_CLASS.muted
                              : settled
                                ? TONE_CLASS.success
                                : TONE_CLASS.warning,
                          )}
                        >
                          {ours ? "Not applicable" : r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {ours ? (
                          <span className="font-semibold text-warning">Fortitude locates this</span>
                        ) : (
                          <span className="text-muted-foreground">811 member</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">
                        {r.respondedOn || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {detail.contractorLocates.length > 0 ? (
        <Panel>
          <PanelHeader title="Our locates" count={detail.contractorLocates.length} />
          <PanelBody>
            <div className="flex flex-col gap-3">
              {detail.contractorLocates.map((c) => (
                <ContractorCard
                  key={c.id}
                  locate={c}
                  canManage={canManage}
                  crews={crews}
                  users={users}
                />
              ))}
            </div>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader title="History" count={detail.changes.length} />
        <PanelBody>
          {detail.changes.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">Nothing has changed yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.changes.map((c) => (
                <li key={c.id} className="flex gap-2.5 border-b border-border/40 pb-2 last:border-0">
                  <span className="num w-[135px] shrink-0 text-[11.5px] text-muted-foreground">
                    {new Date(c.at).toLocaleString()}
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] text-foreground">
                    {c.summary}
                    {c.actor ? (
                      <span className="text-muted-foreground"> · {c.actor}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      {canManage && detail.checks.length > 0 ? (
        <Panel>
          <PanelHeader title="Check history" count={detail.checks.length} />
          <PanelBody>
            <ul className="flex flex-col gap-1.5">
              {detail.checks.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="num w-[135px] shrink-0 text-muted-foreground">
                    {new Date(c.checkedAt).toLocaleString()}
                  </span>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase",
                      c.success ? TONE_CLASS.success : TONE_CLASS.warning,
                    )}
                  >
                    {c.providerStatus}
                  </span>
                  <span className="text-muted-foreground">{c.checkType.toLowerCase()}</span>
                  {c.changesDetected ? (
                    <span className="text-foreground">{c.changesDetected} change(s)</span>
                  ) : null}
                  {c.errorMessage ? (
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {c.errorMessage}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}

function StatusPanel({
  eyebrow,
  label,
  tone,
  detail,
}: {
  eyebrow: string;
  label: string;
  tone: "success" | "warning" | "critical" | "muted";
  detail: string;
}) {
  return (
    <div
      className={cn(
        "surface p-4",
        tone === "success"
          ? "border-success/30"
          : tone === "critical"
            ? "border-critical/30"
            : tone === "warning"
              ? "border-warning/30"
              : "",
      )}
    >
      <p className="eyebrow">{eyebrow}</p>
      <p
        className={cn(
          "mt-1 text-[19px] font-bold uppercase tracking-[-0.01em]",
          tone === "success"
            ? "text-success"
            : tone === "critical"
              ? "text-critical"
              : tone === "warning"
                ? "text-warning"
                : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

/**
 * One locate we walk ourselves.
 *
 * Verifying asks for the frequency and how the signal came back before it will
 * accept a sign-off, and reporting a problem is exactly as easy to reach. A
 * card whose only one-click outcome is "done" produces "done".
 */
function ContractorCard({
  locate: c,
  canManage,
  crews,
  users,
}: {
  locate: Detail["contractorLocates"][number];
  canManage: boolean;
  crews: { id: string; company: string }[];
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [panel, setPanel] = React.useState<"none" | "verify" | "issue" | "assign">("none");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [freq, setFreq] = React.useState("");
  const [signal, setSignal] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [issueKind, setIssueKind] =
    React.useState<"ISSUE_FOUND" | "UNABLE_TO_LOCATE" | "REQUIRES_ESCALATION">("UNABLE_TO_LOCATE");
  const [crewId, setCrewId] = React.useState("");
  const [userId, setUserId] = React.useState("");

  const verified = c.status === "VERIFIED";
  const problem = ["ISSUE_FOUND", "UNABLE_TO_LOCATE", "REQUIRES_ESCALATION"].includes(c.status);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "That didn't go through.");
    setPanel("none");
    router.refresh();
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        verified
          ? "border-success/35 bg-success/[0.05]"
          : problem
            ? "border-critical/35 bg-critical/[0.05]"
            : "border-warning/35 bg-warning/[0.05]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {verified ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <AlertTriangle className="size-4 text-warning" />
        )}
        <p className="text-[13px] font-semibold text-foreground">{c.utilityName}</p>
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase",
            verified ? TONE_CLASS.success : problem ? TONE_CLASS.critical : TONE_CLASS.warning,
          )}
        >
          {c.status.replace(/_/g, " ")}
        </span>
      </div>

      <p className="mt-1 text-[12px] text-muted-foreground">
        {verified
          ? `Walked by ${c.locatedByName || "—"}${c.locatedAt ? ` on ${new Date(c.locatedAt).toLocaleString()}` : ""} · ${c.frequencyUsed} · ${c.signalQuality}`
          : problem
            ? c.notes || "A problem was reported."
            : `Assigned to ${c.assignedToName || c.assignedCrewName || "nobody yet"}. This must be located and signed off before excavation.`}
      </p>

      {err ? <p className="mt-2 text-[12px] text-critical">{err}</p> : null}

      {canManage ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Action label="Assign" onClick={() => setPanel(panel === "assign" ? "none" : "assign")} />
          {!verified ? (
            <Action
              label="Start locate"
              busy={busy}
              onClick={() => void run(() => startContractorLocate(c.id))}
            />
          ) : null}
          <Action label="Mark verified" tone="solid" onClick={() => setPanel(panel === "verify" ? "none" : "verify")} />
          <Action label="Report issue" onClick={() => setPanel(panel === "issue" ? "none" : "issue")} />
        </div>
      ) : null}

      {panel === "assign" ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <select
            value={crewId}
            onChange={(e) => setCrewId(e.target.value)}
            aria-label="Crew"
            className="focus-ring h-8 rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground"
          >
            <option value="">No crew</option>
            {crews.map((x) => (
              <option key={x.id} value={x.id}>{x.company}</option>
            ))}
          </select>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            aria-label="Locator"
            className="focus-ring h-8 rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground"
          >
            <option value="">No locator</option>
            {users.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          <Action
            label="Save"
            tone="solid"
            busy={busy}
            onClick={() =>
              void run(() =>
                assignContractorLocate({
                  id: c.id,
                  assignedCrewId: crewId || null,
                  assignedToId: userId || null,
                }),
              )
            }
          />
        </div>
      ) : null}

      {panel === "verify" ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-[11.5px] text-muted-foreground">
            Signing this off says the line is marked and a crew may dig. Say what you used, so
            somebody can judge it later.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <input
              value={freq}
              onChange={(e) => setFreq(e.target.value)}
              placeholder="Frequency — 82kHz, direct connect…"
              className="focus-ring h-8 w-[230px] rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground"
            />
            <input
              value={signal}
              onChange={(e) => setSignal(e.target.value)}
              placeholder="Signal — strong to the ped, weak past…"
              className="focus-ring h-8 w-[250px] rounded-lg border border-border bg-transparent px-2 text-[12px] text-foreground"
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything the crew should know."
            className="focus-ring rounded-lg border border-border bg-transparent p-2 text-[12px] text-foreground"
          />
          <div>
            <Action
              label="Confirm verified"
              tone="solid"
              busy={busy}
              onClick={() =>
                void run(() =>
                  verifyContractorLocate({
                    id: c.id,
                    frequencyUsed: freq,
                    signalQuality: signal,
                    notes,
                  }),
                )
              }
            />
          </div>
        </div>
      ) : null}

      {panel === "issue" ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["UNABLE_TO_LOCATE", "Unable to locate"],
                ["ISSUE_FOUND", "Issue found"],
                ["REQUIRES_ESCALATION", "Needs escalation"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setIssueKind(v)}
                className={cn(
                  "focus-ring rounded-full px-2.5 py-1 text-[11.5px] font-medium",
                  issueKind === v
                    ? "bg-critical text-white"
                    : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="What happened? This is what somebody acts on."
            className="focus-ring rounded-lg border border-border bg-transparent p-2 text-[12px] text-foreground"
          />
          <div>
            <Action
              label="Report"
              tone="solid"
              busy={busy}
              onClick={() =>
                void run(() =>
                  reportContractorLocateIssue({ id: c.id, status: issueKind, notes }),
                )
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Action({
  label,
  onClick,
  tone,
  busy,
}: {
  label: string;
  onClick: () => void;
  tone?: "solid";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50",
        tone === "solid"
          ? "bg-brand text-white hover:bg-brand/90"
          : "border border-border text-foreground hover:bg-foreground/[0.04]",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {label}
    </button>
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
