import Link from "next/link";
import { FileText } from "lucide-react";

import {
  getDailies,
  getDailyThumbnails,
  getProjects,
  getSheetIndexByDaily,
  getSubcontractors,
} from "@/data/queries";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { PageShell } from "@/components/common/page-shell";
import { DailiesView } from "@/components/dailies/dailies-view";
import { ImportDaily } from "@/components/dailies/import-daily";
import { orgName } from "@/lib/org-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dailies · Vantara IQ" };

export default async function DailiesPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string; status?: string }>;
}) {
  const [dailies, sheetByDaily, me, sp, t] = await Promise.all([
    getDailies(),
    getSheetIndexByDaily(),
    getCurrentUser(),
    searchParams,
    getT(),
  ]);

  const staff = !!me && isStaff(me.role);

  /**
   * A few photographs per daily, for the table.
   *
   * One query for the whole page, keyed by the sheet each daily came from.
   * Dailies filed before evidence records existed simply have none, and
   * those rows fall back to the count they always showed.
   */
  const thumbs = await getDailyThumbnails(
    Object.values(sheetByDaily).map((x) => x.sheetId),
  );

  // Only fetched for the importer, which is staff-only — a crew has no use for
  // the full job list or the roster of other companies.
  const [projects, crews] = staff
    ? await Promise.all([getProjects(), getSubcontractors()])
    : [[], []];

  // The Globe billing sheet is the only way work gets filed — it is the form
  // Globe pays against. The thin "New daily" alongside it collected a different,
  // smaller set of fields and was a second answer to the same question, so the
  // sheet takes the primary action.
  return (
    <PageShell
      eyebrow={t("Overview")}
      title={t("Daily production")}
      description={
        staff
          ? t(
              "Every crew's daily production, digitized from the field. Review quantities, documentation, production and billing from one workspace.",
            )
          : t("The days your crew has filed, and where each one stands with {company}.").replace(
              "{company}",
              await orgName(),
            )
      }
      actions={
        <Link
          href="/dailies/sheet"
          className="brand-gradient focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white"
        >
          <FileText className="size-4" /> {t("Billing sheet")}
        </Link>
      }
    >
      {/* Reading a sheet a crew emailed in. Staff only: it writes a draft
          against a chosen job and can attribute it to any crew, which is the
          office’s call, not a crew’s. */}
      {staff && projects.length > 0 ? (
        <div className="mb-4">
          {/* Folded away while there is a queue. Reading somebody's emailed
              sheet is the second job on this screen; deciding the days already
              filed is the first, and the importer was sitting above them. */}
          <ImportDaily
            projects={projects.map((p) => ({ id: p.id, name: p.name, number: p.number }))}
            crews={crews.map((c) => ({ id: c.id, company: c.company }))}
            // Folded away always, now that the queue is the page. Reading
            // somebody's emailed sheet is the second job here; the first is
            // deciding the days already filed, and an open dropzone pushed
            // them below the fold on a laptop.
            startOpen={false}
          />
        </div>
      ) : null}

      <DailiesView
        dailies={dailies}
        initialId={sp.sheet}
        sheetByDaily={sheetByDaily}
        thumbs={thumbs}
        reviewerName={me?.name}
        canReview={staff}
      />
    </PageShell>
  );
}
