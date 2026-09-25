-- Step 11b: Workforce — employees, shifts, location points, corrections.
--
-- NOT APPLIED. Prepared and reviewed; applied under its own gate.
--
--   ORDER: 006-workforce-role.sql must COMMIT before this runs.
--
-- WHAT THIS ADDS
--
-- Five tables and three enums. Entirely additive: no existing column is
-- dropped, no type altered, no row rewritten. Applying it early is inert —
-- nothing deployed reads these tables until the Workforce code ships.
--
-- REVISED before ever being applied. EmployeeProject was added after the
-- first review, when it became clear nothing in this schema could say which
-- jobs an employee may book hours against: ProjectCrew links a project to a
-- subcontractor, and Project.crew is free text. Since this file has never run
-- anywhere but a scratch schema, the honest thing is to correct it rather
-- than leave the gap and patch it in an 008 that would exist only because the
-- first version shipped incomplete.
--
-- TENANCY
--
-- No organizationId column, deliberately. Isolation in this product is
-- database-per-organisation: org-registry.ts maps each organisation to its
-- own connection and the search_path decides nothing here. Adding a tenant
-- column now would invent a second, parallel answer to a question the
-- architecture already answers, and the parked Phase 4 work would then have
-- two systems to reconcile instead of one.
--
-- These five tables are added to MUST_BE_SCOPED in
-- tests/isolation/database-role.test.ts so that Phase 4 cannot forget them.
-- That test is expected to fail today; it now fails naming these too.
--
-- THE CONSTRAINT THAT MATTERS
--
-- An employee may have at most one open shift. That is not an application
-- rule — a double-tapped button races application rules — it is a partial
-- unique index, and Postgres refuses the second insert whoever asks:
--
--   CREATE UNIQUE INDEX ... ON "TimeEntry"("employeeId") WHERE "clockOutAt" IS NULL
--
-- Prisma has no syntax for a partial index, so it does not appear in
-- schema.prisma and `prisma db push` does not create it. tests/global-setup.ts
-- installs it after push, and fails loudly if it cannot, so the suite runs
-- against the same invariant production has.
--
-- DELETE BEHAVIOUR, AND WHY EACH ONE
--
--   Employee.userId          -> User            SET NULL
--     Removing a login must not delete the hours that person worked.
--
--   TimeEntry.employeeId     -> Employee        RESTRICT
--     A timecard is the record of what somebody is owed. Deleting a person
--     must not be able to delete it; INACTIVE is what you actually want, and
--     this makes the wrong answer impossible rather than discouraged.
--
--   TimeEntry.projectId      -> Project         SET NULL
--     Deleting a job must never delete the hours worked on it. projectName is
--     kept alongside so the timecard still reads correctly afterwards.
--
--   EmployeeProject          -> Employee/Project CASCADE
--     An assignment is a statement about a live pairing. Removing it takes
--     away the permission and nothing else: TimeEntry keeps its own
--     projectId and projectName, so hours already worked are untouched when
--     somebody comes off a job.
--
--   TimeEntryLocation        -> TimeEntry       CASCADE
--   TimeEntryAudit           -> TimeEntry       CASCADE
--     Both are meaningless without their entry. V1 exposes no delete path for
--     a TimeEntry at all, so this is a guard against a future one, not a
--     route anybody can take today.

BEGIN;

-- Idempotent: safe to re-run, and safe against a database where a previous
-- attempt got halfway.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'EmployeeStatus' AND n.nspname = current_schema()) THEN
    CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'TimeEntryStatus' AND n.nspname = current_schema()) THEN
    CREATE TYPE "TimeEntryStatus" AS ENUM ('OPEN', 'COMPLETE', 'EDITED', 'NEEDS_REVIEW');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'LocationPointKind' AND n.nspname = current_schema()) THEN
    CREATE TYPE "LocationPointKind" AS ENUM ('CLOCK_IN', 'PERIODIC', 'CLOCK_OUT');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Employee" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT,
  "name"      TEXT NOT NULL,
  "title"     TEXT NOT NULL DEFAULT '',
  "phone"     TEXT NOT NULL DEFAULT '',
  "status"    "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TimeEntry" (
  "id"                 TEXT NOT NULL,
  "employeeId"         TEXT NOT NULL,
  "projectId"          TEXT,
  "projectName"        TEXT NOT NULL DEFAULT '',
  "clockInAt"          TIMESTAMP(3) NOT NULL,
  "clockOutAt"         TIMESTAMP(3),
  "workDate"           TEXT NOT NULL,
  "durationSeconds"    INTEGER,
  "status"             "TimeEntryStatus" NOT NULL DEFAULT 'OPEN',
  "clockInNote"        TEXT NOT NULL DEFAULT '',
  "clockOutNote"       TEXT NOT NULL DEFAULT '',
  "clockInLocationOk"  BOOLEAN NOT NULL DEFAULT false,
  "clockOutLocationOk" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TimeEntryLocation" (
  "id"             TEXT NOT NULL,
  "timeEntryId"    TEXT NOT NULL,
  "capturedAt"     TIMESTAMP(3) NOT NULL,
  "latitude"       DOUBLE PRECISION NOT NULL,
  "longitude"      DOUBLE PRECISION NOT NULL,
  "accuracyMeters" DOUBLE PRECISION,
  "kind"           "LocationPointKind" NOT NULL DEFAULT 'PERIODIC',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntryLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TimeEntryAudit" (
  "id"          TEXT NOT NULL,
  "timeEntryId" TEXT NOT NULL,
  "field"       TEXT NOT NULL,
  "oldValue"    TEXT NOT NULL DEFAULT '',
  "newValue"    TEXT NOT NULL DEFAULT '',
  "reason"      TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL DEFAULT '',
  "actorEmail"  TEXT NOT NULL DEFAULT '',
  "at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntryAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmployeeProject" (
  "id"         TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "projectId"  TEXT NOT NULL,
  "assignedBy" TEXT NOT NULL DEFAULT '',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeProject_pkey" PRIMARY KEY ("id")
);

-- One assignment per pairing. Assigning somebody twice is not two
-- permissions, and a duplicate would make "unassign" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeProject_employeeId_projectId_key"
  ON "EmployeeProject"("employeeId", "projectId");
CREATE INDEX IF NOT EXISTS "EmployeeProject_projectId_idx"
  ON "EmployeeProject"("projectId");

-- One login controls exactly one timecard. This is the guarantee that a
-- person cannot clock somebody else in, and it belongs to the database.
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_userId_key" ON "Employee"("userId");

CREATE INDEX IF NOT EXISTS "Employee_status_name_idx"        ON "Employee"("status", "name");
CREATE INDEX IF NOT EXISTS "TimeEntry_employeeId_workDate_idx" ON "TimeEntry"("employeeId", "workDate");
CREATE INDEX IF NOT EXISTS "TimeEntry_workDate_status_idx"     ON "TimeEntry"("workDate", "status");
CREATE INDEX IF NOT EXISTS "TimeEntry_projectId_workDate_idx"  ON "TimeEntry"("projectId", "workDate");
CREATE INDEX IF NOT EXISTS "TimeEntryLocation_timeEntryId_capturedAt_idx"
  ON "TimeEntryLocation"("timeEntryId", "capturedAt");
CREATE INDEX IF NOT EXISTS "TimeEntryAudit_timeEntryId_at_idx"
  ON "TimeEntryAudit"("timeEntryId", "at");

-- At most one open shift per employee. A double-tapped Clock In races any
-- check written in application code; this one is decided by the index.
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_one_open_per_employee"
  ON "TimeEntry"("employeeId") WHERE "clockOutAt" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'Employee_userId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'TimeEntry_employeeId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'TimeEntry_projectId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'EmployeeProject_employeeId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "EmployeeProject" ADD CONSTRAINT "EmployeeProject_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'EmployeeProject_projectId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "EmployeeProject" ADD CONSTRAINT "EmployeeProject_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'TimeEntryLocation_timeEntryId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "TimeEntryLocation" ADD CONSTRAINT "TimeEntryLocation_timeEntryId_fkey"
      FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'TimeEntryAudit_timeEntryId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "TimeEntryAudit" ADD CONSTRAINT "TimeEntryAudit_timeEntryId_fkey"
      FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;

-- ROLLBACK, while nothing depends on it:
--
--   BEGIN;
--   DROP TABLE IF EXISTS "EmployeeProject";
--   DROP TABLE IF EXISTS "TimeEntryAudit";
--   DROP TABLE IF EXISTS "TimeEntryLocation";
--   DROP TABLE IF EXISTS "TimeEntry";
--   DROP TABLE IF EXISTS "Employee";
--   DROP TYPE  IF EXISTS "LocationPointKind";
--   DROP TYPE  IF EXISTS "TimeEntryStatus";
--   DROP TYPE  IF EXISTS "EmployeeStatus";
--   COMMIT;
--
-- Drop order matters: children before parents, or RESTRICT refuses.
--
-- Safe only while no deployed code reads these and no hours have been
-- recorded. Once somebody has clocked in, this drops the record of work they
-- are owed for — take it off a backup instead.
--
-- Note that 006 cannot be rolled back at all: Postgres has no DROP VALUE.
