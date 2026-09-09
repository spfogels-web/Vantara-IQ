"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/auth";
import { requireUser, requireStaff } from "@/lib/authz";
import { conversationScope } from "@/data/messages";
import {
  addParticipant,
  findOrCreateConversation,
  postMessage,
  postSystemNote,
  logEvent,
} from "@/lib/messaging";
import { notifyStaff } from "@/lib/notify";

/**
 * Everything the Messages screen can do.
 *
 * Each one re-checks the scope rather than trusting the id it was handed. A
 * conversation id is a string in a form post; being able to read one is a
 * question for the server every time, not something the page decided earlier.
 */

/** The caller, plus the where-clause that limits them. */
async function guard(conversationId: string) {
  const user = await requireUser();
  const scope = await conversationScope(user);
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, ...scope },
    select: { id: true, taskId: true, type: true, title: true },
  });
  return { user, convo };
}

export async function sendMessage(input: {
  conversationId: string;
  body: string;
  withSms?: boolean;
  attachments?: { url: string; name?: string; contentType?: string; bytes?: number }[];
}) {
  const { user, convo } = await guard(input.conversationId);
  if (!convo) return { ok: false as const, error: "Conversation not found." };

  const body = input.body.trim();
  if (!body && !input.attachments?.length) {
    return { ok: false as const, error: "Type something first." };
  }

  const res = await postMessage({
    conversationId: convo.id,
    body: body || "(attachment)",
    senderUserId: user.id,
    senderName: user.name || user.email,
    channels: input.withSms ? ["IN_APP", "SMS"] : ["IN_APP"],
    attachments: input.attachments,
  });

  // Reading is writing here: you have seen your own message.
  await markRead(convo.id).catch(() => undefined);

  revalidatePath("/messages");
  if (convo.taskId) revalidatePath("/tasks");

  return {
    ok: true as const,
    messageId: res.messageId,
    smsSent: res.smsSent,
    smsFailed: res.smsFailed,
    smsSkipped: res.smsSkipped,
    recipients: res.recipients,
  };
}

/**
 * Mark a conversation read, for this person only.
 *
 * Per participant, never a flag on the thread — two people reading the same
 * conversation have different unread counts and one clearing it must not clear
 * the other's.
 */
export async function markRead(conversationId: string) {
  const { user, convo } = await guard(conversationId);
  if (!convo) return { ok: false as const, error: "Conversation not found." };

  const seat = await prisma.conversationParticipant.findFirst({
    where: { conversationId: convo.id, userId: user.id },
    select: { id: true },
  });
  if (seat) {
    await prisma.conversationParticipant.update({
      where: { id: seat.id },
      data: { lastReadAt: new Date() },
    });
  } else {
    // Staff reading a thread they were never named in still get a read mark,
    // otherwise the badge never clears for the office.
    await prisma.conversationParticipant.create({
      data: { conversationId: convo.id, userId: user.id, lastReadAt: new Date() },
    });
  }
  revalidatePath("/messages");
  return { ok: true as const };
}

/**
 * Open a conversation for a piece of work, or start one.
 *
 * The context is the key. Pressing Message on the same task twice lands in the
 * same thread, which is what makes the history worth keeping.
 */
export async function openConversation(input: {
  type: "DIRECT" | "CREW" | "PROJECT" | "SUBCONTRACTOR";
  withUserId?: string;
  subcontractorId?: string;
  projectId?: string;
  taskId?: string;
  title?: string;
  subject?: string;
}) {
  const user = await requireStaff();

  let title = input.title ?? "";
  const seatUsers: string[] = [user.id];

  if (input.type === "SUBCONTRACTOR" || input.type === "CREW") {
    const sub = input.subcontractorId
      ? await prisma.subcontractor.findUnique({
          where: { id: input.subcontractorId },
          select: { company: true },
        })
      : null;
    if (!sub) return { ok: false as const, error: "Pick a crew." };
    title ||= sub.company;
  }
  if (input.type === "PROJECT") {
    const p = input.projectId
      ? await prisma.project.findUnique({
          where: { id: input.projectId },
          select: { name: true },
        })
      : null;
    if (!p) return { ok: false as const, error: "Pick a project." };
    title ||= p.name;
  }
  if (input.type === "DIRECT") {
    const other = input.withUserId
      ? await prisma.user.findUnique({
          where: { id: input.withUserId },
          select: { name: true, email: true },
        })
      : null;
    if (!other) return { ok: false as const, error: "Pick somebody to message." };
    title ||= other.name || other.email;
    seatUsers.push(input.withUserId!);
  }

  const { id, created } = await findOrCreateConversation(
    {
      type: input.type,
      projectId: input.projectId ?? null,
      subcontractorId: input.subcontractorId ?? null,
      taskId: input.taskId ?? null,
      withUserId: input.withUserId ?? null,
    },
    {
      title,
      subject: input.subject,
      createdByUserId: user.id,
      actor: user.name || user.email,
      userIds: seatUsers,
      subcontractorSeat:
        input.type === "SUBCONTRACTOR" || input.type === "CREW"
          ? (input.subcontractorId ?? null)
          : null,
    },
  );

  // A conversation opened from a task says so in the thread, once.
  if (created && input.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: input.taskId },
      select: { title: true },
    });
    if (task) {
      await postSystemNote(id, `Linked to task: ${task.title}`, user.name || user.email);
      await logEvent(id, "linked", `task:${input.taskId}`, user.name || user.email);
    }
  }

  revalidatePath("/messages");
  return { ok: true as const, id, created };
}

/** Attach an existing conversation to a piece of work after the fact. */
export async function linkConversation(input: {
  conversationId: string;
  projectId?: string | null;
  taskId?: string | null;
  subcontractorId?: string | null;
}) {
  const user = await requireStaff();
  const { convo } = await guard(input.conversationId);
  if (!convo) return { ok: false as const, error: "Conversation not found." };

  await prisma.conversation.update({
    where: { id: convo.id },
    data: {
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.subcontractorId !== undefined ? { subcontractorId: input.subcontractorId } : {}),
    },
  });
  await logEvent(convo.id, "linked", JSON.stringify(input), user.name || user.email);
  revalidatePath("/messages");
  return { ok: true as const };
}

/** Add somebody to a thread. Staff only — a crew does not pick who reads. */
export async function addToConversation(input: {
  conversationId: string;
  userId?: string;
  subcontractorId?: string;
}) {
  const user = await requireStaff();
  const { convo } = await guard(input.conversationId);
  if (!convo) return { ok: false as const, error: "Conversation not found." };

  await addParticipant(
    convo.id,
    { userId: input.userId, subcontractorId: input.subcontractorId },
    user.name || user.email,
  );

  const who = input.userId
    ? (await prisma.user.findUnique({ where: { id: input.userId }, select: { name: true } }))?.name
    : (
        await prisma.subcontractor.findUnique({
          where: { id: input.subcontractorId! },
          select: { company: true },
        })
      )?.company;
  await postSystemNote(convo.id, `${user.name || user.email} added ${who ?? "somebody"}.`);

  revalidatePath("/messages");
  return { ok: true as const };
}

/**
 * Retry one failed text.
 *
 * The message already exists in Vantara; this is a second attempt at one
 * delivery, not a second message. Sending it again as a new message would put
 * the same sentence in the thread twice.
 */
export async function retrySms(deliveryId: string) {
  const user = await requireStaff();

  const d = await prisma.messageDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      status: true,
      toPhoneE164: true,
      message: { select: { body: true, conversationId: true } },
    },
  });
  if (!d || d.status !== "FAILED") {
    return { ok: false as const, error: "Nothing to retry." };
  }

  const { smsEnabled, smsProvider } = await import("@/lib/sms-provider");
  if (!smsEnabled()) return { ok: false as const, error: "SMS is switched off here." };

  const res = await smsProvider.send(d.toPhoneE164, d.message.body.slice(0, 1500));
  await prisma.messageDelivery.update({
    where: { id: d.id },
    data: res.ok
      ? {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: res.providerMessageId ?? null,
          errorCode: "",
          errorMessage: "",
        }
      : {
          status: "FAILED",
          failedAt: new Date(),
          errorCode: res.errorCode ?? "",
          errorMessage: (res.errorMessage ?? "").slice(0, 300),
        },
  });
  await logEvent(
    d.message.conversationId,
    res.ok ? "sms_attempted" : "sms_failed",
    d.toPhoneE164,
    user.name || user.email,
  );
  revalidatePath("/messages");
  return res.ok ? { ok: true as const } : { ok: false as const, error: res.errorMessage ?? "Failed." };
}

/**
 * Message the person or crew a task is on.
 *
 * The whole point of the button on a task card: it picks the recipient from
 * the assignment, links the thread to the task, and lands the office in it.
 */
export async function messageAboutTask(taskId: string) {
  const user = await requireStaff();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      assigneeUserId: true,
      assigneeSubId: true,
      projectId: true,
      assigneeSub: { select: { company: true } },
      assigneeUser: { select: { name: true, email: true } },
    },
  });
  if (!task) return { ok: false as const, error: "Task not found." };

  if (task.assigneeSubId) {
    const r = await openConversation({
      type: "SUBCONTRACTOR",
      subcontractorId: task.assigneeSubId,
      projectId: task.projectId ?? undefined,
      taskId: task.id,
      title: task.assigneeSub?.company ?? "Crew",
      subject: task.title,
    });
    return r;
  }
  if (task.assigneeUserId) {
    return openConversation({
      type: "DIRECT",
      withUserId: task.assigneeUserId,
      projectId: task.projectId ?? undefined,
      taskId: task.id,
      title: task.assigneeUser?.name || task.assigneeUser?.email || "Direct",
      subject: task.title,
    });
  }

  // Nobody is on it yet. A thread about the task itself still beats nothing —
  // it is where the chasing gets written down.
  return openConversation({
    type: "PROJECT",
    projectId: task.projectId ?? undefined,
    taskId: task.id,
    title: task.title,
    subject: task.title,
  });
}

/**
 * Tell the office something arrived, without shouting.
 *
 * Called by the inbound webhook. Deliberately not called when the office sends
 * — nobody needs a notification about their own message.
 */
export async function notifyIncoming(conversationId: string, from: string, body: string) {
  await notifyStaff({
    title: `New message from ${from}`,
    detail: body.slice(0, 200),
    category: "crew",
    tone: "info",
    href: `/messages?c=${conversationId}`,
  }).catch(() => undefined);
}

export async function isStaffViewer() {
  const user = await requireUser();
  return isStaff(user.role);
}
