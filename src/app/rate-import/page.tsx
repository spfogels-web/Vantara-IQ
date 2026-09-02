import { prisma } from "@/lib/prisma";
import { isConfigured } from "@/lib/extract";
import { PageShell } from "@/components/common/page-shell";
import { RateImportView, type ImportRow } from "@/components/rate-import/rate-import-view";

export const dynamic = "force-dynamic";
/**
 * A long rate sheet is read a few pages at a time, one pass after another —
 * a sixty-page sheet is ten calls. The default budget is for a page render,
 * not for that, and the upload would be killed part way through with the
 * import left sitting in PROCESSING.
 */
export const maxDuration = 300;
export const metadata = { title: "Rate import · Vantara IQ" };

export default async function RateImportPage() {
  const rows = await prisma.rateImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { _count: { select: { rows: true } } },
  });

  const imports: ImportRow[] = rows.map((r) => ({
    id: r.id,
    docType: r.docType,
    fileName: r.fileName,
    status: r.status,
    summary: r.summary,
    rowCount: r._count.rows,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <PageShell
      eyebrow="Financials"
      title="Rate import"
      description="Upload GC rate sheets, unit-description sheets, material lists and subcontractor rate cards. Claude extracts structured rows; your team reviews and approves before anything activates."
    >
      <RateImportView imports={imports} configured={isConfigured()} />
    </PageShell>
  );
}
