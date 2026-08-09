import { redirect } from "next/navigation";

import { getCrewBadges, getDocuments, getVendorPacket } from "@/data/queries";
import { getAchAuthorization, listSubDocuments } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { FileUp } from "lucide-react";

import { PageShell } from "@/components/common/page-shell";
import { VendorPacketForm } from "@/components/subcontractors/vendor-packet-form";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentCenter } from "@/components/subcontractors/document-center";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
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

  const [packet, docs, badges, ach, myDocs] = await Promise.all([
    getVendorPacket(me.subcontractorId),
    getDocuments(),
    getCrewBadges(me.subcontractorId),
    getAchAuthorization(me.subcontractorId),
    listSubDocuments(me.subcontractorId),
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

        {/* The same slots they filled during onboarding, still open afterwards.
            A COI expires every year, an agreement gets re-signed, a W-9 changes
            when the entity does — so this is not a one-time gate, and a crew
            with a newer certificate needs somewhere to put it without ringing
            the office. Uploading again adds a copy rather than replacing one:
            the old certificate is what was true for the work done under it. */}
        <Panel>
          <PanelHeader
            title="Upload or update a document"
            description="Send a new certificate, a re-signed agreement, or anything Fortitude has asked for"
            icon={<FileUp className="size-3.5" />}
          />
          <PanelBody>
            {/* No delete. Removing a document is staff-only on the server, so
                the button could only ever fail — and a crew unpicking their own
                compliance record after it has been reviewed is not something to
                offer anyway. Uploading again supersedes it. */}
            <DocumentCenter
              subcontractorId={me.subcontractorId}
              initialDocs={myDocs}
              canDelete={false}
            />
          </PanelBody>
        </Panel>

        {/* Who can collect material. A crew clears nobody themselves — they
            put the documents up and Fortitude decides. */}
        <BadgeSection
          subcontractorId={me.subcontractorId}
          badges={badges}
          canReview={false}
        />

        {/* How they get paid. Above the general packet because it is the
            thing a crew chases, and it is the thing that holds up a payment. */}
        <AchForm subcontractorId={me.subcontractorId} existing={ach} existingProof={ach?.proofFileName} />

        <VendorPacketForm packet={packet} />
      </div>
    </PageShell>
  );
}
