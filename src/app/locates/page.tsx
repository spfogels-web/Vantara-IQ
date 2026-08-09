import { getLocateSummary, getLocateTickets, getProjects } from "@/data/queries";
import { locateChatReady } from "@/lib/locate-chat";
import { PageShell } from "@/components/common/page-shell";
import { LocatesView } from "@/components/locates/locates-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locates · Vantara IQ" };

/**
 * Locate intelligence.
 *
 * The tickets, the clock on each one, and a way to ask the board questions.
 * Everything here is staff-only: a locate is a legal position about whether it
 * is safe to break ground, and it is not something to expose to a crew as a
 * summary they might act on without the dates behind it.
 */
export default async function LocatesPage() {
  const [tickets, summary, projects] = await Promise.all([
    getLocateTickets(),
    getLocateSummary(),
    getProjects(),
  ]);

  return (
    <PageShell
      eyebrow="Intelligence"
      title="Locates"
      description="Every 811 ticket with its clock — what is in force, what needs updating, and what has run out."
    >
      <LocatesView
        tickets={tickets}
        summary={summary}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        chatReady={locateChatReady()}
      />
    </PageShell>
  );
}
