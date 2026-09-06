import "server-only";

import { prisma } from "@/lib/prisma";
import type { MaterialInstanceStatus, Prisma } from "@prisma/client";

/**
 * Every operation that moves material.
 *
 * One rule holds the whole thing together: nothing changes an instance without
 * writing the event that changed it, in the same transaction. A quantity that
 * moved with no row saying why is the spreadsheet problem this replaces.
 *
 * Custody on the instance is a cache of the newest event. It exists so a list
 * of two hundred reels can be drawn without replaying two thousand movements;
 * the events remain the truth, and `rebuildCustody` can restate the cache from
 * them if the two ever disagree.
 */

export class MaterialError extends Error {}

/** What a movement is worth to the yard. Positive adds, negative removes. */
const SIGN: Record<string, number> = {
  RECEIVE: 1,
  RETURN: 1,
  ADJUST: 1,
  ISSUE: -1,
  TRANSFER: -1,
  DAMAGE: -1,
  DISPOSE: -1,
  // Installing moves material from a truck into the ground. It never touches
  // the yard, so it has no sign here.
  INSTALL: 0,
  COUNT: 0,
};

export interface Actor {
  userId: string;
  name: string;
}

interface EventInput {
  kind: string;
  code: string;
  quantity: number;
  unit?: string;
  instanceId?: string | null;
  sessionId?: string | null;
  projectId?: string;
  yardId?: string;
  reelNumber?: string;
  from?: { subId?: string; crew?: string; person?: string; location?: string };
  to?: { subId?: string; crew?: string; person?: string; location?: string };
  vehicle?: string;
  trailer?: string;
  reference?: string;
  reason?: string;
  notes?: string;
  photos?: unknown[];
  sourceDailyId?: string;
  source?: string;
  expectedQty?: number | null;
  actualQty?: number | null;
  varianceReason?: string;
  receivedBy?: string;
  signatureUrl?: string;
  actor: Actor;
}

/** Write one movement. Always inside the caller's transaction. */
async function writeEvent(tx: Prisma.TransactionClient, e: EventInput) {
  return tx.materialTransaction.create({
    data: {
      kind: e.kind,
      code: e.code.trim().toUpperCase(),
      // Signed at the point of writing, so on-hand is a sum and no reader has
      // to know which kinds count which way.
      // An unrecognised kind is stored positive rather than silently zeroed —
      // a movement worth nothing is a movement that never happened.
      quantity: Math.abs(e.quantity) * (SIGN[e.kind] ?? 1),
      unit: e.unit ?? "",
      instanceId: e.instanceId ?? null,
      sessionId: e.sessionId ?? null,
      projectId: e.projectId ?? "",
      yardId: e.yardId ?? "",
      reelNumber: e.reelNumber ?? "",
      custodianSubId: e.to?.subId ?? "",
      crew: e.to?.crew ?? "",
      fromSubId: e.from?.subId ?? "",
      fromCrew: e.from?.crew ?? "",
      fromPerson: e.from?.person ?? "",
      fromLocation: e.from?.location ?? "",
      toSubId: e.to?.subId ?? "",
      toCrew: e.to?.crew ?? "",
      toPerson: e.to?.person ?? "",
      toLocation: e.to?.location ?? "",
      vehicle: e.vehicle ?? "",
      trailer: e.trailer ?? "",
      reference: e.reference ?? "",
      reason: e.reason ?? e.notes ?? "",
      photos: (e.photos ?? []) as Prisma.InputJsonValue,
      sourceDailyId: e.sourceDailyId ?? "",
      source: e.source ?? "manual",
      expectedQty: e.expectedQty ?? null,
      actualQty: e.actualQty ?? null,
      varianceReason: e.varianceReason ?? "",
      actorUserId: e.actor.userId,
      receivedBy: e.receivedBy ?? "",
      signatureUrl: e.signatureUrl ?? "",
    },
  });
}

/* ------------------------------------------------------------------ *
 * Reading a position.
 * ------------------------------------------------------------------ */

export interface InstancePosition {
  originalQty: number;
  issued: number;
  installed: number;
  returned: number;
  damaged: number;
  /** What should be left on it, by the book. */
  expectedRemaining: number;
  /** What somebody last physically found. */
  actualRemaining: number | null;
  /** Actual less expected. Negative means material is unaccounted for. */
  variance: number | null;
  usedPct: number;
}

/**
 * What the events say about one instance.
 *
 * Derived every time rather than stored: a stored remaining figure is a number
 * somebody can edit, and the point of this module is that they cannot.
 */
export async function instancePosition(instanceId: string): Promise<InstancePosition> {
  const [inst, events] = await Promise.all([
    prisma.materialInstance.findUnique({
      where: { id: instanceId },
      select: { originalQty: true, lastVerifiedQty: true },
    }),
    prisma.materialTransaction.findMany({
      where: { instanceId },
      select: { kind: true, quantity: true },
    }),
  ]);

  const sum = (kind: string) =>
    events.filter((e) => e.kind === kind).reduce((n, e) => n + Math.abs(e.quantity), 0);

  const originalQty = inst?.originalQty ?? 0;
  const issued = sum("ISSUE");
  const installed = sum("INSTALL");
  const returned = sum("RETURN");
  const damaged = sum("DAMAGE") + sum("DISPOSE");

  // What is left on the reel: what went out, less what went in the ground,
  // less what came back, less what was written off.
  const expectedRemaining = round(issued - installed - returned - damaged);
  const actualRemaining = inst?.lastVerifiedQty ?? null;

  return {
    originalQty,
    issued,
    installed,
    returned,
    damaged,
    expectedRemaining,
    actualRemaining,
    variance: actualRemaining == null ? null : round(actualRemaining - expectedRemaining),
    usedPct: originalQty > 0 ? Math.min(100, round((installed / originalQty) * 100)) : 0,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * The operations.
 * ------------------------------------------------------------------ */

export interface ReceiveInput {
  code: string;
  description?: string;
  category?: string;
  unit?: string;
  quantity: number;
  reelNumber?: string;
  lotNumber?: string;
  serialNumber?: string;
  manufacturer?: string;
  partNumber?: string;
  supplier?: string;
  poNumber?: string;
  shipmentNumber?: string;
  yardId?: string;
  locationLabel?: string;
  projectId?: string | null;
  photos?: unknown[];
  notes?: string;
  sessionId?: string | null;
  actor: Actor;
}

/**
 * Book material in.
 *
 * A reel number makes it an instance; without one it is a quantity of unit
 * material and only the ledger moves. Receiving the same reel twice is refused
 * rather than merged — two rows for one reel is how a yard ends up believing it
 * has twice the fiber it has.
 */
export async function receiveMaterial(input: ReceiveInput) {
  const code = input.code.trim().toUpperCase();
  const reel = (input.reelNumber ?? "").trim();
  if (!code) throw new MaterialError("A material code is required.");
  if (!(input.quantity > 0)) throw new MaterialError("Enter a quantity greater than zero.");

  return prisma.$transaction(async (tx) => {
    let instanceId: string | null = null;

    if (reel) {
      const clash = await tx.materialInstance.findUnique({
        where: { code_reelNumber: { code, reelNumber: reel } },
        select: { id: true, status: true },
      });
      if (clash) {
        throw new MaterialError(
          `Reel ${reel} already exists on ${code} and is ${clash.status.toLowerCase().replace("_", " ")}. Use its record rather than receiving it again.`,
        );
      }
      const inst = await tx.materialInstance.create({
        data: {
          code,
          description: input.description ?? "",
          category: input.category ?? "Hardware",
          unit: input.unit ?? "ft",
          reelNumber: reel,
          lotNumber: input.lotNumber ?? "",
          serialNumber: input.serialNumber ?? "",
          manufacturer: input.manufacturer ?? "",
          partNumber: input.partNumber ?? "",
          originalQty: input.quantity,
          status: "AVAILABLE",
          yardId: input.yardId ?? "",
          locationLabel: input.locationLabel || "Yard",
          projectId: input.projectId || null,
          supplier: input.supplier ?? "",
          poNumber: input.poNumber ?? "",
          shipmentNumber: input.shipmentNumber ?? "",
        },
        select: { id: true },
      });
      instanceId = inst.id;
    }

    await writeEvent(tx, {
      kind: "RECEIVE",
      code,
      quantity: input.quantity,
      unit: input.unit,
      instanceId,
      sessionId: input.sessionId,
      projectId: input.projectId ?? "",
      yardId: input.yardId,
      reelNumber: reel,
      to: { location: input.locationLabel || "Yard" },
      reference: input.poNumber ?? "",
      notes: input.notes,
      photos: input.photos,
      receivedBy: input.actor.name,
      actor: input.actor,
    });

    return { instanceId };
  });
}

export interface IssueInput {
  instanceId?: string | null;
  code?: string;
  quantity: number;
  unit?: string;
  projectId?: string;
  custodianSubId?: string;
  crew?: string;
  /** The person who physically took it. */
  personName: string;
  personRole?: string;
  vehicle?: string;
  trailer?: string;
  fromLocation?: string;
  destination?: string;
  yardId?: string;
  photos?: unknown[];
  notes?: string;
  sessionId?: string | null;
  acknowledgedBy?: string;
  signatureUrl?: string;
  actor: Actor;
}

/**
 * Hand material to a crew.
 *
 * Two things make this different from decrementing a number. It records who
 * physically took it — the name that settles the argument eight weeks later —
 * and it refuses to issue an instance somebody already has, inside a
 * transaction, so two people at two screens cannot both issue the same reel.
 */
export async function issueMaterial(input: IssueInput) {
  if (!(input.quantity > 0)) throw new MaterialError("Enter a quantity greater than zero.");
  if (!input.personName.trim()) {
    throw new MaterialError("Record who is physically picking this up.");
  }

  return prisma.$transaction(async (tx) => {
    let code = (input.code ?? "").trim().toUpperCase();
    let reel = "";
    let from: EventInput["from"] = { location: input.fromLocation || "Yard" };

    if (input.instanceId) {
      // Locked for the length of the transaction: a second issue of the same
      // reel waits here and then finds it already checked out.
      const rows = await tx.$queryRaw<
        { id: string; code: string; reelNumber: string; status: string; custodianSubId: string | null; crew: string; responsibleName: string; locationLabel: string }[]
      >`SELECT id, code, "reelNumber", status::text, "custodianSubId", crew, "responsibleName", "locationLabel"
          FROM "MaterialInstance" WHERE id = ${input.instanceId} FOR UPDATE`;
      const inst = rows[0];
      if (!inst) throw new MaterialError("That material record no longer exists.");

      if (["CHECKED_OUT", "ACTIVE", "IN_TRANSIT"].includes(inst.status)) {
        throw new MaterialError(
          `${inst.code} ${inst.reelNumber} is already checked out${inst.crew ? ` to ${inst.crew}` : ""}. Transfer it instead.`,
        );
      }
      if (["DISPOSED", "CLOSED", "DAMAGED"].includes(inst.status)) {
        throw new MaterialError(`${inst.code} ${inst.reelNumber} is ${inst.status.toLowerCase()} and cannot be issued.`);
      }

      code = inst.code;
      reel = inst.reelNumber;
      from = {
        subId: inst.custodianSubId ?? "",
        crew: inst.crew,
        person: inst.responsibleName,
        location: inst.locationLabel,
      };

      await tx.materialInstance.update({
        where: { id: input.instanceId },
        data: {
          status: "CHECKED_OUT",
          projectId: input.projectId || null,
          custodianSubId: input.custodianSubId || null,
          crew: input.crew ?? "",
          responsibleName: input.personName.trim(),
          vehicle: input.vehicle ?? "",
          trailer: input.trailer ?? "",
          locationLabel: input.destination || input.vehicle || "With crew",
          checkedOutAt: new Date(),
          issuedByName: input.actor.name,
        },
      });
    }

    if (!code) throw new MaterialError("A material code is required.");

    await writeEvent(tx, {
      kind: "ISSUE",
      code,
      quantity: input.quantity,
      unit: input.unit,
      instanceId: input.instanceId ?? null,
      sessionId: input.sessionId,
      projectId: input.projectId,
      yardId: input.yardId,
      reelNumber: reel,
      from,
      to: {
        subId: input.custodianSubId,
        crew: input.crew,
        person: input.personName.trim(),
        location: input.destination || input.vehicle || "With crew",
      },
      vehicle: input.vehicle,
      trailer: input.trailer,
      notes: input.notes,
      photos: input.photos,
      receivedBy: input.acknowledgedBy ?? input.personName.trim(),
      signatureUrl: input.signatureUrl,
      actor: input.actor,
    });

    return { ok: true };
  });
}

export interface TransferInput {
  instanceId: string;
  quantity: number;
  toSubId?: string;
  toCrew?: string;
  toPerson: string;
  toLocation?: string;
  vehicle?: string;
  trailer?: string;
  photos?: unknown[];
  notes?: string;
  sessionId?: string | null;
  actor: Actor;
}

/** Move custody without it passing through the yard. */
export async function transferMaterial(input: TransferInput) {
  if (!input.toPerson.trim()) throw new MaterialError("Record who is taking it.");

  return prisma.$transaction(async (tx) => {
    const inst = await tx.materialInstance.findUnique({
      where: { id: input.instanceId },
      select: {
        id: true, code: true, reelNumber: true, status: true, unit: true,
        custodianSubId: true, crew: true, responsibleName: true, locationLabel: true, projectId: true,
      },
    });
    if (!inst) throw new MaterialError("That material record no longer exists.");
    if (["DISPOSED", "CLOSED"].includes(inst.status)) {
      throw new MaterialError("That material is closed and cannot be transferred.");
    }

    await tx.materialInstance.update({
      where: { id: inst.id },
      data: {
        custodianSubId: input.toSubId || null,
        crew: input.toCrew ?? "",
        responsibleName: input.toPerson.trim(),
        locationLabel: input.toLocation || input.vehicle || "With crew",
        vehicle: input.vehicle ?? "",
        trailer: input.trailer ?? "",
        status: "CHECKED_OUT",
      },
    });

    await writeEvent(tx, {
      kind: "TRANSFER",
      code: inst.code,
      quantity: input.quantity,
      unit: inst.unit,
      instanceId: inst.id,
      sessionId: input.sessionId,
      projectId: inst.projectId ?? "",
      reelNumber: inst.reelNumber,
      from: {
        subId: inst.custodianSubId ?? "",
        crew: inst.crew,
        person: inst.responsibleName,
        location: inst.locationLabel,
      },
      to: {
        subId: input.toSubId,
        crew: input.toCrew,
        person: input.toPerson.trim(),
        location: input.toLocation || input.vehicle || "With crew",
      },
      vehicle: input.vehicle,
      trailer: input.trailer,
      notes: input.notes,
      photos: input.photos,
      receivedBy: input.toPerson.trim(),
      actor: input.actor,
    });

    return { ok: true };
  });
}

export interface ReturnInput {
  instanceId: string;
  actualQty: number;
  condition?: string;
  varianceReason?: string;
  comment?: string;
  yardId?: string;
  location?: string;
  photos?: unknown[];
  sessionId?: string | null;
  actor: Actor;
}

/**
 * Take material back, and say what came back.
 *
 * The variance is the point. Expected remaining is what the ledger says should
 * be on the reel; actual is what somebody measured. A gap outside tolerance
 * needs a reason before it is accepted — not to accuse anybody, but because a
 * gap nobody explained at the time is unexplainable later.
 */
export async function returnMaterial(input: ReturnInput) {
  if (input.actualQty < 0) throw new MaterialError("A returned quantity cannot be negative.");

  const pos = await instancePosition(input.instanceId);
  const variance = round(input.actualQty - pos.expectedRemaining);
  const tolerance = toleranceFor(pos.expectedRemaining);

  if (Math.abs(variance) > tolerance && !input.varianceReason) {
    throw new MaterialError(
      `Expected ${pos.expectedRemaining} back and ${input.actualQty} came in — a ${variance > 0 ? "+" : ""}${variance} difference. Pick a reason before returning it.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const inst = await tx.materialInstance.findUnique({
      where: { id: input.instanceId },
      select: {
        id: true, code: true, reelNumber: true, unit: true, projectId: true,
        custodianSubId: true, crew: true, responsibleName: true, locationLabel: true,
      },
    });
    if (!inst) throw new MaterialError("That material record no longer exists.");

    const flagged = Math.abs(variance) > tolerance;

    await tx.materialInstance.update({
      where: { id: inst.id },
      data: {
        status: flagged ? "RECONCILE" : input.actualQty > 0 ? "AVAILABLE" : "CLOSED",
        custodianSubId: null,
        crew: "",
        responsibleName: "",
        vehicle: "",
        trailer: "",
        locationLabel: input.location || "Yard",
        yardId: input.yardId ?? "",
        checkedOutAt: null,
        lastVerifiedAt: new Date(),
        lastVerifiedQty: input.actualQty,
        lastVerifiedBy: input.actor.name,
      },
    });

    await writeEvent(tx, {
      kind: "RETURN",
      code: inst.code,
      quantity: input.actualQty,
      unit: inst.unit,
      instanceId: inst.id,
      sessionId: input.sessionId,
      projectId: inst.projectId ?? "",
      yardId: input.yardId,
      reelNumber: inst.reelNumber,
      from: {
        subId: inst.custodianSubId ?? "",
        crew: inst.crew,
        person: inst.responsibleName,
        location: inst.locationLabel,
      },
      to: { location: input.location || "Yard" },
      expectedQty: pos.expectedRemaining,
      actualQty: input.actualQty,
      varianceReason: input.varianceReason ?? "",
      notes: input.comment,
      photos: input.photos,
      receivedBy: input.actor.name,
      actor: input.actor,
    });

    return { variance, flagged };
  });
}

export interface VerifyInput {
  instanceId: string;
  actualQty: number;
  varianceReason?: string;
  comment?: string;
  photos?: unknown[];
  actor: Actor;
}

/** A physical count, without custody changing hands. */
export async function verifyMaterial(input: VerifyInput) {
  const pos = await instancePosition(input.instanceId);
  const variance = round(input.actualQty - pos.expectedRemaining);
  const flagged = Math.abs(variance) > toleranceFor(pos.expectedRemaining);

  return prisma.$transaction(async (tx) => {
    const inst = await tx.materialInstance.findUnique({
      where: { id: input.instanceId },
      select: { id: true, code: true, reelNumber: true, unit: true, projectId: true, status: true, originalQty: true, custodianSubId: true, crew: true, responsibleName: true, locationLabel: true },
    });
    if (!inst) throw new MaterialError("That material record no longer exists.");

    // A count does not move material, so it does not move custody. It can move
    // status: a reel that is nearly empty is worth knowing about before a crew
    // is standing at a splice point with 200 ft left.
    const left = input.actualQty;
    const pct = inst.originalQty > 0 ? left / inst.originalQty : 1;
    const status: MaterialInstanceStatus = flagged
      ? "RECONCILE"
      : left <= 0
        ? "CLOSED"
        : pct <= 0.05
          ? "NEARLY_EMPTY"
          : pct <= 0.15
            ? "LOW"
            : inst.status === "CHECKED_OUT"
              ? "ACTIVE"
              : inst.status;

    await tx.materialInstance.update({
      where: { id: inst.id },
      data: {
        status,
        lastVerifiedAt: new Date(),
        lastVerifiedQty: left,
        lastVerifiedBy: input.actor.name,
      },
    });

    await writeEvent(tx, {
      kind: "COUNT",
      code: inst.code,
      quantity: 0,
      unit: inst.unit,
      instanceId: inst.id,
      projectId: inst.projectId ?? "",
      reelNumber: inst.reelNumber,
      from: { subId: inst.custodianSubId ?? "", crew: inst.crew, person: inst.responsibleName, location: inst.locationLabel },
      to: { subId: inst.custodianSubId ?? "", crew: inst.crew, person: inst.responsibleName, location: inst.locationLabel },
      expectedQty: pos.expectedRemaining,
      actualQty: left,
      varianceReason: input.varianceReason ?? "",
      notes: input.comment,
      photos: input.photos,
      receivedBy: input.actor.name,
      actor: input.actor,
    });

    return { variance, flagged, status };
  });
}

export interface DamageInput {
  instanceId: string;
  quantity: number;
  damageType?: string;
  description: string;
  disposition?: string;
  photos?: unknown[];
  actor: Actor;
}

/** Write material off, with a reason and a photograph. */
export async function recordDamage(input: DamageInput) {
  if (!(input.quantity > 0)) throw new MaterialError("Enter the quantity damaged.");
  if (!input.description.trim()) throw new MaterialError("Describe what happened.");

  return prisma.$transaction(async (tx) => {
    const inst = await tx.materialInstance.findUnique({
      where: { id: input.instanceId },
      select: { id: true, code: true, reelNumber: true, unit: true, projectId: true, custodianSubId: true, crew: true, responsibleName: true, locationLabel: true },
    });
    if (!inst) throw new MaterialError("That material record no longer exists.");

    await tx.materialInstance.update({
      where: { id: inst.id },
      data: { status: input.disposition === "Scrap" ? "DISPOSED" : "DAMAGED" },
    });

    await writeEvent(tx, {
      kind: input.disposition === "Scrap" ? "DISPOSE" : "DAMAGE",
      code: inst.code,
      quantity: input.quantity,
      unit: inst.unit,
      instanceId: inst.id,
      projectId: inst.projectId ?? "",
      reelNumber: inst.reelNumber,
      from: { subId: inst.custodianSubId ?? "", crew: inst.crew, person: inst.responsibleName, location: inst.locationLabel },
      reason: `${input.damageType ?? "Damage"}: ${input.description}`.slice(0, 400),
      notes: input.disposition,
      photos: input.photos,
      actor: input.actor,
    });

    return { ok: true };
  });
}

/**
 * Consume material because a daily said so.
 *
 * Called when a daily is approved. The crew already wrote the footage on their
 * sheet; making an inventory manager type it a second time is how the two
 * numbers start disagreeing.
 *
 * Idempotent on the daily and the instance: re-approving a daily, or approving
 * it after a correction, must not consume the same footage twice.
 */
export async function consumeFromDaily(input: {
  dailyId: string;
  instanceId: string;
  code: string;
  quantity: number;
  unit?: string;
  projectId?: string;
  crew?: string;
  custodianSubId?: string;
  actor: Actor;
}) {
  if (!(input.quantity > 0)) return { ok: false as const, reason: "Nothing to consume." };

  const already = await prisma.materialTransaction.findFirst({
    where: { kind: "INSTALL", sourceDailyId: input.dailyId, instanceId: input.instanceId, code: input.code.trim().toUpperCase() },
    select: { id: true },
  });
  if (already) return { ok: false as const, reason: "Already consumed for this daily." };

  return prisma.$transaction(async (tx) => {
    await writeEvent(tx, {
      kind: "INSTALL",
      code: input.code,
      quantity: input.quantity,
      unit: input.unit,
      instanceId: input.instanceId,
      projectId: input.projectId,
      to: { subId: input.custodianSubId, crew: input.crew, location: "Installed" },
      sourceDailyId: input.dailyId,
      source: "daily",
      actor: input.actor,
    });

    // A reel that has now had more installed off it than was ever issued is
    // the billing flag this module exists for. Flagged, never silently fixed.
    const pos = await instancePosition(input.instanceId);
    if (pos.expectedRemaining < 0) {
      await tx.materialInstance.update({
        where: { id: input.instanceId },
        data: { status: "RECONCILE" },
      });
    }

    return { ok: true as const };
  });
}

/**
 * How far a count may drift before somebody has to explain it.
 *
 * A percentage with a floor, because 1% of 48,000 ft is 480 ft and 1% of 200
 * is two — the second is a rounding error and the first is a day's work.
 * Deliberately generous: a tolerance set too tight turns every return into a
 * form nobody fills in honestly.
 */
export function toleranceFor(expected: number): number {
  return Math.max(25, Math.abs(expected) * 0.01);
}

/**
 * Restate the cached custody on an instance from its events.
 *
 * The cache exists for speed and the events are the truth; if they ever
 * disagree, this is what settles it. Not called on a schedule — it is a repair
 * tool, and needing it means something upstream wrote outside a transaction.
 */
export async function rebuildCustody(instanceId: string) {
  const last = await prisma.materialTransaction.findFirst({
    where: { instanceId, kind: { in: ["ISSUE", "TRANSFER", "RETURN", "RECEIVE"] } },
    orderBy: { at: "desc" },
    select: { kind: true, toSubId: true, toCrew: true, toPerson: true, toLocation: true },
  });
  if (!last) return;

  await prisma.materialInstance.update({
    where: { id: instanceId },
    data: {
      custodianSubId: last.toSubId || null,
      crew: last.toCrew,
      responsibleName: last.toPerson,
      locationLabel: last.toLocation || "Yard",
    },
  });
}
