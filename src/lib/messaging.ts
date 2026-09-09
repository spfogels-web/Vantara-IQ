import "server-only";

import { prisma } from "@/lib/prisma";
import { toE164 } from "@/lib/sms";
import { smsEnabled, smsProvider } from "@/lib/sms-provider";
import type { ConversationType, MessageKind } from "@prisma/client";

/**
 * The messaging service.
 *
 * Everything that creates a conversation or sends a message goes through here
 * — the Messages screen, the task buttons, and whatever automation is written
 * next. Nothing above this file touches a provider, and nothing below it knows
 * which screen asked.
 *
 * The order is fixed and it matters:
 *
 *   1. Store the message. It exists whatever happens next.
 *   2. Work out who should receive it and by which channel.
 *   3. Write a delivery row per recipient per channel.
 *   4. Attempt the ones that are eligible.
 *   5. Record what happened.
 *
 * A failed text never fails the message. The message is the record; the text
 * is one way it travelled, and a crew's phone being off is not a reason to
 * lose what the office said.
 */

/* ------------------------------------------------------------------ *
 * Finding or opening a conversation.
 * ------------------------------------------------------------------ */

export interface ConversationKey {
  type: ConversationType;
  projectId?: string | null;
  subcontractorId?: string | null;
  taskId?: string | null;
  /** For DIRECT — the other person. */
  withUserId?: string | null;
}

/**
 * The conversation for a piece of work, opening one only if there is not one.
 *
 * Duplicate threads are the way a messaging system stops being a record: two
 * conversations about the same COI, half the history in each. The key is the
 * operational context rather than the participants, because the office changes
 * and the job does not.
 */
export async function findOrCreateConversation(
  key: ConversationKey,
  opts: {
    title: string;
    subject?: string;
    createdByUserId?: string | null;
    actor?: string;
    /** Internal people who should be in it. */
    userIds?: string[];
    /** A whole company, for a subcontractor thread. */
    subcontractorSeat?: string | null;
  },
): Promise<{ id: string; created: boolean }> {
  const where = {
    type: key.type,
    archivedAt: null,
    ...(key.taskId ? { taskId: key.taskId } : {}),
    ...(key.projectId ? { projectId: key.projectId } : {}),
    ...(key.subcontractorId ? { subcontractorId: key.subcontractorId } : {}),
  };

  // A DIRECT thread is identified by its two people rather than by context.
  if (key.type === "DIRECT" && key.withUserId && opts.createdByUserId) {
    const existing = await prisma.conversation.findFirst({
      where: {
        type: "DIRECT",
        archivedAt: null,
        AND: [
          { participants: { some: { userId: key.withUserId, leftAt: null } } },
          { participants: { some: { userId: opts.createdByUserId, leftAt: null } } },
        ],
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
  } else if (key.taskId || key.projectId || key.subcontractorId) {
    const existing = await prisma.conversation.findFirst({
      where,
      orderBy: { lastMessageAt: "desc" },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
  }

  const convo = await prisma.conversation.create({
    data: {
      type: key.type,
      title: opts.title.slice(0, 160),
      subject: (opts.subject ?? "").slice(0, 160),
      projectId: key.projectId || null,
      subcontractorId: key.subcontractorId || null,
      taskId: key.taskId || null,
      createdByUserId: opts.createdByUserId || null,
    },
    select: { id: true },
  });

  const seats = new Set(
    [...(opts.userIds ?? []), opts.createdByUserId, key.withUserId].filter(Boolean) as string[],
  );
  for (const userId of seats) {
    await prisma.conversationParticipant.create({
      data: { conversationId: convo.id, userId },
    });
  }
  if (opts.subcontractorSeat) {
    await prisma.conversationParticipant.create({
      data: { conversationId: convo.id, subcontractorId: opts.subcontractorSeat },
    });
  }

  await logEvent(convo.id, "created", opts.title, opts.actor ?? "");
  return { id: convo.id, created: true };
}

/** Add somebody, without duplicating a seat they already hold. */
export async function addParticipant(
  conversationId: string,
  who: { userId?: string; contactId?: string; subcontractorId?: string },
  actor = "",
): Promise<void> {
  const existing = await prisma.conversationParticipant.findFirst({
    where: { conversationId, ...who },
    select: { id: true, leftAt: true },
  });
  if (existing) {
    if (existing.leftAt) {
      await prisma.conversationParticipant.update({
        where: { id: existing.id },
        data: { leftAt: null },
      });
    }
    return;
  }
  await prisma.conversationParticipant.create({ data: { conversationId, ...who } });
  await logEvent(conversationId, "participant_added", JSON.stringify(who), actor);
}

/* ------------------------------------------------------------------ *
 * Sending.
 * ------------------------------------------------------------------ */

export interface SendResult {
  messageId: string;
  /** How many texts actually went out. Zero is normal while SMS is off. */
  smsSent: number;
  smsFailed: number;
  smsSkipped: number;
  /**
   * How many people the message was actually for.
   *
   * Zero is a real answer and a common one — a thread somebody started with
   * only themselves in it — and it has to reach the screen. A message that
   * went to nobody and said nothing about it is the worst outcome here,
   * because it looks exactly like one that was delivered.
   */
  recipients: number;
}

/**
 * Post a message into a conversation, and text whoever may lawfully be texted.
 *
 * `channels` says what was asked for, not what happens: an SMS is attempted
 * only for a recipient who has a number, has consented, has not replied STOP,
 * and only when SMS is switched on at all. Everybody else gets a SKIPPED
 * delivery row, which is a record of a decision rather than a failure.
 */
export async function postMessage(input: {
  conversationId: string;
  body: string;
  senderUserId?: string | null;
  senderContactId?: string | null;
  senderName: string;
  direction?: "OUTBOUND" | "INBOUND";
  kind?: MessageKind;
  channels?: ("IN_APP" | "SMS")[];
  attachments?: { url: string; name?: string; contentType?: string; bytes?: number }[];
  /** Set on an inbound message so a webhook cannot store the same text twice. */
  providerMessageId?: string;
}): Promise<SendResult> {
  const direction = input.direction ?? "OUTBOUND";
  const kind = input.kind ?? "USER";
  const wantSms = (input.channels ?? ["IN_APP"]).includes("SMS");

  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      senderUserId: input.senderUserId || null,
      senderContactId: input.senderContactId || null,
      senderName: input.senderName.slice(0, 120),
      direction,
      kind,
      body: input.body.slice(0, 4000),
      attachments: input.attachments?.length
        ? {
            create: input.attachments.map((a) => ({
              url: a.url,
              name: (a.name ?? "").slice(0, 200),
              contentType: a.contentType ?? "",
              bytes: a.bytes ?? 0,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: new Date() },
  });

  // An inbound message is already delivered — it arrived. One row saying so,
  // carrying the provider id that makes a repeated webhook a no-op.
  if (direction === "INBOUND") {
    await prisma.messageDelivery.create({
      data: {
        messageId: message.id,
        channel: input.providerMessageId ? "SMS" : "IN_APP",
        status: "RECEIVED",
        provider: input.providerMessageId ? smsProvider.name : "",
        providerMessageId: input.providerMessageId ?? null,
      },
    });
    return { messageId: message.id, smsSent: 0, smsFailed: 0, smsSkipped: 0, recipients: 0 };
  }

  // System notes are recorded, never texted. Nobody's phone needs to know a
  // participant was added.
  if (kind === "SYSTEM") {
    return { messageId: message.id, smsSent: 0, smsFailed: 0, smsSkipped: 0, recipients: 0 };
  }

  const recipients = await eligibleRecipients(input.conversationId, input.senderUserId ?? null);
  let sent = 0,
    failed = 0,
    skipped = 0;

  for (const r of recipients) {
    // Everybody gets the in-app copy; that is what the thread is.
    await prisma.messageDelivery.create({
      data: {
        messageId: message.id,
        channel: "IN_APP",
        status: "DELIVERED",
        toUserId: r.userId ?? null,
        toContactId: r.contactId ?? null,
        deliveredAt: new Date(),
      },
    });

    if (!wantSms) continue;

    const why = r.smsBlockedReason;
    if (why || !smsEnabled()) {
      skipped++;
      await prisma.messageDelivery.create({
        data: {
          messageId: message.id,
          channel: "SMS",
          status: "SKIPPED",
          toUserId: r.userId ?? null,
          toContactId: r.contactId ?? null,
          toPhoneE164: r.phone ?? "",
          errorMessage: why ?? "SMS is switched off in this environment.",
        },
      });
      continue;
    }

    const delivery = await prisma.messageDelivery.create({
      data: {
        messageId: message.id,
        channel: "SMS",
        status: "QUEUED",
        toUserId: r.userId ?? null,
        toContactId: r.contactId ?? null,
        toPhoneE164: r.phone!,
        provider: smsProvider.name,
      },
      select: { id: true },
    });

    const res = await smsProvider.send(r.phone!, input.body.slice(0, 1500));
    if (res.ok) {
      sent++;
      await prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: res.providerMessageId ?? null,
        },
      });
      await logEvent(input.conversationId, "sms_attempted", r.phone!, input.senderName, {
        providerMessageId: res.providerMessageId,
      });
    } else {
      failed++;
      await prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          errorCode: res.errorCode ?? "",
          errorMessage: (res.errorMessage ?? "").slice(0, 300),
          providerMessageId: res.providerMessageId ?? null,
        },
      });
      await logEvent(input.conversationId, "sms_failed", r.phone!, input.senderName, {
        errorCode: res.errorCode,
        errorMessage: res.errorMessage,
      });
    }
  }

  await logEvent(input.conversationId, "message_sent", input.body.slice(0, 120), input.senderName);
  return {
    messageId: message.id,
    smsSent: sent,
    smsFailed: failed,
    smsSkipped: skipped,
    // How many people this was actually for. Zero is a real answer and a
    // common one — a thread somebody started with only themselves in it —
    // and it has to reach the screen. A message that went to nobody and
    // said nothing about it is the worst outcome here: it looks sent.
    recipients: recipients.length,
  };
}

export interface Recipient {
  userId?: string;
  contactId?: string;
  name: string;
  phone: string | null;
  /** Null when they may be texted; otherwise why not, in plain words. */
  smsBlockedReason: string | null;
}

/**
 * Who a message in this conversation should reach, and whether by text.
 *
 * A crew thread resolves to the people in that company, one delivery each.
 * Deliberately not a group text: carrier group messaging puts every crew's
 * number in front of every other crew, and a reply lands in a thread nobody
 * owns. One conversation here, one message each on the way out.
 */
export async function eligibleRecipients(
  conversationId: string,
  excludeUserId: string | null,
): Promise<Recipient[]> {
  const seats = await prisma.conversationParticipant.findMany({
    where: { conversationId, leftAt: null },
    select: {
      userId: true,
      contactId: true,
      subcontractorId: true,
      user: {
        select: { id: true, name: true, email: true, phone: true, smsConsentAt: true, smsOptOutAt: true },
      },
      contact: {
        select: { id: true, name: true, phoneE164: true, consent: true, optOutAt: true },
      },
      subcontractor: {
        select: { id: true, company: true, phone: true, smsConsentAt: true, smsOptOutAt: true },
      },
    },
  });

  const out: Recipient[] = [];
  const seen = new Set<string>();
  // Numbers already spoken for. An owner's mobile is very often also the
  // company number, and two copies of the same message is how somebody decides
  // this system is noisy.
  const numbers = new Set<string>();

  const pushUser = (u: {
    id: string;
    name: string;
    email: string;
    phone: string;
    smsConsentAt: Date | null;
    smsOptOutAt: Date | null;
  }) => {
    if (u.id === excludeUserId || seen.has(`u:${u.id}`)) return;
    seen.add(`u:${u.id}`);
    const phone = toE164(u.phone);
    if (phone) {
      if (numbers.has(phone)) return;
      numbers.add(phone);
    }
    out.push({
      userId: u.id,
      name: u.name || u.email,
      phone,
      smsBlockedReason: !phone
        ? "No mobile number on file."
        : u.smsOptOutAt
          ? "They replied STOP."
          : !u.smsConsentAt
            ? "They have not agreed to texts."
            : null,
    });
  };

  for (const s of seats) {
    if (s.user) pushUser(s.user);

    if (s.contact && !seen.has(`c:${s.contact.id}`)) {
      seen.add(`c:${s.contact.id}`);
      out.push({
        contactId: s.contact.id,
        name: s.contact.name || s.contact.phoneE164,
        phone: s.contact.phoneE164,
        smsBlockedReason:
          s.contact.optOutAt
            ? "They replied STOP."
            : s.contact.consent !== "GRANTED"
              ? "No recorded consent for this number."
              : null,
      });
    }

    // A company seat fans out to its people. One text each.
    if (s.subcontractorId) {
      // The company's own number first.
      //
      // It was missing, and that is where a crew's consent actually lives:
      // J&P Cable had agreed to texts with a number on the company record,
      // and every message to them went in-app only because the fan-out
      // looked at the people under the company and never at the company. The
      // office wrote to a crew that had opted in and the crew heard nothing.
      const co = s.subcontractor;
      const coPhone = co ? toE164(co.phone) : null;
      if (co && !seen.has(`s:${co.id}`)) {
        seen.add(`s:${co.id}`);
        if (!coPhone || !numbers.has(coPhone)) {
          if (coPhone) numbers.add(coPhone);
          out.push({
            name: co.company.trim() || "Crew",
            phone: coPhone,
            smsBlockedReason: !coPhone
              ? "No mobile number on the company record."
              : co.smsOptOutAt
                ? "They replied STOP."
                : !co.smsConsentAt
                  ? "They have not agreed to texts."
                  : null,
          });
        }
      }

      const [users, contacts] = await Promise.all([
        prisma.user.findMany({
          where: { subcontractorId: s.subcontractorId },
          select: { id: true, name: true, email: true, phone: true, smsConsentAt: true, smsOptOutAt: true },
        }),
        prisma.messageContact.findMany({
          where: { subcontractorId: s.subcontractorId },
          select: { id: true, name: true, phoneE164: true, consent: true, optOutAt: true },
        }),
      ]);
      for (const u of users) pushUser(u);
      for (const c of contacts) {
        if (seen.has(`c:${c.id}`)) continue;
        seen.add(`c:${c.id}`);
        if (c.phoneE164) {
          if (numbers.has(c.phoneE164)) continue;
          numbers.add(c.phoneE164);
        }
        out.push({
          contactId: c.id,
          name: c.name || c.phoneE164,
          phone: c.phoneE164,
          smsBlockedReason:
            c.optOutAt
              ? "They replied STOP."
              : c.consent !== "GRANTED"
                ? "No recorded consent for this number."
                : null,
        });
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * The audit trail.
 * ------------------------------------------------------------------ */

export async function logEvent(
  conversationId: string,
  kind: string,
  detail = "",
  actor = "",
  meta?: unknown,
): Promise<void> {
  await prisma.conversationEvent
    .create({
      data: {
        conversationId,
        kind,
        detail: detail.slice(0, 300),
        actor: actor.slice(0, 120),
        meta: (meta ?? undefined) as never,
      },
    })
    .catch(() => undefined); // An audit row must never fail the thing it records.
}

/** A note in the thread that is plainly the app talking, not a person. */
export async function postSystemNote(
  conversationId: string,
  body: string,
  actor = "",
): Promise<void> {
  await postMessage({
    conversationId,
    body,
    senderName: actor || "Vantara IQ",
    kind: "SYSTEM",
    channels: [],
  });
}

/* ------------------------------------------------------------------ *
 * The door future automation comes through.
 * ------------------------------------------------------------------ */

/**
 * Send an operational message from somewhere else in the app.
 *
 * This is what a COI reminder, a locate clearance or a missing-daily nudge
 * will call. It exists now, unused by any schedule, so those modules have
 * something to call that already obeys consent, already writes an audit trail
 * and already works with SMS switched off.
 *
 * Nothing here sends on a timer. That is deliberate: automated texting is the
 * part with the compliance exposure, and it waits for the campaign.
 */
export async function sendOperationalMessage(input: {
  context: ConversationKey;
  title: string;
  body: string;
  actor?: string;
  userIds?: string[];
  subcontractorSeat?: string | null;
  channels?: ("IN_APP" | "SMS")[];
  kind?: MessageKind;
}): Promise<SendResult & { conversationId: string }> {
  const convo = await findOrCreateConversation(input.context, {
    title: input.title,
    createdByUserId: null,
    actor: input.actor,
    userIds: input.userIds,
    subcontractorSeat: input.subcontractorSeat,
  });
  const res = await postMessage({
    conversationId: convo.id,
    body: input.body,
    senderName: input.actor || "Vantara IQ",
    kind: input.kind ?? "AUTOMATED",
    channels: input.channels ?? ["IN_APP"],
  });
  return { ...res, conversationId: convo.id };
}
