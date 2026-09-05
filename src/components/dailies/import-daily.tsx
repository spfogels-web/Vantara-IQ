"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileUp,
  Loader2,
  UploadCloud,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { importDailyFromFile } from "@/app/actions";
import { useT } from "@/components/layout/language-provider";

/**
 * Drop in the daily a crew emailed over and let the system read it.
 *
 * What comes back is a draft, never a filed day. The reader is transcribing
 * handwriting off a photo taken in a truck, so the result is shown here before
 * anything else happens: which columns matched the rate card, which did not,
 * and whether the rows add up to the TOTALS the crew wrote. Then you open it
 * and check it against the paper.
 *
 * The footing check is the part worth trusting. The printed totals are an
 * independent statement of the same numbers, so a column that foots was almost
 * certainly read correctly, and one that does not is shown with both figures
 * rather than quietly reconciled.
 */

type Result = Awaited<ReturnType<typeof importDailyFromFile>>;

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export function ImportDaily({
  projects,
  crews,
  startOpen = true,
}: {
  projects: { id: string; name: string; number: string }[];
  /** Staff may file a read sheet on a crew's behalf, same as typing one. */
  crews: { id: string; company: string }[];
  /**
   * Whether the importer starts open.
   *
   * Closed when there is a queue waiting. This box is the second job on the
   * screen — reading somebody's emailed sheet — and it was taking the top of
   * the page every time, above thirty-one days needing a decision. The work in
   * front of you should be what you see first.
   */
  startOpen?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = React.useState(startOpen);
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [filedForId, setFiledForId] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [dragging, setDragging] = React.useState(false);

  async function read(file: File) {
    if (!projectId) {
      setResult({ ok: false, error: "Pick the job this sheet belongs to first." });
      return;
    }
    setResult(null);
    try {
      setBusy("Uploading…");
      const blob = await blobUpload(
        `dailies/imported/${Date.now()}-${file.name}`,
        file,
        { access: "public", handleUploadUrl: "/api/blob/upload" },
      );

      setBusy("Reading the sheet…");
      const res = await importDailyFromFile({
        fileUrl: blob.url,
        mediaType: file.type || "application/pdf",
        projectId,
        filedForId: filedForId || null,
      });
      setResult(res);
      if (res.ok) router.refresh();
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "That file couldn't be read.",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-border bg-background px-4 py-2.5 text-left transition-colors hover:border-brand/50"
      >
        <UploadCloud className="size-4 shrink-0 text-brand-bright" />
        <span className="text-[12.5px] font-medium text-foreground">
          {t("Read a daily from a PDF or photo")}
        </span>
        <span className="hidden text-[11.5px] text-muted-foreground sm:block">
          {t("It comes back as a draft for you to check")}
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("Job")}
          </span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 rounded-lg border border-border bg-transparent px-2.5 text-[13px] text-foreground outline-none focus:border-brand"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number ? `${p.number} · ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </label>

        {crews.length > 0 ? (
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {t("Filing this for")}
            </span>
            <select
              value={filedForId}
              onChange={(e) => setFiledForId(e.target.value)}
              className="h-9 rounded-lg border border-border bg-transparent px-2.5 text-[13px] text-foreground outline-none focus:border-brand"
            >
              <option value="">Fortitude — self-perform</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {/* The drop target. Also a plain file input, because a phone has no
          drag and this gets used from a truck as often as from a desk. */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) void read(f);
        }}
        className={cn(
          "mt-3 flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition",
          dragging ? "border-brand bg-brand/[0.06]" : "border-border hover:border-brand/60",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <input
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={!!busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f);
            e.target.value = "";
          }}
        />
        {busy ? (
          <>
            <Loader2 className="size-5 animate-spin text-brand" />
            <span className="text-[13px] font-medium text-foreground">{busy}</span>
          </>
        ) : (
          <>
            <FileUp className="size-5 text-muted-foreground" />
            <span className="text-[13px] font-medium text-foreground">
              {t("Drop a daily here, or tap to choose")}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {t("PDF or photo of the billing sheet. It comes back as a draft for you to check.")}
            </span>
          </>
        )}
      </label>

      {result && !result.ok ? (
        <p className="mt-3 rounded-xl border border-critical/40 bg-critical/[0.07] px-3 py-2 text-[12.5px] text-foreground">
          {result.error}
        </p>
      ) : null}

      {result?.ok ? <ReadReport result={result} projectId={projectId} /> : null}
    </div>
  );
}

/** What the reader made of the sheet, before anyone acts on it. */
function ReadReport({
  result,
  projectId,
}: {
  result: Extract<Result, { ok: true }>;
  projectId: string;
}) {
  const clean = result.footing.length === 0 && result.unresolved.length === 0;

  return (
    <div className="mt-3 rounded-xl border border-border bg-foreground/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {clean ? (
          <Check className="size-4 text-success" />
        ) : (
          <AlertTriangle className="size-4 text-warning" />
        )}
        <p className="text-[13px] font-semibold text-foreground">
          Read {result.columns.length} code column
          {result.columns.length === 1 ? "" : "s"} and {result.rowCount} row
          {result.rowCount === 1 ? "" : "s"}
        </p>
        <Link
          href={`/dailies/sheet/${projectId}?sheet=${result.id}`}
          className="ml-auto text-[12.5px] font-semibold text-brand-bright underline"
        >
          Open the draft
        </Link>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {result.columns.map((c) => (
          <span
            key={c.asWritten}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[11.5px]",
              c.resolved
                ? "border-border bg-background text-foreground"
                : "border-warning/50 bg-warning/[0.08] text-foreground",
            )}
            title={c.resolved ? `matched to ${c.resolved}` : "not on this customer's card"}
          >
            {c.asWritten}
            {c.resolved ? ` → ${c.resolved}` : " → unmatched"}
            {c.printedTotal != null ? ` · ${c.printedTotal.toLocaleString()}` : ""}
          </span>
        ))}
      </div>

      {result.footing.length ? (
        <div className="mt-2.5 rounded-lg border border-critical/40 bg-critical/[0.06] px-2.5 py-2">
          <p className="text-[12px] font-semibold text-foreground">
            {result.footing.length} column
            {result.footing.length === 1 ? " does" : "s do"} not add up to the printed total
          </p>
          {result.footing.map((f) => (
            <p key={f.asWritten} className="mt-0.5 text-[11.5px] text-muted-foreground">
              {f.asWritten}: rows come to {f.rowSum.toLocaleString()}, the sheet says{" "}
              {f.printedTotal.toLocaleString()} ({f.difference > 0 ? "+" : ""}
              {f.difference.toLocaleString()})
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11.5px] text-success">
          Every column adds up to the totals written on the sheet.
        </p>
      )}

      {result.problems.length ? (
        <ul className="mt-2 space-y-0.5">
          {result.problems.map((p, i) => (
            <li key={i} className="text-[11.5px] text-muted-foreground">
              · {p}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        Nothing has been filed. Open the draft, check it against the paper, and submit it there.
      </p>
    </div>
  );
}
