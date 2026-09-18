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
import { seedTwoTenants } from "./support/fixtures";

const PORT = 3111;
export const BASE_URL = `http://localhost:${PORT}`;
const FIXTURE_FILE = join(process.cwd(), "tests", ".fixtures.json");

/** The only row in the second organisation's database. See `SECOND_ORG_NAME`. */
export { SECOND_ORG_NAME } from "./support/second-org";
import { SECOND_ORG_NAME } from "./support/second-org";

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
    writeFileSync(FIXTURE_FILE, JSON.stringify(fixtures, null, 2));
  } finally {
    await db.$disconnect();
  }

  // A second organisation's database, for the proxy's routing tests. Only an
  // organisation row is seeded: the assertion is which connection answered,
  // and one row nobody else can see says that unambiguously.
  console.log(`  second organisation's schema: ${TEST_SCHEMA_B}`);
  await createTestSchema(TEST_SCHEMA_B);
  const other = testClient(TEST_SCHEMA_B);
  try {
    await other.organization.create({ data: { name: SECOND_ORG_NAME } });
  } finally {
    await other.$disconnect();
  }

  console.log(`  starting the server on ${PORT}…`);
  server = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "dev", "--turbopack", "--port", String(PORT)],
    {
      env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, NODE_ENV: "development" },
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
  } catch {
    /* nothing to clean */
  }
  await dropTestSchema();
  await dropTestSchema(TEST_SCHEMA_B);
  clearSchemaName();
  console.log(`\n  dropped ${TEST_SCHEMA} and ${TEST_SCHEMA_B}.`);
}
