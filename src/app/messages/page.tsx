import { redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth";
import { getConversation, getConversations, getMessageTargets } from "@/data/messages";
import { PageShell } from "@/components/common/page-shell";
import { MessagesView } from "@/components/messages/messages-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages · Vantara IQ" };

/**
 * The Communications Hub.
 *
 * `?c=<id>` selects a conversation, so a link from a task or a notification
 * lands on the right thread rather than on the inbox.
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const [conversations, targets] = await Promise.all([
    getConversations(),
    getMessageTargets(),
  ]);

  // Null covers both "nothing selected" and "selected something you may not
  // read" — the scope is enforced in the query, and a refusal looks the same
  // as an absence on purpose.
  const selected = sp.c ? await getConversation(sp.c) : null;

  return (
    <PageShell
      eyebrow="Operations"
      title="Messages"
      description="Keep every field, crew, project, and subcontractor conversation connected to the work."
    >
      <MessagesView
        conversations={conversations}
        initial={selected}
        targets={targets}
        canStart={isStaff(me.role)}
        meId={me.id}
      />
    </PageShell>
  );
}
