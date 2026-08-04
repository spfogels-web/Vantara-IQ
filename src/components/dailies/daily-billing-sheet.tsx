"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
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
import { saveDailySheet, submitDailySheet, type SheetPayload } from "@/app/actions";
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
  employees: Array(CREW_SLOTS).fill(""),
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
        "num h-7 w-full bg-transparent px-1 text-center text-[12px] text-foreground outline-none",
        "focus:bg-brand/10 print:h-6 print:text-[9px]",
        className,
      )}
    />
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
}: {
  project?: SheetProject;
  /** Set when reopening a saved draft, so saves update rather than duplicate. */
  initialSheetId?: string;
  /** A previously saved sheet to reopen — header, both grids and the redline. */
  saved?: SavedSheet | null;
  /** Staff reviewing a filed sheet are not bound by the submit lock. */
  canReview?: boolean;
}) {
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

  const payload = React.useCallback(
    (): SheetPayload => ({
      id: sheetId,
      projectId: project?.id ?? null,
      projectName: project?.name ?? header.jobName,
      workDate: header.dateWorked,
      crewNumber: header.crewNumber,
      header,
      laborCodes,
      laborRows: labor,
      matCodes,
      matRows: mat,
      redlines,
      notes,
      photos,
    }),
    [sheetId, project, header, laborCodes, labor, matCodes, mat, redlines, notes, photos],
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
          {locked ? (
            // A filed daily is a closed record — read and print only.
            <span className="text-[11.5px] text-muted-foreground">Submitted · read only</span>
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

      {/* A filed daily is read-only. `inert` blocks focus, typing and clicks on
          everything inside in one stroke, so no individual field has to
          remember to disable itself. */}
      <div
        className={cn(
          "sheet-page overflow-x-auto rounded-xl border border-border bg-background print:overflow-visible print:rounded-none print:border-0",
          locked && "select-text",
        )}
      >
        <div className="min-w-[1180px] print:min-w-0">
          {/* Everything except the photo strip is frozen once filed. A disabled
              fieldset switches off every control inside it in one place, so no
              individual input has to remember. */}
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
            <colgroup>
              <col className="w-[74px]" />
              <col className="w-[110px]" />
              {Array.from({ length: UNIT_COLS }, (_, i) => (
                <col key={i} className="w-[62px]" />
              ))}
              <col />
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
                    <Cell
                      aria-label={`Unit code ${i + 1}`}
                      value={laborCodes[i]}
                      onChange={(e) =>
                        setLaborCodes((c) => c.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      className="mt-0.5 h-6 font-semibold uppercase text-foreground"
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
            <colgroup>
              <col className="w-[74px]" />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[46px]" />
              {Array.from({ length: MAT_COLS }, (_, i) => (
                <col key={i} className="w-[62px]" />
              ))}
              <col className="w-[92px]" />
              <col className="w-[82px]" />
              <col className="w-[82px]" />
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
                    <Cell
                      aria-label={`Material code ${i + 1}`}
                      value={matCodes[i]}
                      onChange={(e) =>
                        setMatCodes((c) => c.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      className="mt-0.5 h-6 font-semibold uppercase text-foreground"
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

          {/* ── Field photos ────────────────────────────────────── */}
          {project ? (
            <SheetPhotos
              projectId={project.id}
              photos={photos}
              onChange={setPhotos}
            />
          ) : null}

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
