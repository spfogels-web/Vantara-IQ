/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled.
 */
/**
 * Give a demonstration tenant's people a password they can actually sign in
 * with.
 *
 *   VQ_DEMO_PASSWORD=... npx tsx prisma/demo/set-demo-credentials.ts apex
 *
 * The seed writes user rows directly and never invites anybody, so Apex's
 * accounts have no password hash and nobody can log in. This adds one, through
 * the application's own `hashPassword` — the same bcrypt call the sign-up path
 * uses, at the same cost factor. There is no second authentication system here
 * and no demo bypass in the login action: the account ends up indistinguishable
 * from any other, which is the point. A bypass would be a permanent hole cut
 * for a temporary convenience.
 *
 * ## What it refuses to do
 *
 * The password comes from the environment and is never written down here. The
 * target is resolved through the guarded path, so it cannot be pointed at a
 * live tenant — and it additionally refuses any organisation that is not marked
 * `isDemo`, because setting a password on a real person's account from a script
 * is not something this should be capable of.
 *
 * Nothing is emailed, texted or invited. The row is updated in place.
 */
import { PrismaClient } from "@prisma/client";

import { identityOf, targetFor, urlFor } from "../provision/targets";

async function main() {
  const key = process.argv[2] ?? "apex";
  const only = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];

  const password = process.env.VQ_DEMO_PASSWORD;
  if (!password) {
    throw new Error(
      "VQ_DEMO_PASSWORD is not set. The password is supplied by the environment so it " +
        "is never committed; pass it for this command only.",
    );
  }
  if (password.length < 12) {
    throw new Error("VQ_DEMO_PASSWORD is shorter than twelve characters; pick a longer one.");
  }

  const t = targetFor(key);
  const url = urlFor(t, "pooled");
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    console.log(`\nDemo credentials — ${t.label}`);
    console.log(`  target ${identityOf(url).host}`);

    /**
     * Only a demonstration organisation. The guard above already refuses a
     * protected endpoint; this refuses a real tenant that happens to live
     * somewhere else, because "it was not on the deny list" is not the same as
     * "it is a demo".
     */
    const settings = await db.orgSettings.findFirst();
    if (!settings?.isDemo) {
      throw new Error(
        `${t.label} is not marked isDemo. Refusing to set a password on a real organisation's accounts.`,
      );
    }
    console.log(`  organisation: ${settings.legalName} (isDemo=${settings.isDemo})`);

    // The application's own hashing, imported rather than reimplemented — a
    // second implementation here could drift from the one that verifies.
    const { hashPassword } = await import("../../src/lib/auth");
    const hash = await hashPassword(password);

    const users = await db.user.findMany({
      where: only ? { email: only } : {},
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
      orderBy: { role: "asc" },
    });
    if (!users.length) throw new Error(only ? `no user with email ${only}` : "no users in this tenant");

    for (const u of users) {
      await db.user.update({ where: { id: u.id }, data: { passwordHash: hash } });
      console.log(`  set  ${u.role.padEnd(14)} ${u.name.padEnd(20)} ${u.email}`);
    }

    console.log(`\n  ${users.length} account(s) can now sign in. The password was not written to disk.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nCould not set demo credentials:", e instanceof Error ? e.message : e);
  process.exit(1);
});
