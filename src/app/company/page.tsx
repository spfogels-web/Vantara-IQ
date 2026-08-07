import { redirect } from "next/navigation";

import { getCrewBadges, getDocuments, getVendorPacket } from "@/data/queries";
import { getAchAuthorization } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/common/page-shell";
import { VendorPacketForm } from "@/components/subcontractors/vendor-packet-form";
import { DocumentList } from "@/components/documents/document-list";
import { AchForm } from "@/components/subcontractors/ach-form";
import { BadgeSection } from "@/components/subcontractors/badge-section";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company profile · Vantara IQ" };

/**
 * A crew's own vendor packet.
 *
 * Staff have no business here — they review packets from the Subcontractors
 * page, where they can see every crew. This page is deliberately scoped to
 * "yours", so the query needs no id from the URL and there is nothing to tamper
 * with by editing one.
 */
export default async function CompanyProfilePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.subcontractorId) redirect("/subcontractors");

  const [packet, docs, badges, ach] = await Promise.all([
    getVendorPacket(me.subcontractorId),
    getDocuments(),
    getCrewBadges(me.subcontractorId),
    getAchAuthorization(me.subcontractorId),
  ]);
  if (!packet) redirect("/dailies");

  return (
    <PageShell
      eyebrow="Your company"
      title="Company profile"
      description="What Fortitude needs on file before your crew can be assigned work. Everything saves together — fill in what you can and come back for the rest."
    >
      <div className="flex flex-col gap-3">
        {/* Their paperwork, above the form. A crew opening this page is usually
            looking for their signed rates or their agreement, not to re-edit
            their EIN — so the thing they came for goes first. */}
        <DocumentList docs={docs} />

        {/* Who can collect material. A crew clears nobody themselves — they
            put the documents up and Fortitude decides. */}
        <BadgeSection
          subcontractorId={me.subcontractorId}
          badges={badges}
          canReview={false}
        />

        {/* How they get paid. Above the general packet because it is the
            thing a crew chases, and it is the thing that holds up a payment. */}
        <AchForm subcontractorId={me.subcontractorId} existing={ach} />

        <VendorPacketForm packet={packet} />
      </div>
    </PageShell>
  );
}
