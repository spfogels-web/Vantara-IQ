"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  AlertTriangle,
  ArrowDownToLine,
  Camera,
  CheckCheck,
  FileUp,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { toneStyles } from "@/lib/tone";
import { Meter } from "@/components/common/metric";
import {
  approveAndTrackImport,
  deleteProjectMaterial,
  deleteProjectMaterialImport,
  extractProjectMaterials,
  extractProjectMaterialsFromUrl,
  pushMaterialsToProject,
  updateProjectMaterial,
} from "@/app/actions";
import { groupMaterialTotals } from "@/lib/unit-codes";
import type { ProjectMaterialImport, TrackedMaterial } from "@/data/queries";

/**
 * Upload or photograph a material list and let Claude pull the codes off it.
 * Extraction is never trusted on its own — every row lands PENDING with a
 * confidence score, and approval happens on the review screen.
 */

/**
 * Under this we post the file straight through the Server Action (simplest
 * path). Over it, the browser uploads to Blob first — that has no body limit,
 * so a fat multi-page material PDF still goes through.
 */
const DIRECT_POST_LIMIT = 4 * 1024 * 1024;

const ACCEPT = ".pdf,.xlsx,.xls,.csv,.txt,image/png,image/jpeg,image/webp,image/gif";

function confidenceTone(c: number) {
  if (c >= 0.85) return "text-success";
  if (c >= 0.7) return "text-warning";
  return "text-critical";
}

export function ProjectMaterials({
  projectId,
  imports,
  tracked,
}: {
  projectId: string;
  imports: ProjectMaterialImport[];
  tracked: TrackedMaterial[];
}) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  async function upload(file: File | undefined | null) {
    if (!file || busy) return;
    setError(null);
    setNote(null);
    setBusy(true);

    let res: Awaited<ReturnType<typeof extractProjectMaterials>>;
    try {
      if (file.size > DIRECT_POST_LIMIT) {
        // Big file: straight to Blob, then hand the server the URL.
        const blob = await blobUpload(`material-lists/${projectId}/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        });
        res = await extractProjectMaterialsFromUrl({
          projectId,
          url: blob.url,
          fileName: file.name,
        });
      } else {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("projectId", projectId);
        res = await extractProjectMaterials(fd);
      }
    } catch {
      setBusy(false);
      setError(
        "Upload failed. Files over 4MB need Blob storage enabled — or photograph the pages one at a time.",
      );
      return;
    }

    setBusy(false);
    if (res.ok) {
      if (res.count === 0) {
        setNote("Read the document but found no material lines on it.");
      } else if (res.tracked > 0) {
        // A job profile recognised the paperwork and did the approving.
        setNote(
          `${res.profile}: pulled ${res.count} lines and started tracking ${res.tracked} codes automatically` +
            (res.pending > 0 ? ` — ${res.pending} left for review.` : "."),
        );
      } else {
        setNote(
          `Pulled ${res.count} material ${res.count === 1 ? "line" : "lines"} — review and approve to start tracking.`,
        );
      }
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function remove(importId: string) {
    if (busy) return;
    setBusy(true);
    await deleteProjectMaterialImport(importId, projectId);
    setBusy(false);
    router.refresh();
  }

  async function approveAll(importId: string) {
    if (busy) return;
    setError(null);
    setNote(null);
    setBusy(true);
    const res = await approveAndTrackImport(importId, projectId);
    setBusy(false);
    if (res.ok) {
      setNote(
        `Tracking ${res.count} ${res.count === 1 ? "code" : "codes"}` +
          (res.skipped ? ` — ${res.skipped} left pending for review.` : ". They're now pickable on dailies."),
      );
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function track(importId: string) {
    if (busy) return;
    setError(null);
    setNote(null);
    setBusy(true);
    const res = await pushMaterialsToProject(importId, projectId);
    setBusy(false);
    if (res.ok) {
      setNote(`Now tracking ${res.count} ${res.count === 1 ? "material" : "materials"}.`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function setLabel(id: string, next: string, current: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === current) return;
    await updateProjectMaterial(id, { item: trimmed });
    router.refresh();
  }

  /** The plan can be corrected or revised; billed quantities come from dailies. */
  async function setPlanned(id: string, raw: string, current: number) {
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0 || next === current) return;
    await updateProjectMaterial(id, { planned: next });
    router.refresh();
  }

  async function removeTracked(id: string) {
    if (busy) return;
    setBusy(true);
    await deleteProjectMaterial(id);
    setBusy(false);
    router.refresh();
  }

  const groups = React.useMemo(() => groupMaterialTotals(tracked), [tracked]);
  const totalRows = imports.reduce((n, i) => n + i.rows.length, 0);

  return (
    <div className="flex flex-col">
      {/* Hidden inputs — one for the file picker, one that opens the camera */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Roll-ups for units a crew treats as one thing. The codes underneath
          stay distinct — this is the number, not a merge. */}
      {groups.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-b border-border/70 px-4 py-2.5">
          {groups.map((g) => (
            <div key={g.label} className="min-w-[128px] flex-1 rounded-lg bg-foreground/[0.04] px-2.5 py-1.5">
              <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </p>
              <p className="num text-[14px] font-semibold text-foreground">
                {formatNumber(g.remaining)} {g.unit}{" "}
                <span className="text-[11px] font-normal text-muted-foreground">left</span>
              </p>
              <p className="num text-[10.5px] text-muted-foreground">
                {formatNumber(g.completed)} of {formatNumber(g.planned)} · {g.codes} codes
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* What we're actually tracking — approved rows that crossed the line. */}
      {tracked.length > 0 ? (
        // Two or three across on a wide screen: a job's code list is long, and
        // a single column turns it into a scroll.
        <ul className="grid grid-cols-1 gap-x-2 border-b border-border/70 p-2 lg:grid-cols-2 2xl:grid-cols-3">
          {tracked.map((m) => (
            <li key={m.id} className="group/mat rounded-lg px-2.5 py-2 hover:bg-foreground/[0.03]">
              <div className="flex items-baseline gap-2">
                {m.code ? (
                  <span className="num shrink-0 text-[11.5px] font-semibold uppercase text-brand-bright">
                    {m.code}
                  </span>
                ) : null}
                {/* Editable: customers print descriptions that are wrong for
                    the unit (the RI codes say "micro ribbon fiber" when
                    they're microfiber). The code bills; the label should read
                    however the crew knows it. */}
                <input
                  defaultValue={m.item}
                  onBlur={(e) => void setLabel(m.id, e.target.value, m.item)}
                  title="Rename this material"
                  className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 text-[12.5px] text-foreground outline-none hover:border-border focus:border-brand/50 focus:bg-foreground/[0.03]"
                />
                <span className={cn("num shrink-0 text-[11.5px] font-medium", toneStyles[m.tone].text)}>
                  {formatNumber(m.remaining)} {m.unit} left
                </span>
                <button
                  type="button"
                  onClick={() => void removeTracked(m.id)}
                  disabled={busy}
                  title="Stop tracking this material"
                  className="focus-ring grid size-5 shrink-0 place-items-center rounded text-muted-foreground/0 transition group-hover/mat:text-muted-foreground hover:!text-critical"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <Meter
                value={m.planned > 0 ? Math.min(1, m.completed / m.planned) : 0}
                tone={m.tone}
                className="mt-1.5 h-1"
              />
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground">
                {/* Plan is editable — the list can be wrong or revised. Billed
                    is never typed in: it's the sum of the dailies. */}
                <label className="flex items-center gap-1">
                  Plan
                  <input
                    type="number"
                    min={0}
                    defaultValue={m.planned || ""}
                    onBlur={(e) => void setPlanned(m.id, e.target.value, m.planned)}
                    className="num w-16 rounded border border-border bg-transparent px-1 py-0.5 text-right text-foreground outline-none focus:ring-1 focus:ring-brand/50"
                  />
                </label>
                <span className="num">
                  billed {formatNumber(m.completed)}
                  {m.dailyCount > 0 ? ` · ${m.dailyCount} ${m.dailyCount === 1 ? "daily" : "dailies"}` : ""}
                </span>
                {m.overPlan ? (
                  m.coveredByGroup ? (
                    // One size ran out and the crew billed the interchangeable
                    // code — the group still has plan left, so this isn't an
                    // overrun worth flagging red.
                    <span className="text-info">drawing from {m.group}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-critical">
                      <AlertTriangle className="size-3" /> over plan
                    </span>
                  )
                ) : null}
                {m.planned > 0 && m.completed === 0 && m.group ? (
                  <span className="text-muted-foreground/70">untouched</span>
                ) : null}
                {m.reelNumber ? <span className="num truncate">Reel {m.reelNumber}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {busy ? "Reading…" : "Upload list"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"
          >
            <Camera className="size-3.5" /> Scan
          </button>
        </div>
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="size-3 shrink-0" />
          PDF, Excel, CSV or a photo — every code, quantity and reel number.
        </p>
        {error ? <p className="w-full text-[11.5px] text-critical">{error}</p> : null}
        {note ? <p className="w-full text-[11.5px] text-success">{note}</p> : null}
      </div>

      {imports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <FileUp className="size-5 text-muted-foreground" />
          <p className="text-[12.5px] text-muted-foreground">
            No material list on this project yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {imports.map((imp) => (
            <div key={imp.id} className="border-b border-border/50 last:border-0">
              <div className="flex items-start gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-foreground">{imp.fileName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {imp.status === "FAILED"
                      ? imp.error || "Extraction failed"
                      : imp.summary || `${imp.rows.length} lines`}
                  </p>
                </div>
                <Link
                  href={`/rate-import/${imp.id}`}
                  className="focus-ring shrink-0 rounded text-[11px] font-medium text-brand-bright hover:underline"
                >
                  Review
                </Link>
                {imp.rows.some((r) => r.status === "APPROVED") ? (
                  <button
                    type="button"
                    onClick={() => void track(imp.id)}
                    disabled={busy}
                    title="Add the approved rows to this project's tracked material"
                    className="focus-ring inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[10.5px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
                  >
                    <ArrowDownToLine className="size-3" /> Track
                  </button>
                ) : imp.rows.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void approveAll(imp.id)}
                    disabled={busy}
                    title="Approve every row above 70% confidence and start tracking them"
                    className="focus-ring inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-brand px-1.5 text-[10.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
                  >
                    <CheckCheck className="size-3" /> Approve all
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void remove(imp.id)}
                  disabled={busy}
                  title="Remove this import"
                  className="focus-ring grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-critical disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {imp.rows.length > 0 ? (
                <ul className="px-2 pb-2">
                  {imp.rows.map((r) => (
                    <li key={r.id} className="rounded-lg px-2.5 py-2 hover:bg-foreground/[0.03]">
                      <div className="flex items-baseline gap-2">
                        <span className="num shrink-0 text-[12px] font-semibold uppercase text-foreground">
                          {r.code || "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                          {r.description}
                        </span>
                        {r.quantity != null ? (
                          <span className="num shrink-0 text-[11.5px] font-medium text-foreground">
                            {formatNumber(r.quantity)}
                            {r.unit ? ` ${r.unit}` : ""}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                        <span className={cn("num font-medium", confidenceTone(r.confidence))}>
                          {Math.round(r.confidence * 100)}%
                        </span>
                        {r.reelNumber ? <span className="num truncate">Reel {r.reelNumber}</span> : null}
                        {r.size ? <span className="truncate">{r.size}</span> : null}
                        {r.furnished ? <span className="truncate capitalize">{r.furnished}-furnished</span> : null}
                        {r.status !== "PENDING" ? (
                          <span className={r.status === "APPROVED" ? "text-success" : "text-critical"}>
                            {r.status.toLowerCase()}
                          </span>
                        ) : null}
                        {r.warning ? (
                          <span
                            title={r.warning}
                            className="inline-flex min-w-0 items-center gap-1 truncate text-warning"
                          >
                            <AlertTriangle className="size-3 shrink-0" />
                            {r.warning}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}

          {totalRows > 0 ? (
            <p className="px-4 py-2 text-[11px] text-muted-foreground">
              {totalRows} extracted {totalRows === 1 ? "line" : "lines"} — approve them on the
              review screen before they count as tracked material.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
