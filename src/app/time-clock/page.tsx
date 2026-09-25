import { redirect } from "next/navigation";

import { getMyTimeClock } from "@/data/queries";
import { getCurrentUser } from "@/lib/auth";
import { TimeClockView } from "@/components/workforce/time-clock-view";
import { authorizedProjectsForEmployee, employeeForSession } from "@/lib/workforce-authz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Time Clock · Vantara IQ" };

/**
 * Where a field employee starts and ends their day.
 *
 * Deliberately not part of the management shell. An employee is not staff and
 * has no business being handed a navigation rail full of screens they may not
 * open — the middleware would refuse them, but offering a door and then
 * closing it is worse than not offering it.
 *
 * Everything here is this person's own. The employee is resolved from the
 * session; no id reaches this page from the client.
 */
export default async function TimeClockPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const employee = await employeeForSession();
  // Staff have no time clock of their own, and an account that is not set up
  // as an employee should be told so rather than shown an empty one.
  if (!employee) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="text-[20px] font-semibold text-foreground">Time Clock</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          This account is not set up as an employee, so there is no clock to
          start. Ask the office to add you to Workforce.
        </p>
      </main>
    );
  }

  const [clock, projects] = await Promise.all([
    getMyTimeClock(),
    authorizedProjectsForEmployee(employee.employeeId),
  ]);

  return (
    <TimeClockView
      employeeName={clock?.employeeName ?? employee.name}
      open={clock?.open ?? null}
      recent={clock?.recent ?? []}
      projects={projects}
    />
  );
}
