"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSession, signSession, setSessionCookie, type SessionRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runWithOrg } from "@/lib/org-context";
import { isKnownOrg, organisationsFor, orgRecord } from "@/lib/org-registry";

/**
 * Moving between organisations.
 *
 * The organisation is a claim inside a signed token, so switching means
 * re-signing the session. That is the only way it can change, and it is why
 * the id arriving from the browser is never trusted on its own: it is checked
 * against what this particular person is allowed to enter, and a request for
 * anything else is refused rather than clamped to something safe.
 *
 * Who is allowed is the platform-admin allowlist, which is an environment
 * variable and empty by default. Being an ADMIN of a contractor is not the
 * same as operating the platform; only the second is grounds for opening
 * another company's books.
 */

export type OrgChoice = {
  id: string;
  label: string;
  active: boolean;
};

/**
 * The organisations to offer in the account card, and which one is live.
 *
 * Returns a single entry for almost everybody, which the card renders as no
 * switcher at all — there is nothing to choose between.
 */
export async function organisationChoices(): Promise<OrgChoice[]> {
  const session = await getSession();
  if (!session) return [];

  const me = await runWithOrg(session.home, () =>
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, role: true },
    }),
  );
  if (!me) return [];

  // A crew login never moves between companies, whoever they are.
  if (me.role === "SUBCONTRACTOR") return [];

  return organisationsFor(me.email, session.home).map((o) => ({
    id: o.id,
    label: o.label,
    active: o.id === session.org,
  }));
}

/** Switch the active organisation, or refuse. Returns only on refusal. */
export async function switchOrganisation(orgId: string) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };

  // Read from where the account lives, not from whichever organisation is
  // currently being looked at — the operator's row only exists in one of them.
  const me = await runWithOrg(session.home, () =>
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, role: true },
    }),
  );
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (me.role === "SUBCONTRACTOR") {
    return { ok: false as const, error: "Not allowed." };
  }

  if (!isKnownOrg(orgId)) {
    return { ok: false as const, error: "No such organisation." };
  }

  // The allowlist, applied to the organisation actually requested. Refused
  // rather than silently left where they were, so a switcher that has stopped
  // working says so instead of looking like it worked.
  const allowed = organisationsFor(me.email, session.home).some((o) => o.id === orgId);
  if (!allowed) {
    return { ok: false as const, error: "Not allowed." };
  }

  if (orgId === session.org) return { ok: true as const };

  await setSessionCookie(
    await signSession({
      userId: session.userId,
      role: session.role as SessionRole,
      org: orgId,
      // Unchanged: switching changes whose data you see, never who you are.
      home: session.home,
    }),
  );

  // Every cached render belongs to the organisation it was produced for.
  revalidatePath("/", "layout");
  redirect("/");
}

/** The active organisation's label, for the account card. */
export async function activeOrganisationLabel(): Promise<string | null> {
  const session = await getSession();
  if (!session || !isKnownOrg(session.org)) return null;
  return orgRecord(session.org).label;
}
