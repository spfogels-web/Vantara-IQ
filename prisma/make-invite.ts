/**
 * Mint a real invite link from the command line.
 *
 * Run: npx tsx prisma/make-invite.ts "<project name fragment>"
 *
 * The same record the invite dialog creates — a stored token naming one job,
 * which is what the onboarding flow checks against.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

async function main() {
  const fragment = process.argv[2] ?? "";
  const project = await db.project.findFirst({
    where: fragment ? { name: { contains: fragment, mode: "insensitive" } } : {},
    select: { id: true, name: true, client: true },
  });
  if (!project) {
    console.error(`No project matching "${fragment}".`);
    process.exit(1);
  }

  const token = randomBytes(32).toString("base64url");
  await db.invite.create({
    data: {
      token,
      projectId: project.id,
      projectName: project.name,
      customer: project.client,
    },
  });

  console.log(`project: ${project.name.trim()} (${project.client})`);
  console.log(`\n/invite/${token}\n`);
}
main().finally(() => db.$disconnect());
