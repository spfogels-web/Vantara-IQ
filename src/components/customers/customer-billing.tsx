"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRate } from "@/lib/format";
import {
  addCustomerRate,
  deleteCustomerDocument,
  deleteCustomerRate,
  listCustomerDocuments,
  listCustomerRates,
  listRateImports,
  pushImportToCustomer,
  uploadCustomerDocument,
} from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { RateSheetUpload } from "@/components/common/rate-sheet-upload";
import { marketLabel } from "@/lib/markets";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";

type Doc = { id: string; section: string; fileName: string; sizeBytes: number; dataUrl: string; createdAt: string };
type Rate = { id: string; code: string; market: string; description: string; unit: string; rate: number; minimum: number | null; source: string };
type Imp = { id: string; fileName: string; rowCount: number };

const DOC_SECTIONS = [
  { key: "contract", label: "Signed contract", required: true },
  { key: "insurance", label: "Insurance / COI", required: false },
  { key: "tax", label: "W-9 / tax", required: false },
  { key: "other", label: "Other", required: false },
];

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

function fmtBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function CustomerBilling({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [docs, setDocs] = React.useState<Doc[] | null>(null);
  const [rates, setRates] = React.useState<Rate[] | null>(null);
  const [imports, setImports] = React.useState<Imp[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [importId, setImportId] = React.useState("");
  const [draft, setDraft] = React.useState({ code: "", description: "", unit: "ft", rate: "", minimum: "" });

  // Two cards under one customer is the case this column exists for — Trawick
  // runs South Georgia and Alabama at different prices. Without it the same
  // code appears twice at two prices and reads as duplicated data.
  const split = React.useMemo(
    () => new Set((rates ?? []).map((r) => r.market)).size > 1,
    [rates],
  );

  React.useEffect(() => {
    let on = true;
    setDocs(null);
    setRates(null);
    listCustomerDocuments(customerId).then((d) => on && setDocs(d));
    listCustomerRates(customerId).then((r) => on && setRates(r));
    listRateImports().then((i) => on && setImports(i));
    return () => { on = false; };
  }, [customerId]);

  async function upload(section: string, file: File) {
    setBusy("doc:" + section);
    const fd = new FormData();
    fd.set("file", file); fd.set("customerId", customerId); fd.set("section", section);
    const res = await uploadCustomerDocument(fd);
    setBusy(null);
    if (res.ok) setDocs((d) => [...(d ?? []), res.doc]);
  }
  async function removeDoc(id: string) {
    setDocs((d) => (d ?? []).filter((x) => x.id !== id));
    await deleteCustomerDocument(id);
  }
  async function addRate() {
    if (!draft.code.trim() || busy) return;
    setBusy("rate");
    const res = await addCustomerRate(customerId, {
      code: draft.code, description: draft.description, unit: draft.unit,
      rate: Number(draft.rate) || 0, minimum: draft.minimum ? Number(draft.minimum) : null,
    });
    setBusy(null);
    if (res.ok) {
      setDraft({ code: "", description: "", unit: "ft", rate: "", minimum: "" });
      setRates(await listCustomerRates(customerId));
    }
  }
  async function removeRate(id: string) {
    setRates((r) => (r ?? []).filter((x) => x.id !== id));
    await deleteCustomerRate(id);
  }
  async function pushImport() {
    if (!importId || busy) return;
    setBusy("push");
    const res = await pushImportToCustomer(importId, customerId);
    setBusy(null);
    if (res.ok) setRates(await listCustomerRates(customerId));
    else alert(res.error);
    router.refresh();
  }

  const contractOnFile = (docs ?? []).some((d) => d.section === "contract");

  return (
    <>
      {/* Contract & documents */}
      <Panel>
        <PanelHeader
          title="Contract & documents"
          description="Signed contract, insurance and tax docs on file"
          icon={<FileText className="size-3.5" />}
        >
          <StatusPill
            label={contractOnFile ? "Contract on file" : "No contract"}
            tone={contractOnFile ? "success" : "warning"}
            className="text-[10px]"
          />
        </PanelHeader>
        <PanelBody className="flex flex-col gap-2">
          {docs === null ? (
            <p className="text-[12px] text-muted-foreground">Loading…</p>
          ) : (
            DOC_SECTIONS.map((s) => {
              const list = docs.filter((d) => d.section === s.key);
              return (
                <div key={s.key} className="rounded-lg border border-border/60 bg-foreground/[0.02] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("grid size-6 place-items-center rounded", list.length ? "text-success" : "text-muted-foreground")}>
                      {list.length ? <CheckCircle2 className="size-4" /> : <FileText className="size-4" />}
                    </span>
                    <span className="flex-1 text-[12.5px] font-medium text-foreground">
                      {s.label}{s.required ? <span className="ml-1 text-[9.5px] uppercase text-muted-foreground">required</span> : null}
                    </span>
                    <label className="focus-ring inline-flex cursor-pointer items-center gap-1 rounded-md border border-foreground/[0.08] bg-foreground/[0.03] px-2 py-1 text-[11px] font-medium text-brand-bright hover:bg-foreground/[0.06]">
                      {busy === "doc:" + s.key ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />} Upload
                      <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(s.key, f); e.target.value = ""; }} />
                    </label>
                  </div>
                  {list.map((d) => (
                    <div key={d.id} className="mt-1.5 flex items-center gap-2 rounded bg-foreground/[0.03] px-2 py-1">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">{d.fileName}</span>
                      <span className="num text-[10px] text-muted-foreground">{fmtBytes(d.sizeBytes)}</span>
                      <a href={d.dataUrl} target="_blank" rel="noopener noreferrer" className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"><Eye className="size-3.5" /></a>
                      <a href={d.dataUrl} download={d.fileName} className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"><Download className="size-3.5" /></a>
                      <button onClick={() => removeDoc(d.id)} className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:text-critical"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </PanelBody>
      </Panel>

      {/* Rate card */}
      <Panel>
        <PanelHeader
          title="Rate card"
          description="Unit rates that auto-price invoices from approved dailies"
          count={rates?.length ?? 0}
        >
          <div className="flex items-center gap-1.5">
            <select value={importId} onChange={(e) => setImportId(e.target.value)} className={cn(inputClass, "h-8 w-40 appearance-none")}>
              <option value="">Push from import…</option>
              {imports.map((i) => <option key={i.id} value={i.id}>{i.fileName} ({i.rowCount})</option>)}
            </select>
            <Button size="sm" onClick={pushImport} disabled={!importId || busy === "push"} className="h-8 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40">
              {busy === "push" ? <Loader2 className="size-3.5 animate-spin" /> : "Push"}
            </Button>
          </div>
        </PanelHeader>

        {/* Load the signed Exhibit straight on — read off the file itself, so
            it does not need the review queue an AI extraction does. */}
        <RateSheetUpload
          customerId={customerId}
          onLoaded={() => void listCustomerRates(customerId).then(setRates)}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:px-5">Code</th>
                {/* Only when this customer actually has more than one card.
                    A market column on a single-market customer is a column of
                    the same word repeated four hundred times. */}
                {split ? <th className="px-3 py-2 font-medium">Market</th> : null}
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="px-3 py-2 text-right font-medium">Min</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rates === null ? (
                <tr><td colSpan={6} className="px-5 py-6 text-[12px] text-muted-foreground">Loading…</td></tr>
              ) : rates.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-[12px] text-muted-foreground">No rates yet — add one below or push from a rate import.</td></tr>
              ) : (
                rates.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-foreground/[0.02]">
                    <td className="px-4 py-2 sm:px-5"><span className="num rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[11.5px] font-semibold text-foreground ring-1 ring-inset ring-foreground/[0.06]">{r.code}</span></td>
                    {split ? (
                      <td className="px-3 py-2 text-[12px]">
                        {r.market ? (
                          <span className="rounded-full border border-gold/40 bg-gold/[0.1] px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                            {marketLabel(r.market)}
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-muted-foreground">Every market</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-[12px] text-muted-foreground">{r.description}</td>
                    <td className="px-3 py-2 text-[12px] text-muted-foreground">{r.unit}</td>
                    <td className="num px-3 py-2 text-right text-[12.5px] font-medium text-foreground">{formatRate(r.rate)}</td>
                    <td className="num px-3 py-2 text-right text-[12px] text-muted-foreground">{r.minimum != null ? formatRate(r.minimum) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeRate(r.id)} className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:text-critical"><Trash2 className="size-3.5" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70">
                <td className="px-4 py-2 sm:px-5"><input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="BDD" className={cn(inputClass, "num w-20")} /></td>
                <td className="px-3 py-2"><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Directional bore" className={inputClass} /></td>
                <td className="px-3 py-2">
                  <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={cn(inputClass, "w-16 appearance-none")}>
                    <option>ft</option><option>ea</option><option>hr</option><option>ls</option>
                  </select>
                </td>
                <td className="px-3 py-2"><input value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} inputMode="decimal" placeholder="8.75" className={cn(inputClass, "num w-20 text-right")} /></td>
                <td className="px-3 py-2"><input value={draft.minimum} onChange={(e) => setDraft({ ...draft, minimum: e.target.value })} inputMode="decimal" placeholder="—" className={cn(inputClass, "num w-16 text-right")} /></td>
                <td className="px-3 py-2 text-right">
                  <button onClick={addRate} disabled={!draft.code.trim() || busy === "rate"} className="focus-ring grid size-7 place-items-center rounded-md bg-brand text-white hover:bg-brand-bright disabled:opacity-40" title="Add rate">
                    {busy === "rate" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </>
  );
}
