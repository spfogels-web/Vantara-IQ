"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, OctagonPause } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelBody } from "@/components/common/panel";
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_HINT,
  INCIDENT_TYPE_LABEL,
  type IncidentSeverityValue,
  type IncidentTypeValue,
} from "@/lib/incidents";
import { reportIncident } from "@/app/incidents/incident-actions";

/**
 * Opening an incident from a phone.
 *
 * One column, big targets, and nothing that is not needed in the first five
 * minutes. Everything else — who was notified, what the repair took, which 811
 * ticket covered it — is added afterwards by somebody who is not currently
 * standing next to the problem.
 *
 * The time defaults to now and is editable, because the honest answer is often
 * "twenty minutes ago, before anybody got their phone out", and every safety
 * figure is measured from that field rather than from when this was submitted.
 */
export function ReportIncidentForm({
  projects,
  initialProjectId,
}: {
  projects: { id: string; name: string; number: string }[];
  initialProjectId: string;
}) {
  const router = useRouter();

  const [projectId, setProjectId] = React.useState(
    initialProjectId || (projects.length === 1 ? projects[0].id : ""),
  );
  const [type, setType] = React.useState<IncidentTypeValue | "">("");
  const [severity, setSeverity] = React.useState<IncidentSeverityValue>("MINOR");
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [occurredAt, setOccurredAt] = React.useState(() => toLocalInput(new Date()));
  const [locationText, setLocationText] = React.useState("");
  const [injury, setInjury] = React.useState(false);
  const [workStopped, setWorkStopped] = React.useState(false);
  const [utilityOwner, setUtilityOwner] = React.useState("");

  const [fix, setFix] = React.useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [fixState, setFixState] = React.useState<"idle" | "asking" | "failed">("idle");

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Asked for on mount rather than behind a button: the fix is most useful when
  // it is taken where the thing happened, and that is now. A refusal is not an
  // error — the incident is still worth filing without one.
  React.useEffect(() => {
    if (!navigator.geolocation) return;
    setFixState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
        setFixState("idle");
      },
      () => setFixState("failed"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const ready = projectId && type && summary.trim();

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const res = await reportIncident({
      projectId,
      type: type as IncidentTypeValue,
      severity,
      occurredAt: new Date(occurredAt).toISOString(),
      summary,
      description,
      locationText,
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
      accuracyM: fix?.accuracyM ?? null,
      injury,
      workStopped,
      utilityOwner,
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "That did not send.");
      return;
    }
    router.push(`/incidents/${res.id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3">
      <Panel>
        <PanelBody className="flex flex-col gap-4">
          <Field label="Which job">
            <select
              id="incident-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="focus-ring w-full rounded-lg border border-border/60 bg-transparent px-3 py-2.5 text-[14px] text-foreground"
            >
              <option value="">Choose a job…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.number ? ` · ${p.number}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="What happened">
            <div className="flex flex-col gap-1.5">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "focus-ring rounded-lg border px-3 py-2.5 text-left transition-colors",
                    type === t
                      ? "border-brand-bright/60 bg-brand-bright/[0.08]"
                      : "border-border/60 hover:border-border",
                  )}
                >
                  <span className="block text-[13.5px] font-medium text-foreground">
                    {INCIDENT_TYPE_LABEL[t]}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {INCIDENT_TYPE_HINT[t]}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="In one line">
            <input
              id="incident-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Struck a 2in gas service at the back of 114"
              className="focus-ring w-full rounded-lg border border-border/60 bg-transparent px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50"
            />
          </Field>

          <Field label="When it happened" hint="Not when you are filling this in">
            <input
              id="incident-when"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="focus-ring w-full rounded-lg border border-border/60 bg-transparent px-3 py-2.5 text-[14px] text-foreground"
            />
          </Field>

          <Field label="Where" hint="Address, pole number, station — whatever you would say on the radio">
            <input
              id="incident-where"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="114 Coleman Rd, back easement"
              className="focus-ring w-full rounded-lg border border-border/60 bg-transparent px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50"
            />
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MapPin className="size-3" />
              {fix
                ? `Location recorded · ±${Math.round(fix.accuracyM)}m`
                : fixState === "asking"
                  ? "Taking a location…"
                  : "No location from this device — the report still goes in"}
            </p>
          </Field>

          {type === "UTILITY_STRIKE" ? (
            <Field label="Whose line" hint="If you know it">
              <input
                id="incident-utility"
                value={utilityOwner}
                onChange={(e) => setUtilityOwner(e.target.value)}
                placeholder="Dominion, Spire, city water…"
                className="focus-ring w-full rounded-lg border border-border/60 bg-transparent px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50"
              />
            </Field>
          ) : null}

          <div className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-foreground">
              <input
                id="incident-injury"
                type="checkbox"
                checked={injury}
                onChange={(e) => setInjury(e.target.checked)}
                className="focus-ring size-4 rounded border-border/60"
              />
              Somebody was hurt
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-foreground">
              <input
                id="incident-stopped"
                type="checkbox"
                checked={workStopped}
                onChange={(e) => setWorkStopped(e.target.checked)}
                className="focus-ring size-4 rounded border-border/60"
              />
              <OctagonPause className="size-3.5 text-critical" />
              Work has stopped
            </label>
          </div>

          <Field label="Severity">
            <div className="flex gap-1.5">
              {(["MINOR", "MODERATE", "SERIOUS", "CRITICAL"] as IncidentSeverityValue[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={cn(
                    "focus-ring flex-1 rounded-lg border px-2 py-2 text-[12px] transition-colors",
                    severity === s
                      ? "border-brand-bright/60 bg-brand-bright/[0.08] text-foreground"
                      : "border-border/60 text-muted-foreground",
                  )}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Anything else" hint="Optional now — you can add to it later">
            <textarea
              id="incident-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What you were doing, what was marked, who is on site"
              className="focus-ring w-full rounded-lg border border-border/60 bg-transparent px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50"
            />
          </Field>

          {error ? <p className="text-[12.5px] text-critical">{error}</p> : null}

          <button
            type="button"
            disabled={!ready || busy}
            onClick={submit}
            className="focus-ring w-full rounded-lg bg-brand-bright px-4 py-3 text-[14px] font-semibold text-background disabled:opacity-40"
          >
            {busy ? "Sending…" : "Report it"}
          </button>

          <p className="text-center text-[11.5px] text-muted-foreground">
            Photographs are added on the next screen. Get the report in first.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-foreground">{label}</p>
      {hint ? <p className="mb-1.5 text-[11.5px] text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
