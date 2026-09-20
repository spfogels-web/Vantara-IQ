/**
 * Stands the whole thing up once: a disposable schema, the application schema
 * inside it, two tenants of invented data, and a real Next server pointed at
 * it.
 *
 * A real server rather than calling functions directly, because the boundaries
 * under test are not all in one layer. Middleware decides what a crew may
 * reach, the route decides what it hands over, and the query decides what comes
 * back — and the gaps between those three are exactly where a tenancy bug will
 * live. Only an HTTP request crosses all three.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  TEST_SCHEMA,
  TEST_SCHEMA_B,
  clearSchemaName,
  createTestSchema,
  dropTestSchema,
  testClient,
  publishSchemaName,
  testDatabaseUrl,
} from "./support/test-db";
import {
  PLATFORM_ADMIN_EMAIL,
  seedDemoOrgSettings,
  seedIncumbentConfig,
  seedOtherConfig,
  seedOtherDatabase,
  seedTwoTenants,
  seedWorkingOrgSettings,
} from "./support/fixtures";

const PORT = 3111;
export const BASE_URL = `http://localhost:${PORT}`;
const FIXTURE_FILE = join(process.cwd(), "tests", ".fixtures.json");

const OTHER_FIXTURE_FILE = join(process.cwd(), "tests", ".fixtures-other.json");

let server: ChildProcess | null = null;

async function waitForServer(url: string, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url + "/login", { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The test server did not come up within ${timeoutMs}ms.`);
}

function stopServer() {
  if (!server?.pid) return;
  if (process.platform === "win32") {
    // next dev spawns children; killing the parent alone leaves the port held.
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  }
  server = null;
}

export async function setup() {
  const url = testDatabaseUrl();

  // Publish the name before anything else reads it, so every test file
  // resolves the same schema rather than inventing its own.
  publishSchemaName();
  console.log(`\n  test schema: ${TEST_SCHEMA}`);
  console.log("  building the application schema inside it…");
  await createTestSchema();

  console.log("  seeding two tenants…");
  const db = testClient();
  try {
    const fixtures = await seedTwoTenants(db);
    await seedWorkingOrgSettings(db);
    await seedIncumbentConfig(db);
    writeFileSync(FIXTURE_FILE, JSON.stringify(fixtures, null, 2));
  } finally {
    await db.$disconnect();
  }

  // The second organisation's database — a whole contractor of its own, so the
  // switch round-trip can prove that every screen changed and changed back.
  console.log(`  second organisation's schema: ${TEST_SCHEMA_B}`);
  await createTestSchema(TEST_SCHEMA_B);
  const other = testClient(TEST_SCHEMA_B);
  try {
    const tenant = await seedOtherDatabase(other);
    await seedDemoOrgSettings(other);
    await seedOtherConfig(other);
    writeFileSync(OTHER_FIXTURE_FILE, JSON.stringify(tenant, null, 2));
  } finally {
    await other.$disconnect();
  }

  console.log(`  starting the server on ${PORT}…`);
  server = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "dev", "--turbopack", "--port", String(PORT)],
    {
      env: {
        ...process.env,
        DATABASE_URL: url,
        DATABASE_URL_UNPOOLED: url,
        // The second organisation, under the id the registry knows it by. The
        // server must be able to reach both or the switcher has nowhere to go.
        //
        // Both variables, because reaching it is no longer enough to register
        // it. A connection string being present is not a statement that the
        // tenant should be live — Fortitude's production project carries one
        // without anybody having asked for it — so a deployment that wants the
        // second organisation has to say so. This harness genuinely does.
        APEX_DATABASE_URL: testDatabaseUrl(TEST_SCHEMA_B),
        VANTARA_ENABLE_APEX: "true",
        // Who may switch. Named explicitly so the test exercises the allowlist
        // rather than a deployment that happens to let everyone through — and
        // so the "not on the list" case has something real to be refused by.
        PLATFORM_ADMIN_EMAILS: PLATFORM_ADMIN_EMAIL,
        NODE_ENV: "development",
      },
      stdio: "ignore",
      detached: process.platform !== "win32",
    },
  );
  await waitForServer(BASE_URL);
  console.log("  ready.\n");
}

export async function teardown() {
  stopServer();
  try {
    rmSync(FIXTURE_FILE, { force: true });
    rmSync(OTHER_FIXTURE_FILE, { force: true });
  } catch {
    /* nothing to clean */
  }
  await dropTestSchema();
  await dropTestSchema(TEST_SCHEMA_B);
  clearSchemaName();
  console.log(`\n  dropped ${TEST_SCHEMA} and ${TEST_SCHEMA_B}.`);
}
