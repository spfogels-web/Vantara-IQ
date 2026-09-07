import { getCurrentUser, isStaff } from "@/lib/auth";
import { getLocateOverview, getLocatePickers, getLocateRows } from "@/data/locates-ops";
import { locateChatReady } from "@/lib/locate-chat";
import { providerFor, DEFAULT_PROVIDER } from "@/lib/locate-providers";
import { PageShell } from "@/components/common/page-shell";
import { LocateCommandCenter } from "@/components/locates/locate-command-center";
import { LocateChat } from "@/components/locates/locates-view";

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
