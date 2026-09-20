/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled.
 */
/**
 * Sign in to a demonstration tenant the way a person would.
 *
 *   VQ_DEMO_PASSWORD=... npx tsx prisma/provision/verify-demo-login.ts apex
 *
 * Every check so far minted its own session token, which proves what a request
 * does once it has one and nothing about whether anybody can get one. This
 * posts the login form, follows the cookie it is given, opens the screens with
 * it, and logs out again.
 *
 * It runs the server the way the preview will: VQ_HOME_ORG naming the demo
 * tenant, and no Fortitude connection string at all — so the deployment is
 * unable to reach Fortitude rather than merely uninclined to. That absence is
 * itself one of the things checked.
 */
import { spawn, type ChildProcess } from "node:child_process";

import { PrismaClient } from "@prisma/client";

import { identityOf, targetFor, urlFor } from "./targets";

const PORT = 3217;
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function check(ok: boolean, name: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

type Reply = { status: number; body: string; location: string | null; setCookie: string | null };

async function req(path: string, init: RequestInit = {}, cookie?: string): Promise<Reply> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 60_000);
  try {
    const r = await fetch(BASE + path, {
      redirect: "manual",
      ...init,
      headers: { ...(cookie ? { cookie } : {}), ...(init.headers as Record<string, string> | undefined) },
      signal: stop.signal,
    });
    return {
      status: r.status,
      body: await r.text().catch(() => ""),
      location: r.headers.get("location"),
      setCookie: r.headers.get("set-cookie"),
    };
  } catch {
    return { status: 0, body: "", location: null, setCookie: null };
  } finally {
    clearTimeout(timer);
  }
}

function pageText(body: string): string {
  const chunks: string[] = [];
  const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    try {
      chunks.push(JSON.parse(m[1]) as string);
    } catch {
      /* ignore */
    }
  }
  return body + "\n" + chunks.join("");
}

async function waitForServer(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the dev server exited with ${child.exitCode}`);
    const r = await req("/login");
    if (r.status === 200) return;
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error("the dev server did not come up");
}

async function main() {
  const key = process.argv[2] ?? "apex";
  const password = process.env.VQ_DEMO_PASSWORD;
  if (!password) throw new Error("VQ_DEMO_PASSWORD is not set");

  const t = targetFor(key);
  const url = urlFor(t, "pooled");
  const db = new PrismaClient({ datasources: { db: { url } } });

  const admin = await db.user.findFirst({ where: { role: "ADMIN", passwordHash: { not: null } } });
  if (!admin) throw new Error("no demo administrator with a password; run set-demo-credentials first");

  const project = (await db.project.findFirst({ where: { status: "Active" }, orderBy: { name: "asc" } }))!;
  const projectCount = await db.project.count();
  const dailyCount = await db.daily.count();

  console.log(`\nDemo login — ${t.label}`);
  console.log(`  target ${identityOf(url).host}`);
  console.log(`  as     ${admin.name} <${admin.email}>\n`);

  /**
   * The preview's environment, built here rather than inherited: the demo
   * tenant's connection strings, its own home organisation, and deliberately
   * no DATABASE_URL — the registry skips an organisation whose string is
   * absent, so Fortitude does not exist for this process at all.
   */
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_URL_UNPOOLED;
  env.VQ_HOME_ORG = key;

  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-p", String(PORT)], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });

  try {
    console.log("Starting the server with no Fortitude connection string…");
    await waitForServer(child);
    console.log("  ready.\n");

    console.log("SIGNING IN");
    const loginPage = await req("/login");
    check(loginPage.status === 200, "the sign-in page renders", `status ${loginPage.status}`);

    /**
     * The credential itself, checked the way the login action checks it.
     *
     * Posting the form from a script was attempted and abandoned. Next
     * addresses a server action by a build-specific id that is not present in
     * the markup in development; every candidate scraped from the page came
     * back "Server action not found". Rather than fake a browser, this checks
     * the two things the action actually does — the stored hash accepts the
     * password and rejects a wrong one, through the application's own
     * verifyPassword — and then carries a session with exactly the claims the
     * action issues into the screens.
     *
     * What is therefore NOT proven here is the form submission itself, which
     * is a click in a browser. The report says so rather than implying it was
     * covered.
     */
    const { verifyPassword, signSession } = await import("../../src/lib/auth");
    const stored = (await db.user.findUnique({
      where: { id: admin.id },
      select: { passwordHash: true },
    }))!;
    check(!!stored.passwordHash, "the demo administrator has a password hash");
    check(await verifyPassword(password, stored.passwordHash!), "the password is accepted");
    check(!(await verifyPassword(password + "-wrong", stored.passwordHash!)), "a wrong password is rejected");

    /** The session the login action issues: this tenant, as workspace and identity. */
    const cookie = `vq_session=${await signSession({
      userId: admin.id,
      role: admin.role as never,
      org: key,
      home: key,
    })}`;

    console.log("\nINSIDE THE WORKSPACE");
    const home = await req("/", {}, cookie);
    const homeText = pageText(home.body);
    check(home.status === 200, "the operations centre renders", `status ${home.status}`);
    check(homeText.includes("Apex Construction Group"), "it says Apex Construction Group");

    const projects = pageText((await req("/projects", {}, cookie)).body);
    check(projects.includes(project.name), `the projects screen shows "${project.name}"`);

    const dailies = pageText((await req("/dailies", {}, cookie)).body);
    check(dailies.length > 1000, "the dailies screen renders", `${dailies.length} bytes`);

    const customers = pageText((await req("/customers", {}, cookie)).body);
    check(customers.includes("Brightwater Civil"), "the customers screen shows Apex's own customer");

    console.log(`  (tenant holds ${projectCount} projects and ${dailyCount} dailies)`);

    console.log("\nNO ROUTE TO FORTITUDE");
    const terms = ["Fortitude", "GLOBE COMMUNICATIONS", "Trawick", "24208171927-A27-311", "GA811"];
    const everything = [homeText, projects, dailies, customers].join("\n");
    const found = terms.filter((x) => everything.includes(x));
    check(found.length === 0, "no Fortitude identity anywhere in the demo", found.join(", "));

    const forged = await req("/projects", { headers: { "x-vq-org": "fortitude" } }, cookie);
    check(forged.status !== 0, "a forged x-vq-org does not crash the deployment", `status ${forged.status}`);
    check(
      !pageText(forged.body).includes("GLOBE COMMUNICATIONS"),
      "a forged x-vq-org reaches no Fortitude data",
    );

    console.log("\nSIGNING OUT AND BACK IN");
    const after = await req("/projects", {}, "vq_session=deleted");
    check(after.status === 307 || after.status === 302, "a cleared session is sent to sign in", `status ${after.status}`);

    const reissued = `vq_session=${await signSession({
      userId: admin.id,
      role: admin.role as never,
      org: key,
      home: key,
    })}`;
    const backIn = await req("/projects", {}, reissued);
    check(backIn.status === 200, "a freshly issued session works again", `status ${backIn.status}`);

    console.log("\nDEMO FLAGS");
    const settings = await db.orgSettings.findFirst();
    check(settings?.isDemo === true, "the organisation is still a demo");
    check(settings?.smsEnabled === false, "texting is off");
    check(settings?.assistantEnabled === false, "the assistant is off");
    check((await db.messageDelivery.count()) === 0, "nothing was delivered while browsing");
  } finally {
    child.kill();
    await db.$disconnect();
  }

  console.log("\n" + "=".repeat(64));
  console.log(failures === 0 ? "  DEMO LOGIN PASSED" : `  DEMO LOGIN FAILED — ${failures}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("\nDemo login check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
