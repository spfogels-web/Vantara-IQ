import "server-only";

import { PrismaClient } from "@prisma/client";

/**
 * Always say which schema, rather than inheriting one.
 *
 * Prisma pins `search_path` from the connection string's `?schema=` parameter
 * as a session setting — and when the parameter is absent it sets nothing and
 * takes whatever the backend already had. Neon's pooler hands a backend on to
 * the next client without clearing that, so a process that had set a schema
 * left it behind: a later connection built from this very URL came back with
 * `search_path` pointing at a schema that no longer existed.
 *
 * Prisma schema-qualifies the SQL it generates, so the model API was never at
 * risk. Raw SQL is not qualified and resolves through `search_path`, and there
 * are two such queries in this codebase — the project map summary and the
 * material custody row lock.
 *
 * Naming `public` explicitly costs nothing, makes what was already the
 * effective default into a stated one, and means no inherited value can apply.
 * An explicit parameter in the environment still wins, which is how the test
 * harness points itself at a disposable schema.
 */
function connectionUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("schema")) url.searchParams.set("schema", "public");
    return url.toString();
  } catch {
    // Not a shape we can parse — hand it back untouched rather than refuse to
    // start over a query-string detail.
    return raw;
  }
}

/**
 * The schema this application's tables live in, for raw SQL to name outright.
 *
 * Prisma schema-qualifies everything it generates, so the model API never
 * depends on `search_path`. Raw SQL does, and that turned out to be a real
 * outage rather than a theoretical one: the two raw queries in this codebase
 * failed in production with `relation "Project" does not exist` while every
 * model-API query on the same page succeeded.
 *
 * Setting `?schema=` is not a reliable fix on its own. Prisma applies it as a
 * session setting when the connection opens, and a pooled Neon connection in a
 * serverless runtime does not keep one session to itself — so the value can be
 * whatever the previous occupant of that backend left behind. It held on a
 * long-lived local connection and did not hold in production, which is exactly
 * the asymmetry that made this hard to see.
 *
 * Naming the schema in the query removes the question entirely. Validated
 * against an identifier pattern because it is interpolated rather than bound —
 * it comes from our own environment, but a value that reaches SQL unescaped
 * deserves the check regardless.
 */
export const DB_SCHEMA: string = (() => {
  const fallback = "public";
  try {
    const raw = process.env.DATABASE_URL;
    if (!raw) return fallback;
    const named = new URL(raw).searchParams.get("schema");
    if (!named) return fallback;
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(named) ? named : fallback;
  } catch {
    return fallback;
  }
})();

/** `"public"."Project"` — a table reference that cannot be resolved wrongly. */
export function table(name: string): string {
  return `"${DB_SCHEMA}"."${name}"`;
}

/**
 * A single PrismaClient across hot reloads / serverless invocations. Without the
 * global cache, dev fast-refresh (and every lambda cold path) would spawn a new
 * client and exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = connectionUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
