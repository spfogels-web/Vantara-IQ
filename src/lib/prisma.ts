import "server-only";

import { PrismaClient } from "@prisma/client";

/**
 * A single PrismaClient across hot reloads / serverless invocations. Without the
 * global cache, dev fast-refresh (and every lambda cold path) would spawn a new
 * client and exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
