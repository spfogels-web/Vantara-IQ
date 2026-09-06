import { notFound } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth";
import { getLocateDetail, getLocatePickers } from "@/data/locates-ops";
import { PageShell } from "@/components/common/page-shell";
import { LocateDetail } from "@/components/locates/locate-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locate ticket · Vantara IQ" };

export default async function LocateTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  const staff = !!me && isStaff(me.role);

  // The query is the choke point, not this page: it scopes by project access,
  // so a crew asking for a ticket on somebody else's job gets a 404 rather
  // than a hidden button.
  const detail = await getLocateDetail(id);
  if (!detail) notFound();

  const pickers = staff ? await getLocatePickers() : { crews: [], users: [], projects: [] };

  return (
    <PageShell
      eyebrow="Intelligence"
      title={`Ticket ${detail.ticket.number}${detail.ticket.revision ? `-${detail.ticket.revision}` : ""}`}
      description={
        [detail.ticket.street, detail.ticket.city].filter(Boolean).join(" · ") ||
        "No street recorded on this ticket yet."
      }
    >
      <LocateDetail
        detail={detail as never}
        canManage={staff}
        crews={pickers.crews}
        users={pickers.users}
      />
    </PageShell>
  );
}
