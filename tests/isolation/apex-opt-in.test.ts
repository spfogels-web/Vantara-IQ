/**
 * A demonstration tenant goes live because somebody said so, not because a
 * connection string was in scope.
 *
 * This exists because of a real near miss. Fortitude's production Vercel
 * project was found carrying `APEX_DATABASE_URL` scoped to Production — put
 * there by a database integration, not by anyone deciding Apex should be live
 * inside a working business. Under the old rule that was enough: the registry
 * read "a URL is present" as "this tenant exists here". Apex would have
 * appeared in the workspace switcher on the live site, and the locates cron —
 * which iterates `knownOrgs()` with no admin gate at all — would have begun
 * sweeping the demo tenant's database on every invocation, unattended.
 *
 * So the tests below are mostly about refusing. The case that matters is not
 * "does the flag work" but "does everything that is not the flag fail closed".
 */
import { describe, expect, it } from "vitest";

import { apexEnabled, readRegistry } from "../../src/lib/org-registry";

const FORT = "postgresql://user:pw@ep-fortitude.example.neon.tech/neondb";
const APEX = "postgresql://user:pw@ep-apex.example.neon.tech/neondb";

/** Only the variables under test; nothing inherited from the real environment. */
type EnvLike = Partial<Record<string, string | undefined>>;
const env = (over: EnvLike): EnvLike => ({ DATABASE_URL: FORT, ...over });

const ids = (e: EnvLike) => [...readRegistry(e).keys()].sort();

describe("the demo tenant stays unregistered unless it is switched on", () => {
  it("refuses it when the flag is absent, however reachable the database is", () => {
    // The production near miss, exactly: the URL is there, nobody asked for it.
    expect(ids(env({ APEX_DATABASE_URL: APEX }))).toEqual(["fortitude"]);
  });

  it("refuses it when the flag says false", () => {
    expect(ids(env({ APEX_DATABASE_URL: APEX, VANTARA_ENABLE_APEX: "false" }))).toEqual([
      "fortitude",
    ]);
  });

  it("refuses it for anything that is not the word true", () => {
    // A flag somebody meant to set, and set wrongly, must not half-work.
    for (const v of ["1", "yes", "TRUE!", "true false", "", " ", "on", "enabled", "0"]) {
      expect(ids(env({ APEX_DATABASE_URL: APEX, VANTARA_ENABLE_APEX: v })), `value ${JSON.stringify(v)}`).toEqual([
        "fortitude",
      ]);
    }
  });

  it("refuses it when the flag is set but there is no database to reach", () => {
    // Switched on and not configured is a mistake, not an instruction.
    expect(ids(env({ VANTARA_ENABLE_APEX: "true" }))).toEqual(["fortitude"]);
  });
});

describe("it registers when somebody has actually asked for it", () => {
  it("registers with both the flag and the database", () => {
    expect(ids(env({ APEX_DATABASE_URL: APEX, VANTARA_ENABLE_APEX: "true" }))).toEqual([
      "apex",
      "fortitude",
    ]);
  });

  it("tolerates the casing and padding a real environment variable arrives with", () => {
    for (const v of ["TRUE", " true ", "True"]) {
      expect(ids(env({ APEX_DATABASE_URL: APEX, VANTARA_ENABLE_APEX: v })), `value ${JSON.stringify(v)}`).toEqual([
        "apex",
        "fortitude",
      ]);
    }
  });

  it("carries the unpooled url through when it is given one", () => {
    const r = readRegistry(
      env({
        APEX_DATABASE_URL: APEX,
        APEX_DATABASE_URL_UNPOOLED: APEX,
        VANTARA_ENABLE_APEX: "true",
      }),
    );
    expect(r.get("apex")?.directUrl).toBe(APEX);
  });
});

describe("what every caller of the registry sees", () => {
  it("leaves Fortitude exactly as it was", () => {
    // The incumbent must not notice any of this.
    const r = readRegistry(env({ APEX_DATABASE_URL: APEX }));
    const fort = r.get("fortitude");
    expect(fort?.url).toBe(FORT);
    expect(fort?.label).toBe("Fortitude Infrastructure");
    expect(r.size).toBe(1);
  });

  it("keeps the demo tenant out of the list the locates cron iterates", () => {
    // /api/cron/locates loops knownOrgs() and has no admin gate, so this list
    // is the whole of what protects a demo tenant from an unattended sweep.
    const registry = readRegistry(env({ APEX_DATABASE_URL: APEX }));
    expect([...registry.values()].some((o) => o.id === "apex")).toBe(false);
  });

  it("agrees with the flag it is derived from", () => {
    expect(apexEnabled(env({ VANTARA_ENABLE_APEX: "true" }))).toBe(true);
    expect(apexEnabled(env({ VANTARA_ENABLE_APEX: "false" }))).toBe(false);
    expect(apexEnabled(env({}))).toBe(false);
  });
});
