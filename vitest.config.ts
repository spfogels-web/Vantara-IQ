import { readFileSync } from "node:fs";

import { defineConfig } from "vitest/config";

/**
 * The suite needs DATABASE_URL and AUTH_SECRET, and Vitest does not read .env
 * files on its own. Loaded here rather than requiring every contributor to
 * remember an --env-file flag; values already in the environment win, so CI can
 * override without editing anything.
 */
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch {
    /* the file is optional */
  }
}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // One tenant's data is seeded once and shared, so the suites must not race
    // each other against the same rows.
    fileParallelism: false,
    // Standing up a schema and a dev server is slow; the assertions are not.
    hookTimeout: 240_000,
    testTimeout: 60_000,
    reporters: ["verbose"],
  },
});
