import { redirect } from "next/navigation";

import { getTasks, getTaskAssignees } from "@/data/queries";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { PageShell } from "@/components/common/page-shell";
import { TasksView } from "@/components/tasks/tasks-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks · Vantara IQ" };

/**
 * Work assigned to a person or a crew.
 *
 * One page for both audiences, scoped by the query rather than by the route:
 * staff see everything, a crew sees only what is on them. The assignee list is
 * loaded for staff alone — a crew is never choosing who a task goes to, and it
 * would name every employee and every other crew.
 */
export default async function TasksPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const staff = isStaff(me.role);
  const [tasks, assignees] = await Promise.all([
    getTasks(),
    staff ? getTaskAssignees() : Promise.resolve(null),
  ]);

  return (
    <PageShell
      eyebrow={staff ? "Network" : "My work"}
      title="Tasks"
      description={
        staff
          ? "Anything that needs chasing, assigned to an employee or a crew — with a photo of the problem and proof it was fixed."
          : "Work Fortitude has assigned to your crew. Photograph what you find and what you did, and it stays on the record."
      }
    >
      <TasksView tasks={tasks} assignees={assignees} canManage={staff} />
    </PageShell>
  );
}
