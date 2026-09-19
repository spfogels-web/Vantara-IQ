-- Step 4: organisation settings, markets, code profile, platform-admin flag.
--
-- NOT APPLIED. Written here, reviewed, and applied under its own gate — the
-- same handling as 001-project-crew.sql, and for the same reason: the last
-- time something ran against this database without one, it put three test
-- projects into live data.
--
-- Everything here is additive. No existing column changes type, nothing is
-- dropped, and no existing row is edited. The only writes are the rows at the
-- bottom, which give Fortitude the configuration it has been running on all
-- along — until now written into the shape of the product as constants and
-- schema defaults, and therefore inherited by every organisation after it.
--
-- ORDER MATTERS AGAINST THE DEPLOY. The application reads these tables, and an
-- organisation with no rows permits nothing: no texting, no assistant, no
-- markets on a project form. So this runs BEFORE the code that needs it, not
-- after. Applied to a database the new code is not yet serving it does nothing
-- at all, which is the safe direction to be wrong in.
--
-- Daily sheet codes are deliberately NOT in that list. They come from the
-- customer's rate card for the project's market, and no row here can add to or
-- remove from them.

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
  "supportPhone"     TEXT    NOT NULL DEFAULT '',
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

-- Presentation only: which codes lead a picker, and which price together.
--
-- This table carried a `billableCodes` list as well, seeded with a hand-typed
-- copy of the underground vocabulary. That made it a second source of truth for
-- what a crew may bill, competing with the customer rate cards that the invoice
-- is actually built from — and it drifted, which is how twelve codes went
-- missing from the daily sheet and stopped billing. The rate card is the
-- financial source of truth; this row must never be able to remove a code from
-- a sheet the customer is invoiced for.
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
-- Fortitude's own configuration.
--
-- None of this is new. It is what the deployment has been running on since it
-- was built, read out of the constants and schema defaults it was written
-- into. Moving it here changes nothing about how Fortitude behaves; it stops
-- it being the shape every future organisation inherits.
--
-- ON CONFLICT DO NOTHING throughout, so a re-run is harmless and nothing can
-- overwrite a value somebody has since changed in the application.
-- ---------------------------------------------------------------------------
INSERT INTO "public"."OrgSettings" (
  "id", "legalName", "shortName", "isDemo", "smsEnabled", "assistantEnabled",
  "customerTerms", "subTerms", "retainagePct", "locateProvider", "defaultState",
  "supportPhone", "updatedAt"
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
  '(864) 365-1521',
  NOW()
) ON CONFLICT ("id") DO NOTHING;

-- The three markets, exactly as the constant held them.
INSERT INTO "public"."Market" ("id", "label", "prime", "hint", "state", "towns", "customers", "sortOrder")
VALUES
  ('north-ga', 'North Georgia', 'Globe Communications', 'Globe', 'GA',
   ARRAY['toccoa', 'eastanollee', 'colbert', 'lexington', 'white plains', 'hartwell', 'royston', 'carnesville', 'clarkesville', 'cornelia']::TEXT[],
   ARRAY['globe communications', 'globe']::TEXT[], 0),
  ('south-ga', 'South Georgia', 'Trawick Construction', 'Trawick', 'GA',
   ARRAY['milledgeville', 'dublin', 'sandersville', 'eatonton', 'gray', 'macon', 'swainsboro', 'vidalia']::TEXT[],
   -- Trawick runs two markets, so the customer alone cannot place a job — the
   -- town is what separates this from Alabama. Listed anyway so a Trawick
   -- project with an unfamiliar town lands somewhere reviewable rather than
   -- nowhere.
   ARRAY['trawick construction', 'trawick']::TEXT[], 1),
  ('alabama', 'Alabama', 'Trawick Construction', 'Trawick · Odenville & Springville', 'AL',
   ARRAY['odenville', 'springville', 'moody', 'trussville', 'pell city', 'ashville']::TEXT[],
   ARRAY[]::TEXT[], 2)
ON CONFLICT ("id") DO NOTHING;

-- How the codes are ordered and grouped, exactly as the constants held it.
-- Which codes may be billed is not here, and must not be: see the table above.
INSERT INTO "public"."OrgCodeProfile" ("id", "priorityCodes", "families", "updatedAt")
VALUES (
  'singleton',
  ARRAY['BFO12', 'BFO24', 'BFO48', 'BFO144', 'BMFAF', 'BFOV', 'BM5F1', 'BD5MPF', 'BD4MPF', 'BM60', 'BM61', 'BM2', 'BM26', 'BM53', 'BHF', 'BDO']::TEXT[],
  '{"BFO-MAIN":["BFO12","BFO24","BFO48","BFO96","BFO144"],"BFOV-12.7-12IN":["BFOV(12.7)(1W)12IN DEPTH","BFOV(12.7)(2W)12IN DEPTH"]}'::JSONB,
  NOW()
) ON CONFLICT ("id") DO NOTHING;

COMMIT;
