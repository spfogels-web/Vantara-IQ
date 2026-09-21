import "server-only";

/**
 * How an invited subcontractor reaches a database before they have an account.
 *
 * Onboarding is the one flow that must work from nothing: no session, no
 * account, no cookie, no organisation. The person holding the link has never
 * used this application, and creating their access *is* what onboarding does,
 * so requiring a session to onboard is circular.
 *
 * Everywhere else, the organisation on a request comes from the signed
 * session, and `resolveOrg()` throws when there is none. That throw is right —
 * the fallback it replaced would have served a real company's data to an
 * anonymous request. But it left onboarding with no way to say which
 * organisation it belonged to, and an invitation emailed to a new contractor
 * failed for them while working for the office that sent it: same link, same
 * token, one request carrying a session and one not.
 *
 * So the invitation itself becomes the bootstrap credential. It is the only
 * one, and it has to carry its own weight.
 *
 * ## Discovery is not authorization
 *
 * These are two separate questions and the split is deliberate:
 *
 *   `discoverInviteTenant` answers *which database holds this token*. It reads
 *   one primary key per organisation and returns a name. Finding a token
 *   proves only that a database contains it — it grants nothing.
 *
 *   `withInvite` then enters that organisation and hands the invitation to the
 *   caller, which must still check that this invitation may do this particular
 *   thing to this particular record — `assertSubcontractorWrite` already does
 *   exactly that, and is unchanged by any of this.
 *
 * A token that exists but does not own the record being written is refused, in
 * the tenant, by the same rule that has always governed it.
 *
 * ## The invitation outranks the session
 *
 * `runWithOrg` sets an AsyncLocalStorage frame, and `resolveOrg` reads that
 * frame *before* the session header. That ordering matters here: an operator
 * opening an invitation in a browser already signed in to their own
 * organisation must still act on the organisation that issued the invitation,
 * not the one their cookie happens to name. The invitation decides, and it
 * decides the same way whether the browser is clean or not — which is the
 * whole point, since a browser with a stale session is exactly how the
 * original failure stayed hidden.
 *
 * ## Cost
 *
 * One indexed lookup per configured organisation, and production has one. When
 * there are many, tokens can be made self-identifying so the lookup is direct —
 * that is an optimisation of *discovery* and changes nothing about the
 * authorization above it. Links already in circulation are bare tokens and
 * must keep working, which is why discovery is a lookup rather than a parse.
 */
import type { Invite } from "@prisma/client";

import { runWithOrg } from "@/lib/org-context";
import { knownOrgs, type OrgId } from "@/lib/org-registry";
import { prisma } from "@/lib/prisma";

/** The invitation, plus the organisation that turned out to own it. */
export type ValidatedInvite = Invite & { org: OrgId };

export type InviteFailure = { ok: false; error: string };

/** Said the same way whatever went wrong, so probing cannot tell cases apart. */
const REFUSED: InviteFailure = {
  ok: false,
  error: "This invitation link is not valid.",
};

/**
 * Which organisation holds this token, if any.
 *
 * Discovery only. It selects a single column by primary key and returns a
 * name; nothing is read from the tenant and nothing is authorized. A token no
 * organisation holds returns null, and the caller has then entered no
 * organisation at all.
 */
export async function discoverInviteTenant(token: string): Promise<OrgId | null> {
  const t = token?.trim();
  if (!t) return null;

  for (const org of knownOrgs()) {
    const hit = await runWithOrg(org.id, () =>
      prisma.invite.findUnique({ where: { token: t }, select: { token: true } }),
    ).catch(() => null);
    if (hit) return org.id;
  }
  return null;
}

/**
 * Enter the organisation that issued this invitation, and hand it over.
 *
 * `fn` runs inside that organisation's context, so every query it makes — and
 * every authorization check it performs — happens against the right database.
 * What `fn` is allowed to do with the invitation is `fn`'s business: this
 * establishes where, not what.
 */
export async function withInvite<T>(
  token: string,
  fn: (invite: ValidatedInvite) => Promise<T>,
): Promise<T | InviteFailure> {
  const org = await discoverInviteTenant(token);
  if (!org) return REFUSED;

  return runWithOrg(org, async () => {
    // Read again inside the tenant. The discovery pass selected one column to
    // answer "where"; this is the record itself, read where it lives.
    const invite = await prisma.invite.findUnique({ where: { token: token.trim() } });
    if (!invite) return REFUSED;
    return fn({ ...invite, org });
  });
}

/** True when the call returned a refusal rather than the callback's value. */
export function isInviteFailure(v: unknown): v is InviteFailure {
  return typeof v === "object" && v !== null && (v as InviteFailure).ok === false;
}

/**
 * Run an onboarding operation in whichever organisation is appropriate.
 *
 * With an invitation token, that is the organisation the invitation belongs
 * to — established here, before the operation runs, so the authorization the
 * operation performs happens against the right database. Without one, nothing
 * changes: the request is an ordinary signed-in one and the session supplies
 * the organisation exactly as it always has.
 *
 * This is the whole of the fix. The authorization itself was never wrong —
 * `assertSubcontractorWrite` has always accepted a token that owns the record
 * it is writing to. What it lacked was somewhere to read from.
 */
export async function runForOnboarding<T>(
  inviteToken: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T | InviteFailure> {
  if (!inviteToken?.trim()) return fn();
  return withInvite(inviteToken, () => fn());
}
