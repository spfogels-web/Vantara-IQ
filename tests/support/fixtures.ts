/**
 * Two contractors who both run on Vantara IQ, and must never see each other.
 *
 * Every name, number, street and figure here is invented. The point of the
 * fixture is that each tenant holds exactly the things the business has said
 * must stay private — a customer rate card, a crew's pay rate, an invoice, a
 * pay statement — so a test can ask for one across the boundary and get a
 * specific, meaningful answer rather than "some row".
 *
 * Two subcontractors per tenant, because there are two boundaries to prove,
 * not one: tenant against tenant, and crew against crew inside a tenant. The
 * second already works today and is the thing most likely to be broken by
 * accident during the migration.
 */
import type { PrismaClient } from "@prisma/client";

export type Crew = {
  subcontractorId: string;
  userId: string;
  company: string;
  subInvoiceId: string;
  subInvoiceNumber: string;
  documentId: string;
  rate: number;
};

export type Tenant = {
  key: "northgate" | "barrow" | "halloway";
  orgId: string;
  orgName: string;
  staffUserId: string;
  customerId: string;
  customerName: string;
  projectId: string;
  projectName: string;
  invoiceId: string;
  invoiceNumber: string;
  dailyId: string;
  dailySheetId: string;
  taskId: string;
  locateTicketId: string;
  customerRate: number;
  crewNumber: string;
  customer2Name: string;
  project2Id: string;
  project2Name: string;
  crews: [Crew, Crew];
};

export type Fixtures = { a: Tenant; b: Tenant };

type Spec = {
  key: Tenant["key"];
  /** The one-call centre this contractor files with, and its state. */
  centre: { provider: string; state: string };
  org: string;
  staffEmail: string;
  customer: string;
  shortCode: string;
  project: string;
  invoiceNumber: string;
  /** What this contractor bills its customer for one unit code. */
  customerRate: number;
  /** What this customer knows the contractor by on their paperwork. */
  crewNumber: string;
  /**
   * A second prime, deliberately with no crew number on file.
   *
   * One customer's identifier must never stand in for another's, and the
   * only way to show that is a customer that has none: if the sheet for this
   * job shows the first customer's number, the fallback is back.
   */
  customer2: string;
  shortCode2: string;
  project2: string;
  crews: { company: string; email: string; rate: number; subInvoice: string }[];
};

const SPECS: Spec[] = [
  {
    key: "northgate",
    centre: { provider: "GA811", state: "GA" },
    org: "Northgate Utility Group",
    staffEmail: "office@northgate-utility.test",
    customer: "Calder Broadband",
    shortCode: "CLD",
    project: "Whitfield Loop",
    invoiceNumber: "NG-1001",
    customerRate: 8.5,
    crewNumber: "NG-4471-A12-908",
    customer2: "Halvern Networks",
    shortCode2: "HLV",
    project2: "Ardley Cut",
    crews: [
      { company: "Pellham Boring", email: "lead@pellham.test", rate: 6.0, subInvoice: "NG-S-4001" },
      { company: "Orsett Underground", email: "lead@orsett.test", rate: 5.75, subInvoice: "NG-S-4002" },
    ],
  },
  {
    key: "barrow",
    centre: { provider: "GA811", state: "GA" },
    org: "Barrow Line Services",
    staffEmail: "office@barrow-line.test",
    customer: "Merrick Fiber",
    shortCode: "MRK",
    project: "Denholm Extension",
    invoiceNumber: "BL-2001",
    customerRate: 9.25,
    crewNumber: "APX-8820-C04-115",
    customer2: "Sowerby Telecom",
    shortCode2: "SWB",
    project2: "Kestrel Spur",
    crews: [
      { company: "Vance Trenching", email: "lead@vance.test", rate: 6.4, subInvoice: "BL-S-5001" },
      { company: "Kittle Directional", email: "lead@kittle.test", rate: 6.15, subInvoice: "BL-S-5002" },
    ],
  },
];

async function buildTenant(db: PrismaClient, s: Spec): Promise<Tenant> {
  const org = await db.organization.create({ data: { name: s.org, plan: "Enterprise" } });

  const staff = await db.user.create({
    data: { email: s.staffEmail, name: `${s.org} office`, role: "ADMIN", organizationId: org.id },
  });

  const customer = await db.customer.create({
    data: {
      name: s.customer,
      shortCode: s.shortCode,
      industry: "Telecom",
      tone: "info",
      status: "Active",
      logoTint: "#3b6ea5",
      location: "Invented County",
      // What this prime knows the contractor by.
      crewNumber: s.crewNumber,
    },
  });

  /**
   * A second prime with no crew number on file.
   *
   * Its job exists so a sheet can be rendered for a customer that has none.
   * A blank field there is correct; the other customer's number appearing is
   * the cross-customer fallback this whole step exists to remove.
   */
  const customer2 = await db.customer.create({
    data: {
      name: s.customer2,
      shortCode: s.shortCode2,
      industry: "Telecom",
      tone: "info",
      status: "Active",
      logoTint: "#7a5ea5",
      location: "Invented County",
    },
  });

  const project2 = await db.project.create({
    data: {
      name: s.project2,
      client: s.customer2,
      location: "Invented County",
      status: "Active",
      tone: "info",
      customerId: customer2.id,
      crew: s.crews[0].company,
    },
  });

  // The customer rate card: what this contractor bills. Never a crew's business.
  await db.customerRate.create({
    data: { customerId: customer.id, code: "BFOV12", description: "Plow 12ct", unit: "ft", rate: s.customerRate },
  });

  const crews: Crew[] = [];
  for (const c of s.crews) {
    const sub = await db.subcontractor.create({
      data: { company: c.company, lead: c.company, email: c.email, state: "ACTIVE" },
    });
    // What this crew is paid. Never another crew's business, and never the
    // other contractor's.
    await db.subcontractorRate.create({
      data: { subcontractorId: sub.id, code: "BFOV12", description: "Plow 12ct", unit: "ft", rate: c.rate },
    });
    const user = await db.user.create({
      data: {
        email: c.email,
        name: `${c.company} lead`,
        role: "SUBCONTRACTOR",
        subcontractorId: sub.id,
      },
    });
    const statement = await db.subInvoice.create({
      data: { number: c.subInvoice, subcontractorId: sub.id, status: "ISSUED" },
    });
    const doc = await db.subDocument.create({
      data: {
        subcontractorId: sub.id,
        section: "w9",
        fileName: "w9.pdf",
        dataUrl: "data:application/pdf;base64,JVBERi0xLjQK",
      },
    });
    crews.push({
      subcontractorId: sub.id,
      userId: user.id,
      company: c.company,
      subInvoiceId: statement.id,
      subInvoiceNumber: c.subInvoice,
      documentId: doc.id,
      rate: c.rate,
    });
  }

  // Only the first crew is assigned to the job. The second is the control for
  // the crew-against-crew boundary inside one tenant.
  //
  // The map is a real (tiny) data URL rather than left empty. An empty one
  // makes /api/project-map answer "no map on this project" — a 404 that a
  // naive test reads as a refusal, so the test passes while the boundary is
  // wide open. Every resource a cross-tenant test asks for has to exist, or
  // the suite reassures instead of checking.
  const project = await db.project.create({
    data: {
      name: s.project,
      client: s.customer,
      location: "Invented County",
      status: "Active",
      tone: "info",
      customerId: customer.id,
      crew: s.crews[0].company,
      mapUrl: `data:text/plain;base64,${Buffer.from(`${s.project} print`).toString("base64")}`,
      // `create`, not `connect`: the join is an explicit row now, and
      // `connect: [{ id }]` would still compile while looking those ids up as
      // assignment ids and quietly assigning nobody.
      crews: { create: [{ subcontractorId: crews[0].subcontractorId }] },
    },
  });

  // The job's own priced codes. Without these the project rate-sheet route
  // answers 400 "no rates", which a cross-tenant test would read as a refusal.
  await db.projectRate.createMany({
    data: [
      { projectId: project.id, code: "BFOV12", description: "Plow 12ct", unit: "ft", rate: s.customerRate },
      { projectId: project.id, code: "BHF3048", description: "Handhole 30x48", unit: "ea", rate: 396 },
    ],
  });

  const invoice = await db.invoice.create({
    data: { number: s.invoiceNumber, customerId: customer.id, projectId: project.id, status: "SENT" },
  });

  const daily = await db.daily.create({
    data: {
      sheetNumber: `${s.shortCode}-0001`,
      projectId: project.id,
      projectName: s.project,
      customer: s.customer,
      subcontractor: s.crews[0].company,
      crew: s.crews[0].company,
      workDate: "2026-09-01",
      status: "Approved",
      totalFt: 1450,
    },
  });

  // The billing sheet is its own model, and /api/daily-sheet takes its id —
  // not the Daily's. Passing the wrong id gets a 404 that looks like a refusal.
  const sheet = await db.dailySheet.create({
    data: {
      projectId: project.id,
      projectName: s.project,
      filedForId: crews[0].subcontractorId,
      workDate: "2026-09-01",
      status: "Approved",
    },
  });

  const task = await db.task.create({
    data: {
      title: `${s.project}: pedestal not set`,
      projectId: project.id,
      assigneeSubId: crews[0].subcontractorId,
    },
  });

  const ticket = await db.locateTicket.create({
    data: {
      number: `${s.shortCode}-811-0001`,
      projectId: project.id,
      crewId: crews[0].subcontractorId,
      // Each contractor files with its own centre. Left to a default, every
      // ticket in the suite would carry Georgia and the leak test would be
      // asserting against data it had itself planted.
      provider: s.centre.provider,
      state: s.centre.state,
    },
  });

  return {
    key: s.key,
    orgId: org.id,
    orgName: s.org,
    staffUserId: staff.id,
    customerId: customer.id,
    customerName: s.customer,
    projectId: project.id,
    projectName: s.project,
    invoiceId: invoice.id,
    invoiceNumber: s.invoiceNumber,
    dailyId: daily.id,
    dailySheetId: sheet.id,
    taskId: task.id,
    locateTicketId: ticket.id,
    customerRate: s.customerRate,
    crewNumber: s.crewNumber,
    customer2Name: s.customer2,
    project2Id: project2.id,
    project2Name: s.project2,
    crews: [crews[0], crews[1]],
  };
}

export async function seedTwoTenants(db: PrismaClient): Promise<Fixtures> {
  const a = await buildTenant(db, SPECS[0]);
  const b = await buildTenant(db, SPECS[1]);
  return { a, b };
}

/**
 * The contractor who lives in the *other* database.
 *
 * Every name, code and number is different from the two above, because the
 * switch round-trip proves itself by what changes on screen. If the second
 * database held the same names, a switcher that did nothing at all would pass.
 */
const OTHER_SPEC: Spec = {
  key: "halloway",
  centre: { provider: "Sunshine811", state: "FL" },
  org: "Halloway Civil Partners",
  staffEmail: "office@halloway-civil.test",
  customer: "Stroud Telecom",
  shortCode: "STR",
  project: "Kedleston Ring",
  invoiceNumber: "HC-7001",
  customerRate: 11.75,
  crewNumber: "HC-2290-D71-604",
  customer2: "Brindle Fibre",
  shortCode2: "BRN",
  project2: "Ledwich Tie-in",
  crews: [
    { company: "Marden Bore", email: "lead@marden.test", rate: 7.2, subInvoice: "HC-S-9001" },
    { company: "Teale Directional", email: "lead@teale.test", rate: 6.95, subInvoice: "HC-S-9002" },
  ],
};

/** Seeds the second organisation's database. One tenant, wholly its own. */
export async function seedOtherDatabase(db: PrismaClient): Promise<Tenant> {
  return buildTenant(db, OTHER_SPEC);
}

/**
 * Read off the specs rather than retyped, so a test asserting on a name cannot
 * drift from the name actually seeded and start passing for no reason.
 */
export const OTHER_ORG_NAME = OTHER_SPEC.org;

/** The one account the test deployment treats as a platform operator. */
export const PLATFORM_ADMIN_EMAIL = SPECS[0].staffEmail;

/** A staff account that is deliberately *not* on the allowlist. */
export const NON_ADMIN_EMAIL = SPECS[1].staffEmail;

/**
 * Settings for the ordinary organisation: texting on, assistant on.
 *
 * Deliberately permissive, so that a test showing the demonstration
 * organisation refusing to send proves the demonstration flag did it, and not
 * that the feature was off everywhere.
 */
export async function seedWorkingOrgSettings(db: PrismaClient): Promise<void> {
  await db.orgSettings.create({
    data: {
      legalName: SPECS[0].org,
      shortName: "Northgate",
      isDemo: false,
      smsEnabled: true,
      assistantEnabled: true,
      customerTerms: "Net 30",
      subTerms: "Net 21",
      retainagePct: 0.1,
      locateProvider: "GA811",
      defaultState: "GA",
      supportPhone: "(864) 365-1521",
    },
  });
}

/**
 * Settings for the demonstration organisation.
 *
 * Note what is switched **on** here. Texting and the assistant are both
 * enabled, which is the strongest available statement of the rule: the demo
 * flag is not one vote among several, it overrides. A test that set them off
 * would prove only that off things stay off.
 */
export async function seedDemoOrgSettings(db: PrismaClient): Promise<void> {
  await db.orgSettings.create({
    data: {
      legalName: OTHER_SPEC.org,
      shortName: "Halloway",
      isDemo: true,
      smsEnabled: true,
      assistantEnabled: true,
      customerTerms: "Net 45",
      subTerms: "Net 30",
      retainagePct: 0.05,
      locateProvider: "Sunshine811",
      defaultState: "FL",
      supportPhone: "(850) 555-0143",
    },
  });
}

/**
 * The incumbent's real configuration, as it was when it lived in TypeScript.
 *
 * Seeded verbatim so the suite proves backward compatibility: the organisation
 * that had these markets and codes still behaves exactly as it did, and the
 * leak test has something true to find under it.
 */
export async function seedIncumbentConfig(db: PrismaClient): Promise<void> {
  await db.market.createMany({
    data: [
      {
        id: "north-ga",
        label: "North Georgia",
        prime: "Globe Communications",
        hint: "Globe",
        state: "GA",
        towns: ["toccoa", "eastanollee", "colbert", "hartwell", "royston"],
        customers: ["globe communications", "globe"],
        sortOrder: 0,
      },
      {
        id: "south-ga",
        label: "South Georgia",
        prime: "Trawick Construction",
        hint: "Trawick",
        state: "GA",
        towns: ["milledgeville", "dublin", "macon"],
        customers: ["trawick construction", "trawick"],
        sortOrder: 1,
      },
    ],
  });

  await db.orgCodeProfile.create({
    data: {
      priorityCodes: ["BFO12","BFO24","BFO48","BFO144","BMFAF","BFOV","BM5F1","BD5MPF","BD4MPF","BM60","BM61","BM2","BM26","BM53","BHF","BDO"],
      families: {"BFO-MAIN":["BFO12","BFO24","BFO48","BFO96","BFO144"],"BFOV-12.7-12IN":["BFOV(12.7)(1W)12IN DEPTH","BFOV(12.7)(2W)12IN DEPTH"]},
    },
  });
}

/**
 * The other organisation's configuration — different everything.
 *
 * Aerial and splicing work in Florida through a different prime, because the
 * point of the leak test is that two contractors share no vocabulary. If any
 * of these matched, a leak would look like a pass.
 */
export async function seedOtherConfig(db: PrismaClient): Promise<void> {
  await db.market.create({
    data: {
      id: "gulf-coast",
      label: "Gulf Coast",
      prime: "Stroud Telecom",
      hint: "Stroud",
      state: "FL",
      towns: ["pensacola", "navarre", "milton"],
      customers: ["stroud telecom", "stroud"],
      sortOrder: 0,
    },
  });

  await db.orgCodeProfile.create({
    data: {
      priorityCodes: ["AFO24", "AFO48", "SPL12", "STRM8"],
      families: { "AFO-MAIN": ["AFO24", "AFO48"] },
    },
  });
}
