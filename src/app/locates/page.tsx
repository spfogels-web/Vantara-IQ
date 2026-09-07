import { getCurrentUser, isStaff } from "@/lib/auth";
import { getLocateOverview, getLocatePickers, getLocateRows } from "@/data/locates-ops";
import { getMyLocateProjects } from "@/app/locates/locate-actions";
import { locateChatReady } from "@/lib/locate-chat";
import { providerFor, DEFAULT_PROVIDER } from "@/lib/locate-providers";
import { PageShell } from "@/components/common/page-shell";
import { LocateCommandCenter } from "@/components/locates/locate-command-center";
import { LocateChat } from "@/components/locates/locates-view";
import { CrewLocates } from "@/components/locates/crew-locates";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locates · Vantara IQ" };

/**
 * Locate operations.
 *
 * Two questions, kept apart everywhere on this page: has 811 finished, and may
 * a crew actually dig. On the Windstream jobs those have different answers, and
 * a board that showed one number would be wrong on every one of them.
 *
 * A crew sees the tickets on their own jobs — the query scopes it, not the
 * page. Only staff can enter tickets, refresh them, or sign off a locate.
 */
export default async function LocatesPage({
  searchParams,
}: {
  /** Deep links from a project page and a daily arrive already filtered. */
  searchParams: Promise<{ project?: string; crew?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const staff = !!me && isStaff(me.role);

  const [{ rows }, overview, pickers] = await Promise.all([
    getLocateRows({ take: 300 }),
    getLocateOverview(),
    getLocatePickers(),
  ]);

  // A crew gets their own tickets and nothing else — no filing, no
  // refreshing, no assistant, no other company's streets. The query already
  // scoped the rows to their company and stripped our working notes; this
  // just draws the read-only version of the same data.
  if (!staff) {
    const company = me?.subcontractorId
      ? (
          await prisma.subcontractor.findUnique({
            where: { id: me.subcontractorId },
            select: { company: true },
          })
        )?.company ?? "your company"
      : "your company";

    return (
      <PageShell
        eyebrow="Intelligence"
        title="Your locates"
        description="The 811 tickets filed to your company — what is cleared, what has run out, and what has to be located before you break ground."
      >
        <CrewLocates rows={rows} company={company} projects={await getMyLocateProjects()} />
      </PageShell>
    );
  }

  const provider = providerFor(DEFAULT_PROVIDER);

  return (
    <PageShell
      eyebrow="Intelligence"
      title="Locates"
      description="Every 811 ticket with its clock — what is cleared, what we still have to locate ourselves, and where a crew can actually work today."
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <LocateCommandCenter
          initialProject={sp.project ?? ""}
          initialCrew={sp.crew ?? ""}
          initialQuick={sp.view ?? ""}
          rows={rows}
          overview={overview}
          projects={pickers.projects}
          crews={pickers.crews}
          users={pickers.users}
          canManage={staff}
          providerReady={provider.ready()}
          providerDetail={provider.readyDetail()}
        />
        {staff ? (
          <div className="xl:sticky xl:top-3 xl:self-start">
            <LocateChat ready={locateChatReady()} count={rows.length} />
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
