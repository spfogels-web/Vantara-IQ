import Link from "next/link";
import { ChevronRight, FileText, Map as MapIcon, Users } from "lucide-react";

import { getProjects } from "@/data/queries";
import { toneStyles } from "@/lib/tone";
import { projectImageSrc as cover } from "@/lib/project-image";
import { PageShell } from "@/components/common/page-shell";
import { DailyBillingSheet } from "@/components/dailies/daily-billing-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily billing sheet · Vantara IQ" };

export default async function DailyBillingSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ blank?: string }>;
}) {
  const sp = await searchParams;

  // Escape hatch: a sheet with no job behind it, for work booked after the fact.
  if (sp.blank) {
    return (
      <PageShell
        eyebrow="Dailies"
        title="Subcontractor daily billing sheet"
        description="Blank sheet — nothing prefilled. Pick a project instead if you want the job numbers and map filled in for you."
      >
        <DailyBillingSheet />
      </PageShell>
    );
  }

  const projects = await getProjects();

  return (
    <PageShell
      eyebrow="Dailies"
      title="Pick your job"
      description="Choose the project you worked today. The sheet opens with its work order and job numbers already filled in, and its map ready to redline."
      actions={
        <Link
          href="/dailies/sheet?blank=1"
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-[12.5px] font-semibold text-foreground hover:bg-foreground/[0.04]"
        >
          <FileText className="size-4" /> Blank sheet
        </Link>
      }
    >
      {projects.length === 0 ? (
        <div className="surface grid place-items-center px-6 py-14 text-center">
          <p className="text-[13px] text-muted-foreground">
            No projects assigned yet.{" "}
            <Link href="/projects" className="text-brand-bright underline">
              Create one
            </Link>{" "}
            and it will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const tone = toneStyles[p.tone];
            return (
              <Link
                key={p.id}
                href={`/dailies/sheet/${p.id}`}
                className="focus-ring group surface flex flex-col overflow-hidden transition hover:border-brand/40"
              >
                {/* Same cover the project carries everywhere else — a crew
                    picks their job by recognising it, and an aerial does that
                    faster than a row of job numbers that all start 704. */}
                {cover(p) || p.hasMap ? (
                  <div className="relative h-36 shrink-0 overflow-hidden border-b border-border bg-foreground/[0.04]">
                    {cover(p) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover(p)!}
                        alt=""
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-muted-foreground">
                        <MapIcon className="size-5" />
                      </span>
                    )}
                    {p.hasMap ? (
                      <span className="absolute right-2 top-2 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                        Map attached
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-1 flex-col gap-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="num text-[11px] font-semibold tracking-wide text-brand-bright">
                        {p.number || "No job number"}
                      </p>
                      <p className="truncate text-[14px] font-semibold text-foreground">{p.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {p.client} · {p.location}
                      </p>
                    </div>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <Users className="size-3.5" /> {p.crew}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${tone.border} ${tone.bg} ${tone.text}`}
                    >
                      <span className={`size-1.5 rounded-full ${tone.dot}`} />
                      {p.status}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
