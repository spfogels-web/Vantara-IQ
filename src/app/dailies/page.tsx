import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { getDailies, getSheetIndexByDaily } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { DailiesView } from "@/components/dailies/dailies-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dailies · Vantara IQ" };

export default async function DailiesPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string; status?: string }>;
}) {
  const [dailies, sheetByDaily, sp] = await Promise.all([
    getDailies(),
    getSheetIndexByDaily(),
    searchParams,
  ]);

  return (
    <PageShell
      eyebrow="Overview"
      title="Dailies"
      description="Every crew's daily production, digitized from the field. The AI reads each sheet, reconciles quantities and documentation, and stages it for your team's review."
      actions={
        <>
          <Link
            href="/dailies/sheet"
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-[12.5px] font-semibold text-foreground hover:bg-foreground/[0.04]"
          >
            <FileText className="size-4" /> Billing sheet
          </Link>
          <Link
            href="/dailies/new"
            className="brand-gradient focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white"
          >
            <Plus className="size-4" /> New daily
          </Link>
        </>
      }
    >
      <DailiesView dailies={dailies} initialId={sp.sheet} sheetByDaily={sheetByDaily} />
    </PageShell>
  );
}
