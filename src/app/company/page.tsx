import { redirect } from "next/navigation";

import { getCrewBadges, getDocuments, getVendorPacket } from "@/data/queries";
import { getAchAuthorization, listCrewContacts, listCrewLogins, listSubDocuments } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClipboardList, FileUp } from "lucide-react";

import { PageShell } from "@/components/common/page-shell";
import { VendorPacketForm } from "@/components/subcontractors/vendor-packet-form";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentCenter } from "@/components/subcontractors/document-center";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { AchForm } from "@/components/subcontractors/ach-form";
import { BadgeSection } from "@/components/subcontractors/badge-section";
import { orgSettings } from "@/lib/org-settings";

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
  // The company this crew is actually doing business with.
  const settings = await orgSettings();
  const company = settings.legalName || "the office";
  const supportPhone = settings.supportPhone;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.subcontractorId) redirect("/subcontractors");

  const [packet, docs, badges, ach, myDocs, people, logins] = await Promise.all([
    getVendorPacket(me.subcontractorId),
    getDocuments(),
    getCrewBadges(me.subcontractorId),
    getAchAuthorization(me.subcontractorId),
    listSubDocuments(me.subcontractorId),
    listCrewContacts(me.subcontractorId),
    listCrewLogins(me.subcontractorId),
  ]);
  if (!packet) redirect("/dailies");

  /**
   * Whether this person sees the company's own paperwork.
   *
   * The rule used to be a single per-crew flag that defaulted to off, for a
   * good reason: a foreman entering dailies must not be shown the EIN, the
   * bank details, the signatory or what may be the owner's home address.
   *
   * But it locked out the owner as well, and the packet is *theirs to fill
   * in*. The Subcontractors page tells the office, in so many words, that
   * "the crew fills these in themselves under Company in their own portal" —
   * and until somebody found and flipped a toggle, that was not true. A crew
   * who skipped the packet during onboarding had no way back to it except a
   * phone call.
   *
   * So the question is now who is signed in rather than what a flag says.
   * SubUserRole already draws this line: OWNER "signed the subcontract" and
   * ADMIN "runs the office for them — invoicing, packet, documents". Those
   * two are the packet's owners and always see it. Everybody else — PM,
   * FOREMAN, SUPERVISOR — still sees nothing unless the office has opened it
   * for that crew, which is exactly what the flag was written to do.
   *
   * The onboarding account takes SubUserRole's default of OWNER, so the
   * person who registered the company can always finish what they started.
   */
  const [crew, viewer] = await Promise.all([
    prisma.subcontractor.findUnique({
      where: { id: me.subcontractorId },
      select: { showOwnerDetailsToCrew: true },
    }),
    prisma.user.findUnique({
      where: { id: me.id },
      select: { subUserRole: true },
    }),
  ]);
  const runsTheOffice = viewer?.subUserRole === "OWNER" || viewer?.subUserRole === "ADMIN";
  const showOwnerDetails = runsTheOffice || Boolean(crew?.showOwnerDetailsToCrew);

  /**
   * What the office is still waiting on, in the crew's own words.
   *
   * The same fields the Subcontractors page lists as outstanding, so the two
   * screens cannot disagree about what is missing. Shown only to whoever can
   * actually do something about it.
   */
  const outstanding = showOwnerDetails
    ? (
        [
          [packet.legalName, "Legal business name"],
          [packet.entityType, "Entity type"],
          [packet.ein, "EIN"],
          [packet.addressLine1, "Street address"],
          [packet.city, "City"],
          [packet.stateRegion, "State"],
          [packet.postalCode, "ZIP"],
          [packet.signatoryName, "Authorised signatory"],
          [packet.paymentMethod, "Payment method"],
          [packet.remittanceEmail, "Remittance email"],
          [packet.billingContactName, "Billing contact"],
          [packet.billingEmail, "Billing contact email"],
        ] as const
      )
        .filter(([value]) => !String(value ?? "").trim())
        .map(([, label]) => label)
    : [];

  return (
    <PageShell
      eyebrow="Your company"
      title="Company profile"
      description={`What ${company} needs on file before your crew can be assigned work. Everything saves together — fill in what you can and come back for the rest.`}
    >
      <div className="flex flex-col gap-3">
        {/* Said first and plainly, because somebody who skipped the packet
            during onboarding has no other way of knowing the office is still
            waiting on them. It names the fields rather than saying
            "incomplete", so the work is obvious before they scroll. */}
        {outstanding.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning/[0.07] px-3.5 py-3">
            <ClipboardList className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-warning">
                {company} is still waiting on your company details
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {outstanding.join(", ")}.
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                Fill them in on the form further down this page. You can save what
                you have and come back for the rest.
              </p>
            </div>
          </div>
        ) : null}

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
            description={`Send a new certificate, a re-signed agreement, or anything ${company} has asked for`}
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

        {/* How they get paid, and the owner's own paperwork. Both hidden
            unless the office has opened them for this crew. */}
        {showOwnerDetails ? (
          <>
            <AchForm
              subcontractorId={me.subcontractorId}
              existing={ach}
              existingProof={ach?.proofFileName}
            />
            <VendorPacketForm packet={packet} people={people} logins={logins} />
          </>
        ) : (
          <Panel>
            <PanelBody>
              <p className="text-[13px] font-semibold text-foreground">
                Company details and banking are hidden
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Your EIN, bank details, signatory and addresses are on file with{" "}
                {company} and are not shown on this login — it is used in the field,
                and none of that needs to be on a phone in a truck. Documents and
                badges above still work.
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Whoever owns the company, or runs its office, sees and edits all of
                it from their own login. If nobody has one yet, call the office
                {supportPhone ? ` on ${supportPhone}` : ""} and we&rsquo;ll set it up.
              </p>
            </PanelBody>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
