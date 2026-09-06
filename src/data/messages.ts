import "server-only";

import { prisma } from "@/lib/prisma";
import { isStaff, type SessionRole } from "@/lib/auth";
import { requireUser, viewer } from "@/lib/authz";
import { smsDisabledReason, smsEnabled } from "@/lib/sms-provider";

/**
 * Reading conversations, scoped to who is asking.
 *
 * The rule is a seat: you see a conversation because you are in it, or because
 * it belongs to your company. Staff see the office's threads. A crew sees
 * their own and nobody else's — what one subcontractor is told is not
 * something another gets to read, and that is the same reason rates are scoped.
 *
 * Enforced here rather than in the page, because a page is a suggestion and a
 * query is the answer.
 */

export interface ConversationRow {
  id: string;
  type: string;
  title: string;
  subject: string;
  projectId: string | null;
  projectName: string;
  subcontractorId: string | null;
  subcontractorName: string;
  taskId: string | null;
  taskTitle: string;
  lastMessageAt: string;
  /** The last thing said, for the list. */
  preview: string;
  previewKind: string;
  unread: number;
  participantCount: number;
  /** Whether anything in this thread has ever gone by text. */
  usedSms: boolean;
}

/**
 * The where-clause that decides what somebody may read.
 *
 * One definition, used by the list, the thread and every action, so a hole
 * cannot open in one of them.
 */
export async function conversationScope(user: {
  id: string;
  role: SessionRole;
  subcontractorId: string | null;
}) {
  if (isStaff(user.role)) {
    // Staff see the organisation's conversations. Not a free-for-all across
    // companies — every thread here is Fortitude's own correspondence.
    return {};
  }
  if (!user.subcontractorId) {
    // An account attached to no company sees only what it personally sits in.
    return { participants: { some: { userId: user.id, leftAt: null } } };
  }
  return {
    OR: [
      { participants: { some: { userId: user.id, leftAt: null } } },
      { participants: { some: { subcontractorId: user.subcontractorId, leftAt: null } } },
      { subcontractorId: user.subcontractorId },
    ],
  };
}

export async function getConversations(opts?: {
  take?: number;
  cursor?: string;
}): Promise<ConversationRow[]> {
  const user = await requireUser();
  const scope = await conversationScope(user);

  const rows = await prisma.conversation.findMany({
    where: { archivedAt: null, ...scope },
    orderBy: { lastMessageAt: "desc" },
    // Paged. The office will have thousands of these and the inbox needs the
    // first page, not the history.
    take: Math.min(opts?.take ?? 40, 100),
    ...(opts?.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    select: {
      id: true,
      type: true,
      title: true,
      subject: true,
      projectId: true,
      subcontractorId: true,
      taskId: true,
      lastMessageAt: true,
      project: { select: { name: true } },
      subcontractor: { select: { company: true } },
      task: { select: { title: true } },
      _count: { select: { participants: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, kind: true, senderName: true },
      },
      participants: {
        where: { userId: user.id },
        select: { lastReadAt: true },
      },
    },
  });

  // Unread per conversation, in one query rather than one per row.
  const ids = rows.map((r) => r.id);
  const unreadCounts = new Map<string, number>();
  if (ids.length) {
    for (const r of rows) {
      const since = r.participants[0]?.lastReadAt ?? null;
      const n = await prisma.message.count({
        where: {
          conversationId: r.id,
          kind: { not: "SYSTEM" },
          ...(since ? { createdAt: { gt: since } } : {}),
          // Your own words are not unread to you.
          NOT: { senderUserId: user.id },
        },
      });
      unreadCounts.set(r.id, n);
    }
  }

  const smsUsed = new Set(
    (
      await prisma.messageDelivery.findMany({
        where: { channel: "SMS", message: { conversationId: { in: ids } } },
        select: { message: { select: { conversationId: true } } },
        take: 500,
      })
    ).map((d) => d.message.conversationId),
  );

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    subject: r.subject,
    projectId: r.projectId,
    projectName: r.project?.name ?? "",
    subcontractorId: r.subcontractorId,
    subcontractorName: r.subcontractor?.company ?? "",
    taskId: r.taskId,
    taskTitle: r.task?.title ?? "",
    lastMessageAt: r.lastMessageAt.toISOString(),
    preview: r.messages[0]?.body ?? "",
    previewKind: r.messages[0]?.kind ?? "USER",
    unread: unreadCounts.get(r.id) ?? 0,
    participantCount: r._count.participants,
    usedSms: smsUsed.has(r.id),
  }));
}

export interface ThreadMessage {
  id: string;
  body: string;
  kind: string;
  direction: string;
  senderName: string;
  senderUserId: string | null;
  createdAt: string;
  mine: boolean;
  attachments: { id: string; url: string; name: string; contentType: string }[];
  /** How it travelled, summarised — never the provider's own words. */
  delivery: { channel: string; status: string; error: string }[];
}

export interface ConversationDetail {
  id: string;
  type: string;
  title: string;
  subject: string;
  projectId: string | null;
  projectName: string;
  subcontractorId: string | null;
  subcontractorName: string;
  taskId: string | null;
  taskTitle: string;
  participants: { name: string; kind: string; phone: boolean }[];
  messages: ThreadMessage[];
  /** True when there is more history above what was returned. */
  hasMore: boolean;
  smsAvailable: boolean;
  smsNote: string | null;
}

export async function getConversation(
  id: string,
  opts?: { take?: number; before?: string },
): Promise<ConversationDetail | null> {
  const user = await requireUser();
  const scope = await conversationScope(user);

  const c = await prisma.conversation.findFirst({
    where: { id, ...scope },
    select: {
      id: true,
      type: true,
      title: true,
      subject: true,
      projectId: true,
      subcontractorId: true,
      taskId: true,
      project: { select: { name: true } },
      subcontractor: { select: { company: true } },
      task: { select: { title: true } },
      participants: {
        where: { leftAt: null },
        select: {
          user: { select: { name: true, email: true, phone: true } },
          contact: { select: { name: true, phoneE164: true } },
          subcontractor: { select: { company: true } },
        },
      },
    },
  });
  if (!c) return null;

  const take = Math.min(opts?.take ?? 50, 200);
  const rows = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(opts?.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    select: {
      id: true,
      body: true,
      kind: true,
      direction: true,
      senderName: true,
      senderUserId: true,
      createdAt: true,
      attachments: { select: { id: true, url: true, name: true, contentType: true } },
      deliveries: { select: { channel: true, status: true, errorMessage: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = (hasMore ? rows.slice(0, take) : rows).reverse();

  return {
    id: c.id,
    type: c.type,
    title: c.title,
    subject: c.subject,
    projectId: c.projectId,
    projectName: c.project?.name ?? "",
    subcontractorId: c.subcontractorId,
    subcontractorName: c.subcontractor?.company ?? "",
    taskId: c.taskId,
    taskTitle: c.task?.title ?? "",
    participants: c.participants.map((p) => ({
      name:
        p.user?.name || p.user?.email || p.contact?.name || p.contact?.phoneE164 ||
        p.subcontractor?.company || "—",
      kind: p.user ? "employee" : p.contact ? "contact" : "crew",
      phone: Boolean(p.user?.phone || p.contact?.phoneE164),
    })),
    messages: page.map((m) => ({
      id: m.id,
      body: m.body,
      kind: m.kind,
      direction: m.direction,
      senderName: m.senderName,
      senderUserId: m.senderUserId,
      createdAt: m.createdAt.toISOString(),
      mine: m.senderUserId === user.id,
      attachments: m.attachments,
      // Collapsed to what a reader needs: which channels, what happened.
      // Provider ids and raw codes stay in ConversationEvent.
      delivery: [
        ...new Map(
          m.deliveries.map((d) => [
            `${d.channel}:${d.status}`,
            { channel: d.channel, status: d.status, error: d.errorMessage },
          ]),
        ).values(),
      ],
    })),
    hasMore,
    smsAvailable: smsEnabled(),
    smsNote: smsDisabledReason(),
  };
}

/** Unread across everything the viewer may see — for the sidebar badge. */
export async function getUnreadMessageCount(): Promise<number> {
  const user = await viewer();
  if (!user) return 0;
  const scope = await conversationScope(user);

  const seats = await prisma.conversationParticipant.findMany({
    where: { userId: user.id, leftAt: null, conversation: { archivedAt: null, ...scope } },
    select: { conversationId: true, lastReadAt: true },
    take: 200,
  });
  if (seats.length === 0) return 0;

  // One count over the union rather than one per conversation.
  return prisma.message.count({
    where: {
      kind: { not: "SYSTEM" },
      NOT: { senderUserId: user.id },
      OR: seats.map((s) => ({
        conversationId: s.conversationId,
        ...(s.lastReadAt ? { createdAt: { gt: s.lastReadAt } } : {}),
      })),
    },
  });
}

/**
 * The last few messages about a task, for the task card.
 *
 * A summary and a way in, never the whole thread — the task page is not a
 * second inbox.
 */
export async function getTaskCommunication(taskId: string, take = 4) {
  const user = await requireUser();
  const scope = await conversationScope(user);

  const convo = await prisma.conversation.findFirst({
    where: { taskId, archivedAt: null, ...scope },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          body: true,
          kind: true,
          senderName: true,
          createdAt: true,
          deliveries: { select: { channel: true, status: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });
  if (!convo) return null;

  return {
    conversationId: convo.id,
    total: convo._count.messages,
    messages: convo.messages.reverse().map((m) => ({
      id: m.id,
      body: m.body,
      kind: m.kind,
      senderName: m.senderName,
      createdAt: m.createdAt.toISOString(),
      viaSms: m.deliveries.some((d) => d.channel === "SMS" && d.status !== "SKIPPED"),
    })),
  };
}

/** Who a new conversation can be started with. Staff only. */
export async function getMessageTargets() {
  const user = await requireUser();
  if (!isStaff(user.role)) return { employees: [], crews: [], projects: [] };

  const [employees, crews, projects] = await Promise.all([
    prisma.user.findMany({
      where: { subcontractorId: null, NOT: { id: user.id } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.subcontractor.findMany({
      select: { id: true, company: true },
      orderBy: { company: "asc" },
    }),
    prisma.project.findMany({
      select: { id: true, name: true, number: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { employees, crews, projects };
}
