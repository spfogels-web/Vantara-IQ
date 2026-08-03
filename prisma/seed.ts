/**
 * Seeds the database from the existing mock fixtures so the app looks identical
 * once the query seam reads from Postgres. Idempotent: clears and reloads.
 *
 * Run: npm run db:seed
 */
import { PrismaClient, SubState } from "@prisma/client";

import {
  organization,
  customers,
  projects,
  subcontractors,
  dailies,
} from "../src/data/mock";

const prisma = new PrismaClient();

const STATE: Record<string, SubState> = {
  Active: SubState.ACTIVE,
  Onboarding: SubState.ONBOARDING,
  Invited: SubState.INVITED,
  Inactive: SubState.INACTIVE,
  "Pending review": SubState.PENDING_REVIEW,
};

async function main() {
  // Clear (child rows first).
  await prisma.daily.deleteMany();
  await prisma.project.deleteMany();
  await prisma.subcontractor.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // Organization + admin user.
  const org = await prisma.organization.create({
    data: { name: organization.name, plan: organization.plan },
  });
  await prisma.user.create({
    data: {
      email: organization.user.email,
      name: organization.user.name,
      role: "ADMIN",
      organizationId: org.id,
    },
  });

  // Customers, keyed by name so projects can link.
  const customerIdByName = new Map<string, string>();
  for (const c of customers) {
    const row = await prisma.customer.create({
      data: {
        name: c.name,
        shortCode: c.shortCode,
        industry: c.industry,
        tone: c.tone,
        status: c.status,
        logoTint: c.logoTint,
        location: c.location,
        contacts: c.contacts,
        billingEmail: c.billingEmail,
        paymentTerms: c.paymentTerms,
        retainagePct: c.retainagePct,
        invoiceMinimum: c.invoiceMinimum,
        contractValue: c.contractValue,
        billedToDate: c.billedToDate,
        openAr: c.openAr,
        avgDaysToPay: c.avgDaysToPay,
        rateSheet: c.rateSheet,
        notes: c.notes,
        since: c.since,
      },
    });
    customerIdByName.set(c.name, row.id);
  }

  // Projects, keyed by name so dailies can link.
  const projectIdByName = new Map<string, string>();
  for (const p of projects) {
    const row = await prisma.project.create({
      data: {
        name: p.name,
        client: p.client,
        location: p.location,
        status: p.status,
        tone: p.tone,
        remainingFt: p.remainingFt,
        requiredFtPerDay: p.requiredFtPerDay,
        actualFtPerDay: p.actualFtPerDay,
        forecast: p.forecast,
        forecastTone: p.forecastTone,
        health: p.health,
        pctComplete: p.pctComplete,
        crew: p.crew,
        updatedAt: p.updatedAt,
        customerId: customerIdByName.get(p.client) ?? null,
      },
    });
    projectIdByName.set(p.name, row.id);
  }

  // Subcontractors.
  for (const s of subcontractors) {
    await prisma.subcontractor.create({
      data: {
        company: s.company,
        lead: s.lead,
        email: s.email,
        phone: s.phone,
        location: s.location,
        trades: s.trades,
        state: STATE[s.state] ?? SubState.PENDING_REVIEW,
        tone: s.tone,
        assignedProjects: s.assignedProjects,
        compliance: s.compliance,
        complianceTone: s.complianceTone,
        scorecard: s.scorecard,
        crewSize: s.crewSize,
        equipment: s.equipment,
        since: s.since,
      },
    });
  }

  // Dailies.
  for (const d of dailies) {
    await prisma.daily.create({
      data: {
        sheetNumber: d.sheetNumber,
        projectId: projectIdByName.get(d.project) ?? null,
        projectName: d.project,
        customer: d.customer,
        subcontractor: d.subcontractor,
        crew: d.crew,
        workDate: d.workDate,
        submittedAt: d.submittedAt,
        status: d.status,
        tone: d.tone,
        totalFt: d.totalFt,
        billableAmount: d.billableAmount,
        lineItems: d.lineItems,
        photos: d.photos,
        hasAsBuilt: d.hasAsBuilt,
        hasBoreLog: d.hasBoreLog,
        flags: d.flags,
      },
    });
  }

  console.log(
    `Seeded: 1 org, ${customers.length} customers, ${projects.length} projects, ${subcontractors.length} subcontractors, ${dailies.length} dailies.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
