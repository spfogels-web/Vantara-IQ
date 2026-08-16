"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { createProject, updateProject, type ProjectInput } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";

const STATUSES = ["Ahead of schedule", "On schedule", "At risk", "Behind schedule"];

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

export type ProjectFormInitial = ProjectInput & { id?: string };

const BLANK: ProjectInput = {
  number: "",
  name: "",
  client: "",
  location: "",
  status: "On schedule",
  crew: "",
  remainingFt: 0,
  requiredFtPerDay: 0,
  actualFtPerDay: 0,
  pctComplete: 0,
  health: 85,
  forecast: "On track",
};

export function ProjectForm({
  initial,
  customerNames,
}: {
  initial?: ProjectFormInitial;
  customerNames: string[];
}) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [f, setF] = React.useState<ProjectInput>({ ...BLANK, ...initial });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (k: keyof ProjectInput, v: string | number) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = editing ? await updateProject(initial!.id!, f) : await createProject(f);
    setBusy(false);
    if (res.ok) router.push(`/projects/${res.id}`);
    else setError(res.error ?? "Could not save project");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <Link href={editing ? `/projects/${initial!.id}` : "/projects"} className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> {editing ? "Back to project" : "All projects"}
        </Link>
      </div>

      <Panel>
        <PanelHeader title={editing ? "Edit project" : "New project"} description="Project number and name identify the job everywhere." />
        <PanelBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Project number *">
            <input value={f.number} onChange={(e) => set("number", e.target.value)} placeholder="WIN-WP-24001" className={cn(inputClass, "num")} />
          </Field>
          <Field label="Project name *">
            <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Windstream White Plains" className={inputClass} />
          </Field>
          {/* Picked, never typed. This was a free-text box with suggestions,
              and the customer link is made by matching the name exactly — so
              "Windstream Globe" instead of the record's own name silently left
              the project with no customer, no rate card, and a value of $0.
              Three of four projects were in that state. */}
          <Field label="Customer *">
            <select
              value={f.client}
              onChange={(e) => set("client", e.target.value)}
              className={cn(inputClass, "appearance-none")}
            >
              <option value="">Select a customer…</option>
              {customerNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {!f.client ? (
              <p className="mt-1 text-[11px] text-warning">
                Without a customer there is no rate card, so this project cannot be valued or billed.
              </p>
            ) : null}
          </Field>
          <Field label="Location">
            <input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="White Plains, SC" className={inputClass} />
          </Field>
          <Field label="Status">
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className={cn(inputClass, "appearance-none")}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Crew">
            <input value={f.crew} onChange={(e) => set("crew", e.target.value)} placeholder="Crew 4" className={inputClass} />
          </Field>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Production & schedule"
          description="Enter the route length once. Pace, percent complete and health are worked out from the dailies against it."
        />
        <PanelBody className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* The one number a person has to supply. Everything else on this
              panel used to be typed too, which meant it was typed once and
              then quietly went stale — every project sat on health 80 at 0/0
              pace while the dailies knew better. */}
          <Field label="Total route footage">
            <input
              type="number"
              min={0}
              value={f.remainingFt || ""}
              onChange={(e) => set("remainingFt", Number(e.target.value))}
              placeholder="e.g. 12000"
              className={cn(inputClass, "num")}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Plow and bore combined, start to finish. Footage placed is
              subtracted from this as dailies are filed.
            </p>
          </Field>
          <Field label="Required ft/day">
            <input type="number" min={0} value={f.requiredFtPerDay || ""} onChange={(e) => set("requiredFtPerDay", Number(e.target.value))} className={cn(inputClass, "num")} disabled placeholder="from the deadline" />
          </Field>
          <Field label="Actual ft/day">
            <input type="number" min={0} value={f.actualFtPerDay || ""} onChange={(e) => set("actualFtPerDay", Number(e.target.value))} className={cn(inputClass, "num")} disabled placeholder="from the dailies" />
          </Field>
          <Field label="% complete">
            <input type="number" min={0} max={100} value={f.pctComplete || ""} onChange={(e) => set("pctComplete", Number(e.target.value))} className={cn(inputClass, "num")} />
          </Field>
          <Field label="Health (0–100)">
            <input type="number" min={0} max={100} value={f.health || ""} onChange={(e) => set("health", Number(e.target.value))} className={cn(inputClass, "num")} />
          </Field>
          <Field label="Forecast">
            <input value={f.forecast} onChange={(e) => set("forecast", e.target.value)} placeholder="On track" className={inputClass} />
          </Field>
        </PanelBody>
      </Panel>

      {error ? <p className="text-[12.5px] text-critical">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Link href={editing ? `/projects/${initial!.id}` : "/projects"} className="focus-ring rounded-lg px-3 py-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
        <Button type="submit" disabled={busy || !f.number.trim() || !f.name.trim()} className="brand-gradient h-10 gap-1.5 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-40">
          {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : editing ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
