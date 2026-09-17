import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Fixtures } from "./fixtures";

export const BASE_URL = "http://localhost:3111";

/** The two tenants the global setup seeded. */
export function fixtures(): Fixtures {
  return JSON.parse(readFileSync(join(process.cwd(), "tests", ".fixtures.json"), "utf8")) as Fixtures;
}
