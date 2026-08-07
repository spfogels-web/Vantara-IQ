/**
 * Set a login's password from the environment.
 *
 * Run: LOGIN_EMAIL=x@y.com LOGIN_PASSWORD=... npx tsx prisma/set-password.ts
 *
 * Taken from the environment rather than an argument so the password does not
 * land in shell history, and never written into this file so it cannot be
 * committed by accident.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = (process.env.LOGIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.LOGIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    console.error("Set LOGIN_EMAIL and a LOGIN_PASSWORD of at least 8 characters.");
    process.exit(1);
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, role: true, subcontractor: { select: { company: true } } },
  });
  if (!user) {
    console.error(`No login for ${email}.`);
    process.exit(1);
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });

  console.log(`Password set for ${email}`);
  console.log(`  ${user.name} · ${user.role}${user.subcontractor ? ` · ${user.subcontractor.company}` : ""}`);
}
main().finally(() => db.$disconnect());
