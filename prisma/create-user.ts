/**
 * Creates or updates a staff login.
 *
 * Passwords are read from the environment and never written to disk, printed,
 * or committed — the hash is all that reaches the database.
 *
 *   VQ_EMAIL=jon.hunter@fortitude-infra.com \
 *   VQ_NAME="Jon Hunter" \
 *   VQ_ROLE=ADMIN \
 *   VQ_PASSWORD='...' \
 *   npx tsx prisma/create-user.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ORG_NAME = process.env.VQ_ORG ?? "Fortitude Infrastructure";
const ORG_PLAN = process.env.VQ_PLAN ?? "Enterprise";

async function main() {
  const email = (process.env.VQ_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.VQ_NAME ?? "").trim();
  const role = (process.env.VQ_ROLE ?? "ADMIN").trim();
  const password = process.env.VQ_PASSWORD ?? "";

  if (!email || !name || !password) {
    console.error("Set VQ_EMAIL, VQ_NAME and VQ_PASSWORD.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const org =
    (await prisma.organization.findFirst({ where: { name: ORG_NAME } })) ??
    (await prisma.organization.create({ data: { name: ORG_NAME, plan: ORG_PLAN } }));

  // Keep the plan current in case it changed since the org was created.
  if (org.plan !== ORG_PLAN) {
    await prisma.organization.update({ where: { id: org.id }, data: { plan: ORG_PLAN } });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role: role as "ADMIN" | "PM" | "SUPERVISOR" | "OFFICE" | "SUBCONTRACTOR",
      organizationId: org.id,
    },
    update: {
      name,
      passwordHash,
      role: role as "ADMIN" | "PM" | "SUPERVISOR" | "OFFICE" | "SUBCONTRACTOR",
      organizationId: org.id,
    },
  });

  console.log(`${user.email}  ${user.name}  ${user.role}  org=${ORG_NAME} (${ORG_PLAN})`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
