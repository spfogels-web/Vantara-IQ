"use server";

/**
 * Evidence: recording it, classifying it, and saying when a route has been
 * documented.
 *
 * Kept apart from actions.ts because these carry a rule the rest of the
 * application does not: what the camera observed is written once and never
 * rewritten. Everything here either creates a record from what a device
 * reported, or changes what somebody *says about* a record — and the second
 * kind is audited, because a photograph reclassified out of "existing damage"
 * the week a claim lands is exactly the change somebody will want to find.
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { assertProjectAccess, requireStaff, requireUser } from "@/lib/authz";
import {
  auditEvidenceChange,
  legacyPurposeFor,
  linkableEvidenceWhere,
  usableCapturedAt,
  usableFix,
  type EvidenceStageValue,
} from "@/lib/evidence";
import { prisma } from "@/lib/prisma";

const CATEGORIES = [
  "EXISTING_DAMAGE",
  "DRIVEWAY",
  "CURB_SIDEWALK",
  "LANDSCAPING_LAWN",
  "IRRIGATION",
  "MAILBOX",
  "FENCE",
  "ROAD_SHOULDER",
  "DRAINAGE",
  "UTILITY_PEDESTAL",
  "STRUCTURE",
  "GENERAL_ROUTE",
  "OTHER",
] as const;
type Category = (typeof CATEGORIES)[number];

const STAGES = ["PRE_CONSTRUCTION", "WORK_RECORD", "DIRECTION", "CLOSEOUT"] as const;

const asCategory = (v: unknown): Category =>
  CATEGORIES.includes(v as Category) ? (v as Category) : "OTHER";
const asStage = (v: unknown, fallback: EvidenceStageValue): EvidenceStageValue =>
  STAGES.includes(v as EvidenceStageValue) ? (v as EvidenceStageValue) : fallback;

/**
 * Record evidence a crew captured on a daily.
 *
 * The file is already in Blob — the browser uploaded it directly, so a phone
 * video is not capped by the serverless body limit — and this writes the row
 * that makes it evidence. It is the *same* file the daily shows: one object,
 * one record, two places it appears. Nothing is copied.
 *
 * What the device reported is taken as offered and nothing else is filled in.
 * If the crew declined the location permission, or the share sheet stripped
 * the EXIF, the record says it has no location. It does not borrow the
 * project's address, the daily's address, or the coordinate of the photograph
 * taken before it — all three would produce a map pin that looks like evidence
 * and is not.
 */
export async function saveDailyEvidence(input: {
  projectId: string;
  dailySheetId?: string | null;
  dailyId?: string | null;
  subcontractorId?: string | null;
  url: string;
  mediaType: string;
  sizeBytes: number;
  kind: "PHOTO" | "VIDEO";
  source: "CAMERA" | "LIBRARY";
  capturedAt?: string | null;
  capturedAtSource?: string;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  locationSource?: string;
  caption?: string;
  /** "Ped", "Handhole" — what the crew says it is, kept with the record. */
  structure?: string;
}) {
  const user = await requireUser();
  await assertProjectAccess(input.projectId);

  if (!input.url.trim()) return { ok: false as const, error: "No file was uploaded." };

  const fix = usableFix(input);
  const captured = usableCapturedAt(input.capturedAt, input.capturedAtSource);

  const caption = [input.structure?.trim(), input.caption?.trim()].filter(Boolean).join(" — ");

  const photo = await prisma.projectPhoto.create({
    data: {
      projectId: input.projectId,
      url: input.url,
      mediaType: input.mediaType || "",
      sizeBytes: Math.max(0, Math.round(input.sizeBytes || 0)),
      kind: input.kind === "VIDEO" ? "VIDEO" : "PHOTO",
      source: input.source === "CAMERA" ? "CAMERA" : "LIBRARY",

      // Work a crew did, unless somebody later says otherwise.
      stage: "WORK_RECORD",
      purpose: legacyPurposeFor("WORK_RECORD"),
      category: "OTHER",

      capturedAt: captured?.at ?? null,
      capturedAtSource: captured?.source ?? "",
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
      accuracyM: fix?.accuracyM ?? null,
      locationSource: fix?.source ?? "",

      caption,
      dailySheetId: input.dailySheetId ?? null,
      dailyId: input.dailyId ?? null,
      subcontractorId: input.subcontractorId ?? user.subcontractorId ?? null,
      uploadedBy: user.name || user.email,
      uploadedByUserId: user.id,
    },
    select: { id: true },
  });

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true as const, id: photo.id };
}

/**
 * Say what a piece of evidence is *of*.
 *
 * Only the classification moves. The capture time, the coordinate, who
 * uploaded it and which daily it came from are not in the patch and cannot be
 * reached from here — see IMMUTABLE_EVIDENCE_FIELDS, and the tests that hold
 * the two lists apart.
 */
export async function classifyEvidence(
  id: string,
  patch: {
    caption?: string;
    stage?: string;
    category?: string;
    existingDamage?: boolean;
    damageNote?: string;
  },
) {
  const before = await prisma.projectPhoto.findUnique({
    where: { id },
    select: {
      projectId: true,
      caption: true,
      stage: true,
      category: true,
      existingDamage: true,
      damageNote: true,
    },
  });
  if (!before) return { ok: false as const, error: "That evidence no longer exists." };

  const user = await requireUser();
  await assertProjectAccess(before.projectId);

  const stage = patch.stage ? asStage(patch.stage, before.stage as EvidenceStageValue) : undefined;

  const after = {
    ...(patch.caption != null ? { caption: patch.caption.trim() } : {}),
    ...(stage ? { stage, purpose: legacyPurposeFor(stage) } : {}),
    ...(patch.category != null ? { category: asCategory(patch.category) } : {}),
    ...(patch.existingDamage != null ? { existingDamage: patch.existingDamage } : {}),
    ...(patch.damageNote != null ? { damageNote: patch.damageNote.trim() } : {}),
  };

  await prisma.projectPhoto.update({ where: { id }, data: after });

  await auditEvidenceChange({
    photoId: id,
    projectId: before.projectId,
    actorEmail: user.email,
    actorUserId: user.id,
    before,
    // `purpose` moves with `stage` and is not interesting on its own.
    after: { ...after, purpose: undefined },
  });

  revalidatePath(`/projects/${before.projectId}`);
  return { ok: true as const };
}

/**
 * How far along a project's baseline documentation is.
 *
 * IN_PROGRESS happens on its own, the first time somebody captures
 * pre-construction evidence — that much is simply true once a photograph
 * exists. COMPLETE does not: somebody has to say a route has been documented,
 * and the record keeps who said it and when. A tick that arrived because a
 * count crossed a threshold is a tick nobody is accountable for, and the whole
 * point of this section is to be able to say who stood behind it.
 */
export async function setPreConStatus(
  projectId: string,
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE",
) {
  // Marking a route documented is an office decision, not a field one.
  const user = await requireStaff();
  await assertProjectAccess(projectId);

  const complete = status === "COMPLETE";
  await prisma.project.update({
    where: { id: projectId },
    data: {
      preConStatus: status,
      preConCompletedBy: complete ? user.name || user.email : "",
      preConCompletedAt: complete ? new Date() : null,
    },
  });

  await prisma.accessLog
    .create({
      data: {
        action: "evidence.precon.status",
        actorUserId: user.id,
        actorEmail: user.email,
        subjectId: projectId,
        detail: `pre-construction documentation set to ${status}`,
      },
    })
    .catch(() => undefined);

  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

/**
 * Nudge a project from NOT_STARTED to IN_PROGRESS.
 *
 * Called after the first pre-construction capture. Deliberately cannot move a
 * project to COMPLETE, and deliberately cannot move it backwards out of
 * COMPLETE — somebody saying a route is documented is not undone by a later
 * upload.
 */
export async function notePreConStarted(projectId: string) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const };
  await assertProjectAccess(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { preConStatus: true },
  });
  if (project?.preConStatus !== "NOT_STARTED") return { ok: true as const };

  await prisma.project.update({
    where: { id: projectId },
    data: { preConStatus: "IN_PROGRESS" },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

/**
 * Attach evidence captured on a draft daily to the daily once it has an id.
 *
 * Evidence is written the moment the shutter closes, not when a sheet is
 * submitted, because a photograph of an exposed gas main is worth keeping
 * whether or not the crew ever finishes their paperwork. That leaves a gap: on
 * a brand new sheet there is no id to record, so the record is created with
 * `dailySheetId = null` and linked here on the first save.
 *
 * ## What this refuses
 *
 * The client sends evidence ids, not filenames or timestamps, because the id
 * is the relationship and everything else is a guess that can collide. Each id
 * is then checked rather than trusted: it must already belong to the project
 * the sheet belongs to, and it must not already be linked to a *different*
 * daily. A caller handing over an id from another project — or another
 * tenant, which cannot reach this database at all — links nothing and is told
 * how many were refused.
 *
 * Idempotent: linking the same ids again is a no-op, which matters because a
 * sheet is saved over and over as a crew works.
 */
export async function linkDailyEvidence(input: {
  dailySheetId: string;
  projectId: string;
  evidenceIds: string[];
}) {
  const user = await requireUser();
  await assertProjectAccess(input.projectId);

  const ids = [...new Set(input.evidenceIds.filter((x) => typeof x === "string" && x))];
  if (!ids.length) return { ok: true as const, linked: 0, refused: 0 };

  // The sheet has to be the one it says it is, on the project it says it is.
  const sheet = await prisma.dailySheet.findUnique({
    where: { id: input.dailySheetId },
    select: { id: true, projectId: true, filedForId: true },
  });
  if (!sheet) return { ok: false as const, error: "That daily no longer exists." };
  if (sheet.projectId && sheet.projectId !== input.projectId) {
    return { ok: false as const, error: "That daily belongs to a different project." };
  }

  /**
   * Only evidence already on this project, and only evidence not already
   * spoken for by another daily. Both conditions are in the query rather than
   * checked afterwards, so there is no window between deciding and writing.
   */
  const linkable = await prisma.projectPhoto.findMany({
    where: linkableEvidenceWhere({ ids, projectId: input.projectId, dailySheetId: input.dailySheetId }),
    select: { id: true },
  });

  const refused = ids.length - linkable.length;

  if (linkable.length) {
    await prisma.projectPhoto.updateMany({
      where: { id: { in: linkable.map((x) => x.id) } },
      data: {
        dailySheetId: input.dailySheetId,
        ...(sheet.filedForId ? { subcontractorId: sheet.filedForId } : {}),
      },
    });
  }

  if (refused > 0) {
    // Worth a record: the ordinary case refuses nothing, so this is either a
    // stale client or somebody trying ids that are not theirs.
    await prisma.accessLog
      .create({
        data: {
          action: "evidence.link.refused",
          actorUserId: user.id,
          actorEmail: user.email,
          subjectId: input.dailySheetId,
          detail: `${refused} of ${ids.length} evidence ids did not belong to project ${input.projectId}`,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true as const, linked: linkable.length, refused };
}

/**
 * Say that a file reached Blob but never became evidence.
 *
 * The upload succeeding and the record failing leaves the two stores disagreeing
 * — the crew has their photograph on the sheet and the project has no evidence
 * of it. Losing the photograph would be worse, so the attachment stands; but
 * the disagreement must be findable rather than silent, because the whole value
 * of this system is that somebody can later ask what was photographed and get a
 * complete answer.
 *
 * The URL is kept so a reconciliation pass can create the missing record from
 * the file that is already there, without making anybody re-upload anything.
 */
export async function noteEvidenceGap(input: {
  projectId: string;
  url: string;
  reason: string;
}) {
  const me = await getCurrentUser();
  await prisma.accessLog
    .create({
      data: {
        action: "evidence.missing",
        actorUserId: me?.id ?? "",
        actorEmail: me?.email ?? "",
        subjectId: input.projectId,
        detail: `blob stored but no evidence record: ${input.url} (${input.reason})`,
      },
    })
    .catch(() => undefined);
  return { ok: true as const };
}
