/**
 * Creates a subcontractor crew and a login attached to it, so the crew-facing
 * portal can be looked at the way a sub actually sees it.
 *
 * A subcontractor login is not just a role — it has to point at a Subcontractor
 * record, because that record's project assignments are what decide everything
 * the account can see. A SUBCONTRACTOR user with no crew attached sees nothing
 * at all, which looks like a bug rather than a permission.
 *
 * Passwords are read from the environment and never written to disk, printed,
 * or committed — only the bcrypt hash reaches the database.
 *
 *   VQ_EMAIL=crew@example.com \
 *   VQ_NAME="Marcus Webb" \
 *   VQ_COMPANY="Summit Underground" \
 *   VQ_PROJECT="CHARLES HART PROJECT" \
 *   VQ_PASSWORD='...' \
 *   npx tsx prisma/create-sub-login.ts
 *
 * VQ_PROJECT is optional and matched on name; leave it off to create the crew
 * unassigned and assign jobs in the UI instead.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const email = (process.env.VQ_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.VQ_NAME ?? "").trim();
  const company = (process.env.VQ_COMPANY ?? "").trim();
  const projectName = (process.env.VQ_PROJECT ?? "").trim();
  const password = process.env.VQ_PASSWORD ?? "";

  if (!email || !name || !company || !password) {
    console.error("Set VQ_EMAIL, VQ_NAME, VQ_COMPANY and VQ_PASSWORD.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const compliance = [
    { label: "General liability COI", status: "valid", expires: "Nov 30", daysOut: 119 },
    { label: "Workers' comp", status: "valid", expires: "Nov 30", daysOut: 119 },
    { label: "W-9", status: "valid", expires: "—", daysOut: null },
    { label: "Master subcontract", status: "valid", expires: "—", daysOut: null },
  ];

  const sub =
    (await prisma.subcontractor.findFirst({ where: { company } })) ??
    (await prisma.subcontractor.create({
      data: {
        company,
        lead: name,
        email,
        state: "ACTIVE",
        tone: "success",
        complianceTone: "success",
        compliance,
        since: String(new Date().getFullYear()),
      },
    }));

  // Assignment is a real relation now, so resolve the name to a project id.
  if (projectName) {
    const projects = await prisma.project.findMany({ select: { id: true, name: true } });
    const match = projects.find((p) => norm(p.name) === norm(projectName));
    if (!match) {
      console.error(
        `No project named "${projectName}". Available: ${projects.map((p) => p.name).join(", ")}`,
      );
      process.exit(1);
    }
    await prisma.subcontractor.update({
      where: { id: sub.id },
      data: { projects: { connect: { id: match.id } } },
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role: "SUBCONTRACTOR", subcontractorId: sub.id },
    update: { name, passwordHash, role: "SUBCONTRACTOR", subcontractorId: sub.id },
  });

  const assigned = await prisma.subcontractor.findUnique({
    where: { id: sub.id },
    select: { projects: { select: { name: true } } },
  });

  console.log(
    `${user.email}  ${user.name}  SUBCONTRACTOR  crew=${company}  ` +
      `assigned=[${assigned?.projects.map((p) => p.name).join(", ") || "none"}]`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
