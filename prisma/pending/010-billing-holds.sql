-- Step 13: billing holds — production that cannot be invoiced yet.
--
-- NOT APPLIED. Prepared and reviewed; applied under its own gate.
--
--   ORDER: independent of 006–009. Requires Daily and ProjectPhoto, both of
--   which predate all of them.
--
-- WHY THIS EXISTS
--
-- A crew can finish real work and Fortitude still cannot bill it, because the
-- documentation behind the quantity has not arrived — tick marks on a main
-- line pull being the case that prompted this. Before now there were two
-- options: bill it anyway, or delete the production. Both are wrong. The work
-- happened; the invoice has to wait.
--
-- WHAT IS AND IS NOT A SOURCE OF TRUTH
--
-- This table records what is HELD. It deliberately does not record what has
-- been BILLED: InvoiceLine already does, keyed by dailyId and code, and a
-- second ledger of billed quantities is exactly how two systems come to
-- disagree about whether a foot was invoiced. The disagreement is always
-- found by a customer.
--
-- So the arithmetic in lib/billing-readiness.ts is:
--
--   billable = produced − already on an invoice − held
--
-- Staged and Billed are read off the invoice the line sits on — a line on a
-- draft is staged, a line on a sent invoice is billed — rather than stored as
-- a status somebody sets. A status somebody sets is a status somebody sets
-- wrongly.
--
-- PARTIAL QUANTITIES
--
-- `quantity` is how much of a code is held, not the whole entry. Six hundred
-- of a thousand feet can bill while four hundred waits. This is why the
-- invoice filer's guard had to change from "has this daily been touched" to
-- the subtraction above: the old rule would have billed the six hundred and
-- then refused the four hundred forever, because the daily was already filed.
--
-- With no holds on a daily both rules give the same answer, so a job with no
-- documentation requirements bills exactly as it did before this existed.
--
-- CUSTOMER BILLING, NOT CREW PAY
--
-- Nothing here touches SubInvoice. A hold says Fortitude cannot invoice the
-- customer yet; it says nothing about what the crew is owed. Conflating the
-- two would mean a missing photograph stopped somebody being paid for work
-- they actually did.
--
-- WHAT THIS ADDS
--
--   1 enum    BillingHoldStatus (5 values)
--   1 table   BillingHold
--   3 indexes BillingHold_pkey (implicit), _dailyId_code_key, _status_idx
--             plus _dailyId_idx
--   1 FK      BillingHold_dailyId_fkey -> Daily, ON DELETE CASCADE
--   1 column  ProjectPhoto.billingHoldId
--
-- Entirely additive. No existing column is dropped, no type altered, no enum
-- value removed, no row rewritten. Every daily already filed keeps every
-- quantity it has, and with no BillingHold rows the billing path behaves
-- exactly as it does today.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'BillingHoldStatus' AND n.nspname = current_schema()) THEN
    CREATE TYPE "BillingHoldStatus" AS ENUM (
      'NEEDS_DOCUMENTATION',
      'CREW_RESPONDED',
      'ACCEPTED',
      'OVERRIDDEN',
      'NOT_BILLABLE'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BillingHold" (
  "id"             TEXT NOT NULL,
  "dailyId"        TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "quantity"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"         "BillingHoldStatus" NOT NULL DEFAULT 'NEEDS_DOCUMENTATION',
  "requirement"    TEXT NOT NULL DEFAULT '',
  "missing"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "raisedBy"       TEXT NOT NULL DEFAULT '',
  "raisedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedBy"    TEXT NOT NULL DEFAULT '',
  "respondedAt"    TIMESTAMP(3),
  "responseNote"   TEXT NOT NULL DEFAULT '',
  "resolvedBy"     TEXT NOT NULL DEFAULT '',
  "resolvedAt"     TIMESTAMP(3),
  "resolutionNote" TEXT NOT NULL DEFAULT '',
  "overrideReason" TEXT NOT NULL DEFAULT '',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingHold_pkey" PRIMARY KEY ("id")
);

-- One hold per code per daily. Two holds on the same code would make "how
-- much of this is held" a question with two answers, and the subtraction
-- above would then double-count the held quantity and under-bill.
CREATE UNIQUE INDEX IF NOT EXISTS "BillingHold_dailyId_code_key"
  ON "BillingHold"("dailyId", "code");

CREATE INDEX IF NOT EXISTS "BillingHold_status_idx" ON "BillingHold"("status");
CREATE INDEX IF NOT EXISTS "BillingHold_dailyId_idx" ON "BillingHold"("dailyId");

-- The evidence answering a request, tagged rather than copied. One evidence
-- store: the photograph supporting a held quantity is the same ProjectPhoto
-- row the project gallery shows.
ALTER TABLE "ProjectPhoto"
  ADD COLUMN IF NOT EXISTS "billingHoldId" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectPhoto_billingHoldId_idx"
  ON "ProjectPhoto"("billingHoldId");

-- Cascade. A hold is a statement about one daily's production; if the daily
-- goes the statement is meaningless. Note this cannot reach an invoice —
-- BillingHold references neither Invoice nor InvoiceLine, so nothing billed
-- is affected by any delete here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'BillingHold_dailyId_fkey'
                   AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "BillingHold" ADD CONSTRAINT "BillingHold_dailyId_fkey"
      FOREIGN KEY ("dailyId") REFERENCES "Daily"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- ROLLBACK, while unused:
--   BEGIN;
--   DROP TABLE IF EXISTS "BillingHold";
--   DROP TYPE  IF EXISTS "BillingHoldStatus";
--   ALTER TABLE "ProjectPhoto" DROP COLUMN IF EXISTS "billingHoldId";
--   COMMIT;
--
-- Safe while nothing is held. Once quantities are on hold, dropping this
-- releases every one of them for billing at once — which is the opposite of
-- what the holds were for. Take it from a backup instead.
