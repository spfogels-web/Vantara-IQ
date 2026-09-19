/**
 * The rest of the demo: locates, materials, tasks, pipeline, messages, papers.
 *
 * Split from seed-tenant.ts for length only — same target, same guard, same
 * upsert-by-natural-key idempotency. Nothing here calls a service: a locate is
 * a row, not a call to 811; a message is a row, not a text.
 *
 * Every field name here was checked against prisma/schema.prisma rather than
 * assumed. The first draft guessed a dozen of them — `status` on a locate that
 * carries `lifecycle`, `dueAt` on a task that stores `dueDate` as a string,
 * `note` on an activity whose column is `body` — and the typecheck caught all
 * of it before anything was written.
 */
import type { PrismaClient } from "@prisma/client";

import { on } from "./apex/dates";
import type { buildApexDataset } from "./apex/dataset";
import { IN_HOUSE_CREWS, PROSPECTS, STAFF, SUBS, YARDS, subOf } from "./apex/org";
import { PROJECTS, projectsWith, type ProjectSeed } from "./apex/projects";

type Data = ReturnType<typeof buildApexDataset>;
type Should = (m: string) => boolean;

/** Who performs a job, by name, for the denormalised `crew` columns. */
function crewNameFor(p: ProjectSeed): string {
  return p.performedBy.kind === "sub"
    ? subOf(p.performedBy.key).company
    : IN_HOUSE_CREWS.find((c) => c.key === p.performedBy.key)!.name;
}

export async function seedRemaining(
  db: PrismaClient,
  data: Data,
  anchor: Date,
  _only: string | undefined,
  should: Should,
): Promise<string[]> {
  const ran: string[] = [];

  // ---- Locates -------------------------------------------------------------
  if (should("locates")) {
    let n = 5200;
    for (const p of PROJECTS) {
      if (p.status === "Upcoming") continue;

      /**
       * The lifecycle, spread so every state exists somewhere and a blocked job
       * is blocked by a record rather than by a label. Dates are strings here,
       * as the schema stores them.
       */
      const blocked = p.storylines.includes("waiting-on-locates");
      const expiring = p.storylines.includes("locate-expiring");

      const tickets: { lifecycle: string; calledDays: number; expiresDays: number }[] = blocked
        ? [
            { lifecycle: "NEW", calledDays: -3, expiresDays: 11 },
            { lifecycle: "NEW", calledDays: -1, expiresDays: 13 },
          ]
        : expiring
          ? [
              { lifecycle: "EXPIRING", calledDays: -17, expiresDays: 2 },
              { lifecycle: "EXPIRING", calledDays: -16, expiresDays: 3 },
            ]
          : [{ lifecycle: "ACTIVE", calledDays: -9, expiresDays: 10 }];

      // One expired ticket, so renewal has a case to show.
      if (p.key === "gainesville-ug") tickets.push({ lifecycle: "EXPIRED", calledDays: -28, expiresDays: -3 });

      for (const t of tickets) {
        const id = `apex-loc-${p.key}-${t.lifecycle}-${t.calledDays}`;
        await db.locateTicket.upsert({
          where: { id },
          create: {
            id,
            number: `SU-${n++}`,
            projectId: `apex-proj-${p.key}`,
            lifecycle: t.lifecycle as never,
            calledInOn: on(anchor, t.calledDays),
            expiresOn: on(anchor, t.expiresDays),
            workToBeginOn: on(anchor, t.calledDays + 2),
            street: p.location,
            city: p.location.split(",")[0],
            county: "",
            workType: "Fiber optic installation",
          },
          update: { lifecycle: t.lifecycle as never, expiresOn: on(anchor, t.expiresDays) },
        });
      }
    }
    ran.push("locates");
  }

  // ---- Materials -----------------------------------------------------------
  if (should("materials")) {
    for (const y of YARDS) {
      await db.yard.upsert({
        where: { id: `apex-yard-${y.key}` },
        create: {
          id: `apex-yard-${y.key}`, name: y.name, market: y.market,
          city: y.city, state: y.state, managerName: y.manager, status: "ACTIVE",
        },
        update: { name: y.name },
      });
    }

    /**
     * Inventory as movements, not as a balance somebody typed.
     *
     * A constrained job is constrained because more went out than came in. The
     * shortage is arithmetic over these rows, which is what makes "which
     * materials are running low" answerable from the database.
     */
    const constrained = new Set(projectsWith("material-constrained").map((p) => p.key));
    for (const p of PROJECTS) {
      if (p.status === "Upcoming") continue;
      const yard = YARDS.find((y) => y.market === p.market) ?? YARDS[0];
      const short = constrained.has(p.key);
      const crew = crewNameFor(p);

      await db.materialTransaction.upsert({
        where: { id: `apex-mtx-${p.key}-in` },
        create: {
          id: `apex-mtx-${p.key}-in`, kind: "RECEIVE", code: "FIBER-144",
          quantity: short ? 4000 : 26000, unit: "ft",
          projectId: `apex-proj-${p.key}`, yardId: `apex-yard-${yard.key}`,
          crew, at: new Date(on(anchor, -30)),
        },
        update: { quantity: short ? 4000 : 26000 },
      });
      await db.materialTransaction.upsert({
        where: { id: `apex-mtx-${p.key}-out` },
        create: {
          id: `apex-mtx-${p.key}-out`, kind: "ISSUE", code: "FIBER-144",
          quantity: short ? 3750 : 12000, unit: "ft",
          projectId: `apex-proj-${p.key}`, yardId: `apex-yard-${yard.key}`,
          crew, at: new Date(on(anchor, -6)),
        },
        update: { quantity: short ? 3750 : 12000 },
      });
    }
    ran.push("materials");
  }

  // ---- Tasks ---------------------------------------------------------------
  if (should("tasks")) {
    /**
     * The statuses the schema actually has. There is no "ready for
     * verification" task state — that condition lives on a Daily, which is
     * where the product models it, so it is not invented here.
     */
    const states: { status: string; category: string; dueDays: number; title: string }[] = [
      { status: "OPEN", category: "COMPLIANCE", dueDays: 4, title: "Confirm pole attachment permits" },
      { status: "IN_PROGRESS", category: "FIELD_ISSUE", dueDays: 2, title: "Walk the route with the inspector" },
      { status: "BLOCKED", category: "ADMIN", dueDays: -1, title: "Waiting on customer access letter" },
      { status: "DONE", category: "FIELD_ISSUE", dueDays: -6, title: "Close out restoration punch list" },
      // Genuinely overdue by its own date, not by a flag.
      { status: "OPEN", category: "ADMIN", dueDays: -5, title: "Submit the missing daily for the gap" },
      { status: "OPEN", category: "MATERIALS", dueDays: -2, title: "Reel shortage — order before Friday" },
    ];

    let i = 0;
    for (const p of PROJECTS) {
      if (p.status === "Upcoming") continue;
      const picks = p.storylines.includes("punch-list")
        ? states
        : p.storylines.includes("material-constrained")
          ? [states[0], states[1], states[5]]
          : states.slice(0, 3);

      for (const s of picks) {
        const id = `apex-task-${p.key}-${i++}`;
        await db.task.upsert({
          where: { id },
          create: {
            id,
            title: `${s.title} — ${p.name}`,
            status: s.status as never,
            category: s.category as never,
            priority: s.dueDays < 0 ? "HIGH" : "NORMAL",
            projectId: `apex-proj-${p.key}`,
            dueDate: on(anchor, s.dueDays),
            completedAt: s.status === "DONE" ? new Date(on(anchor, s.dueDays)) : null,
          },
          update: { status: s.status as never, dueDate: on(anchor, s.dueDays) },
        });
      }
    }
    ran.push("tasks");
  }

  // ---- Pipeline ------------------------------------------------------------
  if (should("prospects")) {
    /** The demo's stages, mapped onto the ones the schema defines. */
    const STAGE: Record<string, string> = {
      NEW: "NEW", CONTACTED: "CONTACTED", QUALIFYING: "QUALIFYING",
      PROPOSAL: "IN_DISCUSSION", NEGOTIATION: "NEGOTIATING", WON: "WON", LOST: "LOST",
    };

    for (const pr of PROSPECTS) {
      const owner = STAFF.find((s) => s.key === pr.owner)!;
      await db.prospect.upsert({
        where: { id: `apex-prospect-${pr.key}` },
        create: {
          id: `apex-prospect-${pr.key}`,
          name: pr.name,
          kind: (pr.kind === "CUSTOMER" ? "PRIME" : "SUBCONTRACTOR") as never,
          stage: (STAGE[pr.stage] ?? "NEW") as never,
          markets: [pr.market],
          homeState: "FL",
          owner: owner.name,
          ownerUserId: `apex-user-${owner.key}`,
          nextStep: "Follow up",
          nextStepDue: on(anchor, pr.followUpDays),
        },
        update: { stage: (STAGE[pr.stage] ?? "NEW") as never, nextStepDue: on(anchor, pr.followUpDays) },
      });
      await db.prospectActivity.upsert({
        where: { id: `apex-pact-${pr.key}` },
        create: {
          id: `apex-pact-${pr.key}`,
          prospectId: `apex-prospect-${pr.key}`,
          kind: "note",
          body: `Introductory call with ${pr.name}.`,
          author: owner.name,
        },
        update: { body: `Introductory call with ${pr.name}.` },
      });
    }
    ran.push("prospects");
  }

  // ---- Messages ------------------------------------------------------------
  if (should("messages")) {
    /**
     * Conversations as history only.
     *
     * Nothing is sent. The organisation is a demo with texting off at the
     * settings level, and this writes rows rather than calling a carrier — a
     * seeded message that went out would be a real text to an invented number.
     * No MessageDelivery rows are written for the same reason: a delivery
     * record would claim something left the building.
     */
    for (const p of PROJECTS.slice(0, 9)) {
      const convId = `apex-conv-${p.key}`;
      await db.conversation.upsert({
        where: { id: convId },
        create: {
          id: convId, type: "PROJECT" as never,
          title: `${p.name} — field coordination`,
          subject: `${p.name} — field coordination`,
          projectId: `apex-proj-${p.key}`,
        },
        update: { subject: `${p.name} — field coordination` },
      });

      const bodies = [
        `Crew is on ${p.location} today.`,
        "Copy. Locates are marked and in date.",
        "Photos are on the daily, as-built to follow.",
      ];
      for (const [m, body] of bodies.entries()) {
        await db.message.upsert({
          where: { id: `apex-msg-${p.key}-${m}` },
          create: {
            id: `apex-msg-${p.key}-${m}`,
            conversationId: convId,
            direction: (m % 2 === 0 ? "OUTBOUND" : "INBOUND") as never,
            kind: "USER" as never,
            senderName: m % 2 === 0 ? STAFF[1].name : crewNameFor(p),
            body,
          },
          update: { body },
        });
      }
    }
    ran.push("messages");
  }

  // ---- Compliance papers ---------------------------------------------------
  if (should("documents")) {
    /**
     * A SubDocument is a file in a section, not a status field — so onboarding
     * state is shown by which papers exist and which do not, which is how the
     * compliance screen reads it. A missing COI is a missing row.
     */
    for (const s of SUBS) {
      const sections: [string, boolean][] = [
        ["nda", s.onboarding.nda],
        ["agreement", s.onboarding.agreement],
        ["w9", s.onboarding.w9],
        ["coi", s.onboarding.coi],
      ];
      for (const [section, present] of sections) {
        const id = `apex-subdoc-${s.key}-${section}`;
        if (!present) {
          // Absent on purpose: the gap is the compliance story.
          await db.subDocument.deleteMany({ where: { id } });
          continue;
        }
        await db.subDocument.upsert({
          where: { id },
          create: {
            id,
            subcontractorId: `apex-sub-${s.key}`,
            section,
            fileName: `${s.key}-${section}.pdf`,
            mediaType: "application/pdf",
            sizeBytes: 24_000,
            // A placeholder, not a real document.
            dataUrl: `data:application/pdf;base64,${Buffer.from(`${s.company} ${section}`).toString("base64")}`,
            uploadedBy: "subcontractor",
          },
          update: { fileName: `${s.key}-${section}.pdf` },
        });
      }
    }
    ran.push("documents");
  }

  return ran;
}
