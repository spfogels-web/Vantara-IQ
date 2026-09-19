/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled: it reads connection strings for more than
 * one tenant, which is exactly what must not reach a browser.
 */
/**
 * What one subcontractor can see, and what it must not.
 *
 *   npx tsx prisma/provision/verify-subcontractor-access.ts apex
 *
 * The tenant boundary has been proven. This is the boundary inside it: two
 * subcontractors on the same workspace, each of which must see its own jobs,
 * its own money and nothing of the other's. That is the property a prime
 * contractor asks about before putting its subs on somebody else's software,
 * and "the role is SUBCONTRACTOR" is not an answer to it — access here runs
 * through ProjectCrew assignments, so the test has to go through real requests.
 *
 * Reads only. Every request is a GET; no form is posted and no action invoked.
 * Fortitude is fingerprinted before and after and never written.
 */
import { spawn, type ChildProcess } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

import { identityOf, targetFor, urlFor } from "./targets";

const PORT = 3212;
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function check(ok: boolean, name: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function mint(userId: string, role: string, org: string, home: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return `vq_session=${await new SignJWT({ role, org, home })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret))}`;
}

type Reply = { status: number; body: string; location: string | null };

async function get(path: string, cookie?: string, extra: Record<string, string> = {}): Promise<Reply> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 60_000);
  try {
    const r = await fetch(BASE + path, {
      redirect: "manual",
      headers: { ...(cookie ? { cookie } : {}), ...extra },
      signal: stop.signal,
    });
    return { status: r.status, body: await r.text().catch(() => ""), location: r.headers.get("location") };
  } catch {
    return { status: 0, body: "", location: null };
  } finally {
    clearTimeout(timer);
  }
}

function pageText(r: Reply): string {
  const chunks: string[] = [];
  const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(r.body)) !== null) {
    try {
      chunks.push(JSON.parse(m[1]) as string);
    } catch {
      /* ignore a malformed chunk */
    }
  }
  return r.body + "\n" + chunks.join("");
}

async function settled(path: string, cookie: string, attempts = 4): Promise<Reply & { text: string }> {
  let last: Reply = { status: 0, body: "", location: null };
  let previous = -1;
  for (let i = 0; i < attempts; i++) {
    last = await get(path, cookie);
    const text = pageText(last);
    if (last.status !== 200) return { ...last, text };
    if (i > 0 && text.length === previous) return { ...last, text };
    previous = text.length;
    await new Promise((r) => setTimeout(r, 800));
  }
  return { ...last, text: pageText(last) };
}

async function fingerprint(db: PrismaClient): Promise<Record<string, number>> {
  const r = await db.$queryRawUnsafe<Record<string, bigint>[]>(
    `select (select count(*) from "public"."Organization") as organizations,
            (select count(*) from "public"."Customer")     as customers,
            (select count(*) from "public"."CustomerRate") as rates,
            (select count(*) from "public"."Project")      as projects,
            (select count(*) from "public"."Daily")        as dailies,
            (select count(*) from "public"."Invoice")      as invoices`,
  );
  return Object.fromEntries(Object.entries(r[0]).map(([k, v]) => [k, Number(v)]));
}

async function waitForServer(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the dev server exited with ${child.exitCode}`);
    if ((await get("/login")).status === 200) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("the dev server did not come up");
}

async function main() {
  const key = process.argv[2] ?? "apex";
  const t = targetFor(key);
  const url = urlFor(t, "pooled");
  const tenant = new PrismaClient({ datasources: { db: { url } } });
  const fort = new PrismaClient();

  console.log(`\nSubcontractor access — ${t.label}`);
  console.log(`  tenant ${identityOf(url).host}\n`);

  const crews = await tenant.user.findMany({
    where: { role: "SUBCONTRACTOR", subcontractorId: { not: null } },
    select: { id: true, name: true, subcontractorId: true },
    orderBy: { name: "asc" },
  });
  if (crews.length < 2) throw new Error("two subcontractor logins are needed; run the people module");

  const [A, B] = crews;
  const subA = (await tenant.subcontractor.findUnique({ where: { id: A.subcontractorId! } }))!;
  const subB = (await tenant.subcontractor.findUnique({ where: { id: B.subcontractorId! } }))!;

  /** The jobs each is actually assigned, which is what decides access. */
  const jobs = async (subId: string) =>
    (await tenant.projectCrew.findMany({ where: { subcontractorId: subId }, select: { project: { select: { id: true, name: true } } } })).map((x) => x.project);
  const jobsA = await jobs(subA.id);
  const jobsB = await jobs(subB.id);

  console.log(`  A: ${A.name} (${subA.company}) — ${jobsA.length} jobs`);
  console.log(`  B: ${B.name} (${subB.company}) — ${jobsB.length} jobs`);
  if (!jobsA.length || !jobsB.length) throw new Error("both subcontractors need assignments for this to prove anything");

  const before = await fingerprint(fort);
  console.log("\nStarting a development server on " + PORT + "…");
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-p", String(PORT)], {
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "ignore", "pipe"],
  });

  try {
    await waitForServer(child);
    console.log("  ready.\n");

    const sessionA = await mint(A.id, "SUBCONTRACTOR", key, key);
    const sessionB = await mint(B.id, "SUBCONTRACTOR", key, key);

    // ---- what A can legitimately see -------------------------------------
    console.log("WHAT A CAN SEE");
    const ownJob = jobsA[0];
    const ownPage = await settled(`/projects/${ownJob.id}`, sessionA);
    check(ownPage.status === 200 && ownPage.text.includes(ownJob.name), `A opens its own job "${ownJob.name}"`, `status ${ownPage.status}`);

    const dailies = await settled("/dailies", sessionA);
    check(dailies.status === 200, "A reaches the dailies screen", `status ${dailies.status}`);

    // ---- what A must not see ---------------------------------------------
    console.log("\nWHAT A MUST NOT SEE");
    const otherJob = jobsB[0];
    const across = await settled(`/projects/${otherJob.id}`, sessionA);
    check(
      across.status !== 200 || !across.text.includes(otherJob.name),
      `A cannot open B's job "${otherJob.name}" by its id`,
      `status ${across.status}`,
    );

    const listA = await settled("/projects", sessionA);
    const bNamesOnA = jobsB.filter((j) => listA.text.includes(j.name)).map((j) => j.name);
    check(bNamesOnA.length === 0, "B's jobs are not listed to A", bNamesOnA.join(", "));

    check(!listA.text.includes(subB.company), `B's company name is not shown to A`, subB.company);

    // Another subcontractor's rate card, by the API the office uses.
    const rateSheet = await get(`/api/rate-sheet/${subB.id}`, sessionA);
    check(rateSheet.status !== 200, "A cannot download B's rate sheet", `status ${rateSheet.status}`);

    // Office-only screens.
    for (const path of ["/customers", "/invoicing", "/prospects", "/reports"]) {
      const r = await get(path, sessionA);
      const text = pageText(r);
      const leaked = r.status === 200 && (text.includes(subB.company) || text.includes("Calderon Fiber Partners"));
      check(!leaked, `A does not get office data from ${path}`, `status ${r.status}`);
    }

    // ---- B, reciprocally --------------------------------------------------
    console.log("\nRECIPROCALLY, FOR B");
    const ownB = await settled(`/projects/${jobsB[0].id}`, sessionB);
    check(ownB.status === 200 && ownB.text.includes(jobsB[0].name), `B opens its own job "${jobsB[0].name}"`);
    const acrossB = await settled(`/projects/${jobsA[0].id}`, sessionB);
    check(
      acrossB.status !== 200 || !acrossB.text.includes(jobsA[0].name),
      `B cannot open A's job "${jobsA[0].name}"`,
      `status ${acrossB.status}`,
    );

    // ---- forged tenant mechanisms ----------------------------------------
    console.log("\nFORGED TENANT MECHANISMS");
    const forgedHeader = await get("/projects", sessionA, { "x-vq-org": "fortitude" });
    const forgedText = pageText(forgedHeader);
    check(!forgedText.includes("GLOBE COMMUNICATIONS") && !forgedText.includes("Trawick"), "a forged x-vq-org gets A no Fortitude data");

    const crossTenant = await get("/projects", await mint(A.id, "SUBCONTRACTOR", "fortitude", key));
    const crossText = pageText(crossTenant);
    check(
      crossTenant.status !== 200 || (!crossText.includes("GLOBE COMMUNICATIONS") && !crossText.includes("Trawick")),
      "a session naming Fortitude gets A no Fortitude data",
      `status ${crossTenant.status}`,
    );

    /**
     * A token whose role disagrees with the database.
     *
     * Staff-only routes are gated in middleware on the `role` claim, and the
     * pages behind them do not re-check it — /customers has no staff test of
     * its own. So access follows the claim rather than the account.
     *
     * This is not remotely exploitable: forging the claim needs AUTH_SECRET.
     * The case that needs no attacker is demotion. Move somebody from ADMIN to
     * SUBCONTRACTOR and their existing token keeps office access until it
     * expires, because nothing reads the row that changed.
     *
     * Left failing deliberately. The fix belongs in the application's
     * authorization and would change behaviour for the live tenant too, so it
     * is reported rather than applied here.
     */
    const escalated = await get("/customers", await mint(A.id, "ADMIN", key, key));
    const escText = pageText(escalated);
    check(
      escalated.status !== 200 || !escText.includes("Calderon Fiber Partners"),
      "a token claiming ADMIN for a SUBCONTRACTOR account is refused office data",
      `status ${escalated.status} — role is trusted from the token; the page does not re-check it`,
    );

    // ---- no Fortitude anywhere -------------------------------------------
    console.log("\nNO FORTITUDE ANYWHERE");
    const all = [ownPage.text, listA.text, dailies.text, ownB.text].join("\n");
    const terms = ["Fortitude", "GLOBE COMMUNICATIONS", "Trawick", "24208171927-A27-311", "GA811"];
    const found = terms.filter((x) => all.includes(x));
    check(found.length === 0, "no Fortitude identity on any subcontractor screen", found.join(", "));
  } finally {
    child.kill();
    const after = await fingerprint(fort);
    const moved = Object.keys(after).filter((k) => after[k] !== before[k]);
    const structural = moved.filter((k) => !["dailies", "invoices"].includes(k));
    check(structural.length === 0, "Fortitude's reference data did not move", structural.join(", "));
    console.log(`  Fortitude live counts: ${JSON.stringify(after)}`);
    await Promise.all([tenant.$disconnect(), fort.$disconnect()]);
  }

  console.log("\n" + "=".repeat(64));
  console.log(failures === 0 ? "  SUBCONTRACTOR ACCESS PASSED" : `  SUBCONTRACTOR ACCESS FAILED — ${failures}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("\nSubcontractor access check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
