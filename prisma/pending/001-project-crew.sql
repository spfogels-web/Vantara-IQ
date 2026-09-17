-- Phase 1 · make the project/crew assignment an explicit row.
--
-- NOT YET APPLIED TO PRODUCTION. Rehearsed against a disposable schema by
-- prisma/_rehearse-001.ts; run that before applying this anywhere real.
--
-- `prisma migrate diff` generates this migration as DROP TABLE "_ProjectCrews"
-- followed by CREATE TABLE "ProjectCrew" — which is correct as a schema diff
-- and catastrophic as a migration: it throws away all twenty-four assignments,
-- and the assignment is the authority on what a subcontractor can see. Every
-- crew would be silently locked out of every job they are on.
--
-- So the copy comes first, the counts are checked, and the old table is only
-- dropped once its contents are demonstrably somewhere else. In one
-- transaction, because a half-applied version of this is a permissions outage.

BEGIN;

-- 1. The new table.
CREATE TABLE "ProjectCrew" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCrew_pkey" PRIMARY KEY ("id")
);

-- 2. Carry the assignments across.
--
-- In the implicit join table "A" is the Project and "B" the Subcontractor —
-- Prisma orders those columns by model name, and it was verified against the
-- live table rather than assumed: all 24 rows join cleanly to Project on "A"
-- and to Subcontractor on "B".
--
-- assignedAt is backdated to the project's creation. It is the closest honest
-- answer available; the implicit table recorded no time, and stamping now()
-- would claim every crew was assigned during the migration.
INSERT INTO "ProjectCrew" ("id", "projectId", "subcontractorId", "assignedAt")
SELECT
    md5(j."A" || ':' || j."B"),
    j."A",
    j."B",
    COALESCE(p."createdAt", CURRENT_TIMESTAMP)
FROM "_ProjectCrews" j
JOIN "Project" p ON p.id = j."A";

-- 3. Refuse to continue if anything was left behind.
--
-- A row whose project or crew no longer exists would be dropped by the join
-- above rather than by intent, and the difference matters: one is tidying, the
-- other is a crew losing access without anyone noticing.
DO $$
DECLARE
    before_count INTEGER;
    after_count  INTEGER;
BEGIN
    SELECT count(*) INTO before_count FROM "_ProjectCrews";
    SELECT count(*) INTO after_count  FROM "ProjectCrew";
    IF before_count <> after_count THEN
        RAISE EXCEPTION
            'Assignment migration would lose rows: % in _ProjectCrews, % copied into ProjectCrew.',
            before_count, after_count;
    END IF;
END $$;

-- 4. Only now is the old table safe to remove.
ALTER TABLE "_ProjectCrews" DROP CONSTRAINT "_ProjectCrews_A_fkey";
ALTER TABLE "_ProjectCrews" DROP CONSTRAINT "_ProjectCrews_B_fkey";
DROP TABLE "_ProjectCrews";

-- 5. Constraints and indexes.
CREATE INDEX "ProjectCrew_subcontractorId_idx" ON "ProjectCrew"("subcontractorId");
CREATE UNIQUE INDEX "ProjectCrew_projectId_subcontractorId_key"
    ON "ProjectCrew"("projectId", "subcontractorId");

ALTER TABLE "ProjectCrew" ADD CONSTRAINT "ProjectCrew_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCrew" ADD CONSTRAINT "ProjectCrew_subcontractorId_fkey"
    FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. The indexes Daily has never had. It is the highest-volume table in the
-- system and every list reads it by date, by job or by billing week; each of
-- those was a sequential scan. Separate from the work above and safe on its
-- own, but it rides along rather than becoming a second outage window.
CREATE INDEX "Daily_workDate_idx" ON "Daily"("workDate");
CREATE INDEX "Daily_status_workDate_idx" ON "Daily"("status", "workDate");
CREATE INDEX "Daily_billingWeekEnd_idx" ON "Daily"("billingWeekEnd");
CREATE INDEX "Daily_projectId_workDate_idx" ON "Daily"("projectId", "workDate");

COMMIT;
