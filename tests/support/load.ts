import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Fixtures, Tenant } from "./fixtures";

export const BASE_URL = "http://localhost:3111";

/** The two tenants the global setup seeded. */
export function fixtures(): Fixtures {
  return JSON.parse(readFileSync(join(process.cwd(), "tests", ".fixtures.json"), "utf8")) as Fixtures;
}

/** The contractor seeded into the *other* organisation's database. */
export function otherTenant(): Tenant {
  return JSON.parse(
    readFileSync(join(process.cwd(), "tests", ".fixtures-other.json"), "utf8"),
  ) as Tenant;
}
