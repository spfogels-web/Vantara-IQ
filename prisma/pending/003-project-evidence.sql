-- Step 8: project evidence — pre-construction, work record, closeout.
--
-- NOT APPLIED. Written here, reviewed, and applied under its own gate, the same
-- handling as 001 and 002 and for the same reason: the last time something ran
-- against this database outside a gate it was a `prisma db push` meant for
-- another tenant, and it landed here.
--
-- Everything is additive. No column changes type, nothing is dropped, and no
-- existing row's data is altered except to give the new `stage` column the
-- value implied by the `purpose` it already had — which is a translation of
-- what is there, not a new fact about it.
--
-- WHAT THIS IS FOR
--
-- A homeowner rings up three weeks after the crew left and says the driveway
-- was cracked by the bore rig. Today that question is answered by scrolling a
-- phone. After this it is answered by a query: what did this property look
-- like before anybody touched it, with a timestamp and a coordinate on it.
--
-- ORDER AGAINST THE DEPLOY. Additive and defaulted, so the existing
-- application keeps working unchanged after it runs — the new columns simply
-- sit there until code reads them. Safe to apply before the deploy, which is
-- the direction that leaves no window where the code wants a column that is
-- not there.

BEGIN;

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "EvidenceStage" AS ENUM ('PRE_CONSTRUCTION', 'WORK_RECORD', 'DIRECTION', 'CLOSEOUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EvidenceCategory" AS ENUM (
    'EXISTING_DAMAGE', 'DRIVEWAY', 'CURB_SIDEWALK', 'LANDSCAPING_LAWN', 'IRRIGATION',
    'MAILBOX', 'FENCE', 'ROAD_SHOULDER', 'DRAINAGE', 'UTILITY_PEDESTAL', 'STRUCTURE',
    'GENERAL_ROUTE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PreConStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Evidence
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."ProjectPhoto"
  ADD COLUMN IF NOT EXISTS "stage"            "EvidenceStage"    NOT NULL DEFAULT 'WORK_RECORD',
  ADD COLUMN IF NOT EXISTS "category"         "EvidenceCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "existingDamage"   BOOLEAN            NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "damageNote"       TEXT               NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "dailySheetId"     TEXT,
  ADD COLUMN IF NOT EXISTS "dailyId"          TEXT,
  ADD COLUMN IF NOT EXISTS "subcontractorId"  TEXT,
  ADD COLUMN IF NOT EXISTS "uploadedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadedAt"       TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The one write to existing rows: say in the new vocabulary what each row
-- already says in the old one. A photograph marked DIRECTION is an instruction
-- to the crew; everything else is a record of work, which is what every one of
-- the existing rows is.
--
-- Guarded so a re-run cannot move a row somebody has since reclassified: only
-- rows still sitting at the column default are touched.
UPDATE "public"."ProjectPhoto"
   SET "stage" = 'DIRECTION'
 WHERE "purpose" = 'DIRECTION'
   AND "stage" = 'WORK_RECORD';

-- `uploadedAt` defaulted to now() for rows that pre-date it, which would date
-- old evidence to the migration. createdAt is what the row actually knows.
UPDATE "public"."ProjectPhoto"
   SET "uploadedAt" = "createdAt"
 WHERE "uploadedAt" > "createdAt";

CREATE INDEX IF NOT EXISTS "ProjectPhoto_projectId_stage_createdAt_idx"
  ON "public"."ProjectPhoto" ("projectId", "stage", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectPhoto_projectId_existingDamage_idx"
  ON "public"."ProjectPhoto" ("projectId", "existingDamage");
CREATE INDEX IF NOT EXISTS "ProjectPhoto_dailySheetId_idx"
  ON "public"."ProjectPhoto" ("dailySheetId");
-- For "everything photographed within so many metres of this complaint". A
-- bounding box over these two columns is enough at this scale; PostGIS would
-- be a dependency bought for a query nobody has run yet.
CREATE INDEX IF NOT EXISTS "ProjectPhoto_lat_lng_idx"
  ON "public"."ProjectPhoto" ("lat", "lng");

-- ---------------------------------------------------------------------------
-- Baseline documentation, per project
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."Project"
  ADD COLUMN IF NOT EXISTS "preConStatus"      "PreConStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "preConCompletedBy" TEXT           NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "preConCompletedAt" TIMESTAMP(3);

-- Deliberately NOT set from whether photographs exist. A job with pictures on
-- it has not necessarily had its route documented, and saying so would put a
-- tick against work nobody did — which is worse than an empty status, because
-- somebody would rely on it.

COMMIT;
