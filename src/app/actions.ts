"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import {
  extractDocument,
  isConfigured,
  type ExtractedRowData,
  type RateDocType,
} from "@/lib/extract";
import {
  parseDelimitedMaterialList,
  parseRateSheet,
  pdfTextLayer,
  pdfTextPages,
} from "@/lib/parse-material-list";
import { findJobProfile } from "@/lib/job-profiles";
import {
  assertOwnSubcontractor,
  assertProjectAccess,
  requireStaff,
  requireUser,
} from "@/lib/authz";

/**
 * Authorization note.
 *
 * Every action below that touches real data authorizes itself. Middleware gates
 * page URLs, but a Server Action is a POST to whatever route the browser is
 * already on — a subcontractor sitting on /projects, a page they may load,
 * could otherwise invoke any export in this file and read another crew's rate
 * card. The guard belongs next to the data access, not in front of the URL.
 *
 * The exceptions are the onboarding actions used by the public /invite flow
 * (submitOnboarding, createSubcontractorDraft, updateSubcontractorCapabilities,
 * uploadSubDocument). They run before an account exists, so they cannot require
 * a session — they are write-only into a PENDING_REVIEW record that cannot
 * receive work until Fortitude approves it.
 */

/**
 * Resolve a job name typed on an invite to a real project, for the one place
 * a name is still the only handle we have. Everything after onboarding assigns
 * by id. Matching ignores case and stray whitespace because these names are
 * typed by hand — one of the live projects is stored with a trailing space.
 */
async function connectProjectByName(projectName: string | undefined) {
  const wanted = projectName?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!wanted) return undefined;

  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  const match = projects.find(
    (p) => p.name.trim().toLowerCase().replace(/\s+/g, " ") === wanted,
  );
  return match ? { connect: { id: match.id } } : undefined;
}

/** Pilot feedback -> Feedback table. */
export async function submitFeedback(input: {
  category: string;
  message: string;
  page?: string;
}) {
  await requireUser();
  await prisma.feedback.create({
    data: { category: input.category, message: input.message, page: input.page },
  });
  return { ok: true as const };
}

/**
 * Subcontractor onboarding submission. Creates the account in PENDING_REVIEW —
 * it shows up in Fortitude's Subcontractors tab for review and cannot receive
 * work until approved (and compliance docs are on file).
 */
export async function submitOnboarding(input: {
  company: string;
  name: string;
  email: string;
  projectName?: string;
  trades: string[];
  crews?: string;
  fieldStaff?: string;
  equipment: string[];
}) {
  const compliance = [
    { label: "General liability COI", status: "missing", expires: "—", daysOut: null },
    { label: "Workers' comp", status: "missing", expires: "—", daysOut: null },
    { label: "W-9", status: "missing", expires: "—", daysOut: null },
    { label: "Master subcontract", status: "missing", expires: "—", daysOut: null },
  ];
  const scorecard = {
    rating: 0,
    projectsCompleted: 0,
    avgApprovalDays: 0,
    avgDailyFt: 0,
    docAccuracy: 0,
    safetyIncidents: 0,
    disputes: 0,
    avgProductionPct: 0,
  };

  const sub = await prisma.subcontractor.create({
    data: {
      company: input.company,
      lead: input.name,
      email: input.email,
      trades: input.trades,
      equipment: input.equipment,
      crewSize: Number(input.fieldStaff) || Number(input.crews) || 0,
      state: "PENDING_REVIEW",
      tone: "warning",
      complianceTone: "neutral",
      // The invite may name a job. Resolve it to a real project; if nothing
      // matches, the crew is created unassigned and staff assign it — better
      // than recording an assignment that points at nothing.
      projects: await connectProjectByName(input.projectName),
      compliance: compliance as unknown as Prisma.InputJsonValue,
      scorecard: scorecard as unknown as Prisma.InputJsonValue,
      since: "2026",
    },
  });

  revalidatePath("/subcontractors");
  return { ok: true as const, id: sub.id };
}

/** Fortitude approves a pending subcontractor -> becomes Active. */
export async function approveSubcontractor(id: string) {
  await requireStaff();
  await prisma.subcontractor.update({
    where: { id },
    data: { state: "ACTIVE", tone: "success" },
  });
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

/**
 * Creates the subcontractor record at the START of onboarding (account step) so
 * documents can be attached during the flow. Returns the id.
 */
/* ------------------------------------------------------------------ *
 * Subcontractors — add, edit, remove.
 * ------------------------------------------------------------------ */

export type SubcontractorInput = {
  company: string;
  lead: string;
  email: string;
  phone: string;
  location: string;
  /** Comma-separated in the form; stored as an array. */
  trades: string;
  equipment: string;
  crewSize: number;
  state: string;
  since: string;
};

/** "Trenching, Conduit , Restoration" -> ["Trenching","Conduit","Restoration"] */
const toList = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const SUB_STATES = new Set(["INVITED", "ONBOARDING", "PENDING_REVIEW", "ACTIVE", "INACTIVE"]);

function subcontractorData(input: SubcontractorInput) {
  const state = SUB_STATES.has(input.state) ? input.state : "PENDING_REVIEW";
  return {
    company: input.company.trim(),
    lead: input.lead.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    location: input.location.trim(),
    trades: toList(input.trades),
    equipment: toList(input.equipment),
    crewSize: Number.isFinite(input.crewSize) ? Math.max(0, Math.trunc(input.crewSize)) : 0,
    state: state as "INVITED" | "ONBOARDING" | "PENDING_REVIEW" | "ACTIVE" | "INACTIVE",
    tone: state === "ACTIVE" ? "success" : state === "INACTIVE" ? "neutral" : "warning",
    since: input.since.trim(),
  };
}

export async function createSubcontractor(input: SubcontractorInput) {
  await requireStaff();
  if (!input.company.trim()) return { ok: false as const, error: "Company name is required." };
  const sub = await prisma.subcontractor.create({ data: subcontractorData(input) });
  revalidatePath("/subcontractors");
  return { ok: true as const, id: sub.id };
}

export async function updateSubcontractor(id: string, input: SubcontractorInput) {
  await requireStaff();
  if (!input.company.trim()) return { ok: false as const, error: "Company name is required." };
  await prisma.subcontractor.update({ where: { id }, data: subcontractorData(input) });
  revalidatePath("/subcontractors");
  return { ok: true as const, id };
}

/**
 * Removing a sub takes its onboarding documents with it (cascade), so this
 * refuses while the sub is still assigned to a project — losing a compliance
 * record for a crew that is actively working is not something to do quietly.
 */
export async function deleteSubcontractor(id: string) {
  await requireStaff();
  const sub = await prisma.subcontractor.findUnique({
    where: { id },
    select: { company: true, projects: { select: { id: true } } },
  });
  if (!sub) return { ok: false as const, error: "Subcontractor not found." };
  if (sub.projects.length > 0) {
    return {
      ok: false as const,
      error: `${sub.company} is still assigned to ${sub.projects.length} project${
        sub.projects.length === 1 ? "" : "s"
      }. Unassign it first.`,
    };
  }
  await prisma.subcontractor.delete({ where: { id } });
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

/**
 * Save the company logo. Stored as a Blob URL on the organization so it
 * survives a refresh — the picker previewed it in local state before this,
 * which looked like it worked right up until you reloaded.
 */
export async function saveOrganizationLogo(url: string) {
  await requireStaff();
  if (!url) return { ok: false as const, error: "No image to save." };
  const org = await prisma.organization.findFirst();
  if (!org) return { ok: false as const, error: "No organization on this account." };
  await prisma.organization.update({ where: { id: org.id }, data: { logoUrl: url } });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/**
 * Assign / unassign jobs for a crew. Takes project ids and replaces the whole
 * set, so the caller sends the list it wants to end up with.
 *
 * This is the single control over what a subcontractor can see — the maps,
 * material lists and redlines all follow from it — so unknown ids are dropped
 * rather than trusted, and the result is reported back.
 */
export async function setSubcontractorProjects(id: string, projectIds: string[]) {
  await requireStaff();
  const wanted = [...new Set(projectIds.map((p) => p.trim()).filter(Boolean))];
  const real = await prisma.project.findMany({
    where: { id: { in: wanted } },
    select: { id: true },
  });

  await prisma.subcontractor.update({
    where: { id },
    data: { projects: { set: real.map((p) => ({ id: p.id })) } },
  });
  revalidatePath("/subcontractors");
  revalidatePath("/projects");
  return { ok: true as const, count: real.length };
}

/* ---- Subcontractor rate card — what we pay, per unit code ---------------- */

export type SubRateInput = {
  code: string;
  description: string;
  unit: string;
  rate: number;
  minimum?: number | null;
  rules?: string;
  effectiveDate?: string;
  expirationDate?: string;
};

export async function listSubRates(subcontractorId: string) {
  await assertOwnSubcontractor(subcontractorId);
  const rows = await prisma.subcontractorRate.findMany({
    where: { subcontractorId },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    unit: r.unit,
    rate: r.rate,
    minimum: r.minimum,
    rules: r.rules,
    effectiveDate: r.effectiveDate,
    expirationDate: r.expirationDate,
    source: r.source,
  }));
}

export async function addSubRate(subcontractorId: string, input: SubRateInput) {
  await requireStaff();
  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false as const, error: "Unit code is required." };
  if (!Number.isFinite(input.rate) || input.rate < 0) {
    return { ok: false as const, error: "Enter a rate." };
  }
  await prisma.subcontractorRate.create({
    data: {
      subcontractorId,
      code,
      description: input.description.trim(),
      unit: input.unit.trim(),
      rate: input.rate,
      minimum: input.minimum ?? null,
      rules: input.rules?.trim() ?? "",
      effectiveDate: input.effectiveDate?.trim() ?? "",
      expirationDate: input.expirationDate?.trim() ?? "",
      source: "manual",
    },
  });
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

export async function updateSubRate(id: string, patch: { rate?: number; description?: string }) {
  await requireStaff();
  await prisma.subcontractorRate.update({
    where: { id },
    data: {
      ...(patch.rate != null && Number.isFinite(patch.rate) ? { rate: patch.rate } : {}),
      ...(patch.description != null ? { description: patch.description.trim() } : {}),
    },
  });
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

export async function deleteSubRate(id: string) {
  await requireStaff();
  await prisma.subcontractorRate.delete({ where: { id } });
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

/**
 * Push approved rows from a SUB_RATE_CARD import onto a sub's rate card, so a
 * rate sheet can be uploaded and extracted rather than typed line by line.
 */
export async function pushImportToSubcontractor(importId: string, subcontractorId: string) {
  await requireStaff();
  const rows = await prisma.extractedRow.findMany({
    where: { importId, status: "APPROVED" },
  });
  if (rows.length === 0) return { ok: false as const, error: "No approved rows in that import." };
  await prisma.subcontractorRate.createMany({
    data: rows.map((r) => ({
      subcontractorId,
      code: (r.code || "—").toUpperCase(),
      description: r.description,
      unit: r.unit,
      rate: r.rate ?? 0,
      minimum: r.minimum,
      rules: r.rules,
      source: "import",
    })),
  });
  revalidatePath("/subcontractors");
  return { ok: true as const, count: rows.length };
}

export async function createSubcontractorDraft(input: {
  company: string;
  name: string;
  email: string;
  projectName?: string;
}) {
  const compliance = [
    { label: "General liability COI", status: "missing", expires: "—", daysOut: null },
    { label: "Workers' comp", status: "missing", expires: "—", daysOut: null },
    { label: "W-9", status: "missing", expires: "—", daysOut: null },
    { label: "Master subcontract", status: "missing", expires: "—", daysOut: null },
  ];
  const scorecard = {
    rating: 0, projectsCompleted: 0, avgApprovalDays: 0, avgDailyFt: 0,
    docAccuracy: 0, safetyIncidents: 0, disputes: 0, avgProductionPct: 0,
  };
  const sub = await prisma.subcontractor.create({
    data: {
      company: input.company,
      lead: input.name,
      email: input.email,
      state: "PENDING_REVIEW",
      tone: "warning",
      complianceTone: "neutral",
      // The invite may name a job. Resolve it to a real project; if nothing
      // matches, the crew is created unassigned and staff assign it — better
      // than recording an assignment that points at nothing.
      projects: await connectProjectByName(input.projectName),
      compliance: compliance as unknown as Prisma.InputJsonValue,
      scorecard: scorecard as unknown as Prisma.InputJsonValue,
      since: "2026",
    },
  });
  return { ok: true as const, id: sub.id };
}

/** Saves the capabilities statement onto an existing (draft) subcontractor. */
export async function updateSubcontractorCapabilities(
  id: string,
  input: { trades: string[]; crews?: string; fieldStaff?: string; equipment: string[] },
) {
  await prisma.subcontractor.update({
    where: { id },
    data: {
      trades: input.trades,
      equipment: input.equipment,
      crewSize: Number(input.fieldStaff) || Number(input.crews) || 0,
    },
  });
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

/** Uploads one compliance/onboarding document, stored as a data URL. */
export async function uploadSubDocument(formData: FormData) {
  const file = formData.get("file") as File | null;
  const subcontractorId = String(formData.get("subcontractorId") || "");
  const section = String(formData.get("section") || "");
  const uploadedBy = String(formData.get("uploadedBy") || "subcontractor");
  if (!file || !subcontractorId || !section) {
    return { ok: false as const, error: "Missing file or section." };
  }
  if (file.size > MAX_DOC_BYTES) {
    return { ok: false as const, error: "File is over 10 MB." };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type || "application/octet-stream";
  const dataUrl = `data:${mediaType};base64,${buf.toString("base64")}`;

  const doc = await prisma.subDocument.create({
    data: {
      subcontractorId,
      section,
      fileName: file.name,
      mediaType,
      sizeBytes: file.size,
      dataUrl,
      uploadedBy,
    },
  });
  revalidatePath("/subcontractors");
  return {
    ok: true as const,
    doc: {
      id: doc.id,
      section: doc.section,
      fileName: doc.fileName,
      mediaType: doc.mediaType,
      sizeBytes: doc.sizeBytes,
      dataUrl: doc.dataUrl,
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt.toISOString(),
    },
  };
}

export async function deleteSubDocument(id: string) {
  await requireStaff();
  await prisma.subDocument.delete({ where: { id } });
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

/** Load all documents for a subcontractor (contractor-side review). */
export async function listSubDocuments(subcontractorId: string) {
  await assertOwnSubcontractor(subcontractorId);
  const rows = await prisma.subDocument.findMany({
    where: { subcontractorId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((d) => ({
    id: d.id,
    section: d.section,
    fileName: d.fileName,
    mediaType: d.mediaType,
    sizeBytes: d.sizeBytes,
    dataUrl: d.dataUrl,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
  }));
}

/* ---- Customers (create / edit / delete, persisted) ------------------------ */

export type CustomerInput = {
  name: string;
  shortCode: string;
  industry: string;
  location: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  billingEmail: string;
  paymentTerms: string;
  retainagePct: number;
  invoiceMinimum: number;
  notes: string;
};

function customerData(input: CustomerInput) {
  const tone: Record<string, string> = { Telecom: "info", Power: "warning", Water: "success", Gas: "critical" };
  const t = tone[input.industry] ?? "info";
  return {
    name: input.name.trim(),
    shortCode: (input.shortCode || input.name.slice(0, 3)).toUpperCase(),
    industry: input.industry,
    tone: t,
    logoTint: t,
    location: input.location.trim(),
    contacts: [
      {
        name: input.contactName.trim() || "—",
        title: input.contactTitle.trim() || "—",
        email: input.contactEmail.trim(),
        phone: input.contactPhone.trim() || "—",
        primary: true,
      },
    ] as unknown as Prisma.InputJsonValue,
    billingEmail: input.billingEmail.trim(),
    paymentTerms: input.paymentTerms,
    retainagePct: (Number(input.retainagePct) || 0) / 100,
    invoiceMinimum: Number(input.invoiceMinimum) || 0,
    notes: input.notes.trim(),
  };
}

export async function createCustomer(input: CustomerInput) {
  await requireStaff();
  if (!input.name.trim()) return { ok: false as const, error: "Company name is required." };
  const c = await prisma.customer.create({
    data: { ...customerData(input), status: "Active", since: "2026" },
  });
  revalidatePath("/customers");
  return { ok: true as const, id: c.id };
}

export async function updateCustomer(id: string, input: CustomerInput) {
  await requireStaff();
  await prisma.customer.update({ where: { id }, data: customerData(input) });
  revalidatePath("/customers");
  return { ok: true as const, id };
}

export async function deleteCustomer(id: string) {
  await requireStaff();
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
  return { ok: true as const };
}

/* ---- Customer contract documents + rate card ------------------------------ */

export async function listCustomerDocuments(customerId: string) {
  await requireStaff();
  const rows = await prisma.customerDocument.findMany({
    where: { customerId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((d) => ({
    id: d.id,
    section: d.section,
    fileName: d.fileName,
    mediaType: d.mediaType,
    sizeBytes: d.sizeBytes,
    dataUrl: d.dataUrl,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function uploadCustomerDocument(formData: FormData) {
  await requireStaff();
  const file = formData.get("file") as File | null;
  const customerId = String(formData.get("customerId") || "");
  const section = String(formData.get("section") || "");
  if (!file || !customerId || !section) return { ok: false as const, error: "Missing file or section." };
  if (file.size > 10 * 1024 * 1024) return { ok: false as const, error: "File is over 10 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type || "application/octet-stream";
  const doc = await prisma.customerDocument.create({
    data: {
      customerId,
      section,
      fileName: file.name,
      mediaType,
      sizeBytes: file.size,
      dataUrl: `data:${mediaType};base64,${buf.toString("base64")}`,
      uploadedBy: "office",
    },
  });
  revalidatePath("/customers");
  return {
    ok: true as const,
    doc: {
      id: doc.id, section: doc.section, fileName: doc.fileName, mediaType: doc.mediaType,
      sizeBytes: doc.sizeBytes, dataUrl: doc.dataUrl, uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt.toISOString(),
    },
  };
}

export async function deleteCustomerDocument(id: string) {
  await requireStaff();
  await prisma.customerDocument.delete({ where: { id } });
  revalidatePath("/customers");
  return { ok: true as const };
}

export type CustomerRateInput = {
  code: string;
  description: string;
  unit: string;
  rate: number;
  minimum?: number | null;
  rules?: string;
  effectiveDate?: string;
  expirationDate?: string;
};

export async function listCustomerRates(customerId: string) {
  await requireStaff();
  const rows = await prisma.customerRate.findMany({
    where: { customerId },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    unit: r.unit,
    rate: r.rate,
    minimum: r.minimum,
    rules: r.rules,
    effectiveDate: r.effectiveDate,
    expirationDate: r.expirationDate,
    source: r.source,
  }));
}

export async function addCustomerRate(customerId: string, input: CustomerRateInput) {
  await requireStaff();
  if (!input.code.trim()) return { ok: false as const, error: "Unit code is required." };
  await prisma.customerRate.create({
    data: {
      customerId,
      code: input.code.trim(),
      description: input.description ?? "",
      unit: input.unit ?? "",
      rate: Number(input.rate) || 0,
      minimum: input.minimum ?? null,
      rules: input.rules ?? "",
      effectiveDate: input.effectiveDate ?? "",
      expirationDate: input.expirationDate ?? "",
      source: "manual",
    },
  });
  revalidatePath("/customers");
  return { ok: true as const };
}

export async function deleteCustomerRate(id: string) {
  await requireStaff();
  await prisma.customerRate.delete({ where: { id } });
  revalidatePath("/customers");
  return { ok: true as const };
}

/** Recent rate imports (for the push-to-customer picker). */
export async function listRateImports() {
  await requireStaff();
  const imps = await prisma.rateImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { rows: true } } },
  });
  return imps.map((i) => ({ id: i.id, fileName: i.fileName, rowCount: i._count.rows }));
}

/** Push approved rows from a Rate Import onto a customer's rate card. */
export async function pushImportToCustomer(importId: string, customerId: string) {
  await requireStaff();
  const rows = await prisma.extractedRow.findMany({
    where: { importId, status: "APPROVED" },
  });
  if (rows.length === 0) return { ok: false as const, error: "No approved rows in that import." };
  await prisma.customerRate.createMany({
    data: rows.map((r) => ({
      customerId,
      code: r.code || "—",
      description: r.description,
      unit: r.unit,
      rate: r.rate ?? 0,
      minimum: r.minimum,
      rules: r.rules,
      source: "import",
    })),
  });
  revalidatePath("/customers");
  return { ok: true as const, count: rows.length };
}

/* ---- Projects (create / edit / delete / map) ------------------------------ */

const STATUS_TONE: Record<string, string> = {
  "Ahead of schedule": "success",
  "On schedule": "info",
  "At risk": "warning",
  "Behind schedule": "critical",
};

export type ProjectInput = {
  number: string;
  name: string;
  client: string;
  location: string;
  status: string;
  crew: string;
  remainingFt: number;
  requiredFtPerDay: number;
  actualFtPerDay: number;
  pctComplete: number;
  health: number;
  forecast: string;
};

function projectData(input: ProjectInput) {
  const tone = STATUS_TONE[input.status] ?? "info";
  return {
    number: input.number,
    name: input.name,
    client: input.client,
    location: input.location,
    status: input.status,
    tone,
    crew: input.crew || "Unassigned",
    remainingFt: Number(input.remainingFt) || 0,
    requiredFtPerDay: Number(input.requiredFtPerDay) || 0,
    actualFtPerDay: Number(input.actualFtPerDay) || 0,
    pctComplete: Math.max(0, Math.min(100, Number(input.pctComplete) || 0)),
    health: Math.max(0, Math.min(100, Number(input.health) || 80)),
    forecast: input.forecast || "On track",
    forecastTone: tone,
    updatedAt: "Just now",
  };
}

export async function createProject(input: ProjectInput) {
  await requireStaff();
  if (!input.name.trim() || !input.number.trim()) {
    return { ok: false as const, error: "Project number and name are required." };
  }
  const customer = await prisma.customer.findFirst({ where: { name: input.client } });
  const p = await prisma.project.create({
    data: { ...projectData(input), customerId: customer?.id ?? null },
  });
  revalidatePath("/projects");
  return { ok: true as const, id: p.id };
}

export async function updateProject(id: string, input: ProjectInput) {
  await requireStaff();
  const customer = await prisma.customer.findFirst({ where: { name: input.client } });
  await prisma.project.update({
    where: { id },
    data: { ...projectData(input), customerId: customer?.id ?? null },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true as const, id };
}

export async function deleteProject(id: string) {
  await requireStaff();
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
  return { ok: true as const };
}

const MAX_MAP_BYTES = 15 * 1024 * 1024;

/** Uploads a project map image (stored as a data URL; original preserved). */
export async function uploadProjectMap(formData: FormData) {
  await requireStaff();
  const file = formData.get("file") as File | null;
  const projectId = String(formData.get("projectId") || "");
  if (!file || !projectId) return { ok: false as const, error: "Missing map file." };
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isImage && !isPdf) {
    return { ok: false as const, error: "Upload an image (PNG/JPG) or a PDF." };
  }
  if (file.size > MAX_MAP_BYTES) return { ok: false as const, error: "Map is over 15 MB." };

  const buf = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type || (isPdf ? "application/pdf" : "image/png");
  const dataUrl = `data:${mediaType};base64,${buf.toString("base64")}`;
  await prisma.project.update({
    where: { id: projectId },
    data: { mapUrl: dataUrl, mapOriginalUrl: dataUrl },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const, dataUrl };
}

/**
 * Saves a map URL that was uploaded directly to Vercel Blob from the browser.
 * This path has no practical size limit (large map PDFs go straight to storage;
 * we only persist the short https URL).
 */
export async function saveProjectMapUrl(projectId: string, url: string) {
  await requireStaff();
  if (!projectId || !url) return { ok: false as const, error: "Missing map." };
  await prisma.project.update({
    where: { id: projectId },
    data: { mapUrl: url, mapOriginalUrl: url },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const, url };
}

/** Saves a jobsite cover photo (Blob URL) shown on the project card. */
export async function saveProjectPhotoUrl(projectId: string, url: string) {
  await assertProjectAccess(projectId);
  if (!projectId || !url) return { ok: false as const, error: "Missing photo." };
  await prisma.project.update({
    where: { id: projectId },
    data: { photoUrl: url },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const, url };
}

/** Persists as-built redline markups (lines + dots) drawn over the map. */
export async function saveProjectMarkups(projectId: string, markups: unknown) {
  await assertProjectAccess(projectId);
  if (!projectId) return { ok: false as const, error: "Missing project." };
  await prisma.project.update({
    where: { id: projectId },
    data: { markups: (markups ?? null) as Prisma.InputJsonValue },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

/* ---- Dailies (linked to a project by number + name) ----------------------- */

export type DailyLineInput = { location: string; code: string; quantity: number; unit: "ft" | "ea" };

/**
 * Creates a daily production report tied to a project. Project number, name and
 * customer are pulled from the chosen project so the daily is always linked.
 */
export async function createDaily(input: {
  projectId: string;
  subcontractor: string;
  crew: string;
  workDate: string;
  lineItems: DailyLineInput[];
  photos?: number;
  hasAsBuilt?: boolean;
  hasBoreLog?: boolean;
}) {
  await assertProjectAccess(input.projectId);
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project) return { ok: false as const, error: "Pick a project." };

  const lineItems = input.lineItems.filter((l) => l.code.trim() || l.quantity > 0);
  if (lineItems.length === 0) return { ok: false as const, error: "Add at least one line item." };

  const totalFt = lineItems
    .filter((l) => l.unit === "ft")
    .reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  const sheetNumber = `GLS-${Math.floor(100000 + Math.random() * 899999)}`;

  const daily = await prisma.daily.create({
    data: {
      sheetNumber,
      projectId: project.id,
      projectName: project.name,
      customer: project.client,
      subcontractor: input.subcontractor || "—",
      crew: input.crew || "—",
      workDate: input.workDate,
      submittedAt: new Date().toISOString(),
      status: "Submitted",
      tone: "info",
      totalFt,
      billableAmount: 0,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      photos: input.photos ?? 0,
      hasAsBuilt: input.hasAsBuilt ?? false,
      hasBoreLog: input.hasBoreLog ?? false,
      flags: [] as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/dailies");
  revalidatePath(`/projects/${project.id}`);
  return { ok: true as const, id: daily.id };
}

/* ---- Rate-document extraction (AI extracts, human approves) --------------- */

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Extracted rows -> insertable data.
 *
 * These go in via a single `createMany`. Writing them as N individual creates
 * inside one transaction meant a 59-row sheet held an interactive transaction
 * open for 60 round trips, which is long enough for Neon's pooler to hang up
 * mid-write ("server has closed the connection").
 */
function extractedRowData(importId: string, rows: ExtractedRowData[]) {
  return rows.map((r) => ({
    importId,
    code: r.code ?? "",
    description: r.description ?? "",
    unit: r.unit ?? "",
    rate: r.rate ?? null,
    minimum: r.minimum ?? null,
    rules: r.rules ?? "",
    sourcePage: r.sourcePage ?? "",
    confidence: typeof r.confidence === "number" ? r.confidence : 0,
    warning: r.warning ?? "",
    data: r as unknown as Prisma.InputJsonValue,
  }));
}

/**
 * Turns an uploaded file into something Claude can read: PDFs and photos go up
 * as base64 (a phone snap of a paper material list is a first-class input),
 * spreadsheets are flattened to CSV per sheet, everything else is read as text.
 */
async function readDocument(file: File) {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name;
  const lower = name.toLowerCase();
  let mediaType = file.type;
  let base64: string | undefined;
  let text: string | undefined;

  if (lower.endsWith(".pdf") || mediaType === "application/pdf") {
    mediaType = "application/pdf";
    base64 = buf.toString("base64");
  } else if (IMAGE_TYPES.has(mediaType) || /\.(png|jpe?g|webp|gif)$/.test(lower)) {
    if (!IMAGE_TYPES.has(mediaType)) mediaType = lower.endsWith(".png") ? "image/png" : "image/jpeg";
    base64 = buf.toString("base64");
  } else if (/\.(xlsx|xls)$/.test(lower)) {
    const wb = XLSX.read(buf, { type: "buffer" });
    text = wb.SheetNames.map(
      (s) => `# Sheet: ${s}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[s]),
    ).join("\n\n");
  } else {
    text = buf.toString("utf8"); // csv / txt
  }

  return { name, mediaType, base64, text, buffer: buf };
}

/**
 * Upload → Claude extraction → draft rows. Creates a RateImport and its rows in
 * one shot; rows land as PENDING for review. Returns the import id (or an error).
 */
/** Pages per model call when a document is long enough to need splitting. */
const PAGES_PER_BATCH = 6;

/**
 * Extract a document that may be too long for a single pass.
 *
 * A 29-page rate sheet produces hundreds of rows of JSON — more than one reply
 * can hold. Sent whole, the tool call is cut off mid-array and the result reads
 * as "0 rows" on a document the model understood perfectly, which is how the
 * Globe Exhibit A import came back empty while its summary was correct.
 *
 * When the PDF has a real text layer we split it on page boundaries and merge
 * the rows. A scan has no text layer, so it still goes through whole — but a
 * truncated read now raises rather than reporting success.
 */
async function extractLongDocument(input: {
  docType: RateDocType;
  base64?: string;
  mediaType?: string;
  text?: string;
  file: File;
}) {
  const single = () =>
    extractDocument({
      docType: input.docType,
      base64: input.base64,
      mediaType: input.mediaType,
      text: input.text,
    });

  if (input.mediaType !== "application/pdf") return single();

  const buffer = Buffer.from(await input.file.arrayBuffer());

  // A unit rate sheet is a code and a price and nothing else, so read it
  // exactly rather than asking a model to retype two thousand rows. This is
  // free, instant, complete, and cannot truncate — which the model path did,
  // silently, on this very document.
  const isRateSheet = input.docType === "GC_RATE_SHEET" || input.docType === "SUB_RATE_CARD";
  if (isRateSheet) {
    const layer = await pdfTextLayer(buffer);
    const parsed = layer ? parseRateSheet(layer) : [];
    // A handful of matches means we found stray dollar figures in prose, not a
    // rate table — fall through to the model rather than import noise.
    if (parsed.length >= 25) {
      return {
        summary: `Read ${parsed.length} unit rates directly from the sheet — no AI, no truncation.`,
        rows: parsed.map((r) => ({
          code: r.code,
          description: "",
          unit: "",
          rate: r.rate,
          confidence: 1,
        })),
      };
    }
  }

  const pages = await pdfTextPages(buffer);
  // No text layer (a scan), or short enough to read in one go.
  if (!pages || pages.length <= PAGES_PER_BATCH) return single();

  const batches: string[][] = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) {
    batches.push(pages.slice(i, i + PAGES_PER_BATCH));
  }

  const rows: ExtractedRowData[] = [];
  const summaries: string[] = [];
  const failed: number[] = [];

  for (const [i, batch] of batches.entries()) {
    try {
      const part = await extractDocument({
        docType: input.docType,
        text: batch.join("\n\n"),
      });
      rows.push(...part.rows);
      if (part.summary) summaries.push(part.summary);
    } catch {
      // Record which pages we lost rather than pretending the read was clean.
      failed.push(i + 1);
    }
  }

  if (rows.length === 0) {
    throw new Error(
      `Read ${pages.length} pages in ${batches.length} batches but found no rows. The document may not be a rate sheet.`,
    );
  }

  const note = failed.length
    ? ` — batch${failed.length === 1 ? "" : "es"} ${failed.join(", ")} of ${batches.length} failed, so some pages are missing`
    : "";
  return {
    summary: `${summaries[0] ?? ""} (${pages.length} pages, ${rows.length} rows)${note}`,
    rows,
  };
}

export async function extractRateDocument(formData: FormData) {
  await requireStaff();
  if (!isConfigured()) {
    return { ok: false as const, error: "Claude AI isn't connected yet — add an API key in Integrations." };
  }

  const file = formData.get("file") as File | null;
  const docType = String(formData.get("docType") || "") as RateDocType;
  const customer = String(formData.get("customer") || "");
  const market = String(formData.get("market") || "");
  const project = String(formData.get("project") || "");
  if (!file || !docType) return { ok: false as const, error: "Pick a document type and a file." };

  const { mediaType, base64, text, name } = await readDocument(file);

  const imp = await prisma.rateImport.create({
    data: { docType, fileName: name, mediaType, status: "PROCESSING", customer, market, project },
  });

  try {
    const result = await extractLongDocument({
      docType,
      base64,
      mediaType,
      text,
      file,
    });
    await prisma.extractedRow.createMany({ data: extractedRowData(imp.id, result.rows) });
    await prisma.rateImport.update({
      where: { id: imp.id },
      data: { status: "EXTRACTED", summary: result.summary },
    });
  } catch (e) {
    await prisma.rateImport.update({
      where: { id: imp.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : "Extraction failed" },
    });
    return { ok: false as const, error: e instanceof Error ? e.message : "Extraction failed", id: imp.id };
  }

  revalidatePath("/rate-import");
  return { ok: true as const, id: imp.id };
}

/**
 * Same extraction pipeline as the rate importer, entered from a project. The
 * crew uploads or photographs the material list and Claude pulls every code
 * off it — BFO, BFOV, flower pots, peds, markers — with quantities and reel
 * numbers. Rows land PENDING: nothing is trusted until a human approves it.
 */
export async function extractProjectMaterials(formData: FormData) {
  await requireStaff();
  const file = formData.get("file") as File | null;
  const projectId = String(formData.get("projectId") || "");
  if (!file) return { ok: false as const, error: "Pick a file to upload." };
  return runMaterialExtraction(projectId, file);
}

/**
 * Blob path — the browser uploads straight to storage (no Server Action body
 * limit), then hands us the URL. Used for material lists too big to post.
 */
export async function extractProjectMaterialsFromUrl(input: {
  projectId: string;
  url: string;
  fileName: string;
}) {
  await requireStaff();
  if (!input.url) return { ok: false as const, error: "Missing uploaded file." };
  const res = await fetch(input.url);
  if (!res.ok) return { ok: false as const, error: "Could not read the uploaded file back." };
  const blob = await res.blob();
  const file = new File([blob], input.fileName, { type: blob.type });
  return runMaterialExtraction(input.projectId, file);
}

async function runMaterialExtraction(projectId: string, file: File) {
  if (!projectId) return { ok: false as const, error: "Missing project." };

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false as const, error: "Project not found." };

  const { name, mediaType, base64, text, buffer } = await readDocument(file);

  // Try to read the document outright before paying a model to interpret it.
  // Spreadsheets and text-layer PDFs are already structured; only scans and
  // photos genuinely need Claude.
  let parsed = text ? parseDelimitedMaterialList(text) : null;
  if (!parsed && mediaType === "application/pdf") {
    const pdfText = await pdfTextLayer(buffer);
    if (pdfText) parsed = parseDelimitedMaterialList(pdfText, "pdf-text");
  }

  if (!parsed && !isConfigured()) {
    return {
      ok: false as const,
      error:
        "Couldn't read that file directly, and Claude isn't connected for scans — add an API key in Integrations.",
    };
  }

  const imp = await prisma.rateImport.create({
    data: {
      docType: "MATERIAL_LIST",
      fileName: name,
      mediaType,
      status: "PROCESSING",
      project: project.name,
      projectId: project.id,
    },
  });

  try {
    const result = parsed
      ? {
          summary:
            `Read directly from the ${parsed.method === "pdf-text" ? "PDF text" : "spreadsheet"} — ` +
            `${parsed.rows.length} lines via ${parsed.matched.join(", ")}` +
            (parsed.skipped ? ` (${parsed.skipped} non-item rows skipped)` : ""),
          rows: parsed.rows,
        }
      : await extractDocument({ docType: "MATERIAL_LIST", base64, mediaType, text });
    await prisma.extractedRow.createMany({ data: extractedRowData(imp.id, result.rows) });
    await prisma.rateImport.update({
      where: { id: imp.id },
      data: { status: "EXTRACTED", summary: result.summary },
    });

    /*
     * Standing rules for customers whose paperwork never changes. Windstream
     * work through Globe is the same unit summary sheet every time, so the
     * codes this system already recognises approve and start tracking without
     * anyone clicking through them. Unrecognised, low-confidence and aerial
     * rows still wait for review.
     */
    const profile = findJobProfile({
      client: project.client,
      fileName: name,
      summary: result.summary,
    });

    let tracked = 0;
    let pending = result.rows.length;
    if (profile?.autoApprove) {
      const saved = await prisma.extractedRow.findMany({
        where: { importId: imp.id },
        select: { id: true, code: true, confidence: true },
      });
      const approve = saved.filter((r) => profile.approves(r)).map((r) => r.id);
      if (approve.length > 0) {
        await prisma.extractedRow.updateMany({
          where: { id: { in: approve } },
          data: { status: "APPROVED" },
        });
        if (profile.autoTrack) {
          const pushed = await pushMaterialsToProject(imp.id, project.id);
          if (pushed.ok) tracked = pushed.count;
        }
        pending = result.rows.length - approve.length;
      }
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/dailies/new");
    revalidatePath("/rate-import");
    return {
      ok: true as const,
      id: imp.id,
      count: result.rows.length,
      summary: result.summary,
      profile: profile?.label ?? null,
      tracked,
      pending,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Extraction failed";
    // A failed extraction has no rows and nothing to review — leaving it behind
    // just litters the project panel with dead entries. Drop it and surface the
    // error to the caller instead.
    await prisma.rateImport.delete({ where: { id: imp.id } }).catch(() => {});
    return { ok: false as const, error };
  }
}

/** Removes a material import and its rows from a project. */
export async function deleteProjectMaterialImport(importId: string, projectId: string) {
  await requireStaff();
  await prisma.rateImport.delete({ where: { id: importId } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

/** Rough classification so the tracked list groups sensibly without asking. */
function materialCategory(text: string): string {
  const t = text.toLowerCase();
  if (/fiber|strand|cable|reel|bfo|adss/.test(t)) return "Fiber";
  if (/conduit|duct|innerduct|hdpe|pipe|bore/.test(t)) return "Conduit";
  if (/ped|pedestal|vault|handhole|flower ?pot|enclosure|cabinet|closure/.test(t)) return "Structures";
  return "Hardware";
}

/**
 * Promote a reviewed import onto the project. Only APPROVED rows cross over —
 * this is the line between "Claude read it" and "we're tracking it". Approving
 * the same import twice replaces its previous rows rather than doubling them.
 */
export async function pushMaterialsToProject(importId: string, projectId: string) {
  await requireStaff();
  const [imp, rows] = await Promise.all([
    prisma.rateImport.findUnique({ where: { id: importId } }),
    prisma.extractedRow.findMany({ where: { importId, status: "APPROVED" } }),
  ]);
  if (!imp) return { ok: false as const, error: "Import not found." };
  if (rows.length === 0) {
    return {
      ok: false as const,
      error: "No approved rows yet — approve them on the review screen first.",
    };
  }

  await prisma.projectMaterial.deleteMany({ where: { projectId, sourceImportId: importId } });
  await prisma.projectMaterial.createMany({
    data: rows.map((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      const qty = typeof d.plannedQty === "number" ? d.plannedQty : 0;
      return {
        projectId,
        code: r.code || "",
        item: r.description || r.code || "Unnamed material",
        category: materialCategory(`${r.code} ${r.description}`),
        unit: r.unit || "ea",
        planned: qty,
        issued: 0,
        installed: 0,
        manufacturer: typeof d.manufacturer === "string" ? d.manufacturer : "",
        size: typeof d.size === "string" ? d.size : "",
        reelNumber: typeof d.reelNumber === "string" ? d.reelNumber : "",
        furnished: typeof d.furnished === "string" ? d.furnished : "",
        sourceImportId: importId,
      };
    }),
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/materials");
  return { ok: true as const, count: rows.length };
}

/**
 * Approve every row that clears the confidence bar and track them in one go.
 * Reviewing 59 lines one at a time is how a good pipeline stops getting used;
 * rows below the bar stay PENDING for a human to look at individually.
 */
export async function approveAndTrackImport(
  importId: string,
  projectId: string,
  minConfidence = 0.7,
) {
  await requireStaff();
  const total = await prisma.extractedRow.count({ where: { importId } });
  await prisma.extractedRow.updateMany({
    where: { importId, status: "PENDING", confidence: { gte: minConfidence } },
    data: { status: "APPROVED" },
  });
  const approved = await prisma.extractedRow.count({ where: { importId, status: "APPROVED" } });
  if (approved === 0) {
    return {
      ok: false as const,
      error: `No rows cleared the ${Math.round(minConfidence * 100)}% confidence bar — review them individually.`,
    };
  }

  const pushed = await pushMaterialsToProject(importId, projectId);
  if (!pushed.ok) return pushed;

  await prisma.rateImport.update({ where: { id: importId }, data: { status: "APPROVED" } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dailies/new");
  return { ok: true as const, count: approved, skipped: total - approved };
}

/**
 * Field updates to tracked material. Descriptions are editable because the
 * ones printed on a customer's sheet are sometimes wrong for the unit — the RI
 * codes carry "PLACE MICRO RIBBON FIBER IN DUCT" when they're microfiber. The
 * code is what bills; the label should be whatever the crew recognises.
 */
export async function updateProjectMaterial(
  id: string,
  patch: {
    issued?: number;
    installed?: number;
    planned?: number;
    item?: string;
    unit?: string;
  },
) {
  await requireStaff();
  const row = await prisma.projectMaterial.update({
    where: { id },
    data: {
      ...(patch.planned != null ? { planned: patch.planned } : {}),
      ...(patch.issued != null ? { issued: patch.issued } : {}),
      ...(patch.installed != null ? { installed: patch.installed } : {}),
      ...(patch.item != null ? { item: patch.item.trim() } : {}),
      ...(patch.unit != null ? { unit: patch.unit.trim() } : {}),
    },
  });
  revalidatePath(`/projects/${row.projectId}`);
  revalidatePath("/materials");
  return { ok: true as const };
}

export async function deleteProjectMaterial(id: string) {
  await requireStaff();
  const row = await prisma.projectMaterial.delete({ where: { id } });
  revalidatePath(`/projects/${row.projectId}`);
  revalidatePath("/materials");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Daily billing sheets — the Globe-style paper form, saved.
 * ------------------------------------------------------------------ */

export type SheetPayload = {
  id?: string;
  projectId?: string | null;
  projectName: string;
  workDate: string;
  crewNumber: string;
  header: unknown;
  laborCodes: unknown;
  laborRows: unknown;
  matCodes: unknown;
  matRows: unknown;
  redlines: unknown;
  notes?: string;
  photos?: unknown;
};

const asJson = (v: unknown) => (v ?? null) as Prisma.InputJsonValue;

/**
 * Save (or update) a sheet as a draft.
 *
 * A submitted sheet is a record, not a working document: once it has been
 * filed, the only thing anyone may add is photographs. Everything else is
 * refused here rather than merely hidden in the UI, because a hidden button is
 * not a control — anyone can post to a server action.
 */
export async function saveDailySheet(input: SheetPayload) {
  // A sheet belongs to a project, so writing one requires access to that
  // project. Without this a crew could file production against a job that was
  // never theirs — which then flows into billing.
  if (input.projectId) await assertProjectAccess(input.projectId);
  else await requireUser();

  if (input.id) {
    const existing = await prisma.dailySheet.findUnique({
      where: { id: input.id },
      select: { status: true },
    });
    if (existing?.status === "SUBMITTED") {
      return {
        ok: false as const,
        error: "This daily has been submitted. Photos can still be added, but nothing else can change.",
      };
    }
  }

  const data = {
    projectId: input.projectId || null,
    projectName: input.projectName,
    workDate: input.workDate,
    crewNumber: input.crewNumber,
    header: asJson(input.header),
    laborCodes: asJson(input.laborCodes),
    laborRows: asJson(input.laborRows),
    matCodes: asJson(input.matCodes),
    matRows: asJson(input.matRows),
    redlines: asJson(input.redlines),
    notes: input.notes ?? "",
    photos: asJson(input.photos ?? []),
  };

  const sheet = input.id
    ? await prisma.dailySheet.update({ where: { id: input.id }, data })
    : await prisma.dailySheet.create({ data });

  return { ok: true as const, id: sheet.id, savedAt: sheet.updatedAt.toISOString() };
}

/**
 * Submit a sheet. Beyond flipping status, this is what turns a filled-in form
 * into data the rest of the app can use: the production grid collapses into
 * Daily line items keyed by unit code, which is exactly what material
 * draw-down and billing read.
 */
export async function submitDailySheet(input: SheetPayload) {
  // saveDailySheet below checks this too. Stated again here so the guard
  // doesn't quietly depend on that call staying first.
  if (input.projectId) await assertProjectAccess(input.projectId);
  else await requireUser();

  const saved = await saveDailySheet(input);
  const sheet = await prisma.dailySheet.findUnique({ where: { id: saved.id } });
  if (!sheet) return { ok: false as const, error: "Sheet not found after save." };

  // Grid -> line items. Each production row carries a quantity per unit-code
  // column; a code with no quantity in a row simply isn't billed on that row.
  const codes = (Array.isArray(sheet.laborCodes) ? sheet.laborCodes : []) as string[];
  const rows = (Array.isArray(sheet.laborRows) ? sheet.laborRows : []) as {
    location?: string;
    cells?: string[];
  }[];

  const lineItems: { location: string; code: string; quantity: number; unit: string }[] = [];
  for (const row of rows) {
    codes.forEach((code, col) => {
      const trimmed = (code ?? "").trim();
      if (!trimmed) return;
      const qty = Number.parseFloat(row.cells?.[col] ?? "");
      if (!Number.isFinite(qty) || qty === 0) return;
      lineItems.push({
        location: (row.location ?? "").trim(),
        code: trimmed,
        quantity: qty,
        unit: "ea",
      });
    });
  }

  if (lineItems.length === 0) {
    return { ok: false as const, error: "Nothing to submit — enter a unit code and a quantity first." };
  }

  const header = (sheet.header ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof header[k] === "string" ? (header[k] as string) : "");

  // Record which company filed this. The paper sheet has no company field, so
  // the submitting account is the only authority — and without it a daily can
  // neither be shown back to the crew that filed it nor turned into their pay
  // application. Staff submitting a sheet are filing self-perform work.
  const submitter = await requireUser();
  const filedBy = submitter.subcontractorName ?? "Fortitude Self-Perform";

  const daily = await prisma.daily.create({
    data: {
      sheetNumber: str("exchange") || str("projectNumber"),
      projectId: sheet.projectId,
      projectName: sheet.projectName,
      subcontractor: filedBy,
      customer: str("customer"),
      crew: sheet.crewNumber,
      workDate: sheet.workDate,
      submittedAt: new Date().toISOString(),
      status: "Submitted",
      tone: "info",
      totalFt: Math.round(lineItems.reduce((s, l) => s + l.quantity, 0)),
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.dailySheet.update({
    where: { id: sheet.id },
    data: { status: "SUBMITTED", dailyId: daily.id },
  });

  revalidatePath("/dailies");
  if (sheet.projectId) revalidatePath(`/projects/${sheet.projectId}`);
  return { ok: true as const, id: sheet.id, dailyId: daily.id, lines: lineItems.length };
}

/**
 * Supervisor review of a submitted daily.
 *
 * The lock on a submitted sheet exists to stop the *crew* changing what they
 * filed. Review is the other side of that: staff decide whether it stands, and
 * a denial carries the reason, because "denied" with no explanation just sends
 * the crew back to guess.
 */
export async function reviewDaily(input: {
  dailyId: string;
  decision: "APPROVED" | "DENIED";
  note: string;
  reviewedBy: string;
}) {
  await requireStaff();
  const note = input.note.trim();
  if (input.decision === "DENIED" && !note) {
    return { ok: false as const, error: "Say why it's being denied — the crew needs to know what to fix." };
  }

  const daily = await prisma.daily.update({
    where: { id: input.dailyId },
    data: {
      status: input.decision === "APPROVED" ? "Approved" : "Denied",
      tone: input.decision === "APPROVED" ? "success" : "critical",
      reviewNote: note,
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date().toISOString(),
    },
  });

  revalidatePath("/dailies");
  if (daily.projectId) revalidatePath(`/projects/${daily.projectId}`);
  return { ok: true as const };
}

/** Put a decided daily back in review — a reviewer can change their mind. */
export async function reopenDailyReview(dailyId: string) {
  await requireStaff();
  const daily = await prisma.daily.update({
    where: { id: dailyId },
    data: { status: "In review", tone: "warning", reviewNote: "", reviewedBy: "", reviewedAt: "" },
  });
  revalidatePath("/dailies");
  if (daily.projectId) revalidatePath(`/projects/${daily.projectId}`);
  return { ok: true as const };
}

export async function deleteDailySheet(id: string) {
  await requireStaff();
  await prisma.dailySheet.delete({ where: { id } });
  revalidatePath("/dailies");
  return { ok: true as const };
}

export async function setRowStatus(id: string, status: "APPROVED" | "REJECTED") {
  await requireStaff();
  const row = await prisma.extractedRow.update({ where: { id }, data: { status } });
  revalidatePath(`/rate-import/${row.importId}`);
  return { ok: true as const };
}

/** Bulk-approve only rows that pass validation (a confidence floor, no blocking warning). */
export async function bulkApproveRows(importId: string, minConfidence = 0.7) {
  await requireStaff();
  await prisma.extractedRow.updateMany({
    where: { importId, status: "PENDING", confidence: { gte: minConfidence } },
    data: { status: "APPROVED" },
  });
  await prisma.rateImport.update({ where: { id: importId }, data: { status: "APPROVED" } });
  revalidatePath(`/rate-import/${importId}`);
  return { ok: true as const };
}
