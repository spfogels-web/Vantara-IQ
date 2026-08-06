import Link from "next/link";
import {
  Archive,
  Clock,
  FileSignature,
  FileStack,
  FileText,
  Library,
  PenLine,
  ShieldCheck,
} from "lucide-react";

import { getDocumentDashboard, type DocumentSummary } from "@/data/queries";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/format";
import { PageShell } from "@/components/common/page-shell";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents · Vantara IQ" };

/** Human labels for the controlled statuses. */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  INTERNAL_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  READY_TO_SEND: "Ready to send",
  SENT: "Sent",
  VIEWED: "Viewed",
  PARTIALLY_SIGNED: "Partly signed",
  SIGNED: "Signed",
  EXECUTED: "Executed",
  EXPIRED: "Expired",
  SUPERSEDED: "Superseded",
  ARCHIVED: "Archived",
  VOIDED: "Voided",
};

const STATUS_TONE: Record<string, "success" | "warning" | "critical" | "info" | "neutral"> = {
  DRAFT: "neutral",
  INTERNAL_REVIEW: "warning",
  CHANGES_REQUESTED: "critical",
  APPROVED: "info",
  READY_TO_SEND: "info",
  SENT: "info",
  VIEWED: "info",
  PARTIALLY_SIGNED: "warning",
  SIGNED: "success",
  EXECUTED: "success",
  EXPIRED: "critical",
  SUPERSEDED: "neutral",
  ARCHIVED: "neutral",
  VOIDED: "critical",
};

const TYPE_LABEL: Record<string, string> = {
  NDA: "NDA",
  MASTER_SUBCONTRACTOR_AGREEMENT: "Master subcontract",
  PROJECT_SUBCONTRACTOR_AGREEMENT: "Project agreement",
  SUBCONTRACTOR_RATE_CARD: "Rate card",
  CHANGE_ORDER: "Change order",
  PURCHASE_ORDER: "Purchase order",
  CUSTOMER_CONTRACT: "Customer contract",
  WORK_AUTHORIZATION: "Work authorization",
  INSURANCE_REQUEST: "Insurance request",
  W9_REQUEST: "W-9 request",
  LIEN_WAIVER: "Lien waiver",
  SAFETY_FORM: "Safety form",
  EMPLOYMENT_DOCUMENT: "Employment",
  VENDOR_AGREEMENT: "Vendor agreement",
  CLOSEOUT: "Closeout",
  CUSTOM: "Document",
};

export default async function DocumentsPage() {
  const d = await getDocumentDashboard();

  return (
    <PageShell
      eyebrow="Network"
      title="Documents"
      description="Contracts, agreements, rate cards and closeout paperwork — created, approved, signed and versioned in one place."
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Drafts" value={d.drafts} icon={<PenLine className="size-3.5" />} />
          <Kpi
            label="Waiting approval"
            value={d.awaitingApproval}
            tone={d.awaitingApproval > 0 ? "text-warning" : undefined}
            icon={<ShieldCheck className="size-3.5" />}
          />
          <Kpi
            label="Waiting signature"
            value={d.awaitingSignature}
            tone={d.awaitingSignature > 0 ? "text-info" : undefined}
            icon={<FileSignature className="size-3.5" />}
          />
          <Kpi label="Signed this month" value={d.signedThisMonth} tone={d.signedThisMonth > 0 ? "text-success" : undefined} icon={<FileStack className="size-3.5" />} />
          <Kpi
            label="Expiring in 30 days"
            value={d.expiringSoon}
            tone={d.expiringSoon > 0 ? "text-critical" : undefined}
            icon={<Clock className="size-3.5" />}
          />
          <Kpi label="Executed" value={d.executed} icon={<Archive className="size-3.5" />} />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <Panel>
              <PanelHeader
                title="Recently edited"
                description="Newest first"
                count={d.recent.length}
                icon={<FileText className="size-3.5" />}
              />
              {d.recent.length === 0 ? (
                <PanelBody>
                  <Empty />
                </PanelBody>
              ) : (
                <ul className="flex flex-col">
                  {d.recent.map((doc) => (
                    <DocumentRow key={doc.id} doc={doc} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="flex flex-col gap-3 xl:col-span-4">
            <Panel>
              <PanelHeader title="Library" icon={<Library className="size-3.5" />} />
              <PanelBody className="flex flex-col gap-2.5">
                <LibraryRow label="Templates" count={d.templates} href="/documents/templates" />
                <LibraryRow label="Clauses" count={d.clauses} href="/documents/clauses" />
                <LibraryRow label="All documents" count={d.total} href="/documents/all" />
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="What's built" description="Phase 1 in progress" />
              <PanelBody className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
                <p>
                  The data model is live — documents, versions, templates, clauses, fields,
                  signatures, access and a full audit trail.
                </p>
                <p>
                  Next: the template library and the document editor. Nothing here is a
                  placeholder; these counts are real and read zero because the centre is empty.
                </p>
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <Panel className="p-3.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-[0.06em]">{label}</span>
      </div>
      <p className={cn("num mt-1.5 text-[24px] font-semibold tracking-tight text-foreground", tone)}>
        {value}
      </p>
    </Panel>
  );
}

function DocumentRow({ doc }: { doc: DocumentSummary }) {
  const party = doc.subcontractor ?? doc.customer ?? doc.project;
  return (
    <li>
      <Link
        href={`/documents/${doc.id}`}
        className="focus-ring flex items-start gap-3 border-t border-border/60 px-4 py-3 transition-colors first:border-t-0 hover:bg-foreground/[0.025] sm:px-5"
      >
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">{doc.title}</span>
            <StatusPill
              label={STATUS_LABEL[doc.status] ?? doc.status}
              tone={STATUS_TONE[doc.status] ?? "neutral"}
              className="shrink-0 text-[10px]"
              dot={false}
            />
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
            {[TYPE_LABEL[doc.type] ?? doc.type, party].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-right text-[11px] text-muted-foreground">
          <span className="num block">v{doc.versionNo || 1}</span>
          <span className="block">{formatWhen(doc.updatedAt)}</span>
        </span>
      </Link>
    </li>
  );
}

function LibraryRow({ label, count, href }: { label: string; count: number; href: string }) {
  return (
    <Link
      href={href}
      className="focus-ring flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-[12.5px] transition-colors hover:bg-foreground/[0.03]"
    >
      <span className="text-foreground">{label}</span>
      <span className="num text-muted-foreground">{count}</span>
    </Link>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-10 text-center">
      <FileText className="size-5 text-muted-foreground/60" />
      <p className="text-[13px] font-medium text-foreground">No documents yet</p>
      <p className="max-w-sm text-[12px] text-muted-foreground">
        Once the template library lands you&apos;ll start one from a template, or upload an
        existing agreement and turn it into one.
      </p>
    </div>
  );
}
