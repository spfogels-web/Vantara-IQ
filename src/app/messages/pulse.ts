"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * Has anything arrived?
 *
 * The messages page is server-rendered, so a reply landing by SMS sat in the
 * database until somebody reloaded. A crew answering "ok I'll do it" and the
 * office not seeing it for an hour is the failure that makes people go back to
 * their own phones, which is the thing this hub exists to stop.
 *
 * Polling rather than a socket, deliberately. This runs on serverless
 * functions, where a long-lived connection is either impossible or expensive
 * and always fragile; a small query every few seconds is neither.
 *
 * So this is built to be cheap enough to call often: one indexed query for the
 * newest message this person can see, and nothing else. It returns a stamp,
 * not the messages — the client compares it to what it last saw and only asks
 * for a re-render when it actually moved. A poll that re-rendered the page
 * every time would be worse than the reload it replaced.
 */
export async function messagesPulse(): Promise<{ stamp: string }> {
  const me = await getCurrentUser();
  if (!me) return { stamp: "" };

  // Only conversations this person holds a seat in. The same rule the page
  // itself applies, so the pulse can never hint at a thread they cannot open.
  const latest = await prisma.message.findFirst({
    where: {
      conversation: {
        archivedAt: null,
        participants: { some: { userId: me.id, leftAt: null } },
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  // The id travels with the time because two messages can land in the same
  // second and a stamp that only carried seconds would miss the second one.
  return { stamp: latest ? `${latest.createdAt.getTime()}:${latest.id}` : "" };
}
