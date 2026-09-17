/**
 * Which schema this application's tables live in, for raw SQL to name outright.
 *
 * Prisma schema-qualifies everything it generates, so the model API never
 * depends on `search_path`. Raw SQL does, and that was a real outage rather
 * than a theoretical one: two raw queries failed in production with
 * `relation "Project" does not exist` while every model-API query on the same
 * request succeeded.
 *
 * Setting `?schema=` is not a fix on its own. Prisma applies it as a session
 * setting when the connection opens, and a pooled connection in a serverless
 * runtime does not keep one session to itself — the value can be whatever the
 * previous occupant of that backend left behind. It held on a long-lived local
 * connection and did not hold in production, which is the asymmetry that let
 * the bug through local testing.
 *
 * Naming the schema in the query removes the question entirely.
 *
 * Deliberately free of `server-only` so the guard in tests/isolation can import
 * it. It reads one environment variable and holds no connection.
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const DB_SCHEMA: string = (() => {
  const fallback = "public";
  try {
    const raw = process.env.DATABASE_URL;
    if (!raw) return fallback;
    const named = new URL(raw).searchParams.get("schema");
    if (!named) return fallback;
    // Interpolated rather than bound, so it is checked even though it comes
    // from our own environment.
    return IDENTIFIER.test(named) ? named : fallback;
  } catch {
    return fallback;
  }
})();

/** `"public"."Project"` — a table reference that cannot be resolved wrongly. */
export function table(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Refusing to build a table reference from ${name}`);
  return `"${DB_SCHEMA}"."${name}"`;
}
