-- Step 10: the operational calendar.
--
-- NOT APPLIED. Prepared and reviewed; applied under its own gate.
--
-- WHAT THIS ADDS
--
-- One table and one enum. Nothing existing is altered: no column is dropped,
-- no type changed, no row rewritten. Every statement is additive, so applying
-- it early is inert — no deployed code reads CalendarEvent until the code that
-- does goes live, and the table simply sits there empty.
--
--   ORDER AGAINST THE DEPLOY: either side. Unlike 004, nothing about the
--   running application changes when this lands. Applying it first is the
--   safer habit, because the reverse — code that reads a table that does not
--   exist — is the failure that takes a page down.
--
-- WHY A TABLE AT ALL
--
-- Because three of the six things the office wants on a calendar are not
-- written down anywhere yet. Locates carry expiresOn, invoices carry dueAt and
-- tasks carry dueDate, and the calendar reads those three where they live --
-- it does not copy them here. A copied date is a date that can disagree with
-- the record it came from, and the record has to win.
--
-- What has no home is everything a person schedules rather than derives: a
-- crew mobilising on Tuesday, a pre-construction walk, a delivery booked for
-- Thursday, a safety meeting. That is what this holds, and only that.
--
-- WHY DATES ARE TEXT
--
-- The same reason Task.dueDate, LocateTicket.expiresOn and Daily.workDate are
-- text. A day somebody types is a day, not an instant: stored as a timestamp
-- it acquires a timezone, and a job scheduled for the 25th starts reading as
-- the 24th to anyone east of the server. This product already had that bug
-- once in the billing week, where new Date("2026-09-25") printed as the 24th
-- in Eastern. Text cannot drift.
--
-- ACCESS
--
-- Staff only, enforced in the application (requireStaff) exactly as every
-- other write in this system is. No subcontractor route reads it. Tenancy is
-- unchanged: like every other table here it lives inside the organisation's
-- own schema, and the search_path decides which. Nothing about the parked
-- row-level-security work is touched or pre-empted.

BEGIN;

-- Idempotent: safe to re-run, and safe to run against a database where a
-- previous attempt got halfway.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'CalendarEventKind'
                   AND n.nspname = current_schema()) THEN
    CREATE TYPE "CalendarEventKind" AS ENUM
      ('MILESTONE', 'LOCATE', 'FINANCIAL', 'CREW', 'MATERIAL', 'OTHER');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "CalendarEvent" (
  "id"              TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "kind"            "CalendarEventKind" NOT NULL DEFAULT 'OTHER',
  "startDate"       TEXT NOT NULL,
  "endDate"         TEXT NOT NULL DEFAULT '',
  "startTime"       TEXT NOT NULL DEFAULT '',
  "endTime"         TEXT NOT NULL DEFAULT '',
  "note"            TEXT NOT NULL DEFAULT '',
  "projectId"       TEXT,
  "subcontractorId" TEXT,
  "createdBy"       TEXT NOT NULL DEFAULT '',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- The month view asks for a date window and nothing else, so that is the
-- index that matters. The other two serve the project page and the per-kind
-- filters down the side of the calendar.
CREATE INDEX IF NOT EXISTS "CalendarEvent_startDate_idx"      ON "CalendarEvent"("startDate");
CREATE INDEX IF NOT EXISTS "CalendarEvent_projectId_idx"      ON "CalendarEvent"("projectId");
CREATE INDEX IF NOT EXISTS "CalendarEvent_kind_startDate_idx" ON "CalendarEvent"("kind", "startDate");

-- SET NULL rather than CASCADE on both: deleting a job should not silently
-- take the safety meeting that happened on it off the record, and a crew
-- being removed from the roster is not a reason to lose the day they
-- mobilised. The event survives with nothing attached, which is visible and
-- correctable; a vanished row is neither.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'CalendarEvent_projectId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "CalendarEvent"
      ADD CONSTRAINT "CalendarEvent_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'CalendarEvent_subcontractorId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "CalendarEvent"
      ADD CONSTRAINT "CalendarEvent_subcontractorId_fkey"
      FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;

-- ROLLBACK, should it be needed before anything depends on it:
--
--   BEGIN;
--   DROP TABLE IF EXISTS "CalendarEvent";
--   DROP TYPE  IF EXISTS "CalendarEventKind";
--   COMMIT;
--
-- Safe only while no deployed code reads the table. Once the calendar is
-- live this drops real scheduling data, so take it off a backup instead.
