-- Step 15: damage reports and incidents.
--
-- NOT APPLIED. Prepared and reviewed; applied under its own gate.
--
--   ORDER: independent of 006-011. Creates four new tables and adds two
--   nullable/defaulted columns to ProjectPhoto and Conversation, both of which
--   predate all of them.
--
-- WHY THIS EXISTS
--
-- The project page has carried a placeholder since before the module existed,
-- and the placeholder was careful about what it did not claim:
--
--   "A sibling of Dailies, never a child of one. The module does not exist yet
--    and this does not pretend otherwise — no counts, no zero dressed up as a
--    clean bill of health."
--
-- An incident is the record of something going wrong on a job: a struck line, a
-- cracked driveway, somebody hurt. It stands on its own because the crew who
-- has just put a backhoe through a gas main is not going to fill in a
-- production sheet first.
--
-- WHAT THIS DOES NOT TOUCH
--
-- Production, billing readiness, invoices, WE BILL, WE PAY, subcontractor
-- payment. An incident costs money; what it costs is settled by people, in
-- writing, later. Nothing here can move a figure on anybody's statement.
--
-- RE-RUNNABLE
--
-- Every statement is guarded, and the whole file is one transaction. A run that
-- fails halfway rolls back and can be started again; a run that completes can
-- be repeated without error. Matches 010 and 011.

BEGIN;

-- ── types ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncidentType') THEN
    CREATE TYPE "IncidentType" AS ENUM (
      'UTILITY_STRIKE', 'PROPERTY_DAMAGE', 'SAFETY', 'NEAR_MISS',
      'VEHICLE', 'ENVIRONMENTAL', 'OTHER'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncidentSeverity') THEN
    CREATE TYPE "IncidentSeverity" AS ENUM ('MINOR', 'MODERATE', 'SERIOUS', 'CRITICAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncidentStatus') THEN
    CREATE TYPE "IncidentStatus" AS ENUM (
      'REPORTED', 'UNDER_REVIEW', 'REPAIR_IN_PROGRESS', 'REPAIRED',
      'RESOLVED', 'CLOSED', 'VOID'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncidentEventType') THEN
    CREATE TYPE "IncidentEventType" AS ENUM (
      'REPORTED', 'WORK_STOPPED', 'WORK_RESUMED', 'EVIDENCE_ADDED',
      'NOTIFICATION_RECORDED', 'STATUS_CHANGED', 'REPAIR_STARTED',
      'REPAIR_COMPLETED', 'NOTE_ADDED', 'RESOLVED', 'CLOSED', 'REOPENED',
      'VOIDED', 'FIELD_CORRECTED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotifiedParty') THEN
    CREATE TYPE "NotifiedParty" AS ENUM (
      'UTILITY_OWNER', 'ONE_CALL_811', 'CUSTOMER', 'PROPERTY_OWNER',
      'EMERGENCY_SERVICES', 'INSURER', 'INTERNAL', 'OTHER'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationMethod') THEN
    CREATE TYPE "NotificationMethod" AS ENUM (
      'PHONE', 'EMAIL', 'IN_PERSON', 'SMS', 'PORTAL', 'OTHER'
    );
  END IF;
END $$;

-- ── counters ────────────────────────────────────────────────────────────────
--
-- One row per organisation per thing being counted. Created before Incident
-- because the first incident cannot be numbered without it.
--
-- Deliberately NOT seeded here. `organizationId` holds the registry slug the
-- application runs on — what `resolveOrg()` returns — not the cuid on the
-- in-database Organization row. This file has no way to know the first one: the
-- slug lives in the environment that points at this database, not in the
-- database. Seeding from Organization.id would have written a row under a key
-- nothing ever looks up, and the first incident would have found no counter.
--
-- So the counter initialises itself on first use, inside the same transaction
-- that numbers the first incident. See nextIncidentNumber in
-- src/lib/incidents.ts.

CREATE TABLE IF NOT EXISTS "Counter" (
  "organizationId" TEXT    NOT NULL,
  "name"           TEXT    NOT NULL,
  "value"          INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "Counter_pkey" PRIMARY KEY ("organizationId", "name")
);

-- ── incident ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Incident" (
  "id"             TEXT    NOT NULL,
  "organizationId" TEXT    NOT NULL,
  "number"         TEXT    NOT NULL,
  "seq"            INTEGER NOT NULL,

  "projectId" TEXT NOT NULL,

  "type"     "IncidentType"     NOT NULL,
  "severity" "IncidentSeverity" NOT NULL DEFAULT 'MINOR',
  "status"   "IncidentStatus"   NOT NULL DEFAULT 'REPORTED',

  -- When it happened, which is not when somebody got round to filing it. Every
  -- safety figure is measured from this column.
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "locationText" TEXT NOT NULL DEFAULT '',
  "lat"          DOUBLE PRECISION,
  "lng"          DOUBLE PRECISION,
  "accuracyM"    DOUBLE PRECISION,

  "summary"     TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',

  -- Whether anyone was hurt, independent of "type". A struck gas main that put
  -- a man in hospital is a strike AND a safety incident, and the safety metric
  -- has to be able to see it as both.
  "injury"      BOOLEAN NOT NULL DEFAULT false,
  "injuryCount" INTEGER NOT NULL DEFAULT 0,
  "workStopped" BOOLEAN NOT NULL DEFAULT false,

  "utilityOwner" TEXT NOT NULL DEFAULT '',
  "utilityType"  TEXT NOT NULL DEFAULT '',

  -- The live 811 ticket, plus what it said when this was filed. The ticket's
  -- status is deliberately not copied: it is a live fact that belongs to the
  -- ticket, and a frozen copy would go stale while still reading as current.
  "locateTicketId"         TEXT,
  "locateNumberSnapshot"   TEXT NOT NULL DEFAULT '',
  "locateRevisionSnapshot" TEXT NOT NULL DEFAULT '',
  "locateSnapshotAt"       TIMESTAMP(3),

  "reportedByUserId"  TEXT,
  "reportedByName"    TEXT NOT NULL DEFAULT '',
  "subcontractorId"   TEXT,
  "subcontractorName" TEXT NOT NULL DEFAULT '',
  "employeeId"        TEXT,

  "repairStartedAt"   TIMESTAMP(3),
  "repairCompletedAt" TIMESTAMP(3),
  "repairNote"        TEXT NOT NULL DEFAULT '',
  "resolvedAt"        TIMESTAMP(3),
  "resolutionNote"    TEXT NOT NULL DEFAULT '',
  "closedAt"          TIMESTAMP(3),
  "closedByUserId"    TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- Unique within the organisation, never across the platform. Under
-- database-per-organisation this behaves exactly like a plain unique; the
-- difference shows up the day two tenants share a schema, which is precisely
-- when a global unique on a formatted number would have been wrong — one
-- contractor's INC-1000 would have blocked another's.
CREATE UNIQUE INDEX IF NOT EXISTS "Incident_organizationId_number_key" ON "Incident"("organizationId", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "Incident_organizationId_seq_key"    ON "Incident"("organizationId", "seq");

CREATE INDEX IF NOT EXISTS "Incident_organizationId_status_occurredAt_idx" ON "Incident"("organizationId", "status", "occurredAt");
CREATE INDEX IF NOT EXISTS "Incident_projectId_occurredAt_idx"             ON "Incident"("projectId", "occurredAt");
CREATE INDEX IF NOT EXISTS "Incident_subcontractorId_occurredAt_idx"       ON "Incident"("subcontractorId", "occurredAt");
CREATE INDEX IF NOT EXISTS "Incident_employeeId_occurredAt_idx"            ON "Incident"("employeeId", "occurredAt");
CREATE INDEX IF NOT EXISTS "Incident_type_occurredAt_idx"                  ON "Incident"("type", "occurredAt");
CREATE INDEX IF NOT EXISTS "Incident_locateTicketId_idx"                   ON "Incident"("locateTicketId");

-- RESTRICT, not CASCADE: deleting a project must not silently take its damage
-- claims with it. Somebody has to deal with the incidents first.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Incident_projectId_fkey') THEN
    ALTER TABLE "Incident"
      ADD CONSTRAINT "Incident_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- SET NULL: a locate ticket being purged must not delete the record of the
-- strike. The snapshot columns keep the incident readable afterwards.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Incident_locateTicketId_fkey') THEN
    ALTER TABLE "Incident"
      ADD CONSTRAINT "Incident_locateTicketId_fkey"
      FOREIGN KEY ("locateTicketId") REFERENCES "LocateTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── timeline ────────────────────────────────────────────────────────────────
--
-- Append-only by discipline in the application: no UPDATE or DELETE is ever
-- issued against this table, and a correction is a new FIELD_CORRECTED row
-- naming what moved. This is the account somebody gives to a customer, a
-- utility owner, an insurer or an attorney.

CREATE TABLE IF NOT EXISTS "IncidentEvent" (
  "id"         TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,

  "type" "IncidentEventType" NOT NULL,
  "at"   TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- The actor's name and role as they were at the time. Denormalised on
  -- purpose: somebody leaving the company must not silently rewrite who did
  -- what two years ago.
  "actorUserId" TEXT,
  "actorName"   TEXT NOT NULL DEFAULT '',
  "actorRole"   TEXT NOT NULL DEFAULT '',

  "detail"    TEXT NOT NULL DEFAULT '',
  "field"     TEXT NOT NULL DEFAULT '',
  "fromValue" TEXT NOT NULL DEFAULT '',
  "toValue"   TEXT NOT NULL DEFAULT '',

  CONSTRAINT "IncidentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentEvent_incidentId_at_idx" ON "IncidentEvent"("incidentId", "at");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncidentEvent_incidentId_fkey') THEN
    ALTER TABLE "IncidentEvent"
      ADD CONSTRAINT "IncidentEvent_incidentId_fkey"
      FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── notifications ───────────────────────────────────────────────────────────
--
-- A table rather than only a timeline entry, because the first question asked
-- months later is "who did you call and what was their reference number", and
-- that wants columns rather than prose.

CREATE TABLE IF NOT EXISTS "IncidentNotification" (
  "id"         TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,

  "party"     "NotifiedParty"      NOT NULL,
  "method"    "NotificationMethod" NOT NULL,
  "partyName" TEXT                 NOT NULL DEFAULT '',
  -- The number or address actually used, not the one on file.
  "contact"   TEXT                 NOT NULL DEFAULT '',

  "notifiedAt" TIMESTAMP(3) NOT NULL,
  "reference"  TEXT         NOT NULL DEFAULT '',
  "note"       TEXT         NOT NULL DEFAULT '',

  "recordedByUserId" TEXT,
  "recordedByName"   TEXT         NOT NULL DEFAULT '',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IncidentNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentNotification_incidentId_notifiedAt_idx"
  ON "IncidentNotification"("incidentId", "notifiedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncidentNotification_incidentId_fkey') THEN
    ALTER TABLE "IncidentNotification"
      ADD CONSTRAINT "IncidentNotification_incidentId_fkey"
      FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── evidence tagging ────────────────────────────────────────────────────────
--
-- One evidence store. A photograph of a struck line is the same row the project
-- gallery shows, tagged — not a second copy in a parallel table that can drift
-- from it, and not a second blob. "projectId" stays NOT NULL, so incident
-- evidence keeps its project association and all of its capture metadata, which
-- is what makes it possible to lay a pre-construction photograph of a driveway
-- beside the incident photograph of the same driveway.

ALTER TABLE "ProjectPhoto" ADD COLUMN IF NOT EXISTS "incidentId" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectPhoto_incidentId_idx" ON "ProjectPhoto"("incidentId");

-- SET NULL rather than CASCADE: voiding or deleting an incident must never
-- destroy the photographs. They remain project evidence, which is what they
-- were before anyone tagged them.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectPhoto_incidentId_fkey') THEN
    ALTER TABLE "ProjectPhoto"
      ADD CONSTRAINT "ProjectPhoto_incidentId_fkey"
      FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── conversations ───────────────────────────────────────────────────────────
--
-- A plain id, matching the deliberate choice already made for dailyId and
-- locateId: an incident being deleted must not take the conversation about it.

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "incidentId" TEXT NOT NULL DEFAULT '';

COMMIT;
