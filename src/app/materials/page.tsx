import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import {
  getCustodyBySubcontractor,
  getMaterialActivity,
  getMaterialInstances,
  getMaterialOverview,
  getVarianceReasons,
  getYards,
} from "@/data/materials-ops";
import { PageShell } from "@/components/common/page-shell";
import { MaterialsView } from "@/components/materials/materials-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Materials · Vantara IQ" };

export default async function MaterialsPage() {
  const me = await getCurrentUser();
  const staff = !!me && isStaff(me.role);

  const [rows, overview, activity, custody, reasons, yards, crews, projects] = await Promise.all([
    getMaterialInstances(),
    getMaterialOverview(),
    getMaterialActivity(),
    getCustodyBySubcontractor(),
    getVarianceReasons(),
    getYards(),
    // Only the office picks who material goes to.
    staff
      ? prisma.subcontractor.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } })
      : Promise.resolve([]),
    staff
      ? prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <PageShell
      eyebrow="Network"
      title="Materials"
      description="Track every reel, conduit, vault, handhole and hardware item from receiving through installation, return and reconciliation."
    >
      <MaterialsView
        rows={rows}
        overview={overview}
        activity={activity}
        custody={custody}
        reasons={reasons}
        yards={yards}
        crews={crews}
        projects={projects}
        canManage={staff}
      />
    </PageShell>
  );
}
