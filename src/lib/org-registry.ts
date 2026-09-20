import "server-only";

import { PrismaClient } from "@prisma/client";

/**
 * Which organisations exist, and where each one's data lives.
 *
 * Every organisation is a separate Neon project. There is no shared database
 * and no tenant column — isolation is that the two datasets are never reachable
 * from the same connection. The registry is the only place that knows the
 * mapping, and nothing else in the application may construct a client.
 *
 * Read from the environment rather than a control-plane table because there
 * are two of them and a table would need a database to live in, which would
 * then need a connection, which is the thing being resolved.
 */

export type OrgId = string;

export type OrgRecord = {
  id: OrgId;
  /** What the account card shows. Not authoritative — the database's own Organization row is. */
  label: string;
  url: string;
  directUrl: string | null;
};

/**
 * Just the variables these functions read.
 *
 * Narrower than NodeJS.ProcessEnv so a test can hand over the three that
 * matter instead of a copy of the real environment — which would inherit
 * whatever the machine running the test happens to have set, and is how a
 * test of an environment rule quietly stops testing anything.
 */
type EnvLike = Partial<Record<string, string | undefined>>;

/** Fortitude is the incumbent and keeps the unprefixed variables it already has. */
const FORTITUDE: OrgId = "fortitude";

/**
 * Whether the demonstration tenant is switched on here.
 *
 * Deliberately separate from whether its connection string happens to be
 * present. Those two were the same question until Fortitude's production
 * project turned out to carry `APEX_DATABASE_URL` scoped to Production —
 * added, as far as anyone can tell, by a database integration doing something
 * reasonable. Nobody asked for Apex to be live inside Fortitude, and nothing
 * would have said it was: it would simply have appeared in the workspace
 * switcher, and the locates cron would have started sweeping a demo tenant on
 * every run, because `knownOrgs()` has no admin gate.
 *
 * A credential being reachable is not a statement of intent. This is the
 * statement of intent, and it has to be made on purpose.
 *
 * Exactly the string "true", once trimmed and lowercased. Not "1", not "yes",
 * not "TRUE " with something after it — anything else, including a typo in the
 * variable, leaves the tenant unregistered. Failing closed on a malformed flag
 * costs a deliberate operator one corrected character; failing open costs a
 * live business a tenant it never asked for.
 */
export function apexEnabled(env: EnvLike = process.env): boolean {
  return (env.VANTARA_ENABLE_APEX ?? "").trim().toLowerCase() === "true";
}

/**
 * Build the registry from an environment.
 *
 * Takes the environment rather than reading the global one so the rule above
 * can be tested for what it refuses, not only for what it allows.
 */
export function readRegistry(env: EnvLike = process.env): Map<OrgId, OrgRecord> {
  const out = new Map<OrgId, OrgRecord>();

  const fortUrl = env.DATABASE_URL;
  if (fortUrl) {
    out.set(FORTITUDE, {
      id: FORTITUDE,
      label: "Fortitude Infrastructure",
      url: fortUrl,
      directUrl: env.DATABASE_URL_UNPOOLED ?? null,
    });
  }

  // Both, and in this order: the tenant must be switched on *and* reachable.
  const apexUrl = env.APEX_DATABASE_URL;
  if (apexEnabled(env) && apexUrl) {
    out.set("apex", {
      id: "apex",
      label: "Apex Construction Group",
      url: apexUrl,
      directUrl: env.APEX_DATABASE_URL_UNPOOLED ?? null,
    });
  }

  return out;
}

const REGISTRY = readRegistry();

export function knownOrgs(): OrgRecord[] {
  return [...REGISTRY.values()];
}

export function isKnownOrg(id: string): id is OrgId {
  return REGISTRY.has(id);
}

export function orgRecord(id: OrgId): OrgRecord {
  const rec = REGISTRY.get(id);
  if (!rec) {
    throw new Error(
      `Unknown organisation "${id}". Known: ${[...REGISTRY.keys()].join(", ") || "none"}.`,
    );
  }
  return rec;
}

/**
 * Where the platform's own accounts live.
 *
 * This is **not** a fallback. Nothing consults it to recover from a request
 * that lost its organisation — such a request now throws. It names the one
 * thing that genuinely has no organisation to read from yet: a person typing
 * their email into the sign-in form, before there is a session to say who they
 * are or which company they belong to.
 *
 * The same applies to the handful of other doors that open without a session —
 * an invitation link, a carrier's webhook. Each one wraps itself in this
 * organisation explicitly and visibly, at the point where the decision is
 * actually made. That is the difference from the fallback it replaced: a
 * default inside the client made every query a candidate for reading the wrong
 * company's data, silently. Four named call sites cannot.
 *
 * When a second organisation has its own logins, this becomes a lookup rather
 * than a constant. Nothing else has to change for that.
 */
export const PLATFORM_HOME_ORG: OrgId = resolveHomeOrg();

/**
 * Which database holds the accounts, for the one request that cannot be told:
 * signing in.
 *
 * Fortitude unless a deployment says otherwise, which keeps the live
 * environment exactly as it was — an unset variable changes nothing. A
 * demonstration deployment sets VQ_HOME_ORG to its own organisation so its
 * people can sign in to it, and provides no Fortitude connection string at all,
 * which is what makes that deployment unable to reach Fortitude rather than
 * merely disinclined to.
 *
 * Refuses a value it does not recognise rather than falling back. Falling back
 * would mean a typo in a demo's configuration silently pointed its login at the
 * live business, and every account in it would be a real one.
 */
function resolveHomeOrg(): OrgId {
  const asked = process.env.VQ_HOME_ORG?.trim();
  if (!asked) return FORTITUDE;
  if (!REGISTRY.has(asked)) {
    throw new Error(
      `VQ_HOME_ORG is "${asked}", which is not a configured organisation. ` +
        `Known: ${[...REGISTRY.keys()].join(", ") || "none"}. Refusing to fall back to another tenant's accounts.`,
    );
  }
  return asked;
}

/**
 * Who may move between organisations, by email.
 *
 * Empty unless `PLATFORM_ADMIN_EMAILS` says otherwise, so a deployment that
 * has not been told who the platform operators are lets nobody switch rather
 * than guessing. Being an ADMIN of a company is not the same as operating the
 * platform, and only the second is grounds for seeing another company's books.
 */
export function platformAdmins(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** The organisations this person may enter. Their own, plus any they operate. */
export function organisationsFor(email: string, homeOrg: OrgId): OrgRecord[] {
  if (!platformAdmins().has(email.trim().toLowerCase())) {
    const own = REGISTRY.get(homeOrg);
    return own ? [own] : [];
  }
  return knownOrgs();
}

/**
 * One client per organisation, cached across invocations.
 *
 * Each client is pinned to its own schema for the same reason the single client
 * was: Prisma applies `?schema=` as a session setting, a pooled connection does
 * not keep a session to itself, and the two raw queries in this codebase
 * resolve through `search_path`. The schema is also named in those queries now,
 * so this is the second of two defences rather than the only one.
 */
const globalForClients = globalThis as unknown as { vqOrgClients?: Map<OrgId, PrismaClient> };
const clients: Map<OrgId, PrismaClient> = globalForClients.vqOrgClients ?? new Map();
if (process.env.NODE_ENV !== "production") globalForClients.vqOrgClients = clients;

function pinSchema(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("schema")) u.searchParams.set("schema", "public");
    return u.toString();
  } catch {
    return url;
  }
}

export function clientFor(id: OrgId): PrismaClient {
  const existing = clients.get(id);
  if (existing) return existing;

  const rec = orgRecord(id);
  const client = new PrismaClient({
    datasources: { db: { url: pinSchema(rec.url) } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  clients.set(id, client);
  return client;
}
