-- Step 14: an invoice line remembers which span of route it came off.
--
-- NOT APPLIED. Prepared and reviewed; applied under its own gate.
--
--   ORDER: independent of 006-010. Touches only InvoiceLine and
--   SubInvoiceLine, both of which predate all of them.
--
-- WHY THIS EXISTS
--
-- A daily is written span by span. One day on Rock Creek reads:
--
--   153/@1-153/@3     BFO48   1,217
--   153/@3-153/@6     BFO48     882
--   153/@6A-153/@12A  BFO48   1,106
--   153/@12A-153/@12  BFO48     309
--   153/@12-153/@11A  BFO48     491
--   153/@11A-153/@11b BFO48     514
--
-- and the invoice it produced read:
--
--   BFO48   4,519
--
-- The total is right. It is also unreadable: nobody holding the daily can
-- check the bill against it without adding six numbers up by hand, and a
-- subcontractor being paid off the same roll-up cannot tell which span they
-- were paid for. Every disagreement about a figure then starts with
-- reconstructing where the figure came from.
--
-- So a line of an invoice becomes a line of the daily it came from. The money
-- does not move: the same codes at the same rates on the same work date, split
-- the way the crew wrote it rather than summed.
--
-- WHAT THIS ADDS
--
--   2 columns InvoiceLine.location     TEXT    NOT NULL DEFAULT ''
--             InvoiceLine.seq          INTEGER NOT NULL DEFAULT 0
--   2 columns SubInvoiceLine.location  TEXT    NOT NULL DEFAULT ''
--             SubInvoiceLine.seq       INTEGER NOT NULL DEFAULT 0
--
-- `seq` is where the line sat on the daily. Without it the only orderings
-- available are by code, which reorders the spans, or by id, which is a cuid
-- and not an ordering at all. A bill whose rows are in a different order from
-- the sheet it came off still has to be sorted by hand before it can be
-- checked, which is most of what this change exists to stop.
--
-- Entirely additive, and defaulted, so every line already on an invoice keeps
-- exactly the quantity and amount it has and simply reads as having no span —
-- which is true. Nothing is recomputed by this migration. No invoice total
-- changes. A sent invoice is never touched by anything in this change: the
-- customer has that figure, and our copy must not come to disagree with
-- theirs.
--
--   1 column  Invoice.projectNumber    TEXT NOT NULL DEFAULT ''
--   1 column  SubInvoice.projectNumber TEXT NOT NULL DEFAULT ''
--
-- The customer's accounts system is keyed on their job number, not on what we
-- call the job, so an invoice carrying only the name has to be looked up before
-- it can be paid. Denormalised beside projectName for the reason that one is:
-- an invoice is a historical document, and renaming or deleting a project must
-- not change what a bill already sent says.
--
-- Backfilled from the live project below, because an invoice that predates this
-- column still belongs to a job with a number and reading blank would be wrong.
-- The backfill writes ONLY the new column. It touches no quantity, no rate, no
-- amount and no total, on a draft or a sent invoice alike.
--
-- Not an index. Nothing looks a line up by location — it is read with the row
-- it belongs to, and an index on a free-text column nobody filters on is
-- storage and write cost bought for nothing.

BEGIN;

ALTER TABLE "InvoiceLine"
  ADD COLUMN IF NOT EXISTS "location" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "seq" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SubInvoiceLine"
  ADD COLUMN IF NOT EXISTS "location" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "seq" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "projectNumber" TEXT NOT NULL DEFAULT '';

ALTER TABLE "SubInvoice"
  ADD COLUMN IF NOT EXISTS "projectNumber" TEXT NOT NULL DEFAULT '';

-- Only where it is still blank, so re-running this cannot overwrite a number
-- that was written deliberately, and only from the project the invoice already
-- points at.
UPDATE "Invoice" i
   SET "projectNumber" = p."number"
  FROM "Project" p
 WHERE i."projectId" = p."id"
   AND i."projectNumber" = ''
   AND p."number" <> '';

UPDATE "SubInvoice" s
   SET "projectNumber" = p."number"
  FROM "Project" p
 WHERE s."projectId" = p."id"
   AND s."projectNumber" = ''
   AND p."number" <> '';

COMMIT;

-- ROLLBACK, while unused:
--   BEGIN;
--   ALTER TABLE "InvoiceLine"    DROP COLUMN IF EXISTS "location", DROP COLUMN IF EXISTS "seq";
--   ALTER TABLE "SubInvoiceLine" DROP COLUMN IF EXISTS "location", DROP COLUMN IF EXISTS "seq";
--   ALTER TABLE "Invoice"        DROP COLUMN IF EXISTS "projectNumber";
--   ALTER TABLE "SubInvoice"     DROP COLUMN IF EXISTS "projectNumber";
--   COMMIT;
--
-- Safe at any time. Dropping these loses which span each line came off and
-- what order it was in, and nothing else — no quantity, no rate, no amount,
-- and no invoice total.
