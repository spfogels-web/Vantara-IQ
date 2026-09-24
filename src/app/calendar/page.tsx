import { redirect } from "next/navigation";

import { getCalendarItems, getProjects, getSubcontractors } from "@/data/queries";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { PageShell } from "@/components/common/page-shell";
import { CalendarView } from "@/components/calendar/calendar-view";
import { todayET } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar · Vantara IQ" };

/** The first and last day of the month a YYYY-MM-DD falls in, plus a margin. */
function monthWindow(day: string): { from: string; to: string } {
  const d = new Date(`${day}T00:00:00Z`);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  // A month grid shows the tail of the previous month and the head of the
  // next, so the query has to cover them or those cells render empty.
  first.setUTCDate(first.getUTCDate() - 7);
  last.setUTCDate(last.getUTCDate() + 7);
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/**
 * Everything dated, in one place.
 *
 * Staff only — and the redirect is the whole enforcement, not a hidden nav
 * item. A crew has no business seeing when another company mobilises, what a
 * customer owes, or when the office is meeting.
 *
 * Most of what shows here is read from the records that already hold it:
 * locates carry their expiry, invoices their due date, tasks their deadline.
 * Only what nobody else knows — a mobilisation, a walk, a delivery, a meeting
 * — lives in this page's own table.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dailies");

  const sp = await searchParams;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayET();
  const { from, to } = monthWindow(anchor);

  const [items, projects, crews] = await Promise.all([
    getCalendarItems(from, to),
    getProjects(),
    getSubcontractors(),
  ]);

  return (
    <PageShell
      eyebrow="Overview"
      title="Calendar"
      description="All project activity, deadlines, and operational events in one place."
    >
      <CalendarView
        items={items}
        anchor={anchor}
        today={todayET()}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        crews={crews.map((c) => ({ id: c.id, company: c.company }))}
      />
    </PageShell>
  );
}
