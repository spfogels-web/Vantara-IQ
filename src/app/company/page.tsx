import { redirect } from "next/navigation";

import { getVendorPacket } from "@/data/queries";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/common/page-shell";
import { VendorPacketForm } from "@/components/subcontractors/vendor-packet-form";

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

  const packet = await getVendorPacket(me.subcontractorId);
  if (!packet) redirect("/dailies");

  return (
    <PageShell
      eyebrow="Your company"
      title="Company profile"
      description="What Fortitude needs on file before your crew can be assigned work. Everything saves together — fill in what you can and come back for the rest."
    >
      <VendorPacketForm packet={packet} />
    </PageShell>
  );
}
