-- Step 4: organisation settings, markets, code profile, platform-admin flag.
--
-- NOT APPLIED. Written here, reviewed, and applied under its own gate — the
-- same handling as 001-project-crew.sql, and for the same reason: the last
-- time something was run against this database without one, it put three test
-- projects into live data.
--
-- Everything here is additive. No existing column changes type, nothing is
-- dropped, and no existing row is edited. The only writes are the three rows
-- at the bottom that give Fortitude the settings it has been running on all
-- along, which until now were defaults written into the shape of the product.
--
-- ORDER MATTERS AGAINST THE DEPLOY. The application reads these tables, and
-- an organisation with no settings row permits nothing — no texting, no
-- assistant. So this migration runs BEFORE the code that needs it, not after.
-- Applied to a database the new code is not yet serving, it does nothing at
-- all, which is the safe direction to be wrong in.

BEGIN;

CREATE TABLE IF NOT EXISTS "public"."OrgSettings" (
  "id"               TEXT PRIMARY KEY DEFAULT 'singleton',
  "legalName"        TEXT    NOT NULL,
  "shortName"        TEXT    NOT NULL,
  "isDemo"           BOOLEAN NOT NULL DEFAULT false,
  "smsEnabled"       BOOLEAN NOT NULL DEFAULT false,
  "assistantEnabled" BOOLEAN NOT NULL DEFAULT false,
  "customerTerms"    TEXT    NOT NULL,
  "subTerms"         TEXT    NOT NULL,
  "retainagePct"     DOUBLE PRECISION NOT NULL,
  "locateProvider"   TEXT    NOT NULL,
  "defaultState"     TEXT    NOT NULL,
  "updatedAt"        TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."Market" (
  "id"        TEXT PRIMARY KEY,
  "label"     TEXT NOT NULL,
  "prime"     TEXT NOT NULL,
  "hint"      TEXT NOT NULL,
  "state"     TEXT NOT NULL,
  "towns"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "customers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "public"."OrgCodeProfile" (
  "id"            TEXT PRIMARY KEY DEFAULT 'singleton',
  "priorityCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "families"      JSONB  NOT NULL DEFAULT '{}'::JSONB,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);

-- Operating the platform is not the same as running a company on it, and must
-- never be inferred from a role. False for every existing account, including
-- every ADMIN: nobody operates anything until somebody says so.
ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Fortitude's own row.
--
-- These are not new values. They are the terms this deployment has been
-- running on since it was built, read out of the schema defaults they were
-- written into: Net 30 to customers, ten percent retainage, Net 21 to crews,
-- GA811, Georgia. Moving them here changes nothing about how Fortitude
-- behaves; it stops them being the shape every future organisation inherits.
--
-- ON CONFLICT DO NOTHING so a re-run is harmless and so this can never
-- overwrite a value somebody has since changed in the application.
-- ---------------------------------------------------------------------------
INSERT INTO "public"."OrgSettings" (
  "id", "legalName", "shortName", "isDemo", "smsEnabled", "assistantEnabled",
  "customerTerms", "subTerms", "retainagePct", "locateProvider", "defaultState",
  "updatedAt"
) VALUES (
  'singleton',
  'Fortitude Infrastructure LLC',
  'Fortitude',
  false,
  -- On, because it is on today: the A2P campaign, the number and the consent
  -- records all belong to this organisation.
  true,
  -- On, because the assistant works here today. It was gated to one email
  -- address; the entitlement is the organisation's now, and who may use it is
  -- a separate staff check.
  true,
  'Net 30',
  'Net 21',
  0.1,
  'GA811',
  'GA',
  NOW()
) ON CONFLICT ("id") DO NOTHING;

-- Fortitude's three markets, exactly as the constant held them.
INSERT INTO "public"."Market" ("id", "label", "prime", "hint", "state", "towns", "customers", "sortOrder")
VALUES
  ('north-ga', 'North Georgia', 'Globe Communications', 'Globe', 'GA',
   ARRAY['toccoa','eastanollee','colbert','lexington','white plains','hartwell','royston','carnesville','clarkesville','cornelia'],
   ARRAY['globe communications','globe'], 0)
ON CONFLICT ("id") DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- NOT YET WRITTEN, and deliberately so.
--
-- The remaining two markets and the code profile are left out because the
-- application does not read either table yet — the markets constant and the
-- unit-code lists are still in TypeScript. Seeding rows that nothing reads
-- would mean two sources of truth for the same answer, and the one that is
-- wrong would be the one nobody is looking at.
--
-- They belong in the migration that lands alongside the code that reads them.
-- ---------------------------------------------------------------------------
