import { notFound, redirect } from "next/navigation";

import { getTimesheetDetail } from "@/data/queries";
import { getCurrentUser } from "@/lib/auth";
import { notAuthorized } from "@/lib/authz";
import { assertCanViewTimeEntry } from "@/lib/workforce-authz";
import { TimesheetDetailView } from "@/components/workforce/timesheet-detail-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "My shift · Vantara IQ" };

/**
 * An employee's own shift, on an employee's own route.
 *
 * Deliberately not a redirect into /workforce/timesheets/[id]. That address
 * is management's, and an employee is refused it at the middleware before any
 * page runs — which is the right boundary and should stay that way. Sharing
 * the *component* is fine and is what happens here; sharing the route would
 * mean opening a manager path to a non-manager to save a file.
 *
 * The authorization is the same function either way, and it decides from the
 * database: assertCanViewTimeEntry allows the entry's own employee, or an
 * administrator, and nobody else. Somebody pasting a colleague's id here gets
 * the same not-found as somebody pasting one that never existed.
 */
export default async function MyShiftPage({ params }: { params: Promise<{ id: string }> }) {
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
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <p className="text-[12px] text-muted-foreground">{sheet.workDate}</p>
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">
        {sheet.projectName || "My shift"}
      </h1>
      <div className="mt-4">
        <TimesheetDetailView sheet={sheet} />
      </div>
    </main>
  );
}
