"use client";

import * as React from "react";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRate } from "@/lib/format";
import { compareByPriority } from "@/lib/unit-codes";
import {
  addSubRate,
  deleteSubRate,
  listRateImports,
  getCrewBoreMethod,
  listSubRates,
  pushImportToSubcontractor,
  setCrewBoreMethod,
  updateSubRate,
} from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { RateSheetUpload } from "@/components/common/rate-sheet-upload";

/**
 * What we pay this sub, per unit code.
 *
 * The mirror of the customer's rate card: that side is what we bill, this side
 * is what the work costs. Margin comes from the difference on the same code —
 * never a blended average, because two codes on one job can carry very
 * different spreads and averaging them hides the ones losing money.
 */

type Rate = Awaited<ReturnType<typeof listSubRates>>[number];

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

export function SubRateCard({ subcontractorId }: { subcontractorId: string }) {
  const [rates, setRates] = React.useState<Rate[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [unit, setUnit] = React.useState("ft");
  const [rate, setRate] = React.useState("");

  // Extracted rate documents available to push onto this sub's card, so a
  // signed rate sheet can be uploaded once and applied rather than retyped.
  const [imports, setImports] = React.useState<
    { id: string; fileName: string; rowCount: number }[]
  >([]);
  const [importId, setImportId] = React.useState("");
  /** Which machine this crew bores with — decides same-coded bore rates. */
  const [bore, setBore] = React.useState<"MISSILE" | "DRILL" | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    listRateImports().then(setImports).catch(() => setImports([]));
  }, []);

  React.useEffect(() => {
    getCrewBoreMethod(subcontractorId).then(setBore).catch(() => setBore(null));
  }, [subcontractorId]);

  async function pushImport() {
    if (!importId || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await pushImportToSubcontractor(importId, subcontractorId);
    setBusy(false);
    if (res.ok) {
      setNote(`Added ${res.count} rate${res.count === 1 ? "" : "s"} from that document.`);
      setImportId("");
      void load();
    } else {
      setError(res.error);
    }
  }

  const load = React.useCallback(async () => {
    const rows = await listSubRates(subcontractorId);
    setRates([...rows].sort((a, b) => compareByPriority(a.code, b.code)));
  }, [subcontractorId]);

  React.useEffect(() => {
    setRates(null);
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await addSubRate(subcontractorId, {
      code,
      description,
      unit,
      rate: Number(rate),
    });
    setBusy(false);
    if (res.ok) {
      setCode("");
      setDescription("");
      setRate("");
      setAdding(false);
      void load();
    } else {
      setError(res.error);
    }
  }

  async function setRateValue(id: string, raw: string, current: number) {
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0 || next === current) return;
    await updateSubRate(id, { rate: next });
    void load();
  }

  /**
   * Save a text field on blur, and only when it actually changed.
   *
   * Blur rather than keystroke: a rate card is a legal figure, and writing on
   * every character would fill the history with half-typed values.
   */
  async function setField(
    id: string,
    field: "code" | "description" | "unit",
    raw: string,
    current: string,
  ) {
    const next = raw.trim();
    if (next === current.trim()) return;
    const res = await updateSubRate(id, { [field]: next });
    if (!res.ok) setError(res.error);
    void load();
  }

  async function remove(id: string) {
    await deleteSubRate(id);
    void load();
  }

  return (
    <Panel>
      <PanelHeader
        title="Rate card"
        description="What we pay this sub, per unit code. Edit any cell and it saves when you click away."
        count={rates?.length ?? 0}
      >
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05]"
        >
          <Plus className="size-3.5" /> Add rate
        </button>
        {/* Generated from the rates as they stand, so an edited rate is
            already correct on the sheet you send — no second copy to keep in
            step with the app. */}
        <a
          href={`/api/rate-sheet/${subcontractorId}`}
          className={cn(
            "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright",
            !rates?.length && "pointer-events-none opacity-40",
          )}
        >
          <Download className="size-3.5" /> Rate sheet PDF
        </a>
      </PanelHeader>

      {/* Asked once here rather than inferred per invoice. A card that prices a
          bore twice — missile and drill — is not ambiguous once the machine is
          known, and this is where it is known. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5">
        <span className="text-[11.5px] font-medium text-foreground">Bores with</span>
        {(["MISSILE", "DRILL"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              const next = bore === m ? null : m;
              setBore(next);
              void setCrewBoreMethod(subcontractorId, next).then(load);
            }}
            className={cn(
              "focus-ring h-7 rounded-lg border px-2.5 text-[11.5px] font-medium transition",
              bore === m
                ? "border-brand/50 bg-brand/12 text-brand"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "MISSILE" ? "Missile / stick" : "Drill"}
          </button>
        ))}
        <span className="text-[10.5px] text-muted-foreground">
          {bore
            ? "Bore codes priced for this machine"
            : "Not set — a code priced for both machines has no way to choose"}
        </span>
      </div>

      {adding ? (
        <form onSubmit={add} className="grid grid-cols-2 gap-2 border-b border-border/70 p-3 sm:grid-cols-5">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="BFO48"
            className={cn(inputClass, "num uppercase")}
            autoFocus
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Place buried fiber"
            className={cn(inputClass, "col-span-2")}
          />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={cn(inputClass, "appearance-none")}>
            <option value="ft">ft</option>
            <option value="ea">ea</option>
            <option value="hr">hr</option>
            <option value="ls">ls</option>
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="0.01"
              min={0}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="4.25"
              className={cn(inputClass, "num")}
            />
            <button
              type="submit"
              disabled={busy || !code.trim() || !rate}
              className="focus-ring inline-flex h-8 shrink-0 items-center rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
            </button>
          </div>
          {error ? <p className="col-span-full text-[11.5px] text-critical">{error}</p> : null}
        </form>
      ) : null}

      {/* Drop the signed sheet straight on. A rate sheet is a two-column price
          table, read deterministically off the file itself, so it does not need
          the review queue that an AI-extracted document does. */}
      <RateSheetUpload subcontractorId={subcontractorId} onLoaded={load} />

      {/* Apply an extracted rate document — the GC contract or the sub's own
          signed rate sheet — instead of keying every line. */}
      {imports.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5">
          <span className="text-[11.5px] text-muted-foreground">From an uploaded rate sheet:</span>
          <select
            value={importId}
            onChange={(e) => setImportId(e.target.value)}
            className={cn(inputClass, "h-8 w-auto min-w-[200px] appearance-none py-0")}
          >
            <option value="">Choose a document…</option>
            {imports.map((i) => (
              <option key={i.id} value={i.id}>
                {i.fileName} ({i.rowCount} rows)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void pushImport()}
            disabled={!importId || busy}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Apply approved rows
          </button>
          {note ? <span className="text-[11.5px] text-success">{note}</span> : null}
          {error && !adding ? <span className="text-[11.5px] text-critical">{error}</span> : null}
        </div>
      ) : null}

      {rates === null ? (
        <PanelBody className="py-6 text-center text-[12.5px] text-muted-foreground">Loading…</PanelBody>
      ) : rates.length === 0 ? (
        <PanelBody className="py-8 text-center text-[12.5px] text-muted-foreground">
          No rates yet. Add the codes this sub bills, or upload their rate card on the
          rate-import screen and push it here.
        </PanelBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:px-5">Code</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-foreground/[0.02]">
                  {/* Every cell is an input with a visible border. The previous
                      version hid the borders until hover, which made an editable
                      table look like read-only text — nobody found the edit. */}
                  <td className="px-4 py-1.5 sm:px-5">
                    <input
                      defaultValue={r.code}
                      onBlur={(e) => void setField(r.id, "code", e.target.value, r.code)}
                      className="num w-full min-w-[7rem] rounded border border-border/70 bg-foreground/[0.03] px-1.5 py-1 text-[12px] font-semibold uppercase text-brand-bright outline-none focus:border-brand/60 focus:bg-brand/[0.06]"
                    />
                    {/* Which machine this row is for, and whether it is the one
                        this crew runs. A row that will never be used is worth
                        seeing as such rather than reading as a live rate. */}
                    {r.method ? (
                      <span
                        className={cn(
                          "mt-0.5 inline-block rounded px-1 py-px text-[9.5px] font-semibold",
                          r.method === bore
                            ? "bg-success/15 text-success"
                            : bore
                              ? "bg-foreground/[0.06] text-muted-foreground line-through"
                              : "bg-warning/15 text-warning",
                        )}
                        title={
                          r.method === bore
                            ? "This is the rate they are paid"
                            : bore
                              ? "Not their machine — this rate is never used"
                              : "Set what they bore with, above, or this cannot be chosen"
                        }
                      >
                        {r.method === "MISSILE" ? "missile / stick" : "drill"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      defaultValue={r.description}
                      placeholder="Description"
                      onBlur={(e) => void setField(r.id, "description", e.target.value, r.description)}
                      className="w-full min-w-[10rem] rounded border border-border/70 bg-foreground/[0.03] px-1.5 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand/60 focus:bg-brand/[0.06]"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      defaultValue={r.unit}
                      placeholder="ft"
                      onBlur={(e) => void setField(r.id, "unit", e.target.value, r.unit)}
                      className="w-16 rounded border border-border/70 bg-foreground/[0.03] px-1.5 py-1 text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand/60 focus:bg-brand/[0.06]"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={r.rate}
                      onBlur={(e) => void setRateValue(r.id, e.target.value, r.rate)}
                      className="num w-24 rounded border border-border/70 bg-foreground/[0.03] px-1.5 py-1 text-right text-[12.5px] font-semibold text-foreground outline-none focus:border-brand/60 focus:bg-brand/[0.06]"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(r.id)}
                      title="Remove this rate"
                      className="focus-ring grid size-7 place-items-center rounded border border-border/70 text-muted-foreground transition hover:border-critical/40 hover:text-critical"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70">
                <td colSpan={3} className="px-4 py-2 text-[11.5px] text-muted-foreground sm:px-5">
                  {rates.length} coded rate{rates.length === 1 ? "" : "s"}
                </td>
                <td className="num px-3 py-2 text-right text-[11.5px] text-muted-foreground">
                  avg {formatRate(rates.reduce((s, r) => s + r.rate, 0) / rates.length)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}
