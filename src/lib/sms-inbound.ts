import "server-only";

import { prisma } from "@/lib/prisma";
import { toE164 } from "@/lib/sms";
import { findOrCreateConversation, postMessage, logEvent } from "@/lib/messaging";

/**
 * Turning an incoming text into a message in the right conversation.
 *
 * Called by the existing `/api/sms/inbound` route, which already validates
 * Twilio's signature — this is deliberately not a second webhook. One endpoint
 * that carriers point at, one signature check, one place STOP is honoured.
 *
 * Three things have to be right:
 *
 *   Idempotency. Twilio retries. The provider's SID is unique on the delivery
 *   row, so a repeated POST finds the message already stored and does nothing
 *   rather than posting it twice.
 *
 *   Identity. A number is matched to a person or a contact, normalised, so
 *   "+18645550134" reaches the same thread as the crew it belongs to.
 *
 *   Safety with strangers. A text from a number nobody recognises is recorded
 *   and surfaced to the office, never silently dropped and never attached to
 *   somebody else's conversation on a guess.
 */

export interface InboundResult {
  stored: boolean;
  duplicate: boolean;
  conversationId: string | null;
  from: string;
  senderName: string;
}

export async function handleInboundSms(input: {
  from: string;
  body: string;
  providerMessageId: string;
}): Promise<InboundResult> {
  const phone = toE164(input.from);
  const sid = input.providerMessageId.trim();

  const base: InboundResult = {
    stored: false,
    duplicate: false,
    conversationId: null,
    from: phone ?? input.from,
    senderName: phone ?? input.from,
  };
  if (!phone || !sid) return base;

  // Already handled. Twilio retries a webhook it did not get a 200 from, and
  // the second delivery of the same SID must be a no-op.
  const seen = await prisma.messageDelivery.findUnique({
    where: { providerMessageId: sid },
    select: { message: { select: { conversationId: true } } },
  });
  if (seen) {
    return { ...base, duplicate: true, conversationId: seen.message.conversationId };
  }

  // Who is this? A login first, then a standalone contact.
  //
  // Numbers are stored as people typed them, so both sides are normalised in
  // code — a LIKE against "(864) 555-0134" would miss "+18645550134".
  const candidates = await prisma.user.findMany({
    where: { NOT: { phone: "" } },
    select: { id: true, name: true, email: true, phone: true, subcontractorId: true },
  });
  const matchedUser = candidates.find((u) => toE164(u.phone) === phone) ?? null;

  const matchedContact = matchedUser
    ? null
    : await prisma.messageContact.findUnique({
        where: { phoneE164: phone },
        select: { id: true, name: true, subcontractorId: true },
      });

  const senderName =
    matchedUser?.name || matchedUser?.email || matchedContact?.name || phone;

  // The thread this belongs in: the most recent live conversation that person
  // is actually in. Falling back to their company's thread, then to a holding
  // conversation for numbers nobody knows.
  let conversationId: string | null = null;

  if (matchedUser) {
    const seat = await prisma.conversationParticipant.findFirst({
      where: { userId: matchedUser.id, leftAt: null, conversation: { archivedAt: null } },
      orderBy: { conversation: { lastMessageAt: "desc" } },
      select: { conversationId: true },
    });
    conversationId = seat?.conversationId ?? null;
  }
  if (!conversationId && matchedContact) {
    const seat = await prisma.conversationParticipant.findFirst({
      where: { contactId: matchedContact.id, leftAt: null, conversation: { archivedAt: null } },
      orderBy: { conversation: { lastMessageAt: "desc" } },
      select: { conversationId: true },
    });
    conversationId = seat?.conversationId ?? null;
  }

  const subId = matchedUser?.subcontractorId ?? matchedContact?.subcontractorId ?? null;
  if (!conversationId && subId) {
    const sub = await prisma.subcontractor.findUnique({
      where: { id: subId },
      select: { company: true },
    });
    const c = await findOrCreateConversation(
      { type: "SUBCONTRACTOR", subcontractorId: subId },
      { title: sub?.company ?? "Crew", subcontractorSeat: subId, actor: senderName },
    );
    conversationId = c.id;
  }

  if (!conversationId) {
    // A stranger. Recorded rather than discarded — it might be a foreman on a
    // number nobody put in the system, and dropping it loses the only copy.
    const c = await findOrCreateConversation(
      { type: "DIRECT" },
      { title: `Unknown number ${phone}`, actor: senderName },
    );
    conversationId = c.id;
    await logEvent(conversationId, "sms_received", `unrecognised number ${phone}`, senderName);
  }

  await postMessage({
    conversationId,
    body: input.body,
    senderContactId: matchedContact?.id ?? null,
    senderUserId: matchedUser?.id ?? null,
    senderName,
    direction: "INBOUND",
    providerMessageId: sid,
  });
  await logEvent(conversationId, "sms_received", phone, senderName, { sid });

  return { stored: true, duplicate: false, conversationId, from: phone, senderName };
}

/**
 * A delivery receipt from the provider.
 *
 * Maps their word onto ours and updates the one delivery row that SID belongs
 * to. Unknown statuses are ignored rather than guessed at — a status we do not
 * understand should not overwrite one we do.
 */
export async function handleDeliveryCallback(input: {
  providerMessageId: string;
  status: string;
  errorCode?: string;
}): Promise<{ updated: boolean }> {
  const { mapProviderStatus } = await import("@/lib/sms-provider");
  const mapped = mapProviderStatus(input.status);
  if (!mapped) return { updated: false };

  const delivery = await prisma.messageDelivery.findUnique({
    where: { providerMessageId: input.providerMessageId.trim() },
    select: { id: true, status: true, message: { select: { conversationId: true } } },
  });
  if (!delivery) return { updated: false };

  // Never walk a delivery backwards. Twilio can send "sent" after "delivered"
  // on a retry, and a delivered message must not become merely sent.
  const rank = { QUEUED: 0, SENT: 1, DELIVERED: 2, FAILED: 2, RECEIVED: 2, SKIPPED: 0 } as const;
  if (rank[delivery.status] > rank[mapped]) return { updated: false };

  await prisma.messageDelivery.update({
    where: { id: delivery.id },
    data: {
      status: mapped,
      ...(mapped === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      ...(mapped === "SENT" ? { sentAt: new Date() } : {}),
      ...(mapped === "FAILED"
        ? { failedAt: new Date(), errorCode: input.errorCode ?? "" }
        : {}),
    },
  });
  await logEvent(
    delivery.message.conversationId,
    mapped === "DELIVERED" ? "sms_delivered" : mapped === "FAILED" ? "sms_failed" : "sms_attempted",
    input.status,
    "provider",
    { sid: input.providerMessageId, errorCode: input.errorCode },
  );
  return { updated: true };
}
