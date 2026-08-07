import { redirect } from "next/navigation";

import { getCrewBadges } from "@/data/queries";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { PageShell } from "@/components/common/page-shell";
import { BadgeSection } from "@/components/subcontractors/badge-section";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yard badges · Vantara IQ" };

/**
 * A crew's own pickup list.
 *
 * Its own page rather than a panel buried under the company profile: this is
 * the thing that stops a driver at the gate, so it needs somewhere to point
 * somebody at, and somewhere the nav can flag as outstanding.
 *
 * Scoped to "yours" — the query needs no id from the URL, so there is nothing
 * to tamper with by editing one. Staff review badges from the Subcontractors
 * page, where they can see every crew.
 */
export default async function BadgesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (isStaff(me.role)) redirect("/subcontractors");
  if (!me.subcontractorId) redirect("/dailies");

  const badges = await getCrewBadges(me.subcontractorId);

  return (
    <PageShell
      eyebrow="Your company"
      title="Yard badges"
      description="Everyone who will collect material from the yard needs a badge. The yard has to match a face to a name, so each person needs both sides of their driving licence and one document proving the name on it."
    >
      <BadgeSection subcontractorId={me.subcontractorId} badges={badges} canReview={false} />
    </PageShell>
  );
}
