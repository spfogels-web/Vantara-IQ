import "server-only";

/**
 * What a piece of construction evidence is, and the rules that follow from it.
 *
 * A photograph on a job is not decoration. Three weeks after the crew has gone,
 * a homeowner rings up and says the bore rig cracked their driveway, and the
 * only thing standing between that call and a cheque is whether somebody
 * photographed the driveway before anybody touched it — with a time on it, and
 * a place, and a way to tell where both came from.
 *
 * So the record has to survive being questioned. Two rules follow, and
 * everything in this file exists to hold them:
 *
 * ONE — a coordinate is never stored without a stated origin. Not guessed from
 * the project's address, not borrowed from the daily, not averaged from the
 * photographs either side of it. A picture with no location says so.
 *
 * TWO — what the camera recorded is not editable afterwards. Somebody may
 * later say what a photograph is *of*, and correct it; nobody may change when
 * it was taken or where.
 */
import { prisma } from "@/lib/prisma";

/**
 * Where a coordinate came from. Anything else is not a coordinate we keep.
 *
 * ## Why the column stays a string
 *
 * `ProjectPhoto.locationSource` is TEXT and stays TEXT. Converting it to a
 * database enum would be a type change on a column with live rows in it, which
 * is a different class of migration from adding one — it rewrites a table
 * rather than appending to it, and it cannot be undone by leaving the new
 * column alone. That is not a trade worth making for a constraint this file
 * already enforces: nothing reaches the column except through `usableFix`,
 * which accepts exactly two values and is tested on the ones it must refuse.
 *
 * The values live in the type above, and the day a third is added — `manual`,
 * when somebody types a location — it is added there, with its own badge on
 * screen, and the compiler finds every place that has to care.
 */
export type LocationOrigin = "device" | "exif";

/**
 * A coordinate we are prepared to write down.
 *
 * `manual` is deliberately absent. If somebody types a location in later it
 * needs its own value here and its own badge on screen — a typed address and a
 * device fix are not the same evidence, and the day they are stored the same
 * way is the day the distinction is lost.
 */
export type EvidenceFix = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: LocationOrigin;
};

/**
 * Whether a claimed fix is one we will keep, and in what form.
 *
 * Returns null rather than throwing: a photograph with no usable location is
 * ordinary — phones strip EXIF on a share sheet, and a crew may decline the
 * location permission — and it is filed with no location rather than refused.
 */
export function usableFix(input: {
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  locationSource?: string | null;
}): EvidenceFix | null {
  const { lat, lng } = input;
  const source = input.locationSource;

  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Null Island. A real fix at 0,0 is in the Gulf of Guinea; in practice this
  // is a zeroed sensor, and it would draw a pin a continent away from the job.
  if (lat === 0 && lng === 0) return null;
  if (source !== "device" && source !== "exif") return null;

  const accuracy =
    typeof input.accuracyM === "number" && Number.isFinite(input.accuracyM) && input.accuracyM >= 0
      ? input.accuracyM
      : null;

  return { lat, lng, accuracyM: accuracy, source };
}

/** How a capture time was established, weakest last. */
export type CapturedAtOrigin = "camera" | "exif" | "file";

/**
 * A capture time we are prepared to write down.
 *
 * The attachment time is NOT a capture time and must never be promoted into
 * one. A crew photographs a pedestal at eight in the morning and files the
 * sheet at six in the evening; recording the evening as when the shutter fired
 * would date the evidence ten hours wrong, in the direction that matters.
 */
export function usableCapturedAt(
  value: string | Date | null | undefined,
  source: string | null | undefined,
): { at: Date; source: CapturedAtOrigin } | null {
  if (!value) return null;
  if (source !== "camera" && source !== "exif" && source !== "file") return null;
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  // A capture time in the future is a device with a wrong clock, not evidence.
  if (at.getTime() > Date.now() + 60 * 60 * 1000) return null;
  return { at, source };
}

/** The evidence fields that cannot be changed once the record exists. */
export const IMMUTABLE_EVIDENCE_FIELDS = [
  "capturedAt",
  "capturedAtSource",
  "lat",
  "lng",
  "accuracyM",
  "locationSource",
  "uploadedBy",
  "uploadedByUserId",
  "uploadedAt",
  "dailySheetId",
  "dailyId",
  "projectId",
  "subcontractorId",
  "url",
  "source",
] as const;

/** What staff may correct afterwards, and which therefore gets audited. */
export const CLASSIFIABLE_EVIDENCE_FIELDS = [
  "caption",
  "category",
  "stage",
  "existingDamage",
  "damageNote",
] as const;

export type EvidenceStageValue = "PRE_CONSTRUCTION" | "WORK_RECORD" | "DIRECTION" | "CLOSEOUT";

/**
 * The legacy `purpose` written alongside the authoritative `stage`.
 *
 * Kept only so a deploy landing mid-migration does not blank a gallery that
 * still filters on it. Nothing reads it for a new decision. When the last
 * reader is gone, the column goes with it — see the note on the model.
 */
export function legacyPurposeFor(stage: EvidenceStageValue): "RECORD" | "DIRECTION" {
  return stage === "DIRECTION" ? "DIRECTION" : "RECORD";
}

/**
 * Record a change of classification, so a correction is visible as one.
 *
 * Captions and categories are meant to be corrected — an office reading a wall
 * of pedestals knows things the crew in the truck did not. What must not
 * happen is a silent correction: if a photograph is reclassified out of
 * "existing damage" the week a claim lands, that is exactly the change
 * somebody will want to see.
 */
export async function auditEvidenceChange(input: {
  photoId: string;
  projectId: string;
  actorEmail: string;
  actorUserId?: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): Promise<void> {
  const changed = Object.keys(input.after).filter(
    (k) => JSON.stringify(input.before[k]) !== JSON.stringify(input.after[k]),
  );
  if (!changed.length) return;

  const detail = changed
    .map((k) => `${k}: ${JSON.stringify(input.before[k]) ?? "null"} -> ${JSON.stringify(input.after[k])}`)
    .join("; ");

  await prisma.accessLog
    .create({
      data: {
        action: "evidence.reclassified",
        actorUserId: input.actorUserId ?? "",
        actorEmail: input.actorEmail,
        subjectId: input.photoId,
        detail: `project ${input.projectId} — ${detail}`,
      },
    })
    // An audit row that failed to write must not swallow the change the user
    // asked for, but it must not pass unnoticed either.
    .catch((e: unknown) => {
      console.error("evidence audit failed to write", { photoId: input.photoId, e });
    });
}

/**
 * Everything photographed near a point, for the day a complaint arrives.
 *
 * A bounding box rather than a true radius: at the scale of a driveway this
 * over-selects by a few metres at the corners, which is the right direction to
 * be wrong in when somebody is looking for evidence. Latitude degrees are
 * about 111 km everywhere; longitude degrees shrink with the cosine of the
 * latitude, which at Georgia's latitude is roughly a sixth off and would
 * matter over a subdivision.
 */
export async function evidenceNear(input: {
  lat: number;
  lng: number;
  metres: number;
  projectId?: string;
  stage?: EvidenceStageValue;
  existingDamageOnly?: boolean;
}) {
  const dLat = input.metres / 111_320;
  const dLng = input.metres / (111_320 * Math.max(0.1, Math.cos((input.lat * Math.PI) / 180)));

  return prisma.projectPhoto.findMany({
    where: {
      lat: { gte: input.lat - dLat, lte: input.lat + dLat },
      lng: { gte: input.lng - dLng, lte: input.lng + dLng },
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.stage ? { stage: input.stage } : {}),
      ...(input.existingDamageOnly ? { existingDamage: true } : {}),
    },
    orderBy: { capturedAt: "desc" },
  });
}

/**
 * Which evidence a daily is allowed to claim.
 *
 * Kept here, apart from the action, so the rule can be tested against a real
 * database rather than restated in a test that would pass whatever the action
 * actually does. The two conditions are the whole guard:
 *
 * - `projectId` — evidence is claimable only by dailies on its own project.
 *   A caller passing ids from somewhere else selects nothing. (Another
 *   *tenant* cannot reach this far: tenants are separate databases, so an id
 *   from one does not exist in the other.)
 * - the daily — evidence already spoken for by a different daily is not
 *   re-linked, so a second sheet cannot quietly take credit for the first
 *   one's photographs. Evidence already on *this* daily is included, which is
 *   what makes linking idempotent: a sheet is saved over and over as a crew
 *   works, and every save after the first must be a no-op.
 */
export function linkableEvidenceWhere(input: {
  ids: string[];
  projectId: string;
  dailySheetId: string;
}) {
  return {
    id: { in: input.ids },
    projectId: input.projectId,
    OR: [{ dailySheetId: null }, { dailySheetId: input.dailySheetId }],
  };
}
