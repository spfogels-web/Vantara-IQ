import { redirect } from "next/navigation";

import { getMyTimesheets } from "@/data/queries";
import { getCurrentUser } from "@/lib/auth";
import { employeeForSession } from "@/lib/workforce-authz";
import { MyTimesheetsView } from "@/components/workforce/my-timesheets-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "My timesheets · Vantara IQ" };

/**
 * An employee's own hours, from the same records the office reads.
 *
 * getMyTimesheets takes its employee from the session and calls the same
 * query the manager's list uses, so there is one set of numbers rather than
 * an employee-facing copy that could quietly disagree about a day's hours or
 * a shift's coverage.
 */
export default async function MyTimesheetsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const employee = await employeeForSession();
  if (!employee) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="text-[20px] font-semibold text-foreground">My timesheets</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          This account is not set up as an employee, so there are no hours to
          show. Ask the office to add you to Workforce.
        </p>
      </main>
    );
  }

  const rows = await getMyTimesheets();
  return <MyTimesheetsView name={employee.name} rows={rows} />;
}
