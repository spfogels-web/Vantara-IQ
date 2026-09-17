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
