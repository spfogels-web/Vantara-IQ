import { redirect } from "next/navigation";

import {
  getTimesheets,
  getWorkforceEmployees,
  getWorkforceToday,
  getProjects,
} from "@/data/queries";
import { getCurrentUser } from "@/lib/auth";
import { notAuthorized } from "@/lib/authz";
import { requireWorkforceManager } from "@/lib/workforce-authz";
import { PageShell } from "@/components/common/page-shell";
import { WorkforceView } from "@/components/workforce/workforce-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workforce · Vantara IQ" };

/**
 * Who is working, who is on what, and what they filed.
 *
 * Management only, and the check is the redirect below rather than the
 * absence of a navigation link — an employee typing this address gets the
 * same answer as one who guesses it. Nothing here selects a rate, a margin or
 * an invoice figure; the queries were written not to read them, which is a
 * stronger promise than hiding them in the markup.
 */
export default async function WorkforcePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; employee?: string; project?: string; status?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  try {
    await requireWorkforceManager();
  } catch (e) {
    if (notAuthorized(e)) redirect("/");
    throw e;
  }

  const sp = await searchParams;
  const [today, employees, timesheets, projects] = await Promise.all([
    getWorkforceToday(),
    getWorkforceEmployees(),
    getTimesheets({
      from: sp.from,
      to: sp.to,
      employeeId: sp.employee,
      projectId: sp.project,
      status: sp.status,
    }),
    getProjects(),
  ]);

  return (
    <PageShell
      eyebrow="Network"
      title="Workforce"
      description="Who is on the clock, what they are working on, and the hours they have filed."
    >
      <WorkforceView
        today={today}
        employees={employees}
        timesheets={timesheets}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        initialTab={sp.tab === "employees" || sp.tab === "timesheets" ? sp.tab : "today"}
        filters={{
          from: sp.from ?? "",
          to: sp.to ?? "",
          employee: sp.employee ?? "",
          project: sp.project ?? "",
          status: sp.status ?? "",
        }}
      />
    </PageShell>
  );
}
