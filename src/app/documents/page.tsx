import Link from "next/link";
import {
  Archive,
  Clock,
  FileSignature,
  FileStack,
  Library,
  PenLine,
  ShieldCheck,
} from "lucide-react";

import { getDocumentDashboard, getDocuments, getProjects, getSubcontractors } from "@/data/queries";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/common/page-shell";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentList } from "@/components/documents/document-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents · Vantara IQ" };

export default async function DocumentsPage() {
  const [d, docs, projects, subs] = await Promise.all([
    getDocumentDashboard(),
    getDocuments(),
    getProjects(),
    getSubcontractors(),
  ]);

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

        <DocumentUpload
          projects={projects.map((p) => ({ id: p.id, name: p.name, number: p.number }))}
          subcontractors={subs.map((x) => ({ id: x.id, company: x.company }))}
        />

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <DocumentList docs={docs} />
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

