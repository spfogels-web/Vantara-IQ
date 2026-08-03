"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { compareByPriority } from "@/lib/unit-codes";
import { addSubRate, deleteSubRate, listSubRates, updateSubRate } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

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

  async function remove(id: string) {
    await deleteSubRate(id);
    void load();
  }

  return (
    <Panel>
      <PanelHeader
        title="Rate card"
        description="What we pay this sub, per unit code — the basis for their pay application."
        count={rates?.length ?? 0}
      >
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05]"
        >
          <Plus className="size-3.5" /> Add rate
        </button>
      </PanelHeader>

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
                <tr key={r.id} className="group/rate border-b border-border/40 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="num px-4 py-2 text-[12px] font-semibold uppercase text-brand-bright sm:px-5">
                    {r.code}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground">{r.description}</td>
                  <td className="px-3 py-2 text-[11.5px] text-muted-foreground">{r.unit}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={r.rate}
                      onBlur={(e) => void setRateValue(r.id, e.target.value, r.rate)}
                      className="num w-24 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right text-[12.5px] font-medium text-foreground outline-none hover:border-border focus:border-brand/50 focus:bg-foreground/[0.03]"
                    />
                    <span className="ml-1 text-[10.5px] text-muted-foreground">/{r.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(r.id)}
                      title="Remove rate"
                      className="focus-ring grid size-6 place-items-center rounded text-muted-foreground/0 transition group-hover/rate:text-muted-foreground hover:!text-critical"
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
                  avg {formatCurrency(rates.reduce((s, r) => s + r.rate, 0) / rates.length)}
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
