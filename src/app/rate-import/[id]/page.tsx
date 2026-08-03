import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/common/page-shell";
import { ReviewScreen, type ReviewRow } from "@/components/rate-import/review-screen";

export const dynamic = "force-dynamic";

export default async function RateImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const imp = await prisma.rateImport.findUnique({
    where: { id },
    include: { rows: { orderBy: { createdAt: "asc" } } },
  });
  if (!imp) notFound();

  const rows: ReviewRow[] = imp.rows.map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    unit: r.unit,
    rate: r.rate,
    minimum: r.minimum,
    rules: r.rules,
    sourcePage: r.sourcePage,
    confidence: r.confidence,
    warning: r.warning,
    status: r.status,
  }));

  return (
    <PageShell eyebrow="Rate import" title="Review extraction" description={imp.fileName}>
      <ReviewScreen
        imp={{
          id: imp.id,
          docType: imp.docType,
          fileName: imp.fileName,
          status: imp.status,
          summary: imp.summary,
          customer: imp.customer,
          market: imp.market,
          error: imp.error,
        }}
        rows={rows}
      />
    </PageShell>
  );
}
