-- Step 9: Fortitude's own configuration.
--
-- NOT APPLIED. Prepared, reviewed, and applied under its own gate.
--
-- WHY THIS IS A MIGRATION AND NOT A ONE-OFF WRITE
--
-- Because the application refuses to text anybody without it. Every outbound
-- message passes through one gate in src/lib/sms.ts:
--
--     if (!settings.smsAllowed) { ... }
--     smsAllowed = row.smsEnabled && !row.isDemo
--
-- With no OrgSettings row that is false, and the code says so in as many
-- words: "This organisation has no settings, so texting is off until it does."
-- The currently-deployed commit (66d603f) has no such gate — texting works
-- there off environment variables alone. So the release candidate would
-- silently switch off SMS for a live business, and the only thing that
-- prevents it is this file running FIRST.
--
--   ORDER AGAINST THE DEPLOY: apply this BEFORE the new code goes live.
--   Applied early it is inert — nothing on 66d603f reads OrgSettings or
--   Market, so a row sitting there changes no behaviour until the code that
--   reads it ships.
--
-- WHAT IS AND IS NOT AUTHORITATIVE
--
-- These are organisation-level FALLBACKS. Customer and project records already
-- carry their own terms, rates and retainage, and the application prefers
-- those wherever it reads them — see actions.ts, where a subcontractor's terms
-- fall back to subTerms only when the record itself names none. Nothing here
-- overwrites a customer, a project, or a rate card.
--
-- Every value below was either supplied by the business or read out of this
-- database. Nothing is inferred and nothing is invented:
--
--   legalName/shortName/terms/retainage   supplied by the business
--   defaultState = GA                     both markets are Georgia
--   locateProvider = GA811                the only provider this build has
--                                         (src/lib/locate-providers) — anything
--                                         else degrades to "unintegrated"
--   market prime/state                    read from Project -> Customer
--   market label/hint                     supplied by the business
--   Globe crewNumber                      read from 63 filed daily sheets
--
-- SAFETY
--
-- Additive and idempotent. No DROP, no DELETE, no TRUNCATE, no ALTER, no
-- column type change, no rename, no cascade. Re-running it changes nothing.
-- Every name is schema-qualified, because production reaches this database
-- through a pooler that can hand back a connection carrying somebody else's
-- search_path — the defect that would have broken 003 halfway through.

-- ---------------------------------------------------------------------------
-- The organisation
-- ---------------------------------------------------------------------------
--
-- ON CONFLICT DO NOTHING, not DO UPDATE: if a row already exists then somebody
-- has configured this organisation, and their values are worth more than this
-- file's. A second run is a no-op rather than a reset.

INSERT INTO "public"."OrgSettings" (
  "id", "legalName", "shortName", "isDemo", "smsEnabled", "assistantEnabled",
  "customerTerms", "subTerms", "retainagePct", "locateProvider", "defaultState",
  "supportPhone", "updatedAt"
) VALUES (
  'singleton',
  'Fortitude Infrastructure LLC',
  'Fortitude',
  FALSE,        -- isDemo: a live business, so messages may leave the building
  TRUE,         -- smsEnabled: preserves the texting that works today
  FALSE,        -- assistantEnabled: the assistant is not part of this release
  'Net 30',     -- customerTerms: fallback only; a customer's own terms win
  'Net 21',     -- subTerms:      fallback only; a sub's own terms win
  0,            -- retainagePct:  fallback only; customer retainage is authoritative
  'GA811',
  'GA',
  '',           -- supportPhone: not supplied, and not invented
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- The markets
-- ---------------------------------------------------------------------------
--
-- `id` is what Project.market already holds — 7 projects say 'north-ga' and 5
-- say 'south-ga' — so these rows describe jobs that exist rather than creating
-- anything new.
--
-- `towns` and `customers` are left empty on purpose. They are the heuristic
-- that SUGGESTS a market for a project that has none, and every project here
-- already has one; seeding a guess into a field that steers future
-- classification is not something this file should decide.

INSERT INTO "public"."Market" ("id", "label", "prime", "hint", "state", "sortOrder")
VALUES
  ('north-ga', 'North Georgia', 'GLOBE COMMUNICATIONS',  'North Georgia projects', 'GA', 1),
  ('south-ga', 'South Georgia', 'Trawick Construction',  'South Georgia projects', 'GA', 2)
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Globe's crew number
-- ---------------------------------------------------------------------------
--
-- Read from the data, not chosen: 63 filed daily sheets on Globe's projects
-- carry 24208171927-A27-311. Two further sheets carry it outside Globe's work
-- and both are DRAFTS — one linked to no project at all, one a Trawick draft
-- where the field carried over from a previous entry. Neither is filed work,
-- and the carry-over is the exact reason this identifier belongs on the
-- customer rather than on the organisation: a contractor working two primes is
-- issued a different number by each.
--
-- Trawick is deliberately not given one. No Trawick-issued number appears
-- anywhere in this database, and a blank that means "not known" is worth more
-- than a value that means "copied from the other prime".
--
-- Narrowly scoped three ways: by exact customer name, and only where the field
-- is currently empty, so a number somebody has since entered by hand is never
-- overwritten. It cannot reach Trawick, Apex, or any other tenant — Apex lives
-- in a different Neon project entirely.

UPDATE "public"."Customer"
   SET "crewNumber" = '24208171927-A27-311'
 WHERE "name" = 'GLOBE COMMUNICATIONS'
   AND COALESCE("crewNumber", '') = '';
