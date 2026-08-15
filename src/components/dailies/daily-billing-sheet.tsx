"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Map as MapIcon,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  saveDailySheet,
  submitDailySheet,
  updateDailyPhotos,
  type SheetPayload,
} from "@/app/actions";
import { SheetPhotos, parsePhotos, type SheetPhoto } from "@/components/dailies/sheet-photos";
import { isPdfUrl } from "@/components/projects/project-detail-client";
import {
  MapMarkupEditor,
  MapRedlinePreview,
  parseShapes,
  type Shape,
} from "@/components/projects/map-markup";

/**
 * Digital replica of the Globe Communications, LLC "Subcontractor Daily Billing
 * Sheet" (form GLS-203155). Same field order and grid shape as the carbon-copy
 * paper form so a foreman filling this out is looking at what they already know,
 * but every cell is typed, the totals add themselves and it prints to letter.
 */

const UNIT_COLS = 10; // "HOURLY / UNIT CODE" columns across the production grid
const MAT_COLS = 7; // "MAT / UNIT CODE" columns in the material-only section
const LABOR_ROWS = 16;
const MAT_ROWS = 10;
const CREW_SLOTS = 5;

type LaborRow = { print: string; location: string; cells: string[]; remarks: string };
type MatRow = {
  print: string;
  start: string;
  stop: string;
  mat: boolean;
  cells: string[];
  reel: string;
  cableStart: string;
  cableStop: string;
};

type SheetHeader = {
  exchange: string;
  crewNumber: string;
  customer: string;
  dateWorked: string;
  projectNumber: string;
  jobName: string;
  employees: string[];
  complete: "" | "yes" | "no";
  supervisorSignature: string;
  supervisorDate: string;
  subcontractorSignature: string;
  subcontractorDate: string;
  sheet: string;
  sheetOf: string;
};

const blankLaborRow = (): LaborRow => ({
  print: "",
  location: "",
  cells: Array(UNIT_COLS).fill(""),
  remarks: "",
});

const blankMatRow = (): MatRow => ({
  print: "",
  start: "",
  stop: "",
  mat: false,
  cells: Array(MAT_COLS).fill(""),
  reel: "",
  cableStart: "",
  cableStop: "",
});

/** The slice of a project the sheet needs: its numbers and its map. */
export type SheetProject = {
  id: string;
  number: string;
  name: string;
  client: string;
  location: string;
  crew: string;
  mapUrl?: string | null;
  markups?: unknown;
};

/**
 * Fortitude's crew number with Globe. It is the same on every sheet, so it is
 * prefilled rather than retyped — and the field stays editable for the day a
 * second crew number exists.
 *
 * This used to be filled with the project's crew *name* ("Garcia"), which is a
 * different thing entirely and meant every sheet went out with the wrong value
 * in a field Globe bills against.
 */
export const CREW_NUMBER = "24208171927-A27-311";

/**
 * The subcontractor Globe is billed under. It goes in the first employee slot
 * on every sheet, so it is prefilled alongside the crew number. The remaining
 * slots stay blank for the individual crew members who worked that day.
 */
export const SUBCONTRACTOR_NAME = "Fortitude Infrastructure LLC";

/**
 * A fresh sheet. Picking a job off the list means the identity fields arrive
 * already filled — the crew only ever writes down production. Every one of
 * them stays editable, because the paper form gets corrected in the field too.
 */
const blankHeader = (project?: SheetProject): SheetHeader => ({
  exchange: project?.number ?? "",
  crewNumber: CREW_NUMBER,
  customer: project?.client ?? "",
  dateWorked: "",
  projectNumber: project?.number ?? "",
  jobName: project?.name ?? "",
  employees: [
    SUBCONTRACTOR_NAME,
    ...Array(CREW_SLOTS - 1).fill(""),
  ],
  complete: "",
  supervisorSignature: "",
  supervisorDate: "",
  subcontractorSignature: "",
  subcontractorDate: "",
  sheet: "",
  sheetOf: "",
});

const sum = (values: string[]) =>
  values.reduce((total, v) => total + (Number.parseFloat(v) || 0), 0);

const fmt = (n: number) => (n === 0 ? "" : Number(n.toFixed(2)).toLocaleString());

/** Bare input that inherits the surrounding table cell's border — the paper look. */
function Cell({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        // Taller and bigger than the paper form's proportions on screen. This
        // is filled in on a tablet in the field, often with gloves on, and a
        // 7mm row is a mis-tap waiting to happen. Print keeps the compact size
        // so the sheet still fits a page.
        "num h-9 w-full bg-transparent px-1.5 text-center text-[13px] text-foreground outline-none",
        "focus:bg-brand/10 print:h-6 print:px-1 print:text-[9px]",
        className,
      )}
    />
  );
}

/**
 * A code on the customer's rate card, as offered in the picker.
 *
 * No rate. The picker exists to stop a code being spelled wrong, and a rate
 * here bought nothing: a <select> shows the chosen option's text in its
 * collapsed box, the browser prints that box, and the sheet goes to Globe. Not
 * sending the number at all beats hiding it.
 */
export type BillableCode = {
  code: string;
  description: string;
};

/**
 * The unit-code header cell: a dropdown of the customer's card, not a text box.
 *
 * It used to be typed. "Bfov 12.7(2w)" is what a foreman writes for
 * BFOV(12.7)(2W)12"DEPTH, and the two are not the same string — so the line
 * matched no rate, priced at zero, and the sheet still filed clean. One Charles
 * Hart day billed $395 against a card that said $4,192.30. A code that can only
 * be chosen cannot be spelled wrong.
 *
 * A sheet reopened from before the picker may hold a code the card has never
 * had. That value is kept as its own option rather than snapping to blank —
 * losing what the crew wrote down is worse than showing something unpayable,
 * and the banner above the sheet names it either way.
 */
function CodeSelect({
  value,
  onChange,
  codes,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  codes: BillableCode[];
  label: string;
}) {
  const onCard = React.useMemo(
    () => codes.some((c) => c.code.toUpperCase() === value.trim().toUpperCase()),
    [codes, value],
  );


  // No card loaded (a blank sheet with no project) — fall back to typing rather
  // than offering an empty dropdown with no way out.
  if (codes.length === 0) {
    return (
      <Cell
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-8 px-0.5 text-[12px] font-semibold uppercase text-foreground print:h-5"
      />
    );
  }

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        // Looks like the cell next to it, not like a form control: no chrome,
        // no arrow, inherits the table border. Tall enough to hit with gloves.
        "mt-0.5 h-8 w-full cursor-pointer appearance-none bg-transparent px-0.5 text-center",
        "text-[12px] font-semibold uppercase outline-none focus:bg-brand/10",
        "print:h-5 print:text-[9px]",
        value && !onCard ? "text-warning" : "text-foreground",
      )}
    >
      <option value="">—</option>
      {value && !onCard ? <option value={value}>{value} (not on card)</option> : null}
      {/* The code and nothing else. The rate used to ride along as a find-me
          aid, which a <select> then showed in the collapsed box — and that box
          is what the browser prints. Our rate was landing on the sheet that
          goes to Globe. */}
      {codes.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code}
        </option>
      ))}
    </select>
  );
}

/** A labelled box from the header block: micro caps label above a write-in line. */
function Field({
  label,
  value,
  onChange,
  type = "text",
  className,
  inputClassName,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col border-r border-b border-border last:border-r-0", className)}>
      <span className="truncate px-1.5 pt-1 text-[8px] font-semibold uppercase leading-tight tracking-[0.06em] text-muted-foreground print:text-[6.5px]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-7 w-full bg-transparent px-1.5 pb-1 text-[12.5px] text-foreground outline-none",
          "focus:bg-brand/10 print:h-6 print:text-[10px]",
          inputClassName,
        )}
      />
    </label>
  );
}

/** A sheet as loaded back from the database. Shapes are the ones we saved. */
export type SavedSheet = {
  id: string;
  header: unknown;
  laborCodes: unknown;
  laborRows: unknown;
  matCodes: unknown;
  matRows: unknown;
  redlines: unknown;
  status: string;
  notes?: string;
  photos?: unknown;
};

/** Saved JSON is untyped by the time it comes back — coerce, never trust. */
function asStrings(v: unknown, length: number): string[] {
  const arr = Array.isArray(v) ? v : [];
  return Array.from({ length: Math.max(length, arr.length) }, (_, i) =>
    typeof arr[i] === "string" ? (arr[i] as string) : "",
  );
}

function asLaborRows(v: unknown, cols: number): LaborRow[] {
  const arr = Array.isArray(v) ? v : [];
  const rows = arr.map((raw) => {
    const r = (raw ?? {}) as Partial<LaborRow>;
    return {
      print: typeof r.print === "string" ? r.print : "",
      location: typeof r.location === "string" ? r.location : "",
      cells: asStrings(r.cells, cols),
      remarks: typeof r.remarks === "string" ? r.remarks : "",
    };
  });
  // Always leave blank rows to keep writing on.
  while (rows.length < LABOR_ROWS) rows.push(blankLaborRow());
  return rows;
}

function asMatRows(v: unknown, cols: number): MatRow[] {
  const arr = Array.isArray(v) ? v : [];
  const rows = arr.map((raw) => {
    const r = (raw ?? {}) as Partial<MatRow>;
    return {
      print: typeof r.print === "string" ? r.print : "",
      start: typeof r.start === "string" ? r.start : "",
      stop: typeof r.stop === "string" ? r.stop : "",
      mat: Boolean(r.mat),
      cells: asStrings(r.cells, cols),
      reel: typeof r.reel === "string" ? r.reel : "",
      cableStart: typeof r.cableStart === "string" ? r.cableStart : "",
      cableStop: typeof r.cableStop === "string" ? r.cableStop : "",
    };
  });
  while (rows.length < MAT_ROWS) rows.push(blankMatRow());
  return rows;
}

export function DailyBillingSheet({
  project,
  initialSheetId,
  saved,
  canReview = false,
  crews,
  initialFiledForId,
  billableCodes = [],
}: {
  project?: SheetProject;
  /** Set when reopening a saved draft, so saves update rather than duplicate. */
  initialSheetId?: string;
  /** A previously saved sheet to reopen — header, both grids and the redline. */
  saved?: SavedSheet | null;
  /** Staff reviewing a filed sheet are not bound by the submit lock. */
  canReview?: boolean;
  /** Crews on this job. Staff only — the office types a sheet up for one of
   *  them while they are still learning the system. */
  crews?: { id: string; company: string }[];
  initialFiledForId?: string | null;
  /**
   * The codes on this customer’s card. Offered as you type so what goes in
   * the box is a code that exists — a hand-typed near-miss prices at nothing,
   * and a day that bored 210 ft billed $395 because of exactly that.
   */
  billableCodes?: BillableCode[];
}) {
  const [filedForId, setFiledForId] = React.useState(initialFiledForId ?? "");
  const [header, setHeader] = React.useState<SheetHeader>(() =>
    saved?.header
      ? { ...blankHeader(project), ...(saved.header as Partial<SheetHeader>) }
      : blankHeader(project),
  );
  const [labor, setLabor] = React.useState<LaborRow[]>(() =>
    saved ? asLaborRows(saved.laborRows, UNIT_COLS) : Array.from({ length: LABOR_ROWS }, blankLaborRow),
  );
  const [laborCodes, setLaborCodes] = React.useState<string[]>(() =>
    saved ? asStrings(saved.laborCodes, UNIT_COLS) : Array(UNIT_COLS).fill(""),
  );
  const [mat, setMat] = React.useState<MatRow[]>(() =>
    saved ? asMatRows(saved.matRows, MAT_COLS) : Array.from({ length: MAT_ROWS }, blankMatRow),
  );
  const [matCodes, setMatCodes] = React.useState<string[]>(() =>
    saved ? asStrings(saved.matCodes, MAT_COLS) : Array(MAT_COLS).fill(""),
  );

  /* The redline belongs to this daily, not to the project's master as-built —
     it starts from whatever is already drawn on the job and diverges from there. */
  // A reopened sheet keeps the redline the crew drew that day; a new one starts
  // from the project's as-built.
  const [redlines, setRedlines] = React.useState<Shape[]>(() =>
    saved ? parseShapes(saved.redlines) : parseShapes(project?.markups),
  );
  const [redlining, setRedlining] = React.useState(false);
  const mapUrl = project?.mapUrl ?? null;

  const router = useRouter();
  const [sheetId, setSheetId] = React.useState<string | undefined>(initialSheetId);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const [notes, setNotes] = React.useState<string>(
    typeof saved?.notes === "string" ? saved.notes : "",
  );
  const [photos, setPhotos] = React.useState<SheetPhoto[]>(() => parsePhotos(saved?.photos));

  /**
   * A submitted sheet is closed to the crew that filed it — that is the point
   * of submitting. Staff reviewing it are not editing their own work, so the
   * lock does not apply to them; they approve or deny it instead.
   */
  const locked = saved?.status === "SUBMITTED" && !canReview;

  /**
   * Photos added after filing, not yet written.
   *
   * Tracked separately from the sheet's own dirty state because everything else
   * is frozen — this is the only thing that can still change, and it needs its
   * own way to be saved.
   */
  const [savingPhotos, setSavingPhotos] = React.useState(false);
  const submittedPhotoCount = React.useRef<number | null>(null);
  if (locked && submittedPhotoCount.current === null) {
    submittedPhotoCount.current = photos.length;
  }
  const photosDirty =
    locked && submittedPhotoCount.current !== null && photos.length !== submittedPhotoCount.current;

  async function savePhotos() {
    if (!sheetId) return;
    setSavingPhotos(true);
    const res = await updateDailyPhotos(sheetId, photos);
    setSavingPhotos(false);
    if (res.ok) {
      submittedPhotoCount.current = photos.length;
      router.refresh();
    }
  }

  const payload = React.useCallback(
    (): SheetPayload => ({
      id: sheetId,
      projectId: project?.id ?? null,
      projectName: project?.name ?? header.jobName,
      workDate: header.dateWorked,
      crewNumber: header.crewNumber,
      filedForId: filedForId || null,
      header,
      laborCodes,
      laborRows: labor,
      matCodes,
      matRows: mat,
      redlines,
      notes,
      photos,
    }),
    // filedForId belongs here: without it an autosave keeps the crew that was
    // selected when this closure was made, and quietly files the day against
    // whoever was picked first.
    [sheetId, project, header, laborCodes, labor, matCodes, mat, redlines, notes, photos, filedForId],
  );

  async function save() {
    if (saving || submitting) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveDailySheet(payload());
      setSheetId(res.id);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    } catch {
      setSaveError("Couldn't save. Check your connection and try again.");
    }
    setSaving(false);
  }

  async function submit() {
    if (saving || submitting) return;
    setSubmitting(true);
    setSaveError(null);
    const res = await submitDailySheet(payload());
    setSubmitting(false);
    if (res.ok) {
      setSheetId(res.id);
      router.push("/dailies");
    } else {
      setSaveError(res.error);
    }
  }

  const set = <K extends keyof SheetHeader>(key: K, value: SheetHeader[K]) =>
    setHeader((h) => ({ ...h, [key]: value }));

  const setLaborCell = (row: number, col: number, value: string) =>
    setLabor((rows) =>
      rows.map((r, i) =>
        i === row ? { ...r, cells: r.cells.map((c, j) => (j === col ? value : c)) } : r,
      ),
    );

  const setMatCell = (row: number, col: number, value: string) =>
    setMat((rows) =>
      rows.map((r, i) =>
        i === row ? { ...r, cells: r.cells.map((c, j) => (j === col ? value : c)) } : r,
      ),
    );

  const laborTotals = React.useMemo(
    () => Array.from({ length: UNIT_COLS }, (_, col) => sum(labor.map((r) => r.cells[col]))),
    [labor],
  );
  const matTotals = React.useMemo(
    () => Array.from({ length: MAT_COLS }, (_, col) => sum(mat.map((r) => r.cells[col]))),
    [mat],
  );

  /**
   * Codes on this sheet the customer’s card has never heard of.
   *
   * A near-miss spelling — "Bfov 12.7(2w)" for BFOV(12.7)(2W)12"DEPTH — does not
   * error. It prices at zero and bills nothing, and the day looks filed. One
   * Charles Hart sheet went out at $395 that way when the card said $4,192. So
   * the mismatch is named on the sheet, while it can still be retyped.
   */
  const unknownCodes = React.useMemo(() => {
    if (billableCodes.length === 0) return [];
    const card = new Set(billableCodes.map((c) => c.code.toUpperCase().replace(/\s+/g, "")));
    const seen = new Map<string, string>();
    for (const raw of [...laborCodes, ...matCodes]) {
      const code = raw.trim();
      if (!code) continue;
      const key = code.toUpperCase().replace(/\s+/g, "");
      if (!card.has(key) && !seen.has(key)) seen.set(key, code);
    }
    return [...seen.values()];
  }, [billableCodes, laborCodes, matCodes]);

  function reset() {
    setHeader(blankHeader(project));
    setLabor(Array.from({ length: LABOR_ROWS }, blankLaborRow));
    setLaborCodes(Array(UNIT_COLS).fill(""));
    setMat(Array.from({ length: MAT_ROWS }, blankMatRow));
    setMatCodes(Array(MAT_COLS).fill(""));
    setRedlines(parseShapes(project?.markups));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Who this day belongs to.
          Screen only, staff only, and above the form rather than buried in it,
          because it decides whose pay statement the sheet becomes. Left unset,
          a sheet typed up in the office is self-perform — which is the right
          default and the wrong answer for a crew's work. */}
      {crews && crews.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-foreground/[0.02] px-3 py-2.5 print:hidden">
          <span className="text-[12px] font-medium text-foreground">Filing this for</span>
          <select
            value={filedForId}
            onChange={(e) => setFiledForId(e.target.value)}
            className="focus-ring h-8 rounded-lg border border-border bg-foreground/[0.03] px-2 text-[12px] text-foreground"
          >
            <option value="">Fortitude — self-perform</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground">
            {filedForId
              ? "Their work, their pay statement — priced at their rate card once approved."
              : "Nobody gets paid for this. Pick a crew if they did the work."}
          </span>
        </div>
      ) : null}

      {/* Toolbar — screen only */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={project ? "/dailies/sheet" : "/dailies"}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {project ? "Change job" : "All dailies"}
        </Link>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={reset}
            className="h-8 gap-1.5 rounded-lg border border-border bg-transparent px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> Clear sheet
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => window.print()}
            className="h-8 gap-1.5 rounded-lg border border-border bg-transparent px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            <Printer className="size-3.5" /> Print
          </Button>
          {/* Built server-side at a fixed landscape size, so unlike Print it
              cannot be cropped by whatever the dialog was left on. This is the
              one to attach to an email or a text.

              Needs a saved sheet — the PDF is rendered from the database, not
              from what is currently on screen, so an unsaved draft has nothing
              to render. Save first rather than silently sending a stale one. */}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (sheetId) window.open(`/api/daily-sheet/${sheetId}`, "_blank");
            }}
            disabled={!sheetId}
            title={sheetId ? "Landscape PDF, ready to email or text" : "Save the sheet first"}
            className="h-8 gap-1.5 rounded-lg border border-border bg-transparent px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Download className="size-3.5" /> PDF
          </Button>
          {/* The form is 17 columns wide and only fits the page sideways. The
              stylesheet asks for landscape, but a print dialog left on
              portrait overrides it and quietly crops the right-hand unit code
              columns — which reads as "the codes are missing" rather than as a
              paper setting. Say so where the button is. */}
          <span className="text-[11px] text-muted-foreground">
            Print needs landscape · PDF is always landscape
          </span>
          {locked ? (
            // The numbers are closed; the photos are not. Fortitude cannot
            // approve a daily with no evidence, and a crew is often out of
            // signal until well after they file.
            <>
              <span className="text-[11.5px] text-muted-foreground">
                Submitted · numbers locked
              </span>
              {photosDirty ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void savePhotos()}
                  disabled={savingPhotos}
                  className="h-8 gap-1.5 rounded-lg bg-warning px-2.5 text-[12px] font-semibold text-black hover:opacity-90 disabled:opacity-50"
                >
                  {savingPhotos ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  Save photos
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => void save()}
                disabled={saving || submitting}
                className="h-8 gap-1.5 rounded-lg border border-border bg-transparent px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {sheetId ? "Save draft" : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void submit()}
                disabled={saving || submitting}
                className="h-8 gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Submit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Save state — screen only */}
      {saveError || savedAt ? (
        <p
          className={cn(
            "text-[11.5px] print:hidden",
            saveError ? "text-critical" : "text-muted-foreground",
          )}
        >
          {saveError ?? `Draft saved ${savedAt}. Submitting turns the grid into billable line items.`}
        </p>
      ) : null}

      {/* Codes the card can't pay. Loud, on the sheet, while it can still be
          retyped — a code that misses bills nothing rather than erroring, so
          nothing else on this page would say a word about it. */}
      {!locked && unknownCodes.length > 0 ? (
        <div className="rounded-xl border border-warning/45 bg-warning/[0.07] px-3 py-2.5 print:hidden">
          <p className="text-[12.5px] font-semibold text-foreground">
            {unknownCodes.length === 1 ? "1 code isn't" : `${unknownCodes.length} codes aren't`}{" "}
            {canReview
              ? // The office is the one who needs to know what it costs.
                "on this customer's rate card — they will bill $0.00"
              : // A crew gets told their sheet is wrong, not what the customer
                // pays for it. The rate card is not theirs to see.
                "valid for this job — the work on them won't be counted"}
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {unknownCodes.map((c) => (
              <code
                key={c}
                className="rounded-md border border-warning/40 bg-background px-1.5 py-0.5 text-[11.5px] text-foreground"
              >
                {c}
              </code>
            ))}
          </p>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            These were typed before the code row became a dropdown. Reopen each code
            and pick it from the list — the full code is{" "}
            <code className="text-foreground">BFOV(12.7)(2W)12&quot;DEPTH</code>, not{" "}
            <code className="text-foreground">BFOV 12.7(2W)</code>. The 12&quot; depth adder is
            added for you once the base code matches.
          </p>
        </div>
      ) : null}

      {/* A filed daily is read-only. `inert` blocks focus, typing and clicks on
          everything inside in one stroke, so no individual field has to
          remember to disable itself. */}
      <div
        className={cn(
          "sheet-page overflow-x-auto rounded-xl border border-border bg-background print:overflow-visible print:rounded-none print:border-0",
          locked && "select-text",
        )}
      >
        {/* Wide enough for the widest of the two grids (the material section,
            at 1410px) so neither table is squeezed. It scrolls horizontally on
            a narrow screen, which beats cramming the columns.

            `sheet-grid` holds this width at print time too — printing used to
            try to collapse it with a `print:min-w-0` utility that emits no CSS
            at all, so the grid stayed wide and the page simply cut off half
            the unit code columns. It is scaled to fit in globals.css now. */}
        <div className="sheet-grid min-w-[1420px]">
          {/* Everything except the photo strip is frozen once filed. A disabled
              fieldset switches off every control inside it in one place, so no
              individual input has to remember — and the strip sits outside it,
              between the two halves below. */}
          <fieldset disabled={locked} className="contents">
          {/* ── Masthead ─────────────────────────────────────────── */}
          <div className="flex items-end justify-between gap-4 border-b border-border px-3 pb-2 pt-3">
            <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground print:text-[9px]">
              <span className="uppercase tracking-[0.08em]">Sheet</span>
              <input
                value={header.sheet}
                onChange={(e) => set("sheet", e.target.value)}
                className="num h-6 w-10 border-b border-border bg-transparent text-center text-[12px] text-foreground outline-none focus:bg-brand/10"
              />
              <span className="uppercase tracking-[0.08em]">of</span>
              <input
                value={header.sheetOf}
                onChange={(e) => set("sheetOf", e.target.value)}
                className="num h-6 w-10 border-b border-border bg-transparent text-center text-[12px] text-foreground outline-none focus:bg-brand/10"
              />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-bold uppercase tracking-[0.05em] text-foreground print:text-[12px]">
                Globe Communications, LLC.
              </p>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground print:text-[9.5px]">
                Subcontractor Daily Billing Sheet
              </p>
            </div>
            <p className="num text-[12px] font-semibold tracking-wide text-critical print:text-[10px]">
              GLS&nbsp;-&nbsp;203155
            </p>
          </div>

          {/* ── Header fields ────────────────────────────────────── */}
          <div className="border-b border-border">
            <div className="grid grid-cols-[1.2fr_1fr_1.4fr_1.4fr] border-b-0">
              <Field
                label="Exchange / Work Order Number"
                value={header.exchange}
                onChange={(v) => set("exchange", v)}
              />
              <Field
                label="Crew Number"
                value={header.crewNumber}
                onChange={(v) => set("crewNumber", v)}
              />
              <Field label="Customer Name" value={header.customer} onChange={(v) => set("customer", v)} />
              <Field
                label="Work Order Title / Job Name"
                value={header.jobName}
                onChange={(v) => set("jobName", v)}
                className="border-r-0"
              />
            </div>

            <div className="grid grid-cols-[1.2fr_1fr_1.4fr_1.4fr]">
              <Field
                label="Date Work Performed"
                type="date"
                value={header.dateWorked}
                onChange={(v) => set("dateWorked", v)}
              />
              <Field
                label="Project Number"
                value={header.projectNumber}
                onChange={(v) => set("projectNumber", v)}
              />

              {/* Work order complete — YES / NO, circled on paper */}
              <div className="flex flex-col border-b border-r border-border">
                <span className="px-1.5 pt-1 text-[8px] font-semibold uppercase leading-tight tracking-[0.06em] text-muted-foreground print:text-[6.5px]">
                  Work Order Complete
                </span>
                <div className="flex h-7 items-center gap-2 px-1.5 pb-1 print:h-6">
                  {(["yes", "no"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set("complete", header.complete === v ? "" : v)}
                      className={cn(
                        "focus-ring grid h-6 min-w-[38px] place-items-center rounded-full border px-2 text-[11px] font-semibold uppercase transition print:h-5 print:text-[9px]",
                        header.complete === v
                          ? "border-brand bg-brand/15 text-foreground"
                          : "border-transparent text-muted-foreground hover:border-border",
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[1.7fr_1fr] border-b border-border">
                <Field
                  label="Supervisor Approval Signature"
                  value={header.supervisorSignature}
                  onChange={(v) => set("supervisorSignature", v)}
                  className="border-b-0"
                  inputClassName="font-[cursive]"
                />
                <Field
                  label="Date"
                  type="date"
                  value={header.supervisorDate}
                  onChange={(v) => set("supervisorDate", v)}
                  className="border-b-0 border-r-0"
                />
              </div>
            </div>

            {/* Crew roster + subcontractor sign-off */}
            <div className="grid grid-cols-[1.2fr_1fr_1.4fr_1.4fr]">
              <Field
                label="Subcontractor Employee Name"
                value={header.employees[0]}
                onChange={(v) =>
                  set("employees", header.employees.map((e, i) => (i === 0 ? v : e)))
                }
                className="border-b-0"
              />
              <Field
                label="Subcontractor Employee Name"
                value={header.employees[1]}
                onChange={(v) =>
                  set("employees", header.employees.map((e, i) => (i === 1 ? v : e)))
                }
                className="border-b-0"
              />
              <Field
                label="Subcontractor Employee Name"
                value={header.employees[2]}
                onChange={(v) =>
                  set("employees", header.employees.map((e, i) => (i === 2 ? v : e)))
                }
                className="border-b-0"
              />
              <div className="grid grid-cols-[1.7fr_1fr]">
                <Field
                  label="Subcontractor Approval Signature"
                  value={header.subcontractorSignature}
                  onChange={(v) => set("subcontractorSignature", v)}
                  className="border-b-0"
                  inputClassName="font-[cursive]"
                />
                <Field
                  label="Date"
                  type="date"
                  value={header.subcontractorDate}
                  onChange={(v) => set("subcontractorDate", v)}
                  className="border-b-0 border-r-0"
                />
              </div>
            </div>

            <div className="grid grid-cols-[1.2fr_1fr_2.8fr]">
              <Field
                label="Subcontractor Employee Name"
                value={header.employees[3]}
                onChange={(v) =>
                  set("employees", header.employees.map((e, i) => (i === 3 ? v : e)))
                }
                className="border-b-0"
              />
              <Field
                label="Subcontractor Employee Name"
                value={header.employees[4]}
                onChange={(v) =>
                  set("employees", header.employees.map((e, i) => (i === 4 ? v : e)))
                }
                className="border-b-0"
              />
              <div className="border-b-0" />
            </div>
          </div>

          {/* ── Production grid ──────────────────────────────────── */}
          <table className="w-full table-fixed border-collapse">
            {/* Column widths follow what actually gets typed, not the paper
                form's proportions. Ped/pole location numbers are long, and a
                unit code like BFOV(12.7)2W has to be readable while you enter
                it. Remarks is the one column that can afford to be narrow —
                it's used occasionally, and it wraps. */}
            <colgroup>
              <col className="w-[110px]" />
              <col className="w-[210px]" />
              {Array.from({ length: UNIT_COLS }, (_, i) => (
                <col key={i} className="w-[88px]" />
              ))}
              <col className="w-[150px]" />
            </colgroup>
            <thead>
              <tr>
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Print
                  <br />
                  Number
                </th>
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Ped / Pole
                  <br />
                  Location Number
                </th>
                {Array.from({ length: UNIT_COLS }, (_, i) => (
                  <th
                    key={i}
                    className="border border-border px-0.5 py-1 align-bottom text-[7px] font-semibold uppercase leading-tight tracking-[0.03em] text-muted-foreground print:text-[5.5px]"
                  >
                    Hourly / Unit Code
                    <CodeSelect
                      label={`Unit code ${i + 1}`}
                      codes={billableCodes}
                      value={laborCodes[i]}
                      onChange={(v) =>
                        setLaborCodes((c) => c.map((old, j) => (j === i ? v : old)))
                      }
                    />
                  </th>
                ))}
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Remarks / Explanation for Hours
                </th>
              </tr>
            </thead>
            <tbody>
              {labor.map((row, r) => (
                <tr key={r}>
                  <td className="border border-border p-0">
                    <Cell
                      value={row.print}
                      onChange={(e) =>
                        setLabor((rows) =>
                          rows.map((x, i) => (i === r ? { ...x, print: e.target.value } : x)),
                        )
                      }
                    />
                  </td>
                  <td className="border border-border p-0">
                    <Cell
                      value={row.location}
                      onChange={(e) =>
                        setLabor((rows) =>
                          rows.map((x, i) => (i === r ? { ...x, location: e.target.value } : x)),
                        )
                      }
                    />
                  </td>
                  {row.cells.map((v, c) => (
                    <td key={c} className="border border-border p-0">
                      <Cell
                        inputMode="decimal"
                        value={v}
                        onChange={(e) => setLaborCell(r, c, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="border border-border p-0">
                    <Cell
                      value={row.remarks}
                      onChange={(e) =>
                        setLabor((rows) =>
                          rows.map((x, i) => (i === r ? { ...x, remarks: e.target.value } : x)),
                        )
                      }
                      className="text-left"
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td
                  colSpan={2}
                  className="border border-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-foreground print:text-[7px]"
                >
                  Totals
                </td>
                {laborTotals.map((t, i) => (
                  <td
                    key={i}
                    className="num border border-border bg-foreground/[0.04] px-1 py-1 text-center text-[11.5px] font-semibold text-foreground print:text-[9px]"
                  >
                    {fmt(t)}
                  </td>
                ))}
                <td className="border border-border bg-foreground/[0.04]" />
              </tr>
            </tbody>
          </table>

          <div className="print:hidden">
            <button
              type="button"
              onClick={() => setLabor((rows) => [...rows, blankLaborRow()])}
              className="focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" /> Add production row
            </button>
          </div>

          {/* ── Material-only banner ─────────────────────────────── */}
          <p className="border-y border-border bg-foreground/[0.04] px-2 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-[0.06em] text-foreground print:text-[7.5px]">
            Report material only in the section below — circle (MAT) below if material only applies
          </p>

          {/* ── Material grid ────────────────────────────────────── */}
          <table className="w-full table-fixed border-collapse">
            {/* Matched to the production grid above so the two tables line up
                and read as one form. */}
            <colgroup>
              <col className="w-[110px]" />
              <col className="w-[150px]" />
              <col className="w-[170px]" />
              <col className="w-[54px]" />
              {Array.from({ length: MAT_COLS }, (_, i) => (
                <col key={i} className="w-[88px]" />
              ))}
              <col className="w-[110px]" />
              <col className="w-[100px]" />
              <col className="w-[100px]" />
            </colgroup>
            <thead>
              <tr>
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Print
                  <br />
                  Number
                </th>
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Ped / Pole
                  <br />
                  Start #
                </th>
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Ped / Pole Stop Number
                  <br />
                  (or) Incomplete
                </th>
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Mat
                </th>
                {Array.from({ length: MAT_COLS }, (_, i) => (
                  <th
                    key={i}
                    className="border border-border px-0.5 py-1 align-bottom text-[7px] font-semibold uppercase leading-tight tracking-[0.03em] text-muted-foreground print:text-[5.5px]"
                  >
                    Mat / Unit Code
                    <CodeSelect
                      label={`Material code ${i + 1}`}
                      codes={billableCodes}
                      value={matCodes[i]}
                      onChange={(v) =>
                        setMatCodes((c) => c.map((old, j) => (j === i ? v : old)))
                      }
                    />
                  </th>
                ))}
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Cable / Pipe
                  <br />
                  Reel Number
                </th>
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Cable Start
                  <br />
                  Number
                </th>
                <th className="border border-border px-1 py-1 align-bottom text-[7.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted-foreground print:text-[6px]">
                  Cable Stop
                  <br />
                  Number
                </th>
              </tr>
            </thead>
            <tbody>
              {mat.map((row, r) => (
                <tr key={r}>
                  {(["print", "start", "stop"] as const).map((key) => (
                    <td key={key} className="border border-border p-0">
                      <Cell
                        value={row[key]}
                        onChange={(e) =>
                          setMat((rows) =>
                            rows.map((x, i) => (i === r ? { ...x, [key]: e.target.value } : x)),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td className="border border-border p-0 text-center">
                    <button
                      type="button"
                      aria-label={`Material only, row ${r + 1}`}
                      aria-pressed={row.mat}
                      onClick={() =>
                        setMat((rows) => rows.map((x, i) => (i === r ? { ...x, mat: !x.mat } : x)))
                      }
                      className={cn(
                        "focus-ring my-0.5 grid h-6 w-9 place-items-center rounded-full border text-[9.5px] font-bold uppercase transition print:h-5 print:text-[8px]",
                        row.mat
                          ? "border-brand bg-brand/15 text-foreground"
                          : "border-transparent text-muted-foreground/50 hover:border-border",
                      )}
                    >
                      Mat
                    </button>
                  </td>
                  {row.cells.map((v, c) => (
                    <td key={c} className="border border-border p-0">
                      <Cell
                        inputMode="decimal"
                        value={v}
                        onChange={(e) => setMatCell(r, c, e.target.value)}
                      />
                    </td>
                  ))}
                  {(["reel", "cableStart", "cableStop"] as const).map((key) => (
                    <td key={key} className="border border-border p-0">
                      <Cell
                        value={row[key]}
                        onChange={(e) =>
                          setMat((rows) =>
                            rows.map((x, i) => (i === r ? { ...x, [key]: e.target.value } : x)),
                          )
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td
                  colSpan={4}
                  className="border border-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-foreground print:text-[7px]"
                >
                  Totals
                </td>
                {matTotals.map((t, i) => (
                  <td
                    key={i}
                    className="num border border-border bg-foreground/[0.04] px-1 py-1 text-center text-[11.5px] font-semibold text-foreground print:text-[9px]"
                  >
                    {fmt(t)}
                  </td>
                ))}
                <td className="border border-border bg-foreground/[0.04]" colSpan={3} />
              </tr>
            </tbody>
          </table>

          <div className="flex items-center justify-between px-3 py-2 print:hidden">
            <button
              type="button"
              onClick={() => setMat((rows) => [...rows, blankMatRow()])}
              className="focus-ring inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" /> Add material row
            </button>
            <p className="text-[10px] text-muted-foreground">Flash Graphics, Inc. · 706-278-7779</p>
          </div>

          {/* ── Notes ───────────────────────────────────────────── */}
          <div className="border-t border-border">
            <div className="border-b border-border px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground print:text-[7px]">
                Notes
              </p>
              <p className="text-[11px] text-muted-foreground print:hidden">
                Conditions, delays, refusals, anything the grid has no column for.
              </p>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Hit rock at STA 12+40, switched to missile. Homeowner refused access at 214."
              className="w-full resize-y bg-transparent px-3 py-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none print:text-[10px] print:placeholder:text-transparent"
            />
          </div>

          </fieldset>

          {/* ── Field photos ────────────────────────────────────── */}
          {/* Outside the lock on purpose. The numbers freeze the moment a sheet
              is filed — that is what makes it a submission — but a crew can
              still photograph what they built afterwards, and must, because
              Fortitude cannot approve a daily with no evidence behind it. */}
          {project ? (
            <SheetPhotos
              projectId={project.id}
              photos={photos}
              onChange={setPhotos}
            />
          ) : null}

          <fieldset disabled={locked} className="contents">

          {/* ── Job map + as-built redline ───────────────────────── */}
          {project ? (
            <div className="border-t border-border print:break-before-page">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground print:text-[7px]">
                    Job Map — As-Built Redline
                  </p>
                  <p className="num truncate text-[11.5px] text-foreground print:text-[9px]">
                    {project.number ? `${project.number} · ` : ""}
                    {project.name}
                    {redlines.length ? ` · ${redlines.length} mark${redlines.length === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                {mapUrl ? (
                  <div className="flex items-center gap-2 print:hidden">
                    {redlines.length ? (
                      <button
                        type="button"
                        onClick={() => setRedlines([])}
                        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-muted-foreground hover:text-critical"
                      >
                        <Trash2 className="size-3.5" /> Clear redline
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setRedlining(true)}
                      className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
                    >
                      <Pencil className="size-3.5" /> Redline map
                    </button>
                  </div>
                ) : null}
              </div>

              {mapUrl ? (
                <div className="px-3 py-3">
                  <MapRedlinePreview mapUrl={mapUrl} isPdf={isPdfUrl(mapUrl)} shapes={redlines} />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                  <MapIcon className="size-5 text-muted-foreground" />
                  <p className="text-[12.5px] text-muted-foreground">
                    No map on this project yet.{" "}
                    <Link href={`/projects/${project.id}`} className="text-brand-bright underline print:hidden">
                      Upload one
                    </Link>{" "}
                    and crews can redline it right on the daily.
                  </p>
                </div>
              )}
            </div>
          ) : null}
          </fieldset>
        </div>
      </div>

      {redlining && mapUrl ? (
        <MapMarkupEditor
          projectId={project!.id}
          mapUrl={mapUrl}
          isPdf={isPdfUrl(mapUrl)}
          initialMarkups={redlines}
          title={`${project!.number ? `${project!.number} · ` : ""}${project!.name}`}
          onSave={(shapes) => setRedlines(shapes)}
          onClose={() => setRedlining(false)}
        />
      ) : null}
    </div>
  );
}
