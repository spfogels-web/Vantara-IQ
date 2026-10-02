-- Step 16: the pre-construction requirement becomes a switch.
--
-- NOT APPLIED. Prepared and reviewed; applied under its own gate.
--
--   ORDER: independent of 012. Touches only OrgSettings, which predates it.
--   Either may be applied first.
--
-- WHY THIS EXISTS
--
-- Production cannot be filed against a route nobody photographed first. That
-- rule is right, and it is also absolute, and on 2 October thirteen live
-- projects could not accept a production daily because of it — including jobs
-- carrying fifty, sixty and seventy pre-construction photographs that simply
-- had nobody press the button to say the route was documented.
--
-- Most of those are fixed by somebody saying so, which is what `preConStatus`
-- is for and why it is a person's assertion rather than a photograph count.
-- Some are not. A restoration job has no route to walk. A job inherited
-- mid-build has no before. An emergency repair happens before anybody opens a
-- phone. For those the honest answer is not to mark the route documented —
-- that would be inventing compliance — but to say the requirement does not
-- apply, say who decided that, and leave every project's own status telling
-- the truth about what was actually photographed.
--
-- WHAT IT DOES NOT DO
--
-- It does not touch any project's `preConStatus`. A job that was never walked
-- still reads NOT_STARTED after this, and after the switch is thrown, and
-- forever. Nothing here edits a daily, a quantity, an invoice or a payment.
--
-- DEFAULT
--
-- TRUE. This is a requirement, not a feature: the column defaults to on, the
-- application treats an unreadable settings row as on, and switching it off has
-- to be a deliberate act by an admin with a reason attached. A migration that
-- defaulted it to false would have removed a safety rule from every tenant
-- silently, which is the one outcome this file must not have.
--
-- RE-RUNNABLE
--
-- Guarded and transactional, in the manner of 010, 011 and 012.

BEGIN;

ALTER TABLE "OrgSettings"
  ADD COLUMN IF NOT EXISTS "preConRequired" BOOLEAN NOT NULL DEFAULT true;

-- Who turned it off and why, on the row itself, so the current state carries
-- its own explanation and nobody has to go and find the audit log to read it.
-- Cleared when the requirement is put back.
ALTER TABLE "OrgSettings"
  ADD COLUMN IF NOT EXISTS "preConWaivedBy" TEXT NOT NULL DEFAULT '';

ALTER TABLE "OrgSettings"
  ADD COLUMN IF NOT EXISTS "preConWaivedAt" TIMESTAMP(3);

ALTER TABLE "OrgSettings"
  ADD COLUMN IF NOT EXISTS "preConWaiverReason" TEXT NOT NULL DEFAULT '';

COMMIT;
