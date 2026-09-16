import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { PageShell } from "@/components/common/page-shell";
import { DemoRequestsView } from "@/components/marketing/demo-requests-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo requests · Vantara IQ" };

/**
 * Who has asked to see Vantara IQ.
 *
 * Staff only, and deliberately not part of Prospects: that board is Fortitude's
 * pipeline of crews and primes to work with, and a contractor evaluating the
 * software is not one of those. Keeping them apart also matters for the day
 * each customer runs on their own system — a tenant's database has no business
 * holding the names of other companies looking at the product.
 */
export default async function DemoRequestsPage() {
  const me = await getCurrentUser();
  if (!me || !isStaff(me.role)) {
    return (
      <PageShell eyebrow="Vantara IQ" title="Demo requests" description="Who has asked to see the product.">
        <p className="rounded-xl border border-border bg-foreground/[0.02] px-4 py-10 text-center text-[13px] text-muted-foreground">
          This is internal.
        </p>
      </PageShell>
    );
  }

  const rows = await prisma.demoRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <PageShell
      eyebrow="Vantara IQ"
      title="Demo requests"
      description="Contractors who have asked to see the product, newest first."
    >
      <DemoRequestsView
        rows={rows.map((r) => ({
          id: r.id,
          name: r.name,
          company: r.company,
          email: r.email,
          phone: r.phone,
          role: r.role,
          crews: r.crews,
          message: r.message,
          status: r.status,
          note: r.note,
          handledBy: r.handledBy,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </PageShell>
  );
}
