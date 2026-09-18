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

/** Fortitude is the incumbent and keeps the unprefixed variables it already has. */
const FORTITUDE: OrgId = "fortitude";

function readRegistry(): Map<OrgId, OrgRecord> {
  const out = new Map<OrgId, OrgRecord>();

  const fortUrl = process.env.DATABASE_URL;
  if (fortUrl) {
    out.set(FORTITUDE, {
      id: FORTITUDE,
      label: "Fortitude Infrastructure",
      url: fortUrl,
      directUrl: process.env.DATABASE_URL_UNPOOLED ?? null,
    });
  }

  const apexUrl = process.env.APEX_DATABASE_URL;
  if (apexUrl) {
    out.set("apex", {
      id: "apex",
      label: "Apex Construction Group",
      url: apexUrl,
      directUrl: process.env.APEX_DATABASE_URL_UNPOOLED ?? null,
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
 * The organisation this deployment falls back to while step 3 is outstanding.
 *
 * Deliberately named, exported and asserted against rather than buried as a
 * default inside the proxy. Step 3 puts the organisation on the session and
 * this constant stops being consulted — at which point a request that arrives
 * without one is refused rather than quietly served somebody's live data.
 *
 * Until then the honest description is: this deployment serves Fortitude, and
 * says so in one place.
 */
export const INCUMBENT_ORG: OrgId = FORTITUDE;

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
