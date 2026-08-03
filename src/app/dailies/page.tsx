import { getDailies } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { DailiesView } from "@/components/dailies/dailies-view";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dailies · Vantara IQ" };

export default async function DailiesPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string; status?: string }>;
}) {
  const [dailies, sp] = await Promise.all([getDailies(), searchParams]);

  return (
    <PageShell
      eyebrow="Overview"
      title="Dailies"
      description="Every crew's daily production, digitized from the field. The AI reads each sheet, reconciles quantities and documentation, and stages it for your team's review."
      actions={
        <Button size="sm" className="h-9 gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright">
          New daily
        </Button>
      }
    >
      <DailiesView dailies={dailies} initialId={sp.sheet} />
    </PageShell>
  );
}
