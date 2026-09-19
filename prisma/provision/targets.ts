/**
 * Which databases may be provisioned, and which may never be.
 *
 * This exists because a `prisma db push` intended for Apex landed on Fortitude
 * production. The shell had DATABASE_URL overridden; Prisma loaded .env after
 * the shell and used Fortitude's value instead. The command announced the host
 * it was using and did it anyway, because nothing was checking.
 *
 * The lesson is not "be careful with environment variables". It is that a
 * provisioning path must not be able to resolve a live tenant's database at
 * all, and must refuse on identity rather than on intent. Everything here is
 * built for the next organisation as much as for Apex.
 */

/** A hostname fragment that identifies a Neon endpoint without credentials. */
export type HostMark = string;

/**
 * Endpoints that must never be provisioned into, whatever is asked for.
 *
 * Fortitude is a live business. Its database is not a target of this tool, and
 * no flag, variable or argument may make it one. Add a mark here the moment an
 * organisation goes live — before it has data worth protecting, not after.
 */
export const NEVER_PROVISION: { mark: HostMark; who: string }[] = [
  { mark: "damp-mouse", who: "Fortitude Infrastructure (production)" },
];

export type ProvisionTarget = {
  /** The organisation key, as the app's org registry knows it. */
  key: string;
  label: string;
  /**
   * The environment variable holding this organisation's connection string.
   *
   * Deliberately never DATABASE_URL. The generated schema reads its URL from
   * one variable of this tool's own, so Fortitude's value cannot satisfy the
   * datasource even if Prisma loads .env — which it does.
   */
  urlVar: string;
  directUrlVar: string;
  /**
   * The endpoint this organisation is expected to live on. Asserted against
   * the host actually resolved, so a correct-looking string pointed at some
   * other project is refused rather than provisioned.
   */
  expectHostMark: HostMark;
};

export const TARGETS: ProvisionTarget[] = [
  {
    key: "apex",
    label: "Apex Construction Group (demonstration)",
    urlVar: "APEX_DATABASE_URL",
    directUrlVar: "APEX_DATABASE_URL_UNPOOLED",
    expectHostMark: "aged-dew",
  },
];

export function targetFor(key: string): ProvisionTarget {
  const t = TARGETS.find((x) => x.key === key);
  if (!t) {
    throw new Error(
      `No provisioning target named "${key}". Known: ${TARGETS.map((x) => x.key).join(", ") || "none"}`,
    );
  }
  return t;
}

/**
 * The kill switch. Throws before any connection is opened.
 *
 * Shared by every tool that resolves a tenant database, so provisioning and
 * verification refuse on identical grounds — a read-only tool pointed at a
 * live tenant is still a tool reporting the wrong database's state as if it
 * were the one being built.
 */
export function refuseForbiddenHost(host: string, where: string): void {
  for (const { mark, who } of NEVER_PROVISION) {
    if (host.includes(mark)) {
      throw new Error(
        `REFUSING: ${where} resolves to ${host}, which contains "${mark}" — ${who}.`,
      );
    }
  }
}

/** The positive half: it must be the endpoint this organisation lives on. */
export function refuseUnexpectedHost(t: ProvisionTarget, host: string, where: string): void {
  if (!host.includes(t.expectHostMark)) {
    throw new Error(
      `REFUSING: ${where} resolves to ${host}, which is not ${t.label}'s endpoint ("${t.expectHostMark}").`,
    );
  }
}

/**
 * The connection string for a target, checked before it is handed to anything.
 * There is no code path that returns a URL without these two refusals.
 */
export function urlFor(t: ProvisionTarget, kind: "pooled" | "direct"): string {
  const v = kind === "pooled" ? t.urlVar : t.directUrlVar;
  const url = process.env[v];
  if (!url) throw new Error(`${v} is not set — refusing to guess a target`);
  const { host } = identityOf(url);
  refuseForbiddenHost(host, `${t.label} (${kind})`);
  refuseUnexpectedHost(t, host, `${t.label} (${kind})`);
  return url;
}

/** Host and database of a connection string, never its credentials. */
export function identityOf(url: string): { host: string; database: string; user: string } {
  const u = new URL(url);
  return { host: u.host, database: u.pathname.replace(/^\//, ""), user: u.username };
}
