import { notFound, redirect } from "next/navigation";

import { getTimesheetDetail } from "@/data/queries";
import { getCurrentUser } from "@/lib/auth";
import { notAuthorized } from "@/lib/authz";
import { assertCanViewTimeEntry } from "@/lib/workforce-authz";
import { PageShell } from "@/components/common/page-shell";
import { TimesheetDetailView } from "@/components/workforce/timesheet-detail-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timesheet · Vantara IQ" };

/**
 * One shift, in full.
 *
 * Authorization happens before anything is read, and by looking the entry up
 * rather than trusting the id in the address: assertCanViewTimeEntry answers
 * "is this yours, or do you manage" from the database. A missing entry and
 * somebody else's entry give the same answer on purpose, so a probe cannot
 * learn which timecards exist.
 */
export default async function TimesheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const { id } = await params;

  try {
    await assertCanViewTimeEntry(id);
  } catch (e) {
    if (notAuthorized(e)) notFound();
    throw e;
  }

  const sheet = await getTimesheetDetail(id);
  if (!sheet) notFound();

  return (
    <PageShell
      eyebrow="Workforce"
      title={`${sheet.employeeName} — ${sheet.workDate}`}
      description="Hours filed, and every position the device reported during the shift."
    >
      {/* The control is rendered for an administrator only — and the action
          behind it checks again, because a rendered button is not a
          permission. */}
      <TimesheetDetailView sheet={sheet} canCorrect={me.role === "ADMIN"} />
    </PageShell>
  );
}
