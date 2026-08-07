"use server";

import { randomBytes } from "node:crypto";
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
import { priceQuantities } from "@/lib/pricing";
import { addDays, balanceOf, daysFromTerms, invoiceMoney, weekOf } from "@/lib/billing";
import { isLabourOrEquipmentCode } from "@/lib/unit-codes";
import { packetStatus } from "@/lib/vendor-packet";
import { readExif } from "@/lib/exif";
import { describeFileRejection } from "@/lib/document-storage";
import { getCustomerRollup, getVendorPacket } from "@/data/queries";
import {
  assertOwnSubcontractor,
  assertProjectAccess,
  requireStaff,
  requireUser,
  assertSubcontractorWrite,
  bindInviteToSubcontractor,
  viewer,
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
 * The one exception is createSubcontractorDraft, used by the public /invite
 * flow. It runs before an account exists, so it cannot require a session — it
 * requires a stored, unclaimed invite token instead, which is what proves the
 * caller was actually invited. Every later step in that flow
 * (updateSubcontractorCapabilities, uploadSubDocument) takes the same token and
 * checks it against the record it is writing to, so a token for one company is
 * not a key to another.
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
  notes: string;
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
    notes: (input.notes ?? "").trim(),
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

  // Assigning work is the moment the paperwork has to be real. Checked here
  // rather than only in the UI, because this action is reachable on its own —
  // and unassigning must always be allowed, or a crew whose packet lapses could
  // never be taken off a job.
  if (wanted.length > 0) {
    const sub = await prisma.subcontractor.findUnique({ where: { id } });
    if (!sub) return { ok: false as const, error: "Subcontractor not found." };

    const packet = packetStatus(sub);
    if (!packet.complete) {
      return {
        ok: false as const,
        error: `Their vendor packet is incomplete — still needed: ${packet.blocking.join(", ")}.`,
      };
    }
  }
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

export async function updateSubRate(
  id: string,
  patch: { rate?: number; description?: string; unit?: string; code?: string },
) {
  await requireStaff();

  // A code is what pricing matches on, so an empty one would silently orphan
  // the row from every daily that bills it.
  const code = patch.code?.trim().toUpperCase();
  if (patch.code !== undefined && !code) {
    return { ok: false as const, error: "A rate needs a unit code." };
  }

  await prisma.subcontractorRate.update({
    where: { id },
    data: {
      ...(code ? { code } : {}),
      ...(patch.rate != null && Number.isFinite(patch.rate) ? { rate: patch.rate } : {}),
      ...(patch.description != null ? { description: patch.description.trim() } : {}),
      ...(patch.unit != null ? { unit: patch.unit.trim() } : {}),
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

/**
 * Start a subcontractor record from an invite.
 *
 * Deliberately open — the crew following the link has no login yet, and that is
 * the point of an invite. What it does do is bind the token to the record it
 * creates, so every later step in the flow can prove which company the caller
 * is without needing a session.
 */
export async function createSubcontractorDraft(input: {
  company: string;
  name: string;
  email: string;
  projectName?: string;
  inviteToken?: string;
}) {
  // The invitation is the authorization. Without one this endpoint lets anyone
  // on the internet create crew records in the system, and every later step
  // that trusts the token has nothing to check against.
  const invite = input.inviteToken
    ? await prisma.invite.findUnique({
        where: { token: input.inviteToken },
        select: { subcontractorId: true },
      })
    : null;
  if (!invite) return { ok: false as const, error: "This invitation link is not valid." };
  if (invite.subcontractorId) {
    return { ok: false as const, error: "This invitation has already been used." };
  }

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
  if (input.inviteToken) await bindInviteToSubcontractor(input.inviteToken, sub.id);
  return { ok: true as const, id: sub.id };
}

/**
 * Saves the capabilities statement onto an existing (draft) subcontractor.
 *
 * This took an id and wrote to it with no check whatsoever, so anyone could
 * rewrite any crew's trades and headcount.
 */
export async function updateSubcontractorCapabilities(
  id: string,
  input: { trades: string[]; crews?: string; fieldStaff?: string; equipment: string[] },
  inviteToken?: string,
) {
  await assertSubcontractorWrite(id, inviteToken);
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

/**
 * Uploads one compliance/onboarding document, stored as a data URL.
 *
 * Took a subcontractor id straight off the form and wrote to it, so anyone who
 * could POST to the page could file a document into any crew's packet — a W-9,
 * a COI, a signed agreement — under a name they chose themselves. Now the
 * caller has to be staff, that sub's own login, or hold the invite token bound
 * to that record, and the name on the upload is derived rather than trusted.
 */
export async function uploadSubDocument(formData: FormData) {
  const file = formData.get("file") as File | null;
  const subcontractorId = String(formData.get("subcontractorId") || "");
  const section = String(formData.get("section") || "");
  const inviteToken = String(formData.get("inviteToken") || "") || null;
  if (!file || !subcontractorId || !section) {
    return { ok: false as const, error: "Missing file or section." };
  }

  await assertSubcontractorWrite(subcontractorId, inviteToken);

  // Who filed it is established here, not claimed by the caller.
  const actor = await viewer();
  const uploadedBy = actor ? actor.name || actor.email : "subcontractor";
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

/**
 * Set what was billed to this customer before the system was tracking it.
 *
 * The only figure on the customer tiles anyone types. Everything after it is
 * priced off dailies, so this is purely the opening balance that makes the
 * running total start where the business actually is.
 */
export async function setPriorBilled(id: string, amount: number) {
  await requireStaff();
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false as const, error: "Enter a dollar amount of zero or more." };
  }
  await prisma.customer.update({ where: { id }, data: { priorBilled: value } });
  revalidatePath("/customers");
  return { ok: true as const, priorBilled: value };
}

/** The customer tiles, computed from the projects. Staff-only inside. */
export async function customerRollup(customerId: string) {
  return getCustomerRollup(customerId);
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

/**
 * Resolve the typed client name to a real customer record.
 *
 * Refuses rather than storing null. The customer link is what gives a project
 * a rate card, and a project without one values at $0 and cannot be invoiced —
 * silently. Three projects sat in exactly that state because this matched on
 * an exact name and shrugged when it missed.
 */
async function resolveCustomer(
  client: string,
): Promise<{ ok: false; error: string } | { ok: true; customer: { id: string } }> {
  const name = client.trim();
  if (!name) {
    return { ok: false, error: "Choose the customer — without one the project has no rate card and cannot be billed." };
  }
  const customer = await prisma.customer.findFirst({ where: { name }, select: { id: true } });
  if (!customer) {
    return { ok: false, error: `No customer named "${name}". Add them first, or pick an existing one.` };
  }
  return { ok: true, customer };
}

export async function createProject(input: ProjectInput) {
  await requireStaff();
  if (!input.name.trim() || !input.number.trim()) {
    return { ok: false as const, error: "Project number and name are required." };
  }
  const resolved = await resolveCustomer(input.client);
  if (!resolved.ok) return { ok: false as const, error: resolved.error };

  const p = await prisma.project.create({
    data: { ...projectData(input), customerId: resolved.customer.id },
  });
  revalidatePath("/projects");
  return { ok: true as const, id: p.id };
}

export async function updateProject(id: string, input: ProjectInput) {
  await requireStaff();
  const resolved = await resolveCustomer(input.client);
  if (!resolved.ok) return { ok: false as const, error: resolved.error };

  await prisma.project.update({
    where: { id },
    data: { ...projectData(input), customerId: resolved.customer.id },
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
      // Hourly labour, trucks and equipment are on the same sheet but are not
      // what an underground crew bills a daily against, and a few hundred of
      // them bury the codes that matter.
      const work = parsed.filter((r) => !isLabourOrEquipmentCode(r.code));
      const dropped = parsed.length - work.length;

      return {
        summary:
          `Read ${work.length} unit rates directly from the sheet — no AI, no truncation.` +
          (dropped > 0 ? ` Left out ${dropped} labour, truck and equipment rates.` : ""),
        rows: work.map((r) => ({
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

/**
 * Removes a material import and everything it put on the project.
 *
 * sourceImportId is a plain string, not a foreign key, so deleting the import
 * on its own left the tracked material rows behind — a wrong list could be
 * deleted and its quantities would still be in the project's value, with no
 * import left on screen to explain where they came from.
 */
export async function deleteProjectMaterialImport(importId: string, projectId: string) {
  await requireStaff();
  const removed = await prisma.projectMaterial.deleteMany({
    where: { projectId, sourceImportId: importId },
  });
  await prisma.rateImport.delete({ where: { id: importId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/materials");
  revalidatePath("/customers");
  return { ok: true as const, removed: removed.count };
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
 * this is the line between "Claude read it" and "we're tracking it".
 *
 * A project holds one planned quantity per code, so an incoming code replaces
 * whatever was there regardless of which import put it there. Guarding only
 * against re-pushing the *same* import was not enough: uploading the same
 * material list twice made two imports, both pushed, and the project quietly
 * carried every quantity twice — which doubles the contract value without a
 * single figure looking wrong.
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

  // Clear this import's own rows, and any row on the project already carrying
  // one of the incoming codes — whichever import put it there.
  const codes = rows.map((r) => r.code || "").filter(Boolean);

  // Carry scope decisions across the replacement. Marking riser guards
  // out-of-scope and then re-uploading a corrected list should not quietly put
  // them back in the valuation.
  const priorScope = new Map(
    (
      await prisma.projectMaterial.findMany({
        where: { projectId, inScope: false },
        select: { code: true, scopeNote: true },
      })
    ).map((m) => [m.code.toUpperCase(), m.scopeNote]),
  );

  const replaced = await prisma.projectMaterial.deleteMany({
    where: { projectId, OR: [{ sourceImportId: importId }, { code: { in: codes } }] },
  });

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
        inScope: !priorScope.has((r.code || "").toUpperCase()),
        scopeNote: priorScope.get((r.code || "").toUpperCase()) ?? "",
        sourceImportId: importId,
      };
    }),
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/materials");
  return { ok: true as const, count: rows.length, replaced: replaced.count };
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

/**
 * Mark a material line as work we are or are not performing.
 *
 * The list is the customer's document and arrives with whatever is on it —
 * aerial riser guards on an all-underground job, for one. Excluding the line
 * keeps the list intact as a record while taking the work out of the valuation,
 * because revenue nobody will invoice is not revenue.
 */
export async function setProjectMaterialScope(id: string, inScope: boolean, note = "") {
  await requireStaff();
  const row = await prisma.projectMaterial.update({
    where: { id },
    data: { inScope, scopeNote: inScope ? "" : note.trim() },
  });
  revalidatePath(`/projects/${row.projectId}`);
  revalidatePath("/materials");
  revalidatePath("/customers");
  return { ok: true as const };
}

export async function deleteProjectMaterial(id: string) {
  await requireStaff();
  const row = await prisma.projectMaterial.delete({ where: { id } });
  revalidatePath(`/projects/${row.projectId}`);
  revalidatePath("/materials");
  revalidatePath("/customers");
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

  // A zero-footage day is a real day. Runs bill ped to ped and a crew doesn't
  // claim one until it closes, so a day spent on a run that didn't finish —
  // rain, locates, a rock — goes in at zero with notes explaining it. Refusing
  // that submission would mean the only way to file the day is to invent
  // production, so the notes are what make it valid instead of the quantities.
  if (lineItems.length === 0 && !(sheet.notes ?? "").trim()) {
    return {
      ok: false as const,
      error:
        "Nothing to submit. Enter the day's production, or — if the run didn't finish — leave it at zero and write in the notes what happened.",
    };
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

/* ------------------------------------------------------------------ *
 * Vendor packet — what a sub must supply before they can be given work.
 * ------------------------------------------------------------------ */

export type VendorPacketInput = {
  legalName: string;
  dba: string;
  entityType: string;
  stateOfIncorporation: string;
  ein: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  phone: string;
  signatoryName: string;
  signatoryTitle: string;
  apContactName: string;
  apEmail: string;
  apPhone: string;
  mobilePhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  billingContactName: string;
  billingContactTitle: string;
  billingEmail: string;
  billingMobile: string;
  billingOfficePhone: string;
  billingMailingAddress: string;
  paymentMethod: string;
  paymentTerms: string;
  remittanceEmail: string;
  contractorLicense: string;
  dotNumber: string;
  locateCert: string;
  emr: string;
  oshaRecordables: string;
  safetyContact: string;
  references: { company: string; contact: string; phone: string; email: string }[];
};

const clean = (v: string | undefined) => (v ?? "").trim();

/** "12-3456789" or "123456789" -> "12-3456789". Blank stays blank. */
function normalizeEin(raw: string): string {
  const digits = clean(raw).replace(/\D/g, "");
  if (digits.length !== 9) return clean(raw);
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/**
 * A subcontractor filling in their own packet, or staff completing it for them.
 *
 * Only the last four of a bank account are accepted. Anything longer is
 * truncated rather than rejected, because a sub who pastes a full account
 * number should not have it stored while they work out what went wrong —
 * dropping it quietly is the safe failure here, and the voided-check upload is
 * what AP actually uses.
 */
export async function saveVendorPacket(subcontractorId: string, input: VendorPacketInput) {
  await assertOwnSubcontractor(subcontractorId);

  if (!clean(input.legalName)) {
    return { ok: false as const, error: "Legal business name is required — it has to match your W-9." };
  }

  const emr = Number.parseFloat(clean(input.emr));
  const osha = Number.parseInt(clean(input.oshaRecordables), 10);

  await prisma.subcontractor.update({
    where: { id: subcontractorId },
    data: {
      legalName: clean(input.legalName),
      dba: clean(input.dba),
      entityType: clean(input.entityType),
      stateOfIncorporation: clean(input.stateOfIncorporation),
      ein: normalizeEin(input.ein),
      website: clean(input.website),
      addressLine1: clean(input.addressLine1),
      addressLine2: clean(input.addressLine2),
      city: clean(input.city),
      stateRegion: clean(input.stateRegion),
      postalCode: clean(input.postalCode),
      phone: clean(input.phone),
      signatoryName: clean(input.signatoryName),
      signatoryTitle: clean(input.signatoryTitle),
      apContactName: clean(input.apContactName),
      apEmail: clean(input.apEmail),
      apPhone: clean(input.apPhone),
      mobilePhone: clean(input.mobilePhone),
      emergencyContactName: clean(input.emergencyContactName),
      emergencyContactPhone: clean(input.emergencyContactPhone),
      billingContactName: clean(input.billingContactName),
      billingContactTitle: clean(input.billingContactTitle),
      billingEmail: clean(input.billingEmail),
      billingMobile: clean(input.billingMobile),
      billingOfficePhone: clean(input.billingOfficePhone),
      billingMailingAddress: clean(input.billingMailingAddress),
      paymentMethod: clean(input.paymentMethod),
      paymentTerms: clean(input.paymentTerms) || 'Net 21',
      remittanceEmail: clean(input.remittanceEmail),
      contractorLicense: clean(input.contractorLicense),
      dotNumber: clean(input.dotNumber),
      locateCert: clean(input.locateCert),
      emr: Number.isFinite(emr) ? emr : null,
      oshaRecordables: Number.isFinite(osha) ? osha : null,
      safetyContact: clean(input.safetyContact),
      references: (input.references ?? [])
        .filter((r) => clean(r.company))
        .map((r) => ({
          company: clean(r.company),
          contact: clean(r.contact),
          phone: clean(r.phone),
          email: clean(r.email),
        })) as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/subcontractors");
  revalidatePath("/settings");
  return { ok: true as const };
}

/**
 * Read a crew's packet for the review panel. Staff, or that crew themselves —
 * the same authorisation the page uses, applied again here because this is
 * reachable independently of the page that renders it.
 */
export async function getVendorPacketFor(subcontractorId: string) {
  await assertOwnSubcontractor(subcontractorId);
  const packet = await getVendorPacket(subcontractorId);
  return packet ? { ok: true as const, packet } : { ok: false as const, packet: null };
}

/* ------------------------------------------------------------------ *
 * Document centre — upload and file access.
 * ------------------------------------------------------------------ */

const DOC_TYPES = new Set([
  "NDA", "MASTER_SUBCONTRACTOR_AGREEMENT", "PROJECT_SUBCONTRACTOR_AGREEMENT",
  "SUBCONTRACTOR_RATE_CARD", "CHANGE_ORDER", "PURCHASE_ORDER", "CUSTOMER_CONTRACT",
  "WORK_AUTHORIZATION", "INSURANCE_REQUEST", "W9_REQUEST", "LIEN_WAIVER",
  "SAFETY_FORM", "EMPLOYMENT_DOCUMENT", "VENDOR_AGREEMENT", "CLOSEOUT", "CUSTOM",
]);

/**
 * Record a file the browser has already put in storage.
 *
 * The upload itself goes straight from the browser to the store so a 40 MB
 * scanned agreement isn't squeezed through a serverless request body. This
 * action is what makes it a *document*: it creates the record, its first
 * version, the file row and the opening audit entry, in one transaction so a
 * half-made document can't exist.
 */
export async function registerUploadedDocument(input: {
  storageKey: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  title?: string;
  type?: string;
  projectId?: string;
  subcontractorId?: string;
  customerId?: string;
}) {
  const user = await requireStaff();

  const key = (input.storageKey ?? "").trim();
  if (!key) return { ok: false as const, error: "Nothing was uploaded." };

  const rejection = describeFileRejection(input.mime ?? "", input.sizeBytes ?? 0);
  if (rejection) return { ok: false as const, error: rejection };

  const type = DOC_TYPES.has(input.type ?? "") ? (input.type as string) : "CUSTOM";
  const title =
    (input.title ?? "").trim() ||
    (input.fileName ?? "Untitled").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() ||
    "Untitled document";

  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        title,
        type: type as never,
        status: "DRAFT",
        createdBy: user.id,
        ownerId: user.id,
        projectId: input.projectId || null,
        subcontractorId: input.subcontractorId || null,
        customerId: input.customerId || null,
      },
    });

    // An uploaded file is version 1. Its body is empty because the content is
    // the file itself until somebody converts it into an editable template.
    const version = await tx.documentVersion.create({
      data: {
        documentId: created.id,
        versionNo: 1,
        changeReason: "Uploaded",
        createdBy: user.id,
      },
    });

    const file = await tx.documentFile.create({
      data: {
        documentId: created.id,
        versionId: version.id,
        kind: "original_upload",
        storageKey: key,
        fileName: input.fileName ?? "",
        mime: input.mime ?? "",
        sizeBytes: input.sizeBytes ?? 0,
        uploadedBy: user.id,
        scanStatus: "not_scanned",
      },
    });

    await tx.document.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });

    await tx.documentAuditEvent.create({
      data: {
        documentId: created.id,
        versionId: version.id,
        action: "document.uploaded",
        actorUserId: user.id,
        actorEmail: user.email,
        detail: { fileName: input.fileName, sizeBytes: input.sizeBytes, fileId: file.id },
      },
    });

    return created;
  });

  revalidatePath("/documents");
  return { ok: true as const, id: doc.id };
}

/** Soft-delete. Legal records are never removed outright. */
export async function archiveDocument(id: string) {
  const user = await requireStaff();
  const doc = await prisma.document.findUnique({ where: { id }, select: { status: true } });
  if (!doc) return { ok: false as const, error: "Document not found." };
  if (doc.status === "EXECUTED") {
    return {
      ok: false as const,
      error: "An executed document can't be archived — supersede it with a new version instead.",
    };
  }

  await prisma.document.update({ where: { id }, data: { archivedAt: new Date(), status: "ARCHIVED" } });
  await prisma.documentAuditEvent.create({
    data: { documentId: id, action: "document.archived", actorUserId: user.id, actorEmail: user.email },
  });
  revalidatePath("/documents");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Invoicing — approved production, priced and sent, and the money back.
 * ------------------------------------------------------------------ */

/**
 * Stage every uninvoiced approved daily into weekly draft invoices.
 *
 * Only approved dailies bill. Submitted, in-review, flagged and denied work is
 * production nobody has stood behind yet, and invoicing it is how a contractor
 * ends up issuing credits.
 *
 * A daily bills once: its id is on the line it produced, so a second run finds
 * it already invoiced and skips it rather than double-billing the customer.
 *
 * Codes with no rate on the card are reported back, never billed at zero — a
 * silent zero is an invoice that is quietly short.
 */
export async function generateInvoices(customerId: string) {
  await requireStaff();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true, name: true, shortCode: true,
      retainagePct: true, paymentTerms: true,
      rates: {
        select: {
          code: true, description: true, unit: true,
          rate: true, effectiveDate: true, expirationDate: true,
        },
      },
    },
  });
  if (!customer) return { ok: false as const, error: "Customer not found." };
  if (customer.rates.length === 0) {
    return { ok: false as const, error: "No rate card on this customer — nothing can be priced." };
  }

  const projects = await prisma.project.findMany({
    where: { OR: [{ customerId: customer.id }, { client: customer.name }] },
    select: { id: true, name: true },
  });
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) return { ok: false as const, error: "No projects for this customer." };

  // Everything already on an invoice, so a rerun cannot bill it twice.
  const invoiced = new Set(
    (
      await prisma.invoiceLine.findMany({
        where: { dailyId: { not: "" }, invoice: { customerId: customer.id } },
        select: { dailyId: true },
      })
    ).map((l) => l.dailyId),
  );

  const dailies = await prisma.daily.findMany({
    where: { projectId: { in: projectIds }, status: "Approved" },
    select: { id: true, projectId: true, projectName: true, workDate: true, lineItems: true },
    orderBy: { workDate: "asc" },
  });

  const billable = dailies.filter((d) => !invoiced.has(d.id));
  if (billable.length === 0) {
    return { ok: false as const, error: "No approved dailies waiting to be billed." };
  }

  /** Group by the project and the week the work fell in. */
  const batches = new Map<
    string,
    {
      projectId: string | null;
      projectName: string;
      start: string;
      end: string;
      dailies: typeof billable;
    }
  >();
  const undated: string[] = [];

  for (const d of billable) {
    const week = weekOf(d.workDate);
    if (!week) {
      // No work date means no billing period. Report it rather than filing it
      // into whatever week today happens to be.
      undated.push(d.id);
      continue;
    }
    const key = `${d.projectId ?? ""}|${week.start}`;
    const batch = batches.get(key) ?? {
      projectId: d.projectId,
      projectName: d.projectName,
      start: week.start,
      end: week.end,
      dailies: [] as typeof billable,
    };
    batch.dailies.push(d);
    batches.set(key, batch);
  }

  const terms = daysFromTerms(customer.paymentTerms);
  const unpricedCodes = new Set<string>();
  let created = 0;
  let staged = 0;

  for (const batch of batches.values()) {
    const lines: {
      dailyId: string; workDate: string; code: string; description: string;
      unit: string; quantity: number; rate: number; amount: number;
    }[] = [];

    for (const d of batch.dailies) {
      // Roll the daily's own line items up by code before pricing, so one
      // sheet reporting a code twice bills as one line at one rate.
      const byCode = new Map<string, number>();
      const items = Array.isArray(d.lineItems) ? (d.lineItems as unknown[]) : [];
      for (const raw of items) {
        const li = raw as { code?: unknown; quantity?: unknown };
        if (typeof li?.code !== "string" || !li.code.trim()) continue;
        const qty = typeof li.quantity === "number" ? li.quantity : 0;
        byCode.set(li.code.trim(), (byCode.get(li.code.trim()) ?? 0) + qty);
      }

      // Priced at the card in force on the work date, not today's card.
      const priced = priceQuantities(
        [...byCode.entries()].map(([code, quantity]) => ({ code, quantity })),
        customer.rates,
        d.workDate,
      );
      for (const u of priced.unpriced) unpricedCodes.add(u.code);

      for (const l of priced.lines) {
        lines.push({
          dailyId: d.id,
          workDate: d.workDate,
          code: l.code,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          rate: l.rate,
          amount: Math.round(l.amount * 100) / 100,
        });
      }
    }

    if (lines.length === 0) continue;

    const money = invoiceMoney(
      lines.reduce((s, l) => s + l.amount, 0),
      customer.retainagePct,
    );

    // Number by customer and period end. A collision with a concurrent run
    // bumps the suffix rather than failing the whole batch.
    const stamp = batch.end.replace(/-/g, "");
    let saved = false;
    for (let n = 1; n <= 50 && !saved; n++) {
      try {
        await prisma.invoice.create({
          data: {
            number: `${customer.shortCode}-${stamp}-${String(n).padStart(2, "0")}`,
            customerId: customer.id,
            projectId: batch.projectId,
            projectName: batch.projectName,
            periodStart: batch.start,
            periodEnd: batch.end,
            status: "DRAFT",
            subtotal: money.subtotal,
            retainagePct: customer.retainagePct,
            retainageHeld: money.retainageHeld,
            amountDue: money.amountDue,
            dueAt: terms !== null ? new Date(`${addDays(batch.end, terms)}T00:00:00Z`) : null,
            lines: { create: lines },
          },
        });
        saved = true;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }
    if (!saved) continue;

    created++;
    staged += lines.length;
  }

  revalidatePath("/invoicing");
  revalidatePath("/customers");
  return {
    ok: true as const,
    created,
    lines: staged,
    undated: undated.length,
    unpriced: [...unpricedCodes],
  };
}

/** Send a draft. From here the figures are what the customer has seen. */
export async function issueInvoice(id: string) {
  await requireStaff();
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
  if (!inv) return { ok: false as const, error: "Invoice not found." };
  if (inv.status !== "DRAFT") return { ok: false as const, error: "Only a draft can be sent." };

  await prisma.invoice.update({
    where: { id },
    data: { status: "SENT", issuedAt: new Date() },
  });
  revalidatePath("/invoicing");
  revalidatePath("/customers");
  return { ok: true as const };
}

/**
 * Record money received.
 *
 * The invoice's status follows the money: partly covered is PARTIAL, covered is
 * PAID. Nothing infers payment from age, and a payment never edits the invoice's
 * own figures — what was billed and what was paid stay separate records.
 */
export async function recordPayment(
  invoiceId: string,
  input: { amount: number; receivedOn: string; method?: string; reference?: string; note?: string },
) {
  await requireStaff();

  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, error: "Enter an amount greater than zero." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn?.trim() ?? "")) {
    return { ok: false as const, error: "Enter the date the money landed." };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, amountDue: true, payments: { select: { amount: true } } },
  });
  if (!invoice) return { ok: false as const, error: "Invoice not found." };
  if (invoice.status === "DRAFT") {
    return { ok: false as const, error: "Send the invoice before recording a payment against it." };
  }
  if (invoice.status === "VOID") {
    return { ok: false as const, error: "That invoice is void." };
  }

  await prisma.payment.create({
    data: {
      invoiceId,
      amount,
      receivedOn: input.receivedOn.trim(),
      method: input.method?.trim() ?? "",
      reference: input.reference?.trim() ?? "",
      note: input.note?.trim() ?? "",
    },
  });

  const after = balanceOf(invoice.amountDue, [...invoice.payments, { amount }]);
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: after.settled ? "PAID" : "PARTIAL" },
  });

  revalidatePath("/invoicing");
  revalidatePath("/customers");
  return { ok: true as const, balance: after.balance };
}

/** Remove a payment entered in error, and put the invoice back where it belongs. */
export async function deletePayment(id: string) {
  await requireStaff();
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: { invoiceId: true },
  });
  if (!payment) return { ok: false as const, error: "Payment not found." };

  await prisma.payment.delete({ where: { id } });

  const invoice = await prisma.invoice.findUnique({
    where: { id: payment.invoiceId },
    select: { amountDue: true, status: true, payments: { select: { amount: true } } },
  });
  if (invoice && invoice.status !== "VOID") {
    const after = balanceOf(invoice.amountDue, invoice.payments);
    await prisma.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        status: after.settled ? "PAID" : invoice.payments.length > 0 ? "PARTIAL" : "SENT",
      },
    });
  }

  revalidatePath("/invoicing");
  revalidatePath("/customers");
  return { ok: true as const };
}

/**
 * Void an invoice, with the reason on the record.
 *
 * Voiding rather than deleting: the number was issued, and an invoice that
 * vanishes leaves a hole in the sequence nobody can explain later. The dailies
 * it covered are released so the work can be billed again correctly.
 */
export async function voidInvoice(id: string, reason: string) {
  await requireStaff();
  if (!reason.trim()) return { ok: false as const, error: "A void needs a reason on the record." };

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { status: true, payments: { select: { id: true } } },
  });
  if (!invoice) return { ok: false as const, error: "Invoice not found." };
  if (invoice.payments.length > 0) {
    return {
      ok: false as const,
      error: "Money has been received against this invoice — remove the payments first.",
    };
  }

  await prisma.invoice.update({
    where: { id },
    data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim() },
  });
  await prisma.invoiceLine.updateMany({ where: { invoiceId: id }, data: { dailyId: "" } });

  revalidatePath("/invoicing");
  revalidatePath("/customers");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Direct rate-sheet upload — drop the signed sheet, get a rate card.
 * ------------------------------------------------------------------ */

/**
 * Read a rate sheet straight onto a card, no review queue.
 *
 * The import screen exists for documents that need a human to check what was
 * read. A signed rate sheet is not one of them: it is a two-column price table,
 * and the parser reads it deterministically off the PDF's own text layer or the
 * spreadsheet's own cells — no AI, so nothing to second-guess.
 *
 * Codes replace by code rather than piling up. Uploading a revised sheet should
 * leave the card matching the sheet, not the sheet plus every prior version of
 * it, and rates that only existed on the old sheet are reported so a rate that
 * quietly disappeared is visible rather than assumed dropped on purpose.
 */
export async function uploadRateSheet(formData: FormData) {
  await requireStaff();

  const file = formData.get("file") as File | null;
  const subcontractorId = String(formData.get("subcontractorId") || "");
  const customerId = String(formData.get("customerId") || "");

  if (!file) return { ok: false as const, error: "Choose a file." };
  if (!subcontractorId && !customerId) {
    return { ok: false as const, error: "No card to load these onto." };
  }
  if (file.size > MAX_DOC_BYTES) {
    return { ok: false as const, error: "File is over 10 MB." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let parsed: { code: string; rate: number; description?: string; unit?: string }[] = [];

  if (name.endsWith(".pdf")) {
    const text = await pdfTextLayer(buf);
    if (!text) {
      return {
        ok: false as const,
        error: "That PDF has no text layer — it's a scan. Send it through the rate-import screen, which can read images.",
      };
    }
    parsed = parseRateSheet(text);
  } else if (/\.(xlsx|xls|csv)$/.test(name)) {
    // A spreadsheet already has its columns; find the code and the price
    // rather than guessing by position, because these sheets are hand-made and
    // the column order is never the same twice.
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const keyFor = (row: Record<string, unknown>, want: RegExp) =>
      Object.keys(row).find((k) => want.test(k.trim()));

    for (const row of rows) {
      const codeKey = keyFor(row, /^(code|unit ?code|item|cwi)$/i);
      const rateKey = keyFor(row, /^(rate|price|amount|unit ?price|sub ?rate)$/i);
      if (!codeKey || !rateKey) continue;
      const code = String(row[codeKey] ?? "").trim();
      const rate = Number(String(row[rateKey] ?? "").replace(/[$,]/g, ""));
      if (!code || !Number.isFinite(rate)) continue;
      const descKey = keyFor(row, /^(description|desc|work)$/i);
      const unitKey = keyFor(row, /^(unit|uom)$/i);
      parsed.push({
        code,
        rate,
        description: descKey ? String(row[descKey] ?? "").trim() : "",
        unit: unitKey ? String(row[unitKey] ?? "").trim() : "",
      });
    }
    if (parsed.length === 0) {
      return {
        ok: false as const,
        error: "Couldn't find a code column and a rate column in that spreadsheet.",
      };
    }
  } else {
    return { ok: false as const, error: "Upload a PDF, XLSX or CSV." };
  }

  if (parsed.length === 0) {
    return { ok: false as const, error: "No priced rows found in that file." };
  }

  const codes = parsed.map((r) => r.code);
  let added = 0;
  let changed = 0;
  let same = 0;
  const moved: string[] = [];

  if (subcontractorId) {
    const existing = await prisma.subcontractorRate.findMany({
      where: { subcontractorId },
      select: { id: true, code: true, rate: true, unit: true, description: true },
    });
    const byCode = new Map(existing.map((r) => [r.code.toUpperCase(), r]));

    for (const r of parsed) {
      const prior = byCode.get(r.code.toUpperCase());
      if (!prior) {
        await prisma.subcontractorRate.create({
          data: {
            subcontractorId,
            code: r.code,
            description: r.description ?? "",
            unit: r.unit ?? "",
            rate: r.rate,
            source: "upload",
          },
        });
        added++;
        continue;
      }
      if (prior.rate !== r.rate) {
        moved.push(`${r.code}: ${prior.rate} → ${r.rate}`);
        changed++;
      } else same++;
      await prisma.subcontractorRate.update({
        where: { id: prior.id },
        data: {
          rate: r.rate,
          unit: r.unit || prior.unit,
          description: r.description || prior.description,
          source: "upload",
        },
      });
    }
  } else {
    const existing = await prisma.customerRate.findMany({
      where: { customerId },
      select: { id: true, code: true, rate: true, unit: true, description: true },
    });
    const byCode = new Map(existing.map((r) => [r.code.toUpperCase(), r]));

    for (const r of parsed) {
      const prior = byCode.get(r.code.toUpperCase());
      if (!prior) {
        await prisma.customerRate.create({
          data: {
            customerId,
            code: r.code,
            description: r.description ?? "",
            unit: r.unit ?? "",
            rate: r.rate,
            source: "upload",
          },
        });
        added++;
        continue;
      }
      if (prior.rate !== r.rate) {
        moved.push(`${r.code}: ${prior.rate} → ${r.rate}`);
        changed++;
      } else same++;
      await prisma.customerRate.update({
        where: { id: prior.id },
        data: {
          rate: r.rate,
          unit: r.unit || prior.unit,
          description: r.description || prior.description,
          source: "upload",
        },
      });
    }
  }

  revalidatePath("/subcontractors");
  revalidatePath("/customers");
  return {
    ok: true as const,
    fileName: file.name,
    parsed: parsed.length,
    added,
    changed,
    same,
    // Cap the list — a sheet that revises hundreds of rates should say so,
    // not print an unreadable wall.
    moved: moved.slice(0, 12),
    moreMoved: Math.max(0, moved.length - 12),
    codes: codes.length,
  };
}

/* ------------------------------------------------------------------ *
 * Project photos — timestamped, located field record.
 * ------------------------------------------------------------------ */

/**
 * Record a photo or video that has already been uploaded to Blob.
 *
 * The client does the upload (Blob direct, so a phone video isn't capped by the
 * serverless body limit) and hands back the URL plus what it observed at the
 * moment of capture. This writes the record and decides nothing it wasn't told:
 * a location arrives with a source, or it doesn't arrive.
 */
export async function saveProjectPhoto(input: {
  projectId: string;
  url: string;
  mediaType: string;
  sizeBytes: number;
  kind: "PHOTO" | "VIDEO";
  source: "CAMERA" | "LIBRARY";
  capturedAt?: string | null;
  capturedAtSource?: string;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  locationSource?: string;
  caption?: string;
  purpose?: "RECORD" | "DIRECTION";
}) {
  const user = await requireUser();
  await assertProjectAccess(input.projectId);

  if (!input.url.trim()) return { ok: false as const, error: "No file was uploaded." };

  // A coordinate is only stored with a stated origin. Anything else is a
  // number on a record that nobody can account for later.
  const hasFix =
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng) &&
    Math.abs(input.lat) <= 90 &&
    Math.abs(input.lng) <= 180 &&
    (input.locationSource === "device" || input.locationSource === "exif");

  const captured = input.capturedAt ? new Date(input.capturedAt) : null;

  const photo = await prisma.projectPhoto.create({
    data: {
      projectId: input.projectId,
      url: input.url,
      mediaType: input.mediaType || "",
      sizeBytes: Math.max(0, Math.round(input.sizeBytes || 0)),
      kind: input.kind === "VIDEO" ? "VIDEO" : "PHOTO",
      source: input.source === "CAMERA" ? "CAMERA" : "LIBRARY",
      capturedAt: captured && !Number.isNaN(captured.getTime()) ? captured : null,
      capturedAtSource: input.capturedAtSource ?? "",
      lat: hasFix ? input.lat : null,
      lng: hasFix ? input.lng : null,
      accuracyM: hasFix && typeof input.accuracyM === "number" ? input.accuracyM : null,
      locationSource: hasFix ? (input.locationSource as string) : "",
      caption: input.caption?.trim() ?? "",
      purpose: input.purpose === "DIRECTION" ? "DIRECTION" : "RECORD",
      uploadedBy: user.name || user.email,
    },
  });

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true as const, id: photo.id };
}

/**
 * Edit what a photo is for, or what it shows.
 *
 * The caption and the purpose are the only editable parts. Where and when it
 * was taken are observations, not opinions — letting those be retyped would
 * turn the record into something nobody can rely on.
 */
export async function updateProjectPhoto(
  id: string,
  patch: { caption?: string; purpose?: "RECORD" | "DIRECTION" },
) {
  const photo = await prisma.projectPhoto.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!photo) return { ok: false as const, error: "Photo not found." };
  await requireUser();
  await assertProjectAccess(photo.projectId);

  await prisma.projectPhoto.update({
    where: { id },
    data: {
      ...(patch.caption != null ? { caption: patch.caption.trim() } : {}),
      ...(patch.purpose ? { purpose: patch.purpose } : {}),
    },
  });
  revalidatePath(`/projects/${photo.projectId}`);
  return { ok: true as const };
}

/** Staff only — a crew should not be able to remove evidence of the work. */
export async function deleteProjectPhoto(id: string) {
  await requireStaff();
  const photo = await prisma.projectPhoto.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!photo) return { ok: false as const, error: "Photo not found." };

  await prisma.projectPhoto.delete({ where: { id } });
  revalidatePath(`/projects/${photo.projectId}`);
  return { ok: true as const };
}

/**
 * Read the time and place out of an uploaded image's own EXIF.
 *
 * Only for files chosen from the library. A photo from the camera roll was
 * taken somewhere else at some other time, and stamping it with where the phone
 * is now would put a coordinate on the record that never had anything to do
 * with the picture.
 */
export async function readPhotoExif(formData: FormData) {
  await requireUser();
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false as const, error: "No file." };

  // The metadata lives in the first APP1 segment, so a slice is enough — no
  // reason to pull a phone video's worth of bytes through a server action.
  const head = Buffer.from(await file.slice(0, 256 * 1024).arrayBuffer());
  const facts = readExif(new Uint8Array(head));

  return {
    ok: true as const,
    capturedAt: facts.capturedAt ? facts.capturedAt.toISOString() : null,
    lat: facts.lat,
    lng: facts.lng,
  };
}

/* ------------------------------------------------------------------ *
 * Invites — the only way into onboarding.
 * ------------------------------------------------------------------ */

/**
 * Mint a real invite for a project.
 *
 * The link used to be assembled in the browser — `${projectId}-${nonce}` — and
 * never written down, so nothing could tell a genuine invitation from a string
 * somebody typed. That left the whole onboarding flow open: create a crew
 * record, then write to it, with no invitation involved at all.
 *
 * A token is now issued server-side from a CSPRNG and stored, which is what
 * lets the rest of the flow prove a caller was actually invited and to which
 * job — before they have any login to check.
 */
export async function createInvite(input: {
  projectId: string;
  email?: string;
}) {
  await requireStaff();

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true, client: true },
  });
  if (!project) return { ok: false as const, error: "Pick a project for this invite." };

  // 32 bytes of CSPRNG, url-safe. Guessing one is not a threat model.
  const token = randomBytes(32).toString("base64url");

  await prisma.invite.create({
    data: {
      token,
      projectId: project.id,
      projectName: project.name,
      customer: project.client,
      email: input.email?.trim() || null,
    },
  });

  return { ok: true as const, token };
}

/* ------------------------------------------------------------------ *
 * Project pay rates — what a job is budgeted to cost, before a crew.
 * ------------------------------------------------------------------ */

/**
 * Set what this job is budgeted to pay on one code.
 *
 * Separate from a subcontractor's card on purpose. That is what a company
 * signed and is what they get paid; this is a plan, used to cost a job the day
 * the material list lands rather than waiting for someone to be assigned.
 * Keeping them apart is what stops a budget figure becoming an invoice figure.
 */
export async function setProjectRate(
  projectId: string,
  input: { code: string; rate: number; description?: string; unit?: string },
) {
  await requireStaff();
  await assertProjectAccess(projectId);

  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false as const, error: "Unit code is required." };
  if (!Number.isFinite(input.rate) || input.rate < 0) {
    return { ok: false as const, error: "Enter a rate of zero or more." };
  }

  await prisma.projectRate.upsert({
    where: { projectId_code: { projectId, code } },
    create: {
      projectId,
      code,
      rate: input.rate,
      description: input.description ?? "",
      unit: input.unit ?? "",
    },
    update: { rate: input.rate },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/customers");
  return { ok: true as const };
}

/** Drop a budgeted rate, so the code reports unpriced rather than at zero. */
export async function deleteProjectRate(projectId: string, code: string) {
  await requireStaff();
  await assertProjectAccess(projectId);
  await prisma.projectRate.deleteMany({
    where: { projectId, code: code.trim().toUpperCase() },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/customers");
  return { ok: true as const };
}

/**
 * Copy a crew's whole signed card onto this job as its budget.
 *
 * The usual starting point: budget the job at what the crew you expect to use
 * already charges, then move the lines that differ.
 */
export async function copyRatesToProject(projectId: string, subcontractorId: string) {
  await requireStaff();
  await assertProjectAccess(projectId);

  const rates = await prisma.subcontractorRate.findMany({
    where: { subcontractorId },
    select: { code: true, description: true, unit: true, rate: true },
  });
  if (rates.length === 0) return { ok: false as const, error: "That crew has no rates on file." };

  let written = 0;
  for (const r of rates) {
    const code = r.code.trim().toUpperCase();
    if (!code) continue;
    await prisma.projectRate.upsert({
      where: { projectId_code: { projectId, code } },
      create: { projectId, code, rate: r.rate, description: r.description, unit: r.unit },
      update: { rate: r.rate },
    });
    written++;
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/customers");
  return { ok: true as const, count: written };
}
