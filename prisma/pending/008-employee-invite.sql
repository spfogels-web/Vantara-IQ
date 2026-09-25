-- Step 11c: EmployeeInvite — the link that turns an employee into a login.
--
-- NOT APPLIED. Prepared and reviewed; applied under its own gate.
--
--   ORDER: 007-workforce.sql must have been applied before this runs, because
--   this references "Employee". 006 and 007 are already applied to production.
--
-- WHY THIS EXISTS AT ALL
--
-- Workforce V1 shipped with no way to create an employee. The roster, the
-- clock, the timesheets and the assignment controls are all there; the row
-- itself had to be written by hand. Creating the Employee row needs no schema
-- change — every column it wants already exists. Giving that person a login
-- does, and this is the whole of it.
--
-- WHY NOT SubUserInvite
--
-- That table is the same idea and the wrong shape: "subcontractorId" is NOT
-- NULL and references Subcontractor. A subcontractor is a company we engage;
-- an employee is somebody we employ. Putting an employee through it would
-- mean inventing a subcontractor to hang them off, and would fuse two
-- authentication concepts that are deliberately separate.
--
-- WHY NOT A COLUMN ON Employee
--
-- Authentication state does not belong on the roster model, and a token
-- column gives one token per employee for all time. A row can be replaced
-- wholesale when a link is reissued, which is what stops a forwarded copy of
-- the old link still working.
--
-- WHAT IT DOES NOT DO
--
-- It grants nothing by existing. A row here is an unused token; until
-- somebody opens the link and sets a password there is no account, no role
-- and no access. It is not a password reset — this application has none — and
-- it cannot change which employee it was minted for, because the accept path
-- reads the employee and the email off this row rather than off the form.
--
-- Vantara sends no email. Staff copy the link and hand it over, exactly as
-- they already do for a subcontractor invite. No password is ever transmitted
-- or stored anywhere but as a hash the person sets themselves.
--
-- TENANCY
--
-- No organizationId column, for the same reason as 007: isolation in this
-- product is database-per-organisation. This table is added to MUST_BE_SCOPED
-- in tests/isolation/database-role.test.ts alongside the other five, where it
-- fails today exactly as they do — that is the documented baseline, not a new
-- break.
--
-- WHAT THIS ADDS
--
--   1 table   EmployeeInvite
--   2 indexes EmployeeInvite_pkey (implicit), EmployeeInvite_employeeId_key
--   1 FK      EmployeeInvite_employeeId_fkey -> Employee, ON DELETE CASCADE
--
-- Entirely additive. No existing table, column, index, constraint, enum value
-- or row is altered or removed.

BEGIN;

CREATE TABLE IF NOT EXISTS "EmployeeInvite" (
  "token"      TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "used"       BOOLEAN NOT NULL DEFAULT false,
  "invitedBy"  TEXT NOT NULL DEFAULT '',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeInvite_pkey" PRIMARY KEY ("token")
);

-- One live invitation per employee. Reissuing replaces the row rather than
-- adding a second, so exactly one link works at a time and revoking is a
-- delete rather than a search.
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeInvite_employeeId_key"
  ON "EmployeeInvite"("employeeId");

-- Cascade: an invitation is a statement about a live employee. If the
-- employee record goes, an unused link to it is meaningless. Note this can
-- only happen to an employee with no filed hours — TimeEntry_employeeId_fkey
-- is RESTRICT, so anybody who has worked cannot be deleted at all.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'EmployeeInvite_employeeId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "EmployeeInvite" ADD CONSTRAINT "EmployeeInvite_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- ROLLBACK, while unused:
--   BEGIN;
--   DROP TABLE IF EXISTS "EmployeeInvite";
--   COMMIT;
--
-- Safe at any point before anybody accepts an invitation. Afterwards the
-- accounts it created are ordinary User rows and are unaffected by dropping
-- it — the table holds no credential, only spent tokens.
