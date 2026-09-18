import { NextResponse } from "next/server";

import { runScheduledLocateChecks } from "@/app/locates/locate-actions";
import { runWithOrg } from "@/lib/org-context";
import { knownOrgs } from "@/lib/org-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The twice-daily locate sweep.
 *
 * Two things happen here and only one of them talks to a provider:
 *
 *   1. Tickets due a check are asked about. Where no feed is configured this
 *      does nothing but write an honest "LOOKUP_UNAVAILABLE" check row.
 *   2. Every live ticket is re-judged against today's date. This part matters
 *      whether or not a feed exists — expiry moves on its own, and a ticket
 *      that read "expires tomorrow" last night has to read "expired" this
 *      morning without anybody touching it.
 *
 * Protected by CRON_SECRET. Vercel sends it as a bearer token; the header is
 * also accepted so the sweep can be triggered by hand during an incident.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not set, so the sweep will not run." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  /**
   * One sweep per organisation.
   *
   * There is no session here and no organisation on the request, so this is
   * the one path that has to say which databases it means — and the answer is
   * all of them, in turn. A sweep that ran against only one would leave the
   * other's board quietly stale, which is the failure this job exists to
   * prevent.
   *
   * Each organisation is caught separately. One database being unreachable is
   * not a reason to skip the rest, and a partial sweep that says which half
   * failed is worth more than a 500 that says nothing ran.
   */
  const results: Record<string, unknown> = {};
  const failures: Record<string, string> = {};

  for (const org of knownOrgs()) {
    try {
      results[org.id] = await runWithOrg(org.id, () => runScheduledLocateChecks());
    } catch (e) {
      // Logged as a failure rather than swallowed: a sweep that silently
      // stopped running is a board that silently stopped being true.
      console.error(`[cron/locates] ${org.id}`, e);
      failures[org.id] = e instanceof Error ? e.message : "The sweep failed.";
    }
  }

  const ok = Object.keys(failures).length === 0;
  return NextResponse.json(
    ok ? { ok, organisations: results } : { ok, organisations: results, failures },
    { status: ok ? 200 : 500 },
  );
}
