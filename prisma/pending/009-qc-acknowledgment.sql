-- Step 12: QC acknowledgment — who stood behind a daily, and who reviewed a job.
--
-- NOT APPLIED. Prepared and reviewed; applied under its own gate.
--
--   ORDER: independent of 006/007/008. Requires only Project, Subcontractor
--   and DailySheet, all of which predate all four.
--
-- WHY THIS EXISTS
--
-- Two acknowledgments, and neither can be inferred from anything already
-- recorded:
--
--   On a daily, that the crew filing it has read the build standard and says
--   the work on the sheet follows it. Gravel depth, ground rod height, cable
--   labelling and tick mark counts are not visible to this application and
--   never will be. Reading them off a photograph would be inventing
--   compliance, so the honest mechanism is a person saying so and the record
--   keeping who.
--
--   On a project, that a crew reviewed the standards before mobilising. The
--   same information, earlier, when it can still change what gets built.
--
-- WHY NOT THE HEADER BLOB
--
-- DailySheet.header is Json and would have taken this without a migration.
-- It is Globe's form: that is why `roads` is its own column, documented in
-- the schema as "that blob is Globe's form and this is not on Globe's form".
-- An acknowledgment is Fortitude's, not Globe's, and burying it there would
-- also make "which dailies were filed unacknowledged" unanswerable without
-- reading every row.
--
-- WHY A TABLE FOR THE PROJECT ONE
--
-- A project is reviewed by each crew that works it, not once. Two columns
-- would record whoever acknowledged last and silently lose the rest, which is
-- the opposite of what an acknowledgment is for. Project.preConCompletedBy is
-- two columns precisely because pre-construction is done once for the route;
-- this is not that.
--
-- WHAT THIS ADDS
--
--   2 columns  DailySheet.qcAckBy, DailySheet.qcAckAt
--   1 table    ProjectQcAck
--   2 indexes  ProjectQcAck_pkey (implicit), ProjectQcAck_projectId_subcontractorId_key
--   1 index    ProjectQcAck_projectId_idx
--   2 FKs      -> Project, -> Subcontractor, both ON DELETE CASCADE
--
-- Entirely additive. No column is dropped, no type altered, no enum touched,
-- no existing row rewritten.
--
-- WHAT IT DOES TO DAILIES ALREADY FILED
--
-- Nothing. They take qcAckBy = '' and qcAckAt = NULL, which reads correctly
-- as "filed before this rule existed" — the same shape the submit path
-- already uses for the thirty-one dailies that predate the evidence gate. The
-- rule is applied going forward and never retrospectively, because a sheet
-- filed in June cannot be acknowledged now by anybody who was there.
--
-- TENANCY
--
-- No organizationId, for the same reason as 007 and 008: isolation here is
-- database-per-organisation. ProjectQcAck is added to MUST_BE_SCOPED in
-- tests/isolation/database-role.test.ts, where it fails exactly as the other
-- root tables do — the documented baseline, not a new break.

BEGIN;

-- ── The daily's acknowledgment ────────────────────────────────────────────
-- Two columns rather than a table: a sheet is acknowledged once, by the
-- person filing it, at the moment they file it.
ALTER TABLE "DailySheet"
  ADD COLUMN IF NOT EXISTS "qcAckBy" TEXT NOT NULL DEFAULT '';

ALTER TABLE "DailySheet"
  ADD COLUMN IF NOT EXISTS "qcAckAt" TIMESTAMP(3);

-- ── The project's acknowledgment ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProjectQcAck" (
  "id"              TEXT NOT NULL,
  "projectId"       TEXT NOT NULL,
  "subcontractorId" TEXT NOT NULL,
  "acknowledgedBy"  TEXT NOT NULL,
  "acknowledgedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectQcAck_pkey" PRIMARY KEY ("id")
);

-- One standing acknowledgment per crew per job. Reviewing again updates the
-- row rather than adding a second: the question is "has this crew reviewed
-- the standard for this job", and two answers to it is not more information.
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectQcAck_projectId_subcontractorId_key"
  ON "ProjectQcAck"("projectId", "subcontractorId");

-- Reading a project's acknowledgments is the common query — the project page
-- asks it on every render.
CREATE INDEX IF NOT EXISTS "ProjectQcAck_projectId_idx"
  ON "ProjectQcAck"("projectId");

-- Cascade on both sides. An acknowledgment is a statement about a live
-- pairing of a crew and a job; if either goes the statement is meaningless.
-- Note this cannot take a daily with it — ProjectQcAck references neither
-- DailySheet nor Daily, so filed production is untouched by any delete here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ProjectQcAck_projectId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "ProjectQcAck" ADD CONSTRAINT "ProjectQcAck_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ProjectQcAck_subcontractorId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "ProjectQcAck" ADD CONSTRAINT "ProjectQcAck_subcontractorId_fkey"
      FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- ROLLBACK, while unused:
--   BEGIN;
--   DROP TABLE IF EXISTS "ProjectQcAck";
--   ALTER TABLE "DailySheet" DROP COLUMN IF EXISTS "qcAckAt";
--   ALTER TABLE "DailySheet" DROP COLUMN IF EXISTS "qcAckBy";
--   COMMIT;
--
-- Safe while no daily has been acknowledged. Once they have, dropping the
-- columns destroys the record of who stood behind which sheet — recoverable
-- only from a backup, so take it from one rather than re-running this.
