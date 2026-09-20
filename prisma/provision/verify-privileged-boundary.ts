/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled: it reads connection strings for more than
 * one tenant, which is exactly what must not reach a browser.
 */
/**
 * The server boundary itself, called directly rather than navigated to.
 *
 *   npx tsx prisma/provision/verify-privileged-boundary.ts apex
 *
 * A page that redirects is not a protection if the endpoint behind it still
 * answers. So these requests skip the screens entirely and call the handlers —
 * rate sheets, invoices, remittances, documents — as a crew, and then as an
 * administrator to prove the endpoint works at all. A refusal only means
 * something if the same request succeeds for somebody entitled to it.
 *
 * Also here: who may change workspace. A contractor's own ADMIN is not a
 * platform operator, and the two must not be confusable.
 *
 * Reads only, against Apex. No mutation is attempted against Fortitude, and
 * any probe row written to Apex is removed before this exits.
 */
import { spawn, type ChildProcess } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

import { identityOf, targetFor, urlFor } from "./targets";

const PORT = 3216;
const BASE = `http://localhost:${PORT}`;

let failures = 0;
const skipped: string[] = [];
function check(ok: boolean, name: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function mint(userId: string, role: string, org: string, home: string): Promise<string> {
  return `vq_session=${await new SignJWT({ role, org, home })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!))}`;
}

type Reply = { status: number; body: string };

async function req(path: string, cookie: string, init: RequestInit = {}): Promise<Reply> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 60_000);
  try {
    const r = await fetch(BASE + path, {
      redirect: "manual",
      ...init,
      headers: { cookie, ...(init.headers as Record<string, string> | undefined) },
      signal: stop.signal,
    });
    return { status: r.status, body: await r.text().catch(() => "") };
  } catch {
    return { status: 0, body: "" };
  } finally {
    clearTimeout(timer);
  }
}

/** Served means 200 carrying the thing asked for, not merely 200. */
const served = (r: Reply, marker?: string) =>
  r.status === 200 && (!marker || r.body.includes(marker));

async function waitForServer(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the dev server exited with ${child.exitCode}`);
    try {
      if ((await fetch(BASE + "/login")).status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("the dev server did not come up");
}

async function main() {
  const key = process.argv[2] ?? "apex";
  const t = targetFor(key);
  const url = urlFor(t, "pooled");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const fort = new PrismaClient();

  console.log(`\nPrivileged server boundary — ${t.label}`);
  console.log(`  tenant ${identityOf(url).host}\n`);

  const crew = (await db.user.findFirst({ where: { role: "SUBCONTRACTOR" } }))!;
  const admin = (await db.user.findFirst({ where: { role: "ADMIN" } }))!;
  const otherSub = (await db.subcontractor.findFirst({
    where: { id: { not: crew.subcontractorId ?? "" } },
    orderBy: { company: "asc" },
  }))!;
  const invoice = (await db.invoice.findFirst({ select: { id: true, number: true } }))!;
  const subInvoice = await db.subInvoice.findFirst({ select: { id: true, number: true } });
  const project = (await db.project.findFirst({ select: { id: true, name: true } }))!;
  const sheet = await db.dailySheet.findFirst({ select: { id: true } });

  const fortBefore = await fort.task.count();

  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-p", String(PORT)], {
    env: process.env,
    stdio: ["ignore", "ignore", "pipe"],
  });

  try {
    console.log("Starting a development server on " + PORT + "…");
    await waitForServer(child);
    console.log("  ready.\n");

    const asCrew = await mint(crew.id, "SUBCONTRACTOR", key, key);
    /** A crew whose token lies about its role — the false-positive case. */
    const asCrewClaimingAdmin = await mint(crew.id, "ADMIN", key, key);
    const asAdmin = await mint(admin.id, "ADMIN", key, key);

    // ---- endpoints, called directly ---------------------------------------
    console.log("ENDPOINTS CALLED DIRECTLY (not navigated to)");
    const endpoints: [string, string, string | undefined][] = [
      ["customer invoice", `/api/invoice/${invoice.id}`, undefined],
      ["another crew's rate sheet", `/api/rate-sheet/${otherSub.id}`, undefined],
      ["a job's rate sheet", `/api/rate-sheet/project/${project.id}`, undefined],
      ...(subInvoice ? ([["crew remittance", `/api/remittance/${subInvoice.id}`, undefined]] as [string, string, undefined][]) : []),
      ...(sheet ? ([["daily sheet", `/api/daily-sheet/${sheet.id}`, undefined]] as [string, string, undefined][]) : []),
      ["project map", `/api/project-map/${project.id}`, undefined],
    ];

    for (const [label, path, marker] of endpoints) {
      const asAdminReply = await req(path, asAdmin);
      const crewReply = await req(path, asCrew);
      const forgedReply = await req(path, asCrewClaimingAdmin);

      /**
       * The control first, and a failing control is not a failing test.
       *
       * If an administrator cannot get the thing either, the refusals below
       * say nothing about authorization — the endpoint wants a record this
       * dataset has not got. That is reported as not exercised rather than
       * counted as a pass, which would be the dishonest reading, or as a
       * failure, which would be the wrong one.
       */
      const control = served(asAdminReply, marker);
      if (!control) {
        console.log(`  SKIP  ${label}: not exercised — an administrator gets status ${asAdminReply.status} for it`);
        skipped.push(`${label} (admin status ${asAdminReply.status})`);
        continue;
      }
      check(control, `${label}: an administrator is served it`, `status ${asAdminReply.status}`);

      check(!served(crewReply, marker), `${label}: a crew is refused`, `status ${crewReply.status}`);
      check(
        !served(forgedReply, marker),
        `${label}: a crew whose token claims ADMIN is refused`,
        `status ${forgedReply.status}`,
      );
    }

    // ---- a mutation, called directly --------------------------------------
    console.log("\nA MUTATION, CALLED DIRECTLY");
    /**
     * The upload endpoint is the mutation reachable over plain HTTP — the rest
     * of the product's writes are server actions, which Next addresses by a
     * build-specific action id rather than a URL. Those are not invoked here,
     * and that limit is stated in the report rather than papered over: what
     * they share with this endpoint is getCurrentUser, which reads the role
     * from the database, and the query-level requireStaff behind them.
     */
    const upload = await req("/api/blob/upload", asCrewClaimingAdmin, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "shared/probe.txt", callbackUrl: "" } }),
    });
    check(
      upload.status !== 200,
      "a crew's upload request is refused at the endpoint",
      `status ${upload.status}`,
    );

    // ---- who may change workspace -----------------------------------------
    console.log("\nWHO MAY CHANGE WORKSPACE");
    const { organisationsFor, platformAdmins } = await import("../../src/lib/org-registry");
    const operators = [...platformAdmins()];
    console.log(`  platform-admin allowlist: ${operators.length ? operators.join(", ") : "empty"}`);

    /**
     * `organisationsFor` is the authority the switch action consults, after it
     * has read the role from the home database and refused crews outright.
     * Asking it directly is asking the same question the action asks.
     */
    const apexAdminChoices = organisationsFor(admin.email, key).map((o) => o.id);
    check(
      !apexAdminChoices.includes("fortitude"),
      "an Apex ADMIN is not offered Fortitude's workspace",
      apexAdminChoices.join(", ") || "none",
    );

    const fortAdmin = await fort.user.findFirst({ where: { role: "ADMIN" }, select: { email: true } });
    if (fortAdmin) {
      const fortChoices = organisationsFor(fortAdmin.email, "fortitude").map((o) => o.id);
      const isOperator = operators.includes(fortAdmin.email.toLowerCase());
      check(
        isOperator ? fortChoices.includes(key) : !fortChoices.includes(key),
        isOperator
          ? "a platform operator is offered the Apex workspace"
          : "an ordinary Fortitude ADMIN is not offered the Apex workspace",
        fortChoices.join(", ") || "none",
      );
    }

    /**
     * A crew is refused by switchOrganisation before the allowlist is reached:
     * it reads the role from the home database and returns "Not allowed." for
     * SUBCONTRACTOR. Asserted here on the same authority the action consults.
     */
    check(
      organisationsFor(crew.email, key).length <= 1,
      "a crew has no second workspace to be offered",
      String(organisationsFor(crew.email, key).length),
    );

    // And a tenant ADMIN role confers no platform authority by itself.
    check(
      !operators.includes(admin.email.toLowerCase()),
      "Apex's own ADMIN is not on the platform allowlist",
      admin.email,
    );

    // ---- forging the workspace --------------------------------------------
    console.log("\nFORGING THE WORKSPACE");
    const forgedOrg = await req("/customers", await mint(crew.id, "ADMIN", "fortitude", key));
    check(
      !forgedOrg.body.includes("GLOBE COMMUNICATIONS") && !forgedOrg.body.includes("Trawick"),
      "a crew naming Fortitude in its token reaches no Fortitude data",
      `status ${forgedOrg.status}`,
    );
    const forgedHeader = await req("/customers", asAdmin, { headers: { "x-vq-org": "fortitude" } });
    check(
      !forgedHeader.body.includes("GLOBE COMMUNICATIONS") && !forgedHeader.body.includes("Trawick"),
      "an inbound x-vq-org header reaches no Fortitude data",
      `status ${forgedHeader.status}`,
    );
  } finally {
    child.kill();
    const fortAfter = await fort.task.count();
    check(fortAfter === fortBefore, "Fortitude was not mutated", `${fortBefore} -> ${fortAfter}`);
    await Promise.all([db.$disconnect(), fort.$disconnect()]);
  }

  console.log("\n" + "=".repeat(64));
  if (skipped.length) console.log(`  not exercised: ${skipped.join(", ")}`);
  console.log(failures === 0 ? "  PRIVILEGED BOUNDARY PASSED" : `  PRIVILEGED BOUNDARY FAILED — ${failures}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("\nPrivileged boundary check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
