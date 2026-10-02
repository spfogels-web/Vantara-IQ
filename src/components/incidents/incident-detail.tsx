"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,

  Clock,
  MapPin,
  MessageSquarePlus,
  PhoneCall,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import type { IncidentDetail } from "@/data/queries";
import {
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_TONE,
  INCIDENT_TYPE_LABEL,
  type IncidentStatusValue,
} from "@/lib/incidents";
import {
  addIncidentNote,
  recordIncidentNotification,
  setIncidentRepair,
  setIncidentStatus,
  setIncidentWorkStopped,
  voidIncident,
} from "@/app/incidents/incident-actions";

/**
 * One incident, read as an account of what happened rather than a form.
 *
 * The timeline is the spine of the page, not a tab nobody opens. Everything
 * else on screen is the current state; the timeline is the only thing that
 * says how it got there, and it is the part somebody will be reading two years
 * from now with a solicitor beside them.
 */

function statusClass(status: IncidentStatusValue) {
  return {
    critical: "bg-critical/12 text-critical",
    warning: "bg-warning/12 text-warning",
    info: "bg-info/12 text-info",
    success: "bg-success/12 text-success",
    neutral: "bg-foreground/[0.06] text-muted-foreground",
  }[INCIDENT_STATUS_TONE[status]];
}

const EVENT_LABEL: Record<string, string> = {
  REPORTED: "Reported",
  WORK_STOPPED: "Work stopped",
  WORK_RESUMED: "Work resumed",
  EVIDENCE_ADDED: "Evidence added",
  NOTIFICATION_RECORDED: "Notification recorded",
  STATUS_CHANGED: "Status changed",
  REPAIR_STARTED: "Repair started",
  REPAIR_COMPLETED: "Repair completed",
  NOTE_ADDED: "Note added",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  VOIDED: "Voided",
  FIELD_CORRECTED: "Corrected",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[11.5px] text-muted-foreground">{label}</span>
      <span className="text-right text-[12.5px] text-foreground">{value}</span>
    </div>
  );
}

const STATUS_CHOICES: IncidentStatusValue[] = [
  "REPORTED",
  "UNDER_REVIEW",
  "REPAIR_IN_PROGRESS",
  "REPAIRED",
  "RESOLVED",
  "CLOSED",
];

export function IncidentDetailView({
  incident,
  staff,
  canClose,
  canVoid,
  role,
  evidencePicker,
}: {
  incident: IncidentDetail;
  staff: boolean;
  canClose: boolean;
  canVoid: boolean;
  role: string;
  evidencePicker: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    if (!res.ok) setError(res.error ?? "That did not work.");
    setBusy(false);
  }

  const voided = incident.status === "VOID";

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      {/* ── the record ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:col-span-7">
        <Panel>
          <PanelHeader
            title="What happened"
            icon={<AlertTriangle className="size-3.5 text-gold" />}
          />
          <PanelBody className="flex flex-col gap-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={cn("rounded px-2 py-0.5 text-[11.5px] font-medium", statusClass(incident.status))}>
                {INCIDENT_STATUS_LABEL[incident.status]}
              </span>
              {incident.workStopped ? (
                <span className="rounded bg-critical/12 px-2 py-0.5 text-[11.5px] font-medium text-critical">
                  Work stopped
                </span>
              ) : null}
              {incident.injury ? (
                <span className="rounded bg-critical/12 px-2 py-0.5 text-[11.5px] font-medium text-critical">
                  Injury{incident.injuryCount > 0 ? ` · ${incident.injuryCount}` : ""}
                </span>
              ) : null}
            </div>

            {incident.description ? (
              <p className="mb-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                {incident.description}
              </p>
            ) : null}

            <Row label="Type" value={INCIDENT_TYPE_LABEL[incident.type]} />
            <Row label="Severity" value={INCIDENT_SEVERITY_LABEL[incident.severity]} />
            <Row
              label="Occurred"
              value={incident.occurredAt.toLocaleString("en-US")}
            />
            <Row
              label="Reported"
              value={`${incident.reportedAt.toLocaleString("en-US")} by ${incident.reportedByName || "—"}`}
            />
            <Row
              label="Project"
              value={
                <Link href={`/projects/${incident.projectId}`} className="focus-ring hover:text-brand-bright">
                  {incident.projectName}
                </Link>
              }
            />
            {incident.crew ? <Row label="Crew" value={incident.crew} /> : null}
            {incident.locationText ? <Row label="Where" value={incident.locationText} /> : null}
            {incident.lat !== null && incident.lng !== null ? (
              <Row
                label="Fix"
                value={
                  <span className="num inline-flex items-center gap-1 text-muted-foreground">
                    <MapPin className="size-3" />
                    {incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}
                    {incident.accuracyM ? ` ±${Math.round(incident.accuracyM)}m` : ""}
                  </span>
                }
              />
            ) : null}
            {incident.utilityOwner ? <Row label="Utility owner" value={incident.utilityOwner} /> : null}
            {incident.utilityType ? <Row label="Utility" value={incident.utilityType} /> : null}

            {/* The 811 ticket. The live status is shown; the snapshot is shown
                as a snapshot, with the date it was taken, so nobody reads a
                frozen copy as the current state of the ticket. */}
            {incident.locate ? (
              <Row
                label="811 ticket"
                value={
                  <Link href="/locates" className="focus-ring num hover:text-brand-bright">
                    {incident.locate.number}
                    {incident.locate.revision ? `-${incident.locate.revision}` : ""}{" "}
                    <span className="text-muted-foreground">({incident.locate.status} now)</span>
                  </Link>
                }
              />
            ) : incident.locateSnapshot ? (
              <Row
                label="811 ticket"
                value={
                  <span className="num text-muted-foreground">
                    {incident.locateSnapshot.number} — no longer on file
                  </span>
                }
              />
            ) : null}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Evidence"
            description="The same photographs the project holds, tagged to this incident"
            icon={<AlertTriangle className="size-3.5 text-gold" />}
          />
          <PanelBody>
            {evidencePicker ? <div className="mb-3">{evidencePicker}</div> : null}
            {incident.photos.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                Nothing photographed yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {incident.photos.map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring group relative aspect-[4/3] overflow-hidden rounded-lg border border-border/60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption || "Incident evidence"}
                      className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                    {p.capturedAt ? (
                      <span className="num absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9.5px] text-white">
                        {p.capturedAt.toLocaleDateString("en-US")}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Who was notified"
            icon={<PhoneCall className="size-3.5 text-gold" />}
          />
          <PanelBody className="p-0">
            {incident.notifications.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                No notifications recorded.
              </p>
            ) : (
              <ul className="flex flex-col">
                {incident.notifications.map((n) => (
                  <li key={n.id} className="border-b border-border/40 px-4 py-2.5 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12.5px] font-medium text-foreground">
                        {n.partyName || n.party.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="num text-[11px] text-muted-foreground">
                        {n.notifiedAt.toLocaleString("en-US")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {n.method.toLowerCase().replace(/_/g, " ")}
                      {n.contact ? ` · ${n.contact}` : ""}
                      {n.reference ? ` · ref ${n.reference}` : ""}
                    </p>
                    {n.note ? <p className="mt-1 text-[11.5px] text-foreground">{n.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>

      {/* ── the timeline and the controls ──────────────────────────── */}
      <div className="flex flex-col gap-4 xl:col-span-5">
        {staff && !voided ? (
          <Panel>
            <PanelHeader title="Move this on" icon={<Wrench className="size-3.5 text-gold" />} />
            <PanelBody className="flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-1.5">
                {STATUS_CHOICES.map((s) => {
                  const disabled =
                    busy || s === incident.status || (s === "CLOSED" && !canClose);
                  return (
                    <button
                      key={s}
                      disabled={disabled}
                      onClick={() => run(() => setIncidentStatus({ incidentId: incident.id, status: s }))}
                      className={cn(
                        "focus-ring rounded-lg border border-border/60 px-2.5 py-1 text-[11.5px] transition-colors",
                        s === incident.status
                          ? "bg-foreground/[0.08] text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                        disabled && "opacity-40",
                      )}
                    >
                      {INCIDENT_STATUS_LABEL[s]}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
                <button
                  disabled={busy || !!incident.repairStartedAt}
                  onClick={() => run(() => setIncidentRepair({ incidentId: incident.id, phase: "STARTED" }))}
                  className="focus-ring rounded-lg border border-border/60 px-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Repair started
                </button>
                <button
                  disabled={busy || !incident.repairStartedAt || !!incident.repairCompletedAt}
                  onClick={() => run(() => setIncidentRepair({ incidentId: incident.id, phase: "COMPLETED" }))}
                  className="focus-ring rounded-lg border border-border/60 px-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Repair complete
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      setIncidentWorkStopped({ incidentId: incident.id, stopped: !incident.workStopped }),
                    )
                  }
                  className="focus-ring rounded-lg border border-border/60 px-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  {incident.workStopped ? "Resume work" : "Stop work"}
                </button>
              </div>

              {canVoid ? (
                <button
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt("Why is this report being voided? It goes on the record.");
                    if (reason?.trim()) run(() => voidIncident({ incidentId: incident.id, reason }));
                  }}
                  className="focus-ring self-start text-[11px] text-muted-foreground/70 hover:text-critical"
                >
                  Void this report
                </button>
              ) : null}

              {error ? <p className="text-[11.5px] text-critical">{error}</p> : null}
            </PanelBody>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader
            title="Timeline"
            description="Append-only. A correction is a new entry, never an edit."
            icon={<Clock className="size-3.5 text-gold" />}
          />
          <PanelBody className="p-0">
            <ol className="flex flex-col">
              {incident.timeline.map((e) => (
                <li key={e.id} className="relative border-b border-border/40 px-4 py-2.5 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[12.5px] font-medium text-foreground">
                      {EVENT_LABEL[e.type] ?? e.type}
                    </span>
                    <span className="num text-[11px] text-muted-foreground">
                      {e.at.toLocaleString("en-US")}
                    </span>
                  </div>
                  {e.field && e.toValue ? (
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {e.field}: <span className="line-through opacity-60">{e.fromValue || "—"}</span>{" "}
                      → <span className="text-foreground">{e.toValue}</span>
                    </p>
                  ) : null}
                  {e.detail ? (
                    <p className="mt-1 whitespace-pre-wrap text-[12px] text-foreground">{e.detail}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    {e.actorName || "—"}
                    {e.actorRole ? ` · ${e.actorRole.toLowerCase()}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>

        {!voided ? (
          <Panel>
            <PanelHeader
              title="Add a note"
              description="Goes on the timeline under your name"
              icon={<MessageSquarePlus className="size-3.5 text-gold" />}
            />
            <PanelBody className="flex flex-col gap-2">
              <textarea
                id="incident-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="What has changed since this was reported?"
                className="focus-ring w-full rounded-lg border border-border/60 bg-transparent px-2.5 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/60"
              />
              <button
                disabled={busy || !note.trim()}
                onClick={async () => {
                  await run(() => addIncidentNote({ incidentId: incident.id, note }));
                  setNote("");
                }}
                className="focus-ring self-start rounded-lg bg-foreground/[0.08] px-3 py-1.5 text-[12px] font-medium text-foreground disabled:opacity-40"
              >
                Add to timeline
              </button>
            </PanelBody>
          </Panel>
        ) : null}

        {staff && !voided ? (
          <NotificationForm incidentId={incident.id} onError={setError} />
        ) : null}

        {!staff ? (
          <p className="px-1 text-[11.5px] text-muted-foreground">
            {role === "EMPLOYEE"
              ? "You reported this. The office moves it on and records who was notified."
              : "You can add notes, evidence and stop or resume work. The office moves it on."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NotificationForm({
  incidentId,
  onError,
}: {
  incidentId: string;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [party, setParty] = React.useState("UTILITY_OWNER");
  const [method, setMethod] = React.useState("PHONE");
  const [partyName, setPartyName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [notifiedAt, setNotifiedAt] = React.useState(() => toLocalInput(new Date()));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="focus-ring self-start rounded-lg border border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        Record a notification
      </button>
    );
  }

  return (
    <Panel>
      <PanelHeader title="Record a notification" icon={<PhoneCall className="size-3.5 text-gold" />} />
      <PanelBody className="flex flex-col gap-2">
        <select
          id="notify-party"
          value={party}
          onChange={(e) => setParty(e.target.value)}
          className="focus-ring rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-[12.5px]"
        >
          <option value="UTILITY_OWNER">Utility owner</option>
          <option value="ONE_CALL_811">811 / one call</option>
          <option value="CUSTOMER">Customer</option>
          <option value="PROPERTY_OWNER">Property owner</option>
          <option value="EMERGENCY_SERVICES">Emergency services</option>
          <option value="INSURER">Insurer</option>
          <option value="INTERNAL">Internal</option>
          <option value="OTHER">Other</option>
        </select>
        <input
          id="notify-name"
          value={partyName}
          onChange={(e) => setPartyName(e.target.value)}
          placeholder="Who, by name"
          className="focus-ring rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-[12.5px]"
        />
        <select
          id="notify-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="focus-ring rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-[12.5px]"
        >
          <option value="PHONE">Phone</option>
          <option value="EMAIL">Email</option>
          <option value="IN_PERSON">In person</option>
          <option value="SMS">Text</option>
          <option value="PORTAL">Portal</option>
          <option value="OTHER">Other</option>
        </select>
        <input
          id="notify-contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Number or address actually used"
          className="focus-ring rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-[12.5px]"
        />
        <input
          id="notify-at"
          type="datetime-local"
          value={notifiedAt}
          onChange={(e) => setNotifiedAt(e.target.value)}
          className="focus-ring rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-[12.5px]"
        />
        <input
          id="notify-ref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Their ticket or claim number"
          className="focus-ring rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-[12.5px]"
        />
        <textarea
          id="notify-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="What was said"
          className="focus-ring rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-[12.5px]"
        />
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await recordIncidentNotification({
                incidentId,
                party: party as never,
                method: method as never,
                partyName,
                contact,
                notifiedAt: new Date(notifiedAt).toISOString(),
                reference,
                note,
              });
              setBusy(false);
              if (!res.ok) onError(res.error ?? "That did not work.");
              else {
                setOpen(false);
                setPartyName("");
                setContact("");
                setReference("");
                setNote("");
              }
            }}
            className="focus-ring rounded-lg bg-foreground/[0.08] px-3 py-1.5 text-[12px] font-medium text-foreground disabled:opacity-40"
          >
            Record it
          </button>
          <button
            onClick={() => setOpen(false)}
            className="focus-ring px-2 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </PanelBody>
    </Panel>
  );
}

/** A Date as the value a datetime-local input wants, in local time. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
