/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled: it reads connection strings for more than
 * one tenant, which is exactly what must not reach a browser.
 */
/**
 * Prove the application itself works against a tenant's database.
 *
 *   npx tsx prisma/provision/verify-workspace.ts apex
 *
 * Everything up to now proved the *database* was right. This renders the real
 * screens against it — the pages a person opens, not a synthetic shell — and
 * asserts they carry that tenant's own records, and none of anybody else's.
 *
 * ## What it does and does not touch
 *
 * It starts a development server against the real environment, so the server
 * can reach Fortitude as well as the tenant. Every request made here is a GET
 * of a page. Fortitude is fingerprinted before and after and must not move: if
 * rendering a screen writes to a live business, that is a defect worth finding
 * with a read-only script rather than in production.
 *
 * No form is posted, no server action is invoked, nothing is written.
 */
import { spawn, type ChildProcess } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

import { identityOf, targetFor, urlFor } from "./targets";

const PORT = 3211;
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function check(ok: boolean, name: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function mint(userId: string, role: string, org: string, home: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const jwt = await new SignJWT({ role, org, home })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
  return `vq_session=${jwt}`;
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

/** The whole reply, flight payload reassembled, so a name split across chunks is found. */
function pageText(r: Reply): string {
  const chunks: string[] = [];
  const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(r.body)) !== null) {
    try {
      chunks.push(JSON.parse(m[1]) as string);
    } catch {
      /* a malformed chunk is not worth failing a read over */
    }
  }
  return r.body + "\n" + chunks.join("");
}

/** Read until two consecutive reads agree, so a cold compile is not measured. */
async function settled(path: string, cookie: string, attempts = 5): Promise<string> {
  let previous = "";
  for (let i = 0; i < attempts; i++) {
    const r = await get(path, cookie);
    if (r.status !== 200) {
      if (i === attempts - 1) return `__STATUS_${r.status}__${r.location ?? ""}`;
      await new Promise((res) => setTimeout(res, 1200));
      continue;
    }
    const text = pageText(r);
    if (i > 0 && text.length === previous.length) return text;
    previous = text;
    await new Promise((res) => setTimeout(res, 800));
  }
  return previous;
}

async function fingerprint(db: PrismaClient): Promise<Record<string, number>> {
  const r = await db.$queryRawUnsafe<Record<string, bigint>[]>(
    `select
       (select count(*) from "public"."Organization") as organizations,
       (select count(*) from "public"."Customer")     as customers,
       (select count(*) from "public"."CustomerRate") as rates,
       (select count(*) from "public"."Project")      as projects,
       (select count(*) from "public"."Daily")        as dailies,
       (select count(*) from "public"."Invoice")      as invoices,
       (select count(*) from "public"."Task")         as tasks`,
  );
  return Object.fromEntries(Object.entries(r[0]).map(([k, v]) => [k, Number(v)]));
}

async function waitForServer(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the dev server exited with ${child.exitCode}`);
    const r = await get("/login");
    if (r.status === 200) return;
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error("the dev server did not come up");
}

async function main() {
  const key = process.argv[2] ?? "apex";
  const t = targetFor(key);
  const tenantUrl = urlFor(t, "pooled");

  const tenant = new PrismaClient({ datasources: { db: { url: tenantUrl } } });
  const fort = new PrismaClient();

  console.log(`\nWorkspace verification — ${t.label}`);
  console.log(`  tenant    ${identityOf(tenantUrl).host}`);
  console.log(`  fortitude ${identityOf(process.env.DATABASE_URL!).host}  (read-only)`);

  // What the tenant actually contains, so the assertions below name real rows.
  const [org, project, customer, sub, task] = await Promise.all([
    tenant.orgSettings.findFirst(),
    tenant.project.findFirst({ where: { status: "Active" }, orderBy: { name: "asc" } }),
    tenant.customer.findFirst({ where: { crewNumber: { not: "" } }, orderBy: { name: "asc" } }),
    tenant.subcontractor.findFirst({ orderBy: { company: "asc" } }),
    tenant.task.findFirst({ orderBy: { title: "asc" } }),
  ]);
  if (!org || !project || !customer || !sub) throw new Error("the tenant is not seeded; run the seed first");

  const staff = await tenant.user.findFirst({ where: { role: "ADMIN" } });
  if (!staff) throw new Error("the tenant has no admin user");

  const before = await fingerprint(fort);
  console.log(`  Fortitude before: ${JSON.stringify(before)}`);

  console.log("\nStarting a development server on " + PORT + "…");
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-p", String(PORT)], {
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "ignore", "pipe"],
  });

  try {
    await waitForServer(child);
    console.log("  ready.\n");

    /** The account that may enter both workspaces, viewing the tenant. */
    const inTenant = await mint(staff.id, "ADMIN", key, key);

    // ---- 6C: the real screens, carrying this tenant's own records ---------
    console.log("SCREENS UNDER " + t.label.toUpperCase());
    const screens: [string, string, string][] = [
      ["/", "operations centre", project.name],
      ["/projects", "projects", project.name],
      [`/projects/${project.id}`, "one project", project.name],
      ["/dailies", "dailies", project.name],
      ["/customers", "customers", customer.name],
      ["/subcontractors", "subcontractors", sub.company],
      ["/invoicing", "billing", customer.name],
      ["/locates", "locates", project.name],
      ["/materials", "materials", org.legalName.split(",")[0]],
      ["/tasks", "tasks", task ? task.title.slice(0, 24) : project.name],
      ["/prospects", "pipeline", "Kestrel"],
      ["/reports", "reports", org.legalName.split(",")[0]],
    ];

    const rendered: Record<string, string> = {};
    for (const [path, label, expect] of screens) {
      const text = await settled(path, inTenant);
      rendered[path] = text;
      if (text.startsWith("__STATUS_")) {
        check(false, `${label} (${path}) rendered`, text.replace("__STATUS_", "status "));
        continue;
      }
      check(text.includes(expect), `${label} (${path}) shows ${t.label}'s own "${expect}"`);
    }

    // ---- the inverse: nothing of Fortitude's on any of them ---------------
    console.log("\nNOTHING OF FORTITUDE'S UNDER " + t.label.toUpperCase());
    const FORBIDDEN = [
      "Fortitude", "GLOBE COMMUNICATIONS", "Trawick", "24208171927-A27-311",
      "North Georgia", "South Georgia", "GA811", "Rock Creek",
    ];
    const leaks: string[] = [];
    for (const [path] of screens) {
      const text = rendered[path];
      if (!text || text.startsWith("__STATUS_")) continue;
      for (const term of FORBIDDEN) if (text.includes(term)) leaks.push(`${path} → ${term}`);
    }
    check(leaks.length === 0, "no Fortitude identity on any tenant screen", leaks.join("; "));

    // ---- 6B: the switch actually changes the database ---------------------
    console.log("\nROUTING");
    const inFortitude = await mint(staff.id, "ADMIN", "fortitude", key);
    const fortProjects = await settled("/projects", inFortitude);
    const tenantProjects = rendered["/projects"] ?? "";

    check(
      !fortProjects.startsWith("__STATUS_") && !fortProjects.includes(project.name),
      "switching to Fortitude stops showing the tenant's projects",
    );
    check(
      tenantProjects.includes(project.name),
      "and the tenant's own workspace did show them",
    );

    // A header must not be able to move the workspace.
    const forged = await get("/projects", inTenant, { "x-vq-org": "fortitude" });
    const forgedText = pageText(forged);
    check(
      forged.status === 200 && forgedText.includes(project.name),
      "an inbound x-vq-org header does not change the workspace",
    );
    check(
      !forgedText.includes("GLOBE COMMUNICATIONS"),
      "and it certainly does not reach Fortitude's data",
    );

    // A session naming an organisation its holder may not enter.
    const crew = await tenant.user.findFirst({ where: { role: "SUBCONTRACTOR" } });
    if (crew) {
      const crewCrossing = await get("/projects", await mint(crew.id, "SUBCONTRACTOR", "fortitude", key));
      check(
        crewCrossing.status !== 200 || !pageText(crewCrossing).includes("GLOBE COMMUNICATIONS"),
        "a crew naming another organisation does not receive its data",
        `status ${crewCrossing.status}`,
      );
    }

    // ---- 6E: nothing left the building -----------------------------------
    console.log("\nEXTERNAL SIDE EFFECTS");
    const [deliveries, optIns] = await Promise.all([
      tenant.messageDelivery.count(),
      tenant.smsOptIn.count(),
    ]);
    check(deliveries === 0, "no message delivery was recorded while rendering", String(deliveries));
    check(optIns === 0, "no SMS consent was created", String(optIns));
    const settings = await tenant.orgSettings.findFirst();
    check(settings?.isDemo === true && settings?.smsEnabled === false, "the tenant is still a demo with texting off");
  } finally {
    child.kill();
    const after = await fingerprint(fort);
    console.log(`\n  Fortitude after:  ${JSON.stringify(after)}`);
    const moved = Object.keys(after).filter((k) => after[k] !== before[k]);
    // Dailies and invoices may legitimately grow — a live tenant does business
    // while we work. Reference rows may not.
    const structural = moved.filter((k) => !["dailies", "invoices", "tasks"].includes(k));
    check(structural.length === 0, "rendering wrote nothing to Fortitude's reference data", structural.join(", "));
    if (moved.length) console.log(`  (live tables that moved during the run: ${moved.join(", ")})`);

    await Promise.all([tenant.$disconnect(), fort.$disconnect()]);
  }

  console.log("\n" + "=".repeat(64));
  console.log(failures === 0 ? "  WORKSPACE VERIFICATION PASSED" : `  WORKSPACE VERIFICATION FAILED — ${failures}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("\nWorkspace verification failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
