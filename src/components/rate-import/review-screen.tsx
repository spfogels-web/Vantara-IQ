"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, CheckCheck, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatCurrency } from "@/lib/format";
import { bulkApproveRows, setRowStatus } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";

export type ReviewRow = {
  id: string;
  code: string;
  description: string;
  unit: string;
  rate: number | null;
  minimum: number | null;
  rules: string;
  sourcePage: string;
  confidence: number;
  warning: string;
  status: string;
};

export type ReviewImport = {
  id: string;
  docType: string;
  fileName: string;
  status: string;
  summary: string;
  customer: string;
  market: string;
  error: string;
};

function confTone(c: number) {
  return c >= 0.85 ? "success" : c >= 0.6 ? "warning" : "critical";
}

export function ReviewScreen({ imp, rows }: { imp: ReviewImport; rows: ReviewRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  async function act(id: string, status: "APPROVED" | "REJECTED") {
    setPending(id + status);
    await setRowStatus(id, status);
    router.refresh();
    setPending(null);
  }

  async function approveAll() {
    setPending("bulk");
    await bulkApproveRows(imp.id, 0.7);
    router.refresh();
    setPending(null);
  }

  const approved = rows.filter((r) => r.status === "APPROVED").length;
  const eligible = rows.filter((r) => r.status === "PENDING" && r.confidence >= 0.7).length;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Link href="/rate-import" className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All imports
        </Link>
      </div>

      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-foreground">{imp.fileName}</h2>
              <StatusPill label={imp.status} tone={imp.status === "APPROVED" ? "success" : imp.status === "FAILED" ? "critical" : "warning"} dot={false} />
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {imp.summary || imp.docType}
              {imp.customer ? ` · ${imp.customer}` : ""}
              {imp.market ? ` · ${imp.market}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="num font-medium text-foreground">{approved}</span>/{rows.length} approved
          </div>
          <Button
            onClick={approveAll}
            disabled={pending === "bulk" || eligible === 0}
            className="brand-gradient h-9 gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            <CheckCheck className="size-4" /> Approve {eligible} valid
          </Button>
        </PanelBody>
      </Panel>

      {imp.error ? (
        <div className="rounded-xl border border-critical/25 bg-critical/[0.08] px-4 py-3 text-[12.5px] text-critical">
          Extraction failed: {imp.error}
        </div>
      ) : null}

      <Panel>
        <PanelHeader title="Extracted rows" description="Approve, reject, or bulk-approve valid rows. Nothing activates until approved." count={rows.length} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium sm:px-5">Code</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">Unit</th>
                <th className="px-3 py-2.5 text-right font-medium">Rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Min</th>
                <th className="px-3 py-2.5 font-medium">Conf.</th>
                <th className="px-3 py-2.5 font-medium">Page</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn("border-b border-border/40 last:border-0", r.status === "REJECTED" && "opacity-50")}>
                  <td className="px-4 py-2.5 sm:px-5">
                    <span className="num rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[11.5px] font-semibold text-foreground ring-1 ring-inset ring-foreground/[0.06]">
                      {r.code || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-foreground">
                    {r.description}
                    {r.warning ? <span className="mt-0.5 block text-[10.5px] text-warning">⚠ {r.warning}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{r.unit || "—"}</td>
                  <td className="num px-3 py-2.5 text-right text-[12px] text-foreground">{r.rate != null ? formatCurrency(r.rate) : "—"}</td>
                  <td className="num px-3 py-2.5 text-right text-[12px] text-muted-foreground">{r.minimum != null ? formatCurrency(r.minimum) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("num text-[11.5px] font-medium", toneStyles[confTone(r.confidence)].text)}>
                      {Math.round(r.confidence * 100)}%
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-[11px] text-muted-foreground">{r.sourcePage || "—"}</td>
                  <td className="px-4 py-2.5 text-right sm:px-5">
                    {r.status === "PENDING" ? (
                      <span className="inline-flex gap-1.5">
                        <button
                          onClick={() => act(r.id, "APPROVED")}
                          disabled={pending === r.id + "APPROVED"}
                          className="focus-ring grid size-7 place-items-center rounded-md bg-success/12 text-success hover:bg-success/20"
                          title="Approve"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          onClick={() => act(r.id, "REJECTED")}
                          disabled={pending === r.id + "REJECTED"}
                          className="focus-ring grid size-7 place-items-center rounded-md bg-critical/12 text-critical hover:bg-critical/20"
                          title="Reject"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ) : (
                      <StatusPill label={r.status === "APPROVED" ? "Approved" : "Rejected"} tone={r.status === "APPROVED" ? "success" : "neutral"} dot={false} className="text-[10px]" />
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-[12.5px] text-muted-foreground">
                    No rows extracted.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
