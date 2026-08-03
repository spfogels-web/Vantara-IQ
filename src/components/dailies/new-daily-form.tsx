"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { relatedCodes } from "@/lib/unit-codes";
import { createDaily, type DailyLineInput } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";

import type { MaterialCodeOption } from "@/data/queries";

export type ProjectOption = {
  id: string;
  number: string;
  name: string;
  client: string;
  location: string;
  /** Approved material codes for this project, with what the plan has left. */
  codes: MaterialCodeOption[];
};

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

const emptyLine = (): DailyLineInput => ({ location: "", code: "", quantity: 0, unit: "ft" });

export function NewDailyForm({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [subcontractor, setSubcontractor] = React.useState("");
  const [crew, setCrew] = React.useState("");
  const [workDate, setWorkDate] = React.useState("");
  const [lines, setLines] = React.useState<DailyLineInput[]>([emptyLine()]);
  const [photos, setPhotos] = React.useState("");
  const [hasAsBuilt, setHasAsBuilt] = React.useState(false);
  const [hasBoreLog, setHasBoreLog] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const totalFt = lines.filter((l) => l.unit === "ft").reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  const allCodes = React.useMemo(() => project?.codes ?? [], [project]);
  const [showAerial, setShowAerial] = React.useState(false);
  const aerialCount = allCodes.filter((c) => c.aerial).length;
  // Aerial units are hidden, not removed — a crew that genuinely hits one can
  // still bill it, it just isn't cluttering an underground job's picker.
  const codes = React.useMemo(
    () => (showAerial ? allCodes : allCodes.filter((c) => !c.aerial)),
    [allCodes, showAerial],
  );
  const codeListId = React.useId();

  /** Codes are matched case- and space-insensitively — BFO48 vs bfo48 vs "BFO48 ". */
  const codeFor = React.useCallback(
    (raw: string) => {
      const key = raw.trim().toUpperCase().replace(/\s+/g, "");
      return codes.find((c) => c.code.trim().toUpperCase().replace(/\s+/g, "") === key);
    },
    [codes],
  );

  function setLine(i: number, patch: Partial<DailyLineInput>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  /** Picking a known code carries its unit across, so the two can't disagree. */
  function pickCode(i: number, raw: string) {
    const match = codeFor(raw);
    setLine(i, {
      code: raw,
      ...(match && (match.unit === "ft" || match.unit === "ea") ? { unit: match.unit } : {}),
    });
  }

  const valid = projectId && workDate && crew.trim() && lines.some((l) => l.code.trim() && l.quantity > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await createDaily({
      projectId,
      subcontractor,
      crew,
      workDate,
      lineItems: lines
        .filter((l) => l.code.trim() && l.quantity > 0)
        .map((l) => ({ ...l, quantity: Number(l.quantity) || 0 })),
      photos: Number(photos) || 0,
      hasAsBuilt,
      hasBoreLog,
    });
    setBusy(false);
    if (res.ok) router.push("/dailies");
    else setError(res.error ?? "Could not create daily");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <Link href="/dailies" className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All dailies
        </Link>
      </div>

      {/* Project + header */}
      <Panel>
        <PanelHeader title="Daily details" description="Every daily is tied to a project number and name." />
        <PanelBody className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">
              Project<span className="ml-0.5 text-critical">*</span>
            </span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={cn(inputClass, "appearance-none")}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} — {p.name} ({p.client})
                </option>
              ))}
            </select>
            {project ? (
              <span className="num text-[11px] text-muted-foreground">
                {project.number} · {project.client} · {project.location}
              </span>
            ) : null}
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">Work date<span className="ml-0.5 text-critical">*</span></span>
              <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">Crew / foreman<span className="ml-0.5 text-critical">*</span></span>
              <input value={crew} onChange={(e) => setCrew(e.target.value)} placeholder="Crew 4 · T. Whitfield" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">Subcontractor</span>
              <input value={subcontractor} onChange={(e) => setSubcontractor(e.target.value)} placeholder="ABC Utilities" className={inputClass} />
            </label>
          </div>
        </PanelBody>
      </Panel>

      {/* The project's approved codes back every code input below. Remaining
          quantity is shown in the option label, so the picker itself tells you
          how much of that unit the plan still has. */}
      <datalist id={codeListId}>
        {codes.map((c) => (
          <option key={c.code} value={c.code}>
            {c.remaining.toLocaleString()} {c.unit} left · {c.description}
          </option>
        ))}
      </datalist>

      {/* Line items */}
      <Panel>
        <PanelHeader
          title="Production line items"
          description={
            codes.length
              ? `${codes.length} underground codes on this job — pick one and its unit and remaining quantity come with it.`
              : "Location, unit code and quantity — like the paper daily."
          }
          count={lines.length}
        >
          {aerialCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAerial((v) => !v)}
              className="focus-ring rounded-md px-2 py-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              {showAerial ? "Hide" : "Show"} {aerialCount} aerial
            </button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => setLines((ls) => [...ls, emptyLine()])}
            className="h-8 gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
          >
            <Plus className="size-3.5" /> Row
          </Button>
        </PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:px-5">Location</th>
                <th className="px-3 py-2 font-medium">Unit code</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2 sm:px-5">
                    <input value={l.location} onChange={(e) => setLine(i, { location: e.target.value })} placeholder="PED 1 / STA 12+00" className={inputClass} />
                  </td>
                  <td className="px-3 py-2">
                    {/* A list-backed input, not a select: crews can still type a
                        code that isn't on the material list, but the ones that
                        are come with their unit and remaining quantity. */}
                    <input
                      list={codeListId}
                      value={l.code}
                      onChange={(e) => pickCode(i, e.target.value)}
                      placeholder={codes.length ? "Pick or type" : "BDD"}
                      className={cn(inputClass, "num uppercase")}
                    />
                    {(() => {
                      const match = codeFor(l.code);
                      if (!match) {
                        if (!l.code.trim() || !codes.length) return null;
                        // Sheets carry variants a crew won't type from memory —
                        // BM61 on the daily vs BM61(2)F on the list. Offer the
                        // real code rather than substituting one silently.
                        const near = relatedCodes(l.code, codes.map((c) => c.code)).slice(0, 3);
                        return (
                          <span className="mt-1 block text-[10.5px] text-warning">
                            {near.length ? (
                              <>
                                Did you mean{" "}
                                {near.map((c, n) => (
                                  <React.Fragment key={c}>
                                    {n > 0 ? " · " : ""}
                                    <button
                                      type="button"
                                      onClick={() => pickCode(i, c)}
                                      className="num font-semibold underline hover:text-foreground"
                                    >
                                      {c}
                                    </button>
                                  </React.Fragment>
                                ))}
                                ?
                              </>
                            ) : (
                              "Not on the material list"
                            )}
                          </span>
                        );
                      }
                      const left = match.remaining - (Number(l.quantity) || 0);
                      return (
                        <span
                          className={cn(
                            "num mt-1 block text-[10.5px]",
                            left < 0 ? "text-critical" : "text-muted-foreground",
                          )}
                        >
                          {left < 0
                            ? `${Math.abs(left).toLocaleString()} ${match.unit} over plan`
                            : `${left.toLocaleString()} ${match.unit} left`}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} value={l.quantity || ""} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} placeholder="0" className={cn(inputClass, "num w-24")} />
                  </td>
                  <td className="px-3 py-2">
                    <select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value as "ft" | "ea" })} className={cn(inputClass, "w-20 appearance-none")}>
                      <option value="ft">ft</option>
                      <option value="ea">ea</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}
                      className="focus-ring grid size-7 place-items-center rounded text-muted-foreground hover:text-critical"
                      title="Remove row"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70">
                <td className="px-4 py-2.5 text-[12px] font-medium text-muted-foreground sm:px-5" colSpan={2}>Total footage</td>
                <td className="num px-3 py-2.5 text-[13px] font-semibold text-foreground" colSpan={3}>{totalFt.toLocaleString()} ft</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* Backup */}
      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-[12.5px] text-foreground">
            <span className="text-muted-foreground">Photos</span>
            <input type="number" min={0} value={photos} onChange={(e) => setPhotos(e.target.value)} placeholder="0" className={cn(inputClass, "num w-20")} />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
            <input type="checkbox" checked={hasAsBuilt} onChange={(e) => setHasAsBuilt(e.target.checked)} className="size-4 accent-[var(--vq-blue)]" />
            As-built attached
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
            <input type="checkbox" checked={hasBoreLog} onChange={(e) => setHasBoreLog(e.target.checked)} className="size-4 accent-[var(--vq-blue)]" />
            Bore log attached
          </label>
        </PanelBody>
      </Panel>

      {error ? <p className="text-[12.5px] text-critical">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Link href="/dailies" className="focus-ring rounded-lg px-3 py-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
        <Button type="submit" disabled={!valid || busy} className="brand-gradient h-10 gap-1.5 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-40">
          {busy ? <><Loader2 className="size-4 animate-spin" /> Submitting…</> : "Submit daily"}
        </Button>
      </div>
    </form>
  );
}
