import "server-only";

import { prisma } from "@/lib/prisma";
import { textCrew } from "@/lib/sms";

/**
 * Recording that something happened, for whoever needs to know.
 *
 * Written where the event happens rather than worked out afterwards by
 * comparing states. A notification that says "a COI was uploaded" is only
 * trustworthy if it was written at the moment the COI was uploaded — derive it
 * later and it becomes a guess about what changed since somebody last looked.
 *
 * Every call is best-effort. Telling the office about an upload is worth doing
 * and never worth failing the upload for, so a broken notification must not
 * take the thing it was reporting down with it.
 */

type Tone = "success" | "warning" | "critical" | "info" | "neutral";
type Category = "daily" | "billing" | "compliance" | "crew" | "system";

/** Tell the office. Never carries a subcontractor id — this is the whole book. */
export async function notifyStaff(input: {
  title: string;
  detail?: string;
  href?: string;
  category?: Category;
  tone?: Tone;
  actor?: string;
}): Promise<void> {
  await prisma.notification
    .create({
      data: {
        audience: "STAFF",
        title: input.title,
        detail: input.detail ?? "",
        href: input.href ?? "",
        category: input.category ?? "system",
        tone: input.tone ?? "info",
        actor: input.actor ?? "",
      },
    })
    .catch(() => undefined);
}

/**
 * Tell one crew about their own work.
 *
 * Scoped by construction: the row carries the crew it belongs to, so there is
 * no query filter to forget and no way for one crew's notification to be
 * delivered to another.
 */
export async function notifyCrew(
  subcontractorId: string,
  input: {
    title: string;
    detail?: string;
    href?: string;
    category?: Category;
    tone?: Tone;
    actor?: string;
    /**
     * Also text it. Off by default — a crew who gets a text for every document
     * upload stops reading them, and then the one that mattered is the one
     * they scrolled past. Reserve it for what a person has to act on: work
     * assigned, a daily returned, a schedule moved.
     */
    sms?: boolean;
  },
): Promise<void> {
  if (!subcontractorId) return;
  await prisma.notification
    .create({
      data: {
        audience: "SUBCONTRACTOR",
        subcontractorId,
        title: input.title,
        detail: input.detail ?? "",
        href: input.href ?? "",
        category: input.category ?? "system",
        tone: input.tone ?? "info",
        actor: input.actor ?? "",
      },
    })
    .catch(() => undefined);

  // Best-effort, exactly like the notification above it. textCrew checks
  // consent and opt-out itself and never throws, so a crew with no phone or no
  // consent simply does not get a text — it cannot fail the thing being
  // reported.
  if (input.sms) {
    const line = input.detail ? `${input.title} — ${input.detail}` : input.title;
    await textCrew(subcontractorId, `Fortitude: ${line}`.slice(0, 320)).catch(() => undefined);
  }
}
