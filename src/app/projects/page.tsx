import Link from "next/link";
import { Plus } from "lucide-react";

import { getProjects } from "@/data/queries";
import { canManagePhotos, getCurrentUser } from "@/lib/auth";
import { formatFeet } from "@/lib/format";
import { PageShell, StatStrip } from "@/components/common/page-shell";
import { ProjectCard } from "@/components/projects/project-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects · Vantara IQ" };

export default async function ProjectsPage() {
  const [projects, me] = await Promise.all([getProjects(), getCurrentUser()]);
  const canManage = !!me && canManagePhotos(me.role);

  const remaining = projects.reduce((s, p) => s + p.remainingFt, 0);
  const atRisk = projects.filter((p) => p.tone === "critical" || p.tone === "warning").length;
  const avgHealth = Math.round(projects.reduce((s, p) => s + p.health, 0) / projects.length);
  const behind = projects.filter((p) => p.status === "Behind schedule").length;

  return (
    <PageShell
      eyebrow="Overview"
      title="Projects"
      description="Every active build with its own identity — health, pace, forecast and the intelligence behind each one."
      actions={
        <Link
          href="/projects/new"
          className="brand-gradient focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white"
        >
          <Plus className="size-4" /> New project
        </Link>
      }
    >
      <div className="flex flex-col gap-3">
        <StatStrip
          stats={[
            { label: "Active projects", value: String(projects.length) },
            { label: "Avg health", value: String(avgHealth) },
            { label: "At risk", value: String(atRisk), tone: atRisk ? "text-warning" : undefined },
            { label: "Behind schedule", value: String(behind), tone: behind ? "text-critical" : undefined },
            { label: "Feet remaining", value: formatFeet(remaining) },
          ]}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} canManage={canManage} />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
