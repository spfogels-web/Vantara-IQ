"use server";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { hashPassword, isStaff, setSessionCookie, signSession } from "@/lib/auth";
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
  isLabourOrEquipmentCode,
  isLinearFootageCode,
  isMainBillableCode,
} from "@/lib/unit-codes";
import { checkFooting, dailyImportReady, extractDailySheet } from "@/lib/daily-import";
import { askOps, opsChatReady } from "@/lib/ops-chat";
import { packetStatus } from "@/lib/vendor-packet";
import { readExif } from "@/lib/exif";
import { notifyCrew, notifyStaff } from "@/lib/notify";
import { askAboutLocates, locateChatReady, parseLocateText } from "@/lib/locate-chat";
import { getLocateTickets } from "@/data/queries";
import {
  FAST_PAY_DAYS,
  FAST_PAY_FEE_PCT,
  FAST_PAY_METHOD,
  canElectFastPay,
  fastPayQuote,
} from "@/lib/fast-pay";
import { balanceOf } from "@/lib/billing";
import { badgeReadiness } from "@/lib/badge";
import {
  canStoreBankDetails,
  decryptField,
  encryptField,
  isValidRouting,
  last4,
} from "@/lib/field-crypto";
import {
  fileApprovedDaily,
  recalcInvoice,
  unfileDaily,
  type FileResult,
  type UnfileResult,
} from "@/lib/auto-invoice";
import {
  fileApprovedDailyForSub,
  recalcSubInvoice,
  unfileDailyForSub,
  type SubFileResult,
  type SubUnfileResult,
} from "@/lib/sub-pay";
import { describeFileRejection } from "@/lib/document-storage";
import { getCrewBadges, getCustomerRollup, getSubInvoices, getVendorPacket } from "@/data/queries";
import {
  assertOwnSubcontractor,
  assertProjectAccess,
  requireStaff,
  requireUser,
  assertSubcontractorWrite,
  bindInviteToSubcontractor,
  viewer,
  NotAuthorizedError,
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
/**
 * Delete a subcontractor.
 *
 * Two different things used to be treated as one. A project *assignment* is
 * bookkeeping — it can be undone as part of the delete. Approved dailies and
 * pay statements are billing history, and removing the crew they name would
 * leave the books referring to somebody who no longer exists. Only the second
 * is a real refusal; the first just needs saying out loud first.
 *
 * Call without `confirm` to find out what the delete would take with it. The
 * login goes too — `User.subcontractorId` is optional, so Postgres would
 * otherwise null it and leave an account able to sign in with no crew.
 */
export async function deleteSubcontractor(id: string, confirm?: boolean) {
  await requireStaff();
  const sub = await prisma.subcontractor.findUnique({
    where: { id },
    select: { company: true, projects: { select: { name: true } } },
  });
  if (!sub) return { ok: false as const, error: "Subcontractor not found." };

  const [approvedDailies, payStatements] = await Promise.all([
    prisma.daily.count({ where: { subcontractor: sub.company, status: "Approved" } }),
    prisma.subInvoice.count({ where: { subcontractorId: id } }),
  ]);
  if (approvedDailies > 0 || payStatements > 0) {
    const parts = [
      approvedDailies > 0 ? `${approvedDailies} approved dail${approvedDailies === 1 ? "y" : "ies"}` : null,
      payStatements > 0 ? `${payStatements} pay statement${payStatements === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return {
      ok: false as const,
      error: `${sub.company} has ${parts.join(" and ")} on the books. Deleting would leave those records naming a crew that no longer exists. Mark them inactive instead.`,
    };
  }

  const projects = sub.projects.map((p) => p.name.trim()).filter(Boolean);
  if (projects.length > 0 && !confirm) {
    return {
      ok: false as const,
      needsConfirm: true as const,
      projects,
      error: `${sub.company} is assigned to ${projects.join(" and ")}. Deleting removes them from ${
        projects.length === 1 ? "that job" : "those jobs"
      } and deletes their login.`,
    };
  }

  const [logins] = await prisma.$transaction([
    prisma.user.deleteMany({ where: { subcontractorId: id } }),
    prisma.subcontractor.delete({ where: { id } }),
  ]);
  revalidatePath("/subcontractors");
  revalidatePath("/projects");
  return { ok: true as const, removedLogins: logins.count };
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
    method: r.method,
  }));
}

/**
 * Which machine a crew bores with, and setting it.
 *
 * A rate card prints the same bore code twice — one price for a missile or
 * stick, another for a drill — and expects whoever reads it to know which crew
 * is which. Nothing in a lookup can know that, so it is recorded against the
 * crew once and every bore they file is priced from it. Without it the two
 * rows are indistinguishable and the rate matched is whichever came back first.
 */
export async function getCrewBoreMethod(subcontractorId: string) {
  await assertOwnSubcontractor(subcontractorId);
  const crew = await prisma.subcontractor.findUnique({
    where: { id: subcontractorId },
    select: { boreMethod: true },
  });
  return crew?.boreMethod ?? null;
}

export async function setCrewBoreMethod(
  subcontractorId: string,
  method: "MISSILE" | "DRILL" | null,
) {
  await requireStaff();
  await prisma.subcontractor.update({
    where: { id: subcontractorId },
    data: { boreMethod: method },
  });
  revalidatePath("/subcontractors");
  revalidatePath("/invoicing");
  return { ok: true as const };
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
  /** What they typed on the account step. Without it there is no login. */
  password?: string;
}) {
  /**
   * The link is the invitation, and it stays open.
   *
   * It used to be spent by the first crew that registered, which meant putting
   * three crews on a job took three links and sending the wrong one got two of
   * them an error. One link per project now, reusable, because that is how
   * somebody actually invites a job's crews.
   *
   * What replaces single-use as the authorization is the session below: the
   * crew is signed in the moment their account exists, so every later step
   * proves who it is the same way the rest of the app does. Registering is not
   * access — a new crew lands in PENDING_REVIEW and can be assigned nothing
   * until Fortitude approves them.
   */
  const invite = input.inviteToken
    ? await prisma.invite.findUnique({
        where: { token: input.inviteToken },
        select: { token: true },
      })
    : null;
  if (!invite) return { ok: false as const, error: "This invitation link is not valid." };

  /**
   * An email can front exactly one login.
   *
   * Checked before anything is written. Creating the crew and then quietly
   * skipping the login leaves a record nobody can sign in to and no hint as to
   * why: the crew believes they registered, and the office sees a company that
   * never comes back.
   */
  const wantedEmail = input.email.trim().toLowerCase();
  if (wantedEmail) {
    const taken = await prisma.user.findUnique({
      where: { email: wantedEmail },
      select: { id: true },
    });
    if (taken) {
      return {
        ok: false as const,
        error: `${input.email.trim()} already has an account. Sign in with it, or register this crew under a different email.`,
      };
    }
  }

  // The work-eligibility gate. A crew cannot be given a job until every one of
  // these is satisfied — the NDA sits here beside the subcontract because both
  // have to be signed before any of it starts, not chased afterwards.
  // Workers' comp is not listed separately. The certificate asked for covers
  // general liability and workers' comp together, so a second line for it only
  // ever restated the first — and could be missing while the document proving
  // it sat on file.
  const compliance = [
    { label: "General liability COI", status: "missing", expires: "—", daysOut: null },
    { label: "W-9", status: "missing", expires: "—", daysOut: null },
    { label: "Master subcontract", status: "missing", expires: "—", daysOut: null },
    { label: "Mutual NDA", status: "missing", expires: "—", daysOut: null },
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

  /**
   * Create the login they just set a password for.
   *
   * The form asked for a password, checked it was eight characters, and threw
   * it away — the crew finished onboarding believing they had an account and
   * then could not sign in. Everything in the portal, including their own
   * documents, was unreachable until somebody noticed and made a login by hand.
   *
   * Failing to create it must not lose the onboarding: the record and its
   * documents are the valuable part, and staff can always issue a login.
   */
  let loginCreated = false;
  const email = input.email.trim().toLowerCase();
  if (input.password && input.password.length >= 8 && email) {
    try {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!existing) {
        const user = await prisma.user.create({
          data: {
            email,
            name: input.name.trim() || input.company.trim(),
            passwordHash: await hashPassword(input.password),
            role: "SUBCONTRACTOR",
            subcontractorId: sub.id,
          },
          select: { id: true },
        });
        loginCreated = true;

        /**
         * Sign them in here, not at the end.
         *
         * This is what makes a reusable invite link safe. From this point the
         * rest of onboarding — capabilities, the agreement, documents, badges —
         * is authorised by their own session, which names exactly one company
         * and cannot be forwarded to anyone else. The link only ever gets
         * somebody as far as creating an account.
         *
         * It also means they land in their portal already signed in rather
         * than being asked to log in with the password they set ninety seconds
         * ago.
         */
        await setSessionCookie(await signSession({ userId: user.id, role: "SUBCONTRACTOR" }));
      }
    } catch {
      // A duplicate email is the common case and is not fatal here.
    }
  }

  return { ok: true as const, id: sub.id, loginCreated };
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
  const crewName = await prisma.subcontractor.findUnique({
    where: { id: subcontractorId },
    select: { company: true },
  });
  await notifyStaff({
    title: `${crewName?.company ?? "A crew"} uploaded a document`,
    detail: `${section} — ${file.name}`,
    href: "/subcontractors",
    category: "compliance",
    tone: "info",
    actor: uploadedBy,
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
      url: `/api/sub-document/${doc.id}`,
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
    // A link, not the file. These are stored as base64, so returning every
    // one shipped megabytes to draw a list of filenames — the bytes come
    // through the route when somebody actually opens one.
    url: `/api/sub-document/${d.id}`,
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

/**
 * Uploads a project map when the browser could not reach Blob directly.
 *
 * This still stores the file in Blob and keeps only the URL on the project. It
 * used to inline the whole PDF as base64 into two columns, which put megabytes
 * on the row — and every screen that lists jobs reads those rows. Inlining is
 * now the last resort for a local environment with no Blob token at all, and it
 * is capped, because a map on the row is a cost the field pays on every load.
 */
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

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`project-maps/${projectId}/map.${isPdf ? "pdf" : "img"}`, buf, {
      access: "public",
      contentType: mediaType,
      addRandomSuffix: true,
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { mapUrl: blob.url, mapOriginalUrl: blob.url },
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, dataUrl: blob.url };
  }

  if (buf.length > 512 * 1024) {
    return {
      ok: false as const,
      error: "Blob storage is not configured, so maps over 512 KB cannot be stored.",
    };
  }
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

  /**
   * A material list replaces the job's list. It does not merge into it.
   *
   * Replacing only the codes the new list happened to mention left every row
   * from a previous push standing. Thompson rd ended up carrying Charles
   * Hart's whole list underneath its own — thirteen rows at Charles Hart's
   * quantities — and read $68,214.81 against a real value near $7,500. Nothing
   * on screen looked wrong, because every individual figure was right.
   *
   * Rows added by hand (no source import) survive; they were not part of any
   * list and nobody asked for them to be replaced.
   */
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
    where: {
      projectId,
      OR: [
        // Everything any list put here, including a list since deleted.
        { sourceImportId: { not: "" } },
        // And any hand-added row this list also names, so one code cannot
        // appear twice at two quantities.
        { code: { in: codes } },
      ],
    },
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
  /** Staff only: the crew this sheet is being typed up for. */
  filedForId?: string | null;
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

  const actor = await viewer();

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
    // Only staff may say who a sheet is for. A subcontractor filing their own
    // is identified by their login, and letting the form carry a crew id would
    // let one company file production against another.
    ...(actor && isStaff(actor.role) ? { filedForId: input.filedForId || null } : {}),
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

  // Which company this day belongs to, which decides whose pay statement it
  // becomes. A subcontractor is always their own company — the account is the
  // authority and nothing on the form can override it, or one crew could file
  // production against another. Staff may nominate the crew they are typing it
  // up for, and are filing self-perform work when they do not.
  const submitter = await requireUser();
  let filedBy: string;
  if (submitter.subcontractorName) {
    filedBy = submitter.subcontractorName;
  } else {
    const filedFor = sheet.filedForId
      ? await prisma.subcontractor.findUnique({
          where: { id: sheet.filedForId },
          select: { company: true },
        })
      : null;
    filedBy = filedFor?.company ?? "Fortitude Self-Perform";
  }

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
      // Feet are feet. A pedestal, a ground rod and an ant-control unit are
      // each counted in ones, and adding them to a footage total inflates the
      // day by however many of them the crew set — which then flows into pace,
      // percent complete and every production figure downstream. Only plow and
      // bore advance the route, and only those are counted here.
      totalFt: Math.round(
        lineItems
          .filter((l) => isLinearFootageCode(l.code))
          .reduce((s, l) => s + l.quantity, 0),
      ),
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

  /**
   * No photos, no approval.
   *
   * Approving is what turns a daily into money — it bills the customer and it
   * puts the crew on a pay statement. Doing that on a sheet with no evidence
   * behind it means claiming footage nobody can show, which is exactly the
   * claim that gets queried months later when the photos no longer exist.
   *
   * A crew can still file without them: submitting is not the problem, and a
   * dead phone should not stop the day being recorded. They add the photos
   * afterwards — the sheet stays open for that even though its numbers lock.
   */
  if (input.decision === "APPROVED") {
    const sheet = await prisma.dailySheet.findFirst({
      where: { dailyId: input.dailyId },
      select: { photos: true },
    });
    const count = Array.isArray(sheet?.photos) ? (sheet.photos as unknown[]).length : 0;
    if (count === 0) {
      return {
        ok: false as const,
        error:
          "No field photos on this daily. Ask the crew to add them — the sheet stays open for photos after it's filed — then approve it.",
      };
    }
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

  /**
   * Approval is the moment work becomes billable, so it is the moment it
   * lands on a bill.
   *
   * Filing is reported, never silent, and never fatal: a daily carrying a code
   * with no rate on the customer's card is still approved work, and refusing
   * the approval over it would leave the crew unpaid to protect an invoice.
   * The approval stands and the reason comes back for someone to act on.
   */
  let billing: FileResult | UnfileResult | null = null;
  let crewPay: SubFileResult | SubUnfileResult | null = null;
  if (input.decision === "APPROVED") {
    // Both sides of the same event: what the customer is billed, and what the
    // crew is owed. They are separate records because the difference between
    // them is our margin, and a crew reaches one and never the other.
    billing = await fileApprovedDaily(daily.id);
    crewPay = await fileApprovedDailyForSub(daily.id);
  } else {
    // Denied work cannot sit on either. It comes off a draft; anything already
    // issued needs a credit or a conversation, not a quiet edit.
    billing = await unfileDaily(daily.id);
    crewPay = await unfileDailyForSub(daily.id);
  }

  // Tell the crew what happened to the day they filed. A denial they find out
  // about a week later is a week of the same mistake repeated.
  const filingCrew = daily.subcontractor?.trim()
    ? await prisma.subcontractor.findFirst({
        where: { company: daily.subcontractor.trim() },
        select: { id: true },
      })
    : null;
  if (filingCrew) {
    await notifyCrew(filingCrew.id, {
      title:
        input.decision === "APPROVED"
          ? `${daily.projectName} — ${daily.workDate} approved`
          : `${daily.projectName} — ${daily.workDate} sent back`,
      detail:
        input.decision === "APPROVED"
          ? "It will appear on your next pay statement."
          : input.note.trim() || "Check the sheet and file it again.",
      href: "/dailies",
      category: "daily",
      tone: input.decision === "APPROVED" ? "success" : "critical",
      actor: input.reviewedBy,
    });
  }

  revalidatePath("/dailies");
  revalidatePath("/invoicing");
  revalidatePath("/customers");
  if (daily.projectId) revalidatePath(`/projects/${daily.projectId}`);
  return { ok: true as const, billing, crewPay };
}

/**
 * Put a decided daily back in review — a reviewer can change their mind.
 *
 * Refused when the work is already on an invoice the customer has. Reopening
 * would take it out of "approved" while the figure stays on their bill, and
 * the two records would disagree from then on. Void or credit that invoice
 * first; the reviewer is told which one.
 */
export async function reopenDailyReview(dailyId: string) {
  await requireStaff();

  const pulled = await unfileDaily(dailyId);
  if (!pulled.ok) {
    return {
      ok: false as const,
      error: `This work is on ${pulled.blockedBy}, which has been sent. Void or credit that invoice before reopening it.`,
    };
  }

  const daily = await prisma.daily.update({
    where: { id: dailyId },
    data: { status: "In review", tone: "warning", reviewNote: "", reviewedBy: "", reviewedAt: "" },
  });
  revalidatePath("/dailies");
  revalidatePath("/invoicing");
  revalidatePath("/customers");
  if (daily.projectId) revalidatePath(`/projects/${daily.projectId}`);
  return { ok: true as const, removedFrom: pulled.removedFrom };
}

/**
 * Throw away a sheet — a test, a duplicate, a file that read back as nonsense.
 *
 * Drafts only. A submitted sheet is the paper behind a filed daily, and
 * deleting it would leave that daily with production nobody can trace back to
 * a form. Deleting the daily is the way to undo a filed day, and that releases
 * its sheet back to a draft, which can then be deleted here if it deserves it.
 */
export async function deleteDailySheet(id: string, confirm?: boolean) {
  await requireStaff();

  const sheet = await prisma.dailySheet.findUnique({
    where: { id },
    select: {
      id: true,
      projectName: true,
      workDate: true,
      status: true,
      dailyId: true,
      laborRows: true,
    },
  });
  if (!sheet) return { ok: false as const, error: "Sheet not found." };

  if (sheet.status === "SUBMITTED" || sheet.dailyId) {
    return {
      ok: false as const,
      error:
        "This sheet has been filed, so it is the record behind a daily. Delete the daily instead — that releases this sheet back to a draft, and it can be deleted from here afterwards.",
    };
  }

  const rows = (Array.isArray(sheet.laborRows) ? sheet.laborRows : []) as {
    cells?: string[];
  }[];
  const filled = rows.filter((r) => (r.cells ?? []).some((c) => c?.trim())).length;

  if (!confirm) {
    return {
      ok: false as const,
      needsConfirm: true as const,
      error:
        `Delete this draft${sheet.projectName ? ` for ${sheet.projectName}` : ""}` +
        `${sheet.workDate ? ` dated ${sheet.workDate}` : ""}?` +
        (filled > 0 ? ` It has ${filled} row${filled === 1 ? "" : "s"} of production on it.` : "") +
        " Nothing has been billed from it and this cannot be undone.",
    };
  }

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
 * Catch up any approved dailies that aren't on an invoice yet.
 *
 * Approval files work automatically now, so this is a backfill rather than the
 * main path: dailies approved before that existed, ones whose customer had no
 * rate card at the time, and anything that failed to file for a reason since
 * fixed. Running it when there is nothing outstanding is a no-op.
 *
 * It goes through exactly the same filing as approval does, so a daily cannot
 * be billed twice and the invoice it lands on is the same one either way.
 */
export async function generateInvoices(customerId: string) {
  await requireStaff();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, rates: { select: { id: true }, take: 1 } },
  });
  if (!customer) return { ok: false as const, error: "Customer not found." };
  if (customer.rates.length === 0) {
    return { ok: false as const, error: "No rate card on this customer — nothing can be priced." };
  }

  const projects = await prisma.project.findMany({
    where: { OR: [{ customerId: customer.id }, { client: customer.name }] },
    select: { id: true },
  });
  if (projects.length === 0) return { ok: false as const, error: "No projects for this customer." };

  const dailies = await prisma.daily.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, status: "Approved" },
    select: { id: true },
    orderBy: { workDate: "asc" },
  });

  const invoices = new Set<string>();
  const unpriced = new Set<string>();
  const skipped: string[] = [];
  let filed = 0;
  let lines = 0;

  for (const d of dailies) {
    const res = await fileApprovedDaily(d.id);
    if (res.ok) {
      filed++;
      lines += res.lines ?? 0;
      if (res.invoiceNumber) invoices.add(res.invoiceNumber);
      for (const c of res.unpriced ?? []) unpriced.add(c);
      continue;
    }
    // "Already on X" is the normal case on a rerun, not a problem to report.
    if (res.reason && !res.reason.startsWith("Already on")) skipped.push(res.reason);
    for (const c of res.unpriced ?? []) unpriced.add(c);
  }

  revalidatePath("/invoicing");
  revalidatePath("/customers");

  if (filed === 0) {
    return {
      ok: false as const,
      error: skipped.length
        ? `Nothing new to bill. ${skipped[0]}`
        : "Nothing new to bill — every approved daily is already on an invoice.",
    };
  }

  return {
    ok: true as const,
    created: invoices.size,
    filed,
    lines,
    skipped: skipped.length,
    unpriced: [...unpriced],
  };
}

/** Send a draft. From here the figures are what the customer has seen. */
/* ---- Invoice lines: reviewing and correcting a draft --------------------- */

export type InvoiceLineRow = {
  id: string;
  dailyId: string;
  workDate: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  /** Produced by a rule rather than typed — currently the depth adder. */
  derived: boolean;
};

/**
 * The lines on one invoice, for review before it goes out.
 *
 * Loaded when an invoice is opened rather than with the list — the list draws
 * totals, and pulling every line of every invoice to render a table of sums is
 * how a page that opens instantly stops doing so.
 */
export async function getInvoiceLines(invoiceId: string): Promise<{
  status: string;
  editable: boolean;
  lines: InvoiceLineRow[];
}> {
  await requireStaff();
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      status: true,
      lines: { orderBy: [{ workDate: "asc" }, { code: "asc" }] },
    },
  });
  if (!inv) return { status: "", editable: false, lines: [] };

  return {
    status: inv.status,
    // Only a draft. Everything from SENT on is a figure the customer has seen.
    editable: inv.status === "DRAFT",
    lines: inv.lines.map((l) => ({
      id: l.id,
      dailyId: l.dailyId,
      workDate: l.workDate,
      code: l.code,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      rate: l.rate,
      amount: l.amount,
      derived: l.derived,
    })),
  };
}

export type InvoiceCostCrew = {
  subInvoiceId: string | null;
  number: string;
  company: string;
  status: string;
  /** Their price for the dailies that are on this invoice, at their own card. */
  cost: number;
  dailyCount: number;
  /** Fast pay reduces what actually leaves the bank; shown, not silently netted. */
  fastPay: boolean;
  fastPayFeePct: number;
  /** The rate card(s) these lines were priced from, recorded at pricing time. */
  cards: string[];
  /**
   * Codes where the rate on this statement no longer matches the crew's card.
   * Either the card was changed after pricing or the wrong one was attached —
   * both mean somebody is about to be paid the wrong amount.
   */
  drift: { code: string; paidRate: number; cardRate: number | null }[];
  /** Codes their card lists more than once, so the rate matched is a coin flip. */
  ambiguous: string[];
};

export type InvoiceCost = {
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  crews: InvoiceCostCrew[];
  /**
   * Dailies on this invoice with nothing priced against them yet, and why.
   * These are the reason a margin can be wrong, so they are never folded in.
   */
  uncosted: { dailyId: string; workDate: string; crew: string; revenue: number; reason: string }[];
  /** False when anything is uncosted — the margin below is then incomplete. */
  complete: boolean;
};

/**
 * What this invoice costs us, and therefore what it makes.
 *
 * Matched on the daily rather than on the week. Both sides of the job — what
 * Fortitude bills Globe and what Fortitude pays the crew — are built from the
 * same reported day, so the daily id is the only link that stays true when a
 * crew's pay period and a customer's billing period do not line up, or when one
 * statement covers dailies that ended up on two different invoices.
 *
 * A daily with no crew pricing behind it is listed rather than counted as free.
 * Treating an uncosted day as zero cost is how a job reads as pure profit right
 * up until the crew invoices for it.
 */
export async function getInvoiceCost(invoiceId: string): Promise<InvoiceCost> {
  await requireStaff();

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { lines: { select: { dailyId: true, amount: true } } },
  });
  const empty: InvoiceCost = {
    revenue: 0, cost: 0, margin: 0, marginPct: null,
    crews: [], uncosted: [], complete: true,
  };
  if (!invoice) return empty;

  const revenueByDaily = new Map<string, number>();
  let revenue = 0;
  for (const l of invoice.lines) {
    revenue += l.amount;
    if (l.dailyId) revenueByDaily.set(l.dailyId, (revenueByDaily.get(l.dailyId) ?? 0) + l.amount);
  }
  const dailyIds = [...revenueByDaily.keys()];
  if (dailyIds.length === 0) {
    return { ...empty, revenue, margin: revenue, complete: invoice.lines.length === 0 };
  }

  const subLines = await prisma.subInvoiceLine.findMany({
    where: { dailyId: { in: dailyIds } },
    select: {
      dailyId: true,
      amount: true,
      code: true,
      rate: true,
      sourceCard: true,
      invoice: {
        select: {
          id: true, number: true, status: true,
          fastPay: true, fastPayFeePct: true,
          subcontractorId: true,
          subcontractor: { select: { company: true } },
        },
      },
    },
  });

  const byStatement = new Map<
    string,
    InvoiceCostCrew & {
      dailies: Set<string>;
      cardSet: Set<string>;
      subcontractorId: string;
      priced: Map<string, number>;
    }
  >();
  const costedDailies = new Set<string>();
  let cost = 0;

  for (const l of subLines) {
    const inv = l.invoice;
    costedDailies.add(l.dailyId);
    cost += l.amount;
    const entry = byStatement.get(inv.id) ?? {
      subInvoiceId: inv.id,
      number: inv.number,
      company: inv.subcontractor.company,
      status: inv.status,
      cost: 0,
      dailyCount: 0,
      fastPay: inv.fastPay,
      fastPayFeePct: inv.fastPayFeePct,
      cards: [],
      drift: [],
      ambiguous: [],
      dailies: new Set<string>(),
      cardSet: new Set<string>(),
      subcontractorId: inv.subcontractorId,
      priced: new Map<string, number>(),
    };
    entry.cost += l.amount;
    entry.dailies.add(l.dailyId);
    if (l.sourceCard) entry.cardSet.add(l.sourceCard);
    entry.priced.set(l.code, l.rate);
    byStatement.set(inv.id, entry);
  }

  // Check each statement back against the card the crew is on today. A rate
  // that has moved since pricing, or a code the card lists twice, is how
  // somebody gets paid the wrong amount without anyone typing a wrong number.
  for (const entry of byStatement.values()) {
    const [card, crewRow] = await Promise.all([
      prisma.subcontractorRate.findMany({
        where: { subcontractorId: entry.subcontractorId },
        select: { code: true, rate: true, method: true },
      }),
      prisma.subcontractor.findUnique({
        where: { id: entry.subcontractorId },
        select: { boreMethod: true },
      }),
    ]);

    // Narrow to the rates this crew is actually eligible for before judging
    // anything ambiguous. A code printed twice for two machines is not
    // ambiguous once you know which machine they run.
    const method = crewRow?.boreMethod ?? null;
    const eligible = card.filter((r) => !r.method || r.method === method);

    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    for (const r of eligible) {
      if (seen.has(r.code) && seen.get(r.code) !== r.rate) dupes.add(r.code);
      else seen.set(r.code, r.rate);
    }
    entry.cards = [...entry.cardSet];
    entry.ambiguous = [...dupes].filter((c) => entry.priced.has(c));
    entry.drift = [...entry.priced.entries()]
      .map(([code, paidRate]) => ({ code, paidRate, cardRate: seen.get(code) ?? null }))
      .filter((d) => d.cardRate === null || Math.abs(d.cardRate - d.paidRate) > 0.0001);
  }

  // Anything still unpriced: say which day, whose it is, and what is blocking it.
  const missingIds = dailyIds.filter((id) => !costedDailies.has(id));
  const missing = missingIds.length
    ? await prisma.daily.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, workDate: true, subcontractor: true },
      })
    : [];

  const uncosted = await Promise.all(
    missing.map(async (d) => {
      const company = d.subcontractor?.trim() ?? "";
      let reason = "No pay statement raised for this day yet.";
      if (!company) {
        reason = "The daily names no crew, so there is nobody to price it against.";
      } else {
        const crew = await prisma.subcontractor.findFirst({
          where: { company },
          select: { _count: { select: { rates: true } } },
        });
        if (!crew) reason = `No crew on file called "${company}".`;
        else if (crew._count.rates === 0) reason = `${company} has no signed rate card.`;
      }
      return {
        dailyId: d.id,
        workDate: d.workDate,
        crew: company || "—",
        revenue: revenueByDaily.get(d.id) ?? 0,
        reason,
      };
    }),
  );

  const margin = revenue - cost;
  return {
    revenue,
    cost,
    margin,
    marginPct: revenue > 0 ? margin / revenue : null,
    crews: [...byStatement.values()]
      // Built field by field: the working sets above are bookkeeping for this
      // function and have no business crossing to a client.
      .map((c) => ({
        subInvoiceId: c.subInvoiceId,
        number: c.number,
        company: c.company,
        status: c.status,
        cost: c.cost,
        dailyCount: c.dailies.size,
        fastPay: c.fastPay,
        fastPayFeePct: c.fastPayFeePct,
        cards: c.cards,
        drift: c.drift,
        ambiguous: c.ambiguous,
      }))
      .sort((a, b) => b.cost - a.cost),
    uncosted,
    complete: uncosted.length === 0,
  };
}

/** A draft can be corrected; anything the customer has seen cannot. */
async function assertDraft(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, number: true },
  });
  if (!inv) return { ok: false as const, error: "Invoice not found." };
  if (inv.status !== "DRAFT") {
    return {
      ok: false as const,
      error: `${inv.number} has already been sent. Void it and raise a new one rather than editing a figure the customer has seen.`,
    };
  }
  return { ok: true as const };
}

/**
 * Correct one line.
 *
 * The amount is worked out here from quantity and rate rather than accepted
 * from the caller — a total that does not equal its own quantity times its own
 * rate is the one thing an invoice must never do, and that is not a rule worth
 * trusting a browser with.
 */
export async function updateInvoiceLine(
  lineId: string,
  patch: {
    code?: string;
    description?: string;
    unit?: string;
    quantity?: number;
    rate?: number;
    workDate?: string;
  },
) {
  await requireStaff();
  const line = await prisma.invoiceLine.findUnique({
    where: { id: lineId },
    select: { invoiceId: true, quantity: true, rate: true },
  });
  if (!line) return { ok: false as const, error: "Line not found." };

  const guard = await assertDraft(line.invoiceId);
  if (!guard.ok) return guard;

  const quantity = patch.quantity ?? line.quantity;
  const rate = patch.rate ?? line.rate;
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false as const, error: "Quantity has to be zero or more." };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { ok: false as const, error: "Rate has to be zero or more." };
  }

  await prisma.invoiceLine.update({
    where: { id: lineId },
    data: {
      ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit.trim() } : {}),
      ...(patch.workDate !== undefined ? { workDate: patch.workDate.trim() } : {}),
      quantity,
      rate,
      amount: Math.round(quantity * rate * 100) / 100,
    },
  });
  await recalcInvoice(line.invoiceId);

  revalidatePath("/invoicing");
  return { ok: true as const };
}

/**
 * Add a line by hand.
 *
 * Carries no daily id, which is the honest record: this is work the office put
 * on the bill, not production a crew reported. Anything with a daily id behind
 * it can be traced back to a signed sheet, and a hand-added line should not be
 * able to pretend it can.
 */
export async function addInvoiceLine(
  invoiceId: string,
  input: { code: string; description?: string; unit?: string; quantity: number; rate: number; workDate?: string },
) {
  await requireStaff();
  const guard = await assertDraft(invoiceId);
  if (!guard.ok) return guard;

  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false as const, error: "A unit code is needed." };
  const quantity = Number(input.quantity);
  const rate = Number(input.rate);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false as const, error: "Quantity has to be zero or more." };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { ok: false as const, error: "Rate has to be zero or more." };
  }

  await prisma.invoiceLine.create({
    data: {
      invoiceId,
      dailyId: "",
      workDate: input.workDate?.trim() ?? "",
      code,
      description: input.description?.trim() ?? "",
      unit: input.unit?.trim() ?? "",
      quantity,
      rate,
      amount: Math.round(quantity * rate * 100) / 100,
    },
  });
  await recalcInvoice(invoiceId);

  revalidatePath("/invoicing");
  return { ok: true as const };
}

/**
 * Take a line off.
 *
 * Removing a line that came from a daily frees that daily to be billed again —
 * the daily id on the line is what marks it as already invoiced, so taking the
 * line away is what puts the work back in the queue rather than losing it.
 */
export async function deleteInvoiceLine(lineId: string) {
  await requireStaff();
  const line = await prisma.invoiceLine.findUnique({
    where: { id: lineId },
    select: { invoiceId: true, code: true, dailyId: true },
  });
  if (!line) return { ok: false as const, error: "Line not found." };

  const guard = await assertDraft(line.invoiceId);
  if (!guard.ok) return guard;

  await prisma.invoiceLine.delete({ where: { id: lineId } });
  await recalcInvoice(line.invoiceId);

  revalidatePath("/invoicing");
  return {
    ok: true as const,
    // Worth saying out loud — otherwise it looks like the work vanished.
    freedDaily: Boolean(line.dailyId),
  };
}

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

  // One link per project, reused. Minting a fresh token every time the dialog
  // opened left a trail of live links nobody could account for, and made
  // inviting three crews look like three different things to send.
  const open = await prisma.invite.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
    select: { token: true },
  });
  if (open) return { ok: true as const, token: open.token };

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

/**
 * Set or clear the contract completion date.
 *
 * Everything schedule-related hangs off this: required pace, projected finish,
 * whether the job is behind. Clearing it removes those figures rather than
 * leaving stale ones on screen, because a required pace against a date nobody
 * is working to is worse than no figure.
 */
export async function setProjectDeadline(projectId: string, deadline: string) {
  await requireStaff();
  await assertProjectAccess(projectId);

  const value = deadline.trim();
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false as const, error: "Enter the date as YYYY-MM-DD." };
  }

  await prisma.project.update({ where: { id: projectId }, data: { deadline: value } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Yard badges — who is cleared to collect material.
 * ------------------------------------------------------------------ */

/** Identity photos are images, and a phone camera shot is a couple of MB. */
const MAX_BADGE_BYTES = 8 * 1024 * 1024;

/** Add or rename a person on the pickup list. */
export async function saveCrewBadge(input: {
  id?: string;
  subcontractorId: string;
  personName: string;
  phone?: string;
  licenseExpires?: string;
  inviteToken?: string;
}) {
  await assertSubcontractorWrite(input.subcontractorId, input.inviteToken);

  const personName = input.personName.trim();
  if (!personName) return { ok: false as const, error: "Whose badge is this?" };
  const expires = (input.licenseExpires ?? "").trim();
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    return { ok: false as const, error: "Enter the licence expiry as YYYY-MM-DD." };
  }

  if (input.id) {
    const existing = await prisma.crewBadge.findUnique({
      where: { id: input.id },
      select: { subcontractorId: true },
    });
    if (!existing || existing.subcontractorId !== input.subcontractorId) {
      return { ok: false as const, error: "That badge belongs to another crew." };
    }
    await prisma.crewBadge.update({
      where: { id: input.id },
      data: { personName, phone: input.phone?.trim() ?? "", licenseExpires: expires },
    });
    revalidatePath("/subcontractors");
    revalidatePath("/badges");
  revalidatePath("/company");
    return { ok: true as const, id: input.id };
  }

  const badge = await prisma.crewBadge.create({
    data: {
      subcontractorId: input.subcontractorId,
      personName,
      phone: input.phone?.trim() ?? "",
      licenseExpires: expires,
    },
    select: { id: true },
  });
  revalidatePath("/subcontractors");
  revalidatePath("/badges");
  revalidatePath("/company");
  return { ok: true as const, id: badge.id };
}

/**
 * Attach a photo of an identity document.
 *
 * Held in the database rather than the Blob store. Blob is public-read here —
 * unguessable URLs and no access control — which is fine for a photo of a
 * pedestal and not fine for somebody's Social Security card. This row is only
 * ever reachable through a query that has already checked who is asking.
 *
 * One document per kind: re-uploading a licence front replaces it, so a stale
 * image cannot sit alongside its replacement and be shown at the gate.
 */
export async function uploadBadgeDocument(formData: FormData) {
  const badgeId = String(formData.get("badgeId") || "");
  const kind = String(formData.get("kind") || "");
  const inviteToken = String(formData.get("inviteToken") || "") || null;
  const file = formData.get("file") as File | null;

  if (!file || !badgeId || !kind) return { ok: false as const, error: "Missing file." };
  if (!["LICENSE_FRONT", "LICENSE_BACK", "SSN_CARD", "PASSPORT"].includes(kind)) {
    return { ok: false as const, error: "Unknown document type." };
  }
  if (file.size > MAX_BADGE_BYTES) {
    return { ok: false as const, error: "That image is over 8 MB — take it again at a lower size." };
  }
  // Images only. A PDF of a licence is unusual enough that it is more likely a
  // mistake, and refusing keeps this to one thing the viewer can render.
  const mediaType = file.type || "";
  if (!mediaType.startsWith("image/")) {
    return { ok: false as const, error: "Upload a photo — JPG, PNG or HEIC." };
  }

  const badge = await prisma.crewBadge.findUnique({
    where: { id: badgeId },
    select: { subcontractorId: true, status: true },
  });
  if (!badge) return { ok: false as const, error: "Badge not found." };
  await assertSubcontractorWrite(badge.subcontractorId, inviteToken);

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${mediaType};base64,${buf.toString("base64")}`;
  const actor = await viewer();

  await prisma.badgeDocument.upsert({
    where: { badgeId_kind: { badgeId, kind: kind as never } },
    create: {
      badgeId,
      kind: kind as never,
      fileName: file.name,
      mediaType,
      sizeBytes: file.size,
      dataUrl,
      uploadedBy: actor ? actor.name || actor.email : "subcontractor",
    },
    update: {
      fileName: file.name,
      mediaType,
      sizeBytes: file.size,
      dataUrl,
      uploadedBy: actor ? actor.name || actor.email : "subcontractor",
    },
  });

  // A badge that was already decided goes back in the queue when its documents
  // change — otherwise a cleared badge could quietly acquire a different licence.
  if (badge.status === "APPROVED" || badge.status === "REJECTED") {
    await prisma.crewBadge.update({ where: { id: badgeId }, data: { status: "SUBMITTED" } });
  }

  revalidatePath("/subcontractors");
  revalidatePath("/badges");
  revalidatePath("/company");
  return { ok: true as const };
}

export async function deleteBadgeDocument(id: string, inviteToken?: string) {
  const doc = await prisma.badgeDocument.findUnique({
    where: { id },
    select: { badge: { select: { subcontractorId: true } } },
  });
  if (!doc) return { ok: false as const, error: "Not found." };
  await assertSubcontractorWrite(doc.badge.subcontractorId, inviteToken ?? null);

  await prisma.badgeDocument.delete({ where: { id } });
  revalidatePath("/subcontractors");
  revalidatePath("/badges");
  revalidatePath("/company");
  return { ok: true as const };
}

/** Send a badge for review, once the documents are actually on file. */
export async function submitCrewBadge(id: string, inviteToken?: string) {
  const badge = await prisma.crewBadge.findUnique({
    where: { id },
    select: {
      subcontractorId: true,
      licenseExpires: true,
      documents: { select: { kind: true } },
    },
  });
  if (!badge) return { ok: false as const, error: "Badge not found." };
  await assertSubcontractorWrite(badge.subcontractorId, inviteToken ?? null);

  const ready = badgeReadiness(badge.documents, badge.licenseExpires);
  if (!ready.complete) {
    return { ok: false as const, error: `Still needed: ${ready.missing.join(", ")}.` };
  }

  await prisma.crewBadge.update({ where: { id }, data: { status: "SUBMITTED" } });
  revalidatePath("/subcontractors");
  revalidatePath("/badges");
  revalidatePath("/company");
  return { ok: true as const };
}

/**
 * Fortitude's decision on a badge.
 *
 * Staff only, and a refusal or revocation carries a reason — a crew told "no"
 * with no explanation cannot fix anything, and the yard needs to know why
 * somebody who used to be on the list is not.
 */
export async function reviewCrewBadge(
  id: string,
  decision: "APPROVED" | "REJECTED" | "REVOKED",
  note = "",
) {
  const user = await requireStaff();
  if (decision !== "APPROVED" && !note.trim()) {
    return { ok: false as const, error: "Say why, so the crew can fix it." };
  }

  const badge = await prisma.crewBadge.findUnique({
    where: { id },
    select: { licenseExpires: true, documents: { select: { kind: true } } },
  });
  if (!badge) return { ok: false as const, error: "Badge not found." };

  if (decision === "APPROVED") {
    const ready = badgeReadiness(badge.documents, badge.licenseExpires);
    if (!ready.complete) {
      return { ok: false as const, error: `Cannot clear this badge — ${ready.missing.join(", ")}.` };
    }
  }

  await prisma.crewBadge.update({
    where: { id },
    data: {
      status: decision,
      reviewNote: note.trim(),
      reviewedBy: user.name || user.email,
      reviewedAt: new Date(),
    },
  });
  revalidatePath("/subcontractors");
  revalidatePath("/badges");
  revalidatePath("/company");
  return { ok: true as const };
}

/** Remove a badge and the identity documents behind it. */
export async function deleteCrewBadge(id: string, inviteToken?: string) {
  const badge = await prisma.crewBadge.findUnique({
    where: { id },
    select: { subcontractorId: true },
  });
  if (!badge) return { ok: false as const, error: "Badge not found." };
  await assertSubcontractorWrite(badge.subcontractorId, inviteToken ?? null);

  await prisma.crewBadge.delete({ where: { id } });
  revalidatePath("/subcontractors");
  revalidatePath("/badges");
  revalidatePath("/company");
  return { ok: true as const };
}

/** Badges for one crew, for the office panel. Staff-or-own inside. */
export async function listCrewBadges(subcontractorId: string) {
  return getCrewBadges(subcontractorId);
}


/* ------------------------------------------------------------------ *
 * ACH authorisation — where a crew's money goes.
 * ------------------------------------------------------------------ */

export interface AchView {
  legalName: string; dba: string; ein: string;
  addressLine1: string; addressLine2: string;
  city: string; stateRegion: string; postalCode: string;
  phone: string; email: string;
  bankName: string; bankAddressLine1: string;
  bankCity: string; bankStateRegion: string; bankPostalCode: string;
  accountType: string;
  /** Masked. The real numbers never leave the server. */
  accountLast4: string;
  routingLast4: string;
  signerName: string; signerTitle: string;
  signatureDataUrl: string;
  signedDate: string;
  submittedAt: string | null;
  /**
   * Name of the voided cheque or statement on file. The file itself is not
   * pulled here — this screen only needs to know that one exists.
   */
  proofFileName: string | null;
  /** False when the environment has no key, so the form can say why. */
  canStore: boolean;
}

/**
 * The authorisation on file, with the account and routing numbers masked.
 *
 * Deliberately never returns them. There is no screen that needs an account
 * number displayed — reconciling a remittance takes the last four, and paying
 * takes a decryption at the point of payment, not a value sitting in a page
 * somebody might screenshot.
 */
export async function getAchAuthorization(subcontractorId: string): Promise<AchView | null> {
  await assertOwnSubcontractor(subcontractorId);

  const row = await prisma.achAuthorization.findUnique({ where: { subcontractorId } });
  if (!row) return null;

  // Name only. The image is megabytes of base64 and nothing on this screen
  // draws it — knowing one is on file is the whole question.
  const proof = await prisma.subDocument.findFirst({
    where: { subcontractorId, section: "payment" },
    orderBy: { createdAt: "desc" },
    select: { fileName: true },
  });

  return {
    legalName: row.legalName, dba: row.dba, ein: row.ein,
    addressLine1: row.addressLine1, addressLine2: row.addressLine2,
    city: row.city, stateRegion: row.stateRegion, postalCode: row.postalCode,
    phone: row.phone, email: row.email,
    bankName: row.bankName, bankAddressLine1: row.bankAddressLine1,
    bankCity: row.bankCity, bankStateRegion: row.bankStateRegion,
    bankPostalCode: row.bankPostalCode,
    accountType: row.accountType,
    accountLast4: row.accountLast4,
    routingLast4: row.routingLast4,
    signerName: row.signerName, signerTitle: row.signerTitle,
    signatureDataUrl: row.signatureDataUrl,
    signedDate: row.signedDate,
    submittedAt: row.submittedAt?.toISOString().slice(0, 10) ?? null,
    proofFileName: proof?.fileName ?? null,
    canStore: canStoreBankDetails(),
  };
}

/**
 * Save a signed ACH authorisation.
 *
 * The bank numbers are encrypted before they touch the database and only their
 * last four are kept in the clear. If the environment has no key, this refuses
 * rather than storing them in plaintext — a missing key is a configuration
 * problem, and writing the account number anyway to keep the form working
 * would turn it into a permanent one.
 *
 * Blank bank numbers on an existing record mean "leave what's there", so
 * correcting a typo in the address does not require re-entering the account.
 */
export async function saveAchAuthorization(input: {
  subcontractorId: string;
  inviteToken?: string;
  legalName: string; dba?: string; ein: string;
  addressLine1: string; addressLine2?: string;
  city: string; stateRegion: string; postalCode: string;
  phone?: string; email?: string;
  bankName: string; bankAddressLine1?: string;
  bankCity?: string; bankStateRegion?: string; bankPostalCode?: string;
  accountType: string;
  /** Blank keeps whatever is already stored. */
  accountNumber?: string;
  routingNumber?: string;
  signerName: string; signerTitle?: string;
  signatureDataUrl: string;
  signedDate: string;
}) {
  await assertSubcontractorWrite(input.subcontractorId, input.inviteToken);

  const existing = await prisma.achAuthorization.findUnique({
    where: { subcontractorId: input.subcontractorId },
    select: { id: true, accountNumberEnc: true, routingNumberEnc: true, accountLast4: true, routingLast4: true },
  });

  const required: [string, string | undefined][] = [
    ["Legal business name", input.legalName],
    ["EIN", input.ein],
    ["Street address", input.addressLine1],
    ["City", input.city],
    ["State", input.stateRegion],
    ["ZIP", input.postalCode],
    ["Bank name", input.bankName],
    ["Name of the person signing", input.signerName],
    ["Signature", input.signatureDataUrl],
    ["Date", input.signedDate],
  ];
  const missing = required.filter(([, v]) => !v?.trim()).map(([label]) => label);
  if (missing.length) {
    return { ok: false as const, error: `Still needed: ${missing.join(", ")}.` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.signedDate.trim())) {
    return { ok: false as const, error: "Enter the date as YYYY-MM-DD." };
  }

  const account = (input.accountNumber ?? "").replace(/\s|-/g, "");
  const routing = (input.routingNumber ?? "").replace(/\s|-/g, "");

  // Both are required on a first submission; on an edit, blank keeps the
  // stored value so a typo elsewhere doesn't mean re-keying the account.
  if (!existing && (!account || !routing)) {
    return { ok: false as const, error: "Account number and routing number are both needed." };
  }

  // A routing number carries a check digit, so a typo in it is caught here. An
  // account number carries nothing of the sort, and the only thing that catches
  // a transposed digit is the picture it was copied from — so a first
  // submission has to have one. An edit does not: it is already on file.
  if (!existing) {
    const proof = await prisma.subDocument.count({
      where: { subcontractorId: input.subcontractorId, section: "payment" },
    });
    if (proof === 0) {
      return {
        ok: false as const,
        error:
          "Add a photo of a voided check or a screenshot of your account and wire details first — we check the typed numbers against it before paying.",
      };
    }
  }
  if (account && !/^\d{4,17}$/.test(account)) {
    return { ok: false as const, error: "An account number is 4 to 17 digits." };
  }
  if (routing && !isValidRouting(routing)) {
    return {
      ok: false as const,
      error: "That routing number isn't valid — it's nine digits and the check digit doesn't match. Worth reading it off a cheque again.",
    };
  }

  if ((account || routing) && !canStoreBankDetails()) {
    return {
      ok: false as const,
      error: "Bank details can't be stored on this environment yet — the encryption key isn't set. Everything else on the form saves.",
    };
  }

  const data = {
    subcontractorId: input.subcontractorId,
    legalName: input.legalName.trim(),
    dba: input.dba?.trim() ?? "",
    ein: input.ein.trim(),
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2?.trim() ?? "",
    city: input.city.trim(),
    stateRegion: input.stateRegion.trim(),
    postalCode: input.postalCode.trim(),
    phone: input.phone?.trim() ?? "",
    email: input.email?.trim() ?? "",
    bankName: input.bankName.trim(),
    bankAddressLine1: input.bankAddressLine1?.trim() ?? "",
    bankCity: input.bankCity?.trim() ?? "",
    bankStateRegion: input.bankStateRegion?.trim() ?? "",
    bankPostalCode: input.bankPostalCode?.trim() ?? "",
    accountType: input.accountType === "savings" ? "savings" : "checking",
    accountNumberEnc: account ? encryptField(account) : (existing?.accountNumberEnc ?? ""),
    routingNumberEnc: routing ? encryptField(routing) : (existing?.routingNumberEnc ?? ""),
    accountLast4: account ? last4(account) : (existing?.accountLast4 ?? ""),
    routingLast4: routing ? last4(routing) : (existing?.routingLast4 ?? ""),
    signerName: input.signerName.trim(),
    signerTitle: input.signerTitle?.trim() ?? "",
    signatureDataUrl: input.signatureDataUrl,
    signedDate: input.signedDate.trim(),
    submittedAt: new Date(),
  };

  await prisma.achAuthorization.upsert({
    where: { subcontractorId: input.subcontractorId },
    create: data,
    update: data,
  });

  // Keep the vendor packet's payment section in step, so a crew isn't asked
  // for the same thing twice in two places.
  await prisma.subcontractor.update({
    where: { id: input.subcontractorId },
    data: {
      paymentMethod: "ACH",
      remittanceEmail: input.email?.trim() || undefined,
    },
  });

  revalidatePath("/subcontractors");
  revalidatePath("/company");
  return { ok: true as const };
}

/**
 * Decrypt the bank numbers for one crew, to actually pay them.
 *
 * Staff only, and separate from the read used to render a page — the numbers
 * come out at the moment somebody is setting up a payment, and not before.
 * Every call is written to the audit log, because the interesting question
 * about an account number is never "what is it" but "who looked".
 */
export async function revealBankDetails(subcontractorId: string) {
  const user = await requireStaff();

  const row = await prisma.achAuthorization.findUnique({
    where: { subcontractorId },
    select: { accountNumberEnc: true, routingNumberEnc: true, subcontractor: { select: { company: true } } },
  });
  if (!row?.accountNumberEnc) return { ok: false as const, error: "No bank details on file." };

  try {
    const accountNumber = decryptField(row.accountNumberEnc);
    const routingNumber = row.routingNumberEnc ? decryptField(row.routingNumberEnc) : "";

    await prisma.accessLog.create({
      data: {
        action: "ach.revealed",
        actorUserId: user.id,
        actorEmail: user.email,
        subjectId: subcontractorId,
        detail: `Viewed bank details for ${row.subcontractor.company}`,
      },
    }).catch(() => {
      // An audit table that isn't there must not stop a payment going out,
      // but it should not fail silently in development either.
      console.warn("ach.revealed could not be recorded");
    });

    return { ok: true as const, accountNumber, routingNumber };
  } catch {
    return {
      ok: false as const,
      error: "Stored details could not be decrypted — the encryption key has changed or the record was altered.",
    };
  }
}

/* ------------------------------------------------------------------ *
 * Crew pay statements — what we owe, and their agreement to it.
 * ------------------------------------------------------------------ */

/**
 * Send a statement to the crew for agreement.
 *
 * The figures freeze here. From this point the crew has seen them, so a line
 * cannot be added or removed without telling them — which is the whole point of
 * asking them to accept.
 */
export async function issueSubInvoice(id: string) {
  await requireStaff();
  const inv = await prisma.subInvoice.findUnique({
    where: { id },
    select: { status: true, lines: { select: { id: true } } },
  });
  if (!inv) return { ok: false as const, error: "Statement not found." };
  if (inv.status !== "DRAFT") return { ok: false as const, error: "Only a draft can be sent." };
  if (inv.lines.length === 0) return { ok: false as const, error: "Nothing on this statement to send." };

  const sent = await prisma.subInvoice.update({
    where: { id },
    data: { status: "ISSUED", issuedAt: new Date() },
    select: { number: true, subtotal: true, subcontractorId: true },
  });
  await notifyCrew(sent.subcontractorId, {
    title: `Pay statement ${sent.number} is ready`,
    detail: "Check it against your sheets, then accept it or tell us what is wrong.",
    href: "/pay",
    category: "billing",
    tone: "warning",
  });
  revalidatePath("/subcontractors");
  revalidatePath("/pay");
  return { ok: true as const };
}

/**
 * The crew agrees the figures.
 *
 * This is the record the whole statement exists to produce: who agreed, and
 * exactly when. Only the crew the statement belongs to can do it — staff
 * accepting on a crew's behalf would make the timestamp worthless.
 */
export async function acceptSubInvoice(id: string, electFastPay = false) {
  const user = await requireUser();

  const inv = await prisma.subInvoice.findUnique({
    where: { id },
    select: {
      subcontractorId: true, status: true, number: true, fastPay: true,
      subcontractor: { select: { company: true } },
    },
  });
  if (!inv) return { ok: false as const, error: "Statement not found." };

  if (user.subcontractorId !== inv.subcontractorId) {
    return {
      ok: false as const,
      error: "Only the crew this statement belongs to can accept it.",
    };
  }
  if (inv.status !== "ISSUED" && inv.status !== "DISPUTED") {
    return { ok: false as const, error: "This statement isn't waiting on you." };
  }

  const at = new Date();
  // Electing fast pay is part of accepting, so the agreement and the terms it
  // was agreed on are written together and carry the same timestamp.
  const takingFastPay = electFastPay && !inv.fastPay;
  await prisma.subInvoice.update({
    where: { id },
    data: {
      status: "ACCEPTED",
      acceptedAt: at,
      acceptedBy: user.name || user.email,
      // Accepting settles any earlier dispute; the note stays as history.
      disputedAt: null,
      ...(takingFastPay
        ? {
            fastPay: true,
            fastPayFeePct: FAST_PAY_FEE_PCT,
            fastPayElectedAt: at,
            fastPayElectedBy: user.name || user.email,
            termsDays: FAST_PAY_DAYS,
            payMethod: FAST_PAY_METHOD,
          }
        : {}),
    },
  });

  await prisma.accessLog.create({
    data: {
      action: "subinvoice.accepted",
      actorUserId: user.id,
      actorEmail: user.email,
      subjectId: id,
      detail: takingFastPay
        ? `Accepted ${inv.number} with fast pay (${FAST_PAY_FEE_PCT}%, NET ${FAST_PAY_DAYS}, wire)`
        : `Accepted ${inv.number}`,
    },
  }).catch(() => undefined);

  // The office is waiting on this answer before it can pay anybody.
  await notifyStaff({
    title: `${inv.subcontractor?.company ?? "A crew"} accepted ${inv.number}`,
    detail: takingFastPay
      ? `Took fast pay — NET ${FAST_PAY_DAYS} by wire, less ${FAST_PAY_FEE_PCT}%.`
      : "Agreed the figures. Standard terms.",
    href: "/subcontractors",
    category: "billing",
    tone: "success",
    actor: user.name || user.email,
  });

  revalidatePath("/pay");
  revalidatePath("/subcontractors");
  return { ok: true as const, acceptedAt: at.toISOString() };
}

/**
 * Move a daily into a different billing week.
 *
 * Billing runs Saturday to Friday, and a day filed after Friday night falls
 * into the week that follows. Sometimes it shouldn't — a sheet that arrived
 * late, or a day the office needs to hold back. This moves which week the
 * daily bills in without touching the work date, because the work happened
 * when it happened and a statement that says otherwise is a false record.
 *
 * Pass an empty string to put it back on the rule.
 */
export async function setDailyBillingWeek(dailyId: string, fridayDate: string) {
  const me = await requireStaff();

  const daily = await prisma.daily.findUnique({
    where: { id: dailyId },
    select: { id: true, sheetNumber: true, workDate: true, billingWeekEnd: true },
  });
  if (!daily) return { ok: false as const, error: "Daily not found." };

  const target = fridayDate.trim();
  if (target) {
    const d = new Date(`${target}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      return { ok: false as const, error: "That isn't a date." };
    }
    if (d.getUTCDay() !== 5) {
      return {
        ok: false as const,
        error: "A billing week closes on a Friday. Pick the Friday it should bill to.",
      };
    }
  }

  // Once it is on a statement, moving the week would leave the statement's own
  // period disagreeing with the line inside it. Pull it off first.
  const onStatement = await prisma.subInvoiceLine.findFirst({
    where: { dailyId },
    select: { invoice: { select: { number: true, status: true } } },
  });
  const onInvoice = await prisma.invoiceLine.findFirst({
    where: { dailyId },
    select: { invoice: { select: { number: true, status: true } } },
  });
  const held = onStatement?.invoice ?? onInvoice?.invoice;
  if (held) {
    return {
      ok: false as const,
      error: `This daily is already on ${held.number}. Take it off that first.`,
    };
  }

  await prisma.daily.update({ where: { id: dailyId }, data: { billingWeekEnd: target } });

  await prisma.accessLog
    .create({
      data: {
        action: "daily.billingweek",
        actorUserId: me.id,
        actorEmail: me.email,
        subjectId: dailyId,
        detail: target
          ? `Sheet ${daily.sheetNumber || dailyId} (worked ${daily.workDate}) moved to the week ending ${target}`
          : `Sheet ${daily.sheetNumber || dailyId} put back on the standard week for ${daily.workDate}`,
      },
    })
    .catch(() => undefined);

  revalidatePath("/dailies");
  revalidatePath("/invoicing");
  revalidatePath("/pay");
  return { ok: true as const };
}

/**
 * Take fast pay on a statement that has already been accepted.
 *
 * A crew that agreed the figures on Monday and needs the money on Wednesday is
 * a normal thing to happen. The gross does not move — what they agreed to is
 * what the work came to — so this only adds the fee and shortens the terms.
 *
 * One way, deliberately. Once this is elected the office may already have the
 * wire queued, and letting it be taken back would mean a payment run that no
 * longer matches what the statement says.
 */
export async function electFastPay(id: string) {
  const user = await requireUser();

  const inv = await prisma.subInvoice.findUnique({
    where: { id },
    select: { subcontractorId: true, status: true, number: true, fastPay: true, subtotal: true },
  });
  if (!inv) return { ok: false as const, error: "Statement not found." };
  if (user.subcontractorId !== inv.subcontractorId) {
    return { ok: false as const, error: "Only the crew this statement belongs to can do that." };
  }
  if (inv.fastPay) {
    return { ok: false as const, error: "Fast pay is already on this statement." };
  }
  if (!canElectFastPay(inv.status, inv.fastPay)) {
    return {
      ok: false as const,
      error:
        inv.status === "PAID"
          ? "This one has already been paid."
          : "Fast pay can't be added to this statement.",
    };
  }

  const at = new Date();
  const quote = fastPayQuote(inv.subtotal, FAST_PAY_FEE_PCT, FAST_PAY_DAYS);
  await prisma.subInvoice.update({
    where: { id },
    data: {
      fastPay: true,
      fastPayFeePct: FAST_PAY_FEE_PCT,
      fastPayElectedAt: at,
      fastPayElectedBy: user.name || user.email,
      termsDays: FAST_PAY_DAYS,
      payMethod: FAST_PAY_METHOD,
    },
  });

  await prisma.accessLog
    .create({
      data: {
        action: "subinvoice.fastpay",
        actorUserId: user.id,
        actorEmail: user.email,
        subjectId: id,
        detail: `Fast pay on ${inv.number}: ${quote.feePct}% fee ($${quote.fee.toFixed(
          2,
        )}), net $${quote.net.toFixed(2)}, NET ${quote.days} by wire`,
      },
    })
    .catch(() => undefined);

  revalidatePath("/pay");
  revalidatePath("/subcontractors");
  return { ok: true as const, electedAt: at.toISOString(), fee: quote.fee, net: quote.net };
}

/**
 * The crew says something is wrong.
 *
 * A reason is required. "Denied" on its own tells the office nothing to act on,
 * and the crew ends up explaining it on the phone anyway — which is the thing
 * this is meant to replace.
 */
export async function disputeSubInvoice(id: string, note: string) {
  const user = await requireUser();

  if (!note.trim()) {
    return { ok: false as const, error: "Say what's wrong with it — which day, which code, what it should be." };
  }

  const inv = await prisma.subInvoice.findUnique({
    where: { id },
    select: { subcontractorId: true, status: true, number: true },
  });
  if (!inv) return { ok: false as const, error: "Statement not found." };
  if (user.subcontractorId !== inv.subcontractorId) {
    return { ok: false as const, error: "Only the crew this statement belongs to can dispute it." };
  }
  if (inv.status !== "ISSUED") {
    return { ok: false as const, error: "This statement isn't waiting on you." };
  }

  await prisma.subInvoice.update({
    where: { id },
    data: {
      status: "DISPUTED",
      disputeNote: note.trim(),
      disputedAt: new Date(),
      disputedBy: user.name || user.email,
    },
  });

  revalidatePath("/pay");
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

/**
 * Staff answer a dispute by putting the statement back for another look.
 *
 * Corrections happen on the dailies, not here — a statement is priced from
 * approved production, so the way to change a figure is to fix the daily and
 * let it re-file. This reopens the statement so that can happen.
 */
export async function reopenSubInvoice(id: string, note: string) {
  await requireStaff();
  const inv = await prisma.subInvoice.findUnique({ where: { id }, select: { status: true } });
  if (!inv) return { ok: false as const, error: "Statement not found." };
  if (inv.status === "PAID") return { ok: false as const, error: "That statement has been paid." };

  await prisma.subInvoice.update({
    where: { id },
    data: { status: "DRAFT", issuedAt: null, resolutionNote: note.trim() },
  });
  revalidatePath("/pay");
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

/** Mark an accepted statement as paid. */
export async function markSubInvoicePaid(id: string) {
  await requireStaff();
  const inv = await prisma.subInvoice.findUnique({ where: { id }, select: { status: true } });
  if (!inv) return { ok: false as const, error: "Statement not found." };
  if (inv.status !== "ACCEPTED") {
    return { ok: false as const, error: "Wait for the crew to accept it before paying it." };
  }
  await prisma.subInvoice.update({ where: { id }, data: { status: "PAID" } });
  revalidatePath("/pay");
  revalidatePath("/subcontractors");
  return { ok: true as const };
}

/**
 * Catch up statements for work approved before this existed.
 *
 * Same filing as approval, so a daily cannot be paid twice.
 */
export async function generateSubInvoices(subcontractorId: string) {
  await requireStaff();
  const crew = await prisma.subcontractor.findUnique({
    where: { id: subcontractorId },
    select: { company: true, rates: { select: { id: true }, take: 1 } },
  });
  if (!crew) return { ok: false as const, error: "Crew not found." };
  if (crew.rates.length === 0) {
    return { ok: false as const, error: "No signed rate card for this crew — their work can't be priced." };
  }

  const dailies = await prisma.daily.findMany({
    where: { subcontractor: crew.company, status: "Approved" },
    select: { id: true },
    orderBy: { workDate: "asc" },
  });

  const statements = new Set<string>();
  const unpriced = new Set<string>();
  let filed = 0;
  let lines = 0;
  let skipped = 0;

  for (const d of dailies) {
    const res = await fileApprovedDailyForSub(d.id);
    if (res.ok) {
      filed++;
      lines += res.lines ?? 0;
      if (res.invoiceNumber) statements.add(res.invoiceNumber);
    } else if (!res.reason?.startsWith("Already on")) {
      skipped++;
    }
    for (const c of res.unpriced ?? []) unpriced.add(c);
  }

  revalidatePath("/subcontractors");
  revalidatePath("/pay");

  if (filed === 0) {
    return {
      ok: false as const,
      error: "Nothing new to pay — every approved daily is already on a statement.",
    };
  }
  return {
    ok: true as const,
    created: statements.size,
    filed,
    lines,
    skipped,
    unpriced: [...unpriced],
  };
}

/** This crew's pay statements, for the office panel. Staff only inside. */
export async function listSubInvoices() {
  return getSubInvoices();
}

/**
 * Add photos to a daily that has already been filed.
 *
 * The one thing a crew can still change after submitting. Its numbers are the
 * submission and freeze the moment it is filed; the evidence behind them does
 * not, because Fortitude cannot approve a daily with no photos and a crew
 * often cannot take them until they are back in signal.
 *
 * Only the photos are written. Passing the whole sheet back would mean
 * trusting a client that has just been told its numbers are read-only.
 */
export async function updateDailyPhotos(sheetId: string, photos: unknown) {
  const user = await requireUser();

  const sheet = await prisma.dailySheet.findUnique({
    where: { id: sheetId },
    select: { id: true, projectId: true, dailyId: true },
  });
  if (!sheet) return { ok: false as const, error: "Sheet not found." };
  if (sheet.projectId) await assertProjectAccess(sheet.projectId);
  else if (!isStaff(user.role)) return { ok: false as const, error: "Not your sheet." };

  const list = Array.isArray(photos) ? photos : [];
  await prisma.dailySheet.update({
    where: { id: sheetId },
    data: { photos: asJson(list) },
  });

  // Keep the Daily's own count in step — it is what the review queue reads.
  if (sheet.dailyId) {
    await prisma.daily.update({
      where: { id: sheet.dailyId },
      data: { photos: list.length },
    }).catch(() => undefined);
  }

  revalidatePath("/dailies");
  if (sheet.projectId) revalidatePath(`/projects/${sheet.projectId}`);
  return { ok: true as const, count: list.length };
}

/* ------------------------------------------------------------------ *
 * Tasks — work assigned to a person or a crew.
 * ------------------------------------------------------------------ */

/** Everyone who may touch a given task: staff, or the crew it is on. */
async function assertTaskAccess(taskId: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assigneeSubId: true },
  });
  if (!task) throw new NotAuthorizedError("Task not found.");
  if (isStaff(user.role)) return { user, task };
  if (task.assigneeSubId && task.assigneeSubId === user.subcontractorId) return { user, task };
  throw new NotAuthorizedError("That task isn't assigned to you.");
}

export async function createTask(input: {
  title: string;
  detail?: string;
  priority?: string;
  dueDate?: string;
  assigneeUserId?: string | null;
  assigneeSubId?: string | null;
  projectId?: string | null;
}) {
  const user = await requireStaff();

  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Give the task a title." };
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    return { ok: false as const, error: "Enter the due date as YYYY-MM-DD." };
  }
  // One assignee or none — never both, or two people each think it is theirs
  // and neither does it.
  if (input.assigneeUserId && input.assigneeSubId) {
    return { ok: false as const, error: "Assign it to a person or a crew, not both." };
  }

  const task = await prisma.task.create({
    data: {
      title,
      detail: input.detail?.trim() ?? "",
      priority: (["LOW", "NORMAL", "HIGH", "URGENT"].includes(input.priority ?? "")
        ? input.priority
        : "NORMAL") as never,
      dueDate: input.dueDate ?? "",
      assigneeUserId: input.assigneeUserId || null,
      assigneeSubId: input.assigneeSubId || null,
      projectId: input.projectId || null,
      createdByEmail: user.email,
    },
    select: { id: true },
  });

  revalidatePath("/tasks");
  return { ok: true as const, id: task.id };
}

export async function updateTask(
  id: string,
  patch: {
    title?: string;
    detail?: string;
    priority?: string;
    dueDate?: string;
    assigneeUserId?: string | null;
    assigneeSubId?: string | null;
    projectId?: string | null;
  },
) {
  await requireStaff();
  if (patch.assigneeUserId && patch.assigneeSubId) {
    return { ok: false as const, error: "Assign it to a person or a crew, not both." };
  }

  await prisma.task.update({
    where: { id },
    data: {
      ...(patch.title != null ? { title: patch.title.trim() } : {}),
      ...(patch.detail != null ? { detail: patch.detail.trim() } : {}),
      ...(patch.priority ? { priority: patch.priority as never } : {}),
      ...(patch.dueDate != null ? { dueDate: patch.dueDate } : {}),
      ...(patch.assigneeUserId !== undefined
        ? { assigneeUserId: patch.assigneeUserId || null, assigneeSubId: null }
        : {}),
      ...(patch.assigneeSubId !== undefined
        ? { assigneeSubId: patch.assigneeSubId || null, assigneeUserId: null }
        : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId || null } : {}),
    },
  });
  revalidatePath("/tasks");
  return { ok: true as const };
}

/**
 * Move a task along, and write the move into its own thread.
 *
 * The history reads in one column that way — what was said and what was done,
 * in the order it happened, rather than a status field that changed at some
 * point nobody can place.
 */
export async function setTaskStatus(id: string, status: string, note = "") {
  const { user } = await assertTaskAccess(id);

  const allowed = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"];
  if (!allowed.includes(status)) return { ok: false as const, error: "Unknown status." };
  // Blocked without a reason is just "not done", which the board already knew.
  if ((status === "BLOCKED" || status === "CANCELLED") && !note.trim()) {
    return {
      ok: false as const,
      error: status === "BLOCKED" ? "Say what it's waiting on." : "Say why it's being cancelled.",
    };
  }

  const done = status === "DONE";
  await prisma.task.update({
    where: { id },
    data: {
      status: status as never,
      statusNote: note.trim(),
      completedAt: done ? new Date() : null,
      completedBy: done ? user.name || user.email : "",
    },
  });

  const label: Record<string, string> = {
    OPEN: "reopened this",
    IN_PROGRESS: "started work",
    BLOCKED: "marked it blocked",
    DONE: "marked it done",
    CANCELLED: "cancelled it",
  };
  await prisma.taskComment.create({
    data: {
      taskId: id,
      body: note.trim() ? `${label[status]} — ${note.trim()}` : label[status],
      systemNote: true,
      authorName: user.name || user.email,
      authorEmail: user.email,
    },
  });

  revalidatePath("/tasks");
  return { ok: true as const };
}

export async function addTaskComment(id: string, body: string) {
  const { user } = await assertTaskAccess(id);
  if (!body.trim()) return { ok: false as const, error: "Nothing to say." };

  await prisma.taskComment.create({
    data: {
      taskId: id,
      body: body.trim(),
      authorName: user.name || user.email,
      authorEmail: user.email,
    },
  });
  revalidatePath("/tasks");
  return { ok: true as const };
}

/**
 * Attach a photo to a task, already uploaded to Blob by the browser.
 *
 * PROBLEM or RESOLUTION — what was found, or what was done about it. A task
 * closed with the fix beside the fault settles an argument that words do not.
 */
export async function addTaskPhoto(input: {
  taskId: string;
  url: string;
  mediaType: string;
  sizeBytes: number;
  kind: "PROBLEM" | "RESOLUTION";
  caption?: string;
  lat?: number | null;
  lng?: number | null;
  locationSource?: string;
}) {
  const { user } = await assertTaskAccess(input.taskId);
  if (!input.url.trim()) return { ok: false as const, error: "No file was uploaded." };

  // Same rule as the project gallery: a coordinate is stored only with a
  // source behind it, never inferred.
  const located =
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng) &&
    input.locationSource === "device";

  await prisma.taskPhoto.create({
    data: {
      taskId: input.taskId,
      url: input.url,
      mediaType: input.mediaType || "",
      sizeBytes: Math.max(0, Math.round(input.sizeBytes || 0)),
      kind: input.kind === "RESOLUTION" ? "RESOLUTION" : "PROBLEM",
      caption: input.caption?.trim() ?? "",
      lat: located ? input.lat : null,
      lng: located ? input.lng : null,
      locationSource: located ? "device" : "",
      uploadedBy: user.name || user.email,
    },
  });

  revalidatePath("/tasks");
  return { ok: true as const };
}

export async function deleteTaskPhoto(id: string) {
  const photo = await prisma.taskPhoto.findUnique({ where: { id }, select: { taskId: true } });
  if (!photo) return { ok: false as const, error: "Photo not found." };
  await assertTaskAccess(photo.taskId);

  await prisma.taskPhoto.delete({ where: { id } });
  revalidatePath("/tasks");
  return { ok: true as const };
}

/** Staff only — a crew closes a task, it never deletes one. */
export async function deleteTask(id: string) {
  await requireStaff();
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
  return { ok: true as const };
}

/** One task with its thread and photos. Scoped inside. */
export async function getTaskDetail(id: string) {
  await assertTaskAccess(id);

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      photos: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, url: true, kind: true, caption: true,
          lat: true, lng: true, uploadedBy: true, createdAt: true,
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, body: true, systemNote: true,
          authorName: true, createdAt: true,
        },
      },
    },
  });
  if (!task) return null;

  return {
    photos: task.photos.map((p) => ({
      id: p.id,
      url: p.url,
      kind: p.kind,
      caption: p.caption,
      lat: p.lat,
      lng: p.lng,
      uploadedBy: p.uploadedBy,
      createdAt: p.createdAt.toISOString().slice(0, 16).replace("T", " "),
    })),
    comments: task.comments.map((c) => ({
      id: c.id,
      body: c.body,
      systemNote: c.systemNote,
      authorName: c.authorName,
      createdAt: c.createdAt.toISOString().slice(0, 16).replace("T", " "),
    })),
  };
}

/* ---- Prospects ----------------------------------------------------------- */

const KIND_TO_DB = { Worker: "WORKER", Crew: "SUBCONTRACTOR", Prime: "PRIME" } as const;
const STAGE_TO_DB = {
  New: "NEW",
  Contacted: "CONTACTED",
  Qualifying: "QUALIFYING",
  "In discussion": "IN_DISCUSSION",
  Won: "WON",
  Lost: "LOST",
  Dormant: "DORMANT",
} as const;

export type ProspectInput = {
  id?: string;
  kind: keyof typeof KIND_TO_DB;
  stage: keyof typeof STAGE_TO_DB;
  name: string;
  contactName?: string;
  contactRole?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  homeState?: string;
  states?: string[];
  markets?: string[];
  trades?: string[];
  crewSize?: number;
  equipment?: string[];
  rating?: number;
  source?: string;
  notes?: string;
  nextStep?: string;
  nextStepDue?: string;
  owner?: string;
};

/** Trim, drop blanks, de-duplicate — lists here are typed by hand. */
const cleanList = (xs?: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs ?? []) {
    const v = x.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
};

/** States are typed in a hurry — store them the way everything else reads them. */
const cleanStates = (xs?: string[]) => cleanList(xs).map((s) => s.toUpperCase());

export async function saveProspect(input: ProspectInput) {
  await requireStaff();
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "A name is required." };

  const data = {
    kind: KIND_TO_DB[input.kind],
    stage: STAGE_TO_DB[input.stage],
    name,
    contactName: input.contactName?.trim() ?? "",
    contactRole: input.contactRole?.trim() ?? "",
    email: input.email?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    website: input.website?.trim() ?? "",
    city: input.city?.trim() ?? "",
    homeState: (input.homeState ?? "").trim().toUpperCase(),
    states: cleanStates(input.states),
    markets: cleanList(input.markets),
    trades: cleanList(input.trades),
    crewSize: Math.max(0, Math.round(input.crewSize ?? 0)),
    equipment: cleanList(input.equipment),
    rating: Math.min(5, Math.max(0, Math.round(input.rating ?? 0))),
    source: input.source?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    nextStep: input.nextStep?.trim() ?? "",
    nextStepDue: input.nextStepDue?.trim() ?? "",
    owner: input.owner?.trim() ?? "",
  };

  const saved = input.id
    ? await prisma.prospect.update({ where: { id: input.id }, data })
    : await prisma.prospect.create({ data });

  revalidatePath("/prospects");
  return { ok: true as const, id: saved.id };
}

export async function deleteProspect(id: string) {
  await requireStaff();
  await prisma.prospect.delete({ where: { id } });
  revalidatePath("/prospects");
  return { ok: true as const };
}

/**
 * Move a prospect along, and write the move into the log.
 *
 * The stage on its own tells you where something is but never how it got
 * there. Recording the change beside the calls and emails means the history
 * reads as one story rather than a status field and a separate diary.
 */
export async function setProspectStage(id: string, stage: keyof typeof STAGE_TO_DB) {
  const me = await requireStaff();
  const before = await prisma.prospect.findUnique({ where: { id }, select: { stage: true } });
  if (!before) return { ok: false as const, error: "Prospect not found." };

  const to = STAGE_TO_DB[stage];
  if (before.stage === to) return { ok: true as const };

  await prisma.$transaction([
    prisma.prospect.update({ where: { id }, data: { stage: to } }),
    prisma.prospectActivity.create({
      data: {
        prospectId: id,
        kind: "stage",
        body: `Moved to ${stage}`,
        author: me.name || me.email,
      },
    }),
  ]);
  revalidatePath("/prospects");
  return { ok: true as const };
}

export async function logProspectActivity(id: string, kind: string, body: string) {
  const me = await requireStaff();
  const text = body.trim();
  if (!text) return { ok: false as const, error: "Nothing to log." };

  await prisma.$transaction([
    prisma.prospectActivity.create({
      data: { prospectId: id, kind, body: text, author: me.name || me.email },
    }),
    // A logged touch is the only honest source for "when did we last speak".
    prisma.prospect.update({
      where: { id },
      data: { lastContact: new Date().toISOString().slice(0, 10) },
    }),
  ]);
  revalidatePath("/prospects");
  return { ok: true as const };
}

/**
 * Promote a won crew into the real subcontractor roster.
 *
 * The prospect stays, marked converted and pointing at the record it became —
 * deleting it would lose how the relationship started, which is exactly what
 * you want to know when deciding whether a channel is worth working again.
 */
export async function convertProspectToSubcontractor(id: string) {
  const me = await requireStaff();
  const p = await prisma.prospect.findUnique({ where: { id } });
  if (!p) return { ok: false as const, error: "Prospect not found." };
  if (p.convertedSubcontractorId) {
    return { ok: false as const, error: `${p.name} has already been converted.` };
  }
  if (p.kind === "PRIME") {
    return {
      ok: false as const,
      error: "A prime contractor is somebody you work for — add them under Customers, not Subcontractors.",
    };
  }

  const existing = await prisma.subcontractor.findFirst({
    where: { company: { equals: p.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false as const, error: `A subcontractor called ${p.name} already exists.` };
  }

  const sub = await prisma.subcontractor.create({
    data: {
      company: p.name,
      lead: p.contactName,
      email: p.email,
      phone: p.phone,
      location: [p.city, p.homeState].filter(Boolean).join(", "),
      trades: p.trades,
      crewSize: p.crewSize,
      equipment: p.equipment,
      state: "PENDING_REVIEW",
      notes: p.notes,
    },
  });

  await prisma.$transaction([
    prisma.prospect.update({
      where: { id },
      data: { stage: "WON", convertedSubcontractorId: sub.id, convertedAt: new Date() },
    }),
    prisma.prospectActivity.create({
      data: {
        prospectId: id,
        kind: "stage",
        body: "Converted to a subcontractor",
        author: me.name || me.email,
      },
    }),
  ]);

  revalidatePath("/prospects");
  revalidatePath("/subcontractors");
  return { ok: true as const, subcontractorId: sub.id };
}

/**
 * Clear the viewer's own unread notifications.
 *
 * Scoped the same way reading them is: staff clear the office feed, a crew
 * clears only rows written about their own work. There is no id parameter,
 * because an id parameter is a way to clear somebody else's.
 */
export async function markNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: isStaff(user.role)
      ? { audience: "STAFF", readAt: null }
      : user.subcontractorId
        ? { audience: "SUBCONTRACTOR", subcontractorId: user.subcontractorId, readAt: null }
        : { id: "" },
    data: { readAt: new Date() },
  });
  return { ok: true as const };
}

/* ---- Locates -------------------------------------------------------------- */

export type LocateTicketInput = {
  id?: string;
  number: string;
  revision?: string;
  projectId?: string | null;
  street?: string;
  crossStreet?: string;
  city?: string;
  county?: string;
  workType?: string;
  calledInOn?: string;
  workToBeginOn?: string;
  responseBy?: string;
  updateBy?: string;
  expiresOn?: string;
  notes?: string;
};

const day = (v?: string) => {
  const s = (v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

export async function saveLocateTicket(input: LocateTicketInput) {
  await requireStaff();
  const number = input.number.trim().toUpperCase();
  if (!number) return { ok: false as const, error: "A ticket number is needed." };

  const data = {
    number,
    revision: (input.revision ?? "").trim(),
    projectId: input.projectId || null,
    street: (input.street ?? "").trim(),
    crossStreet: (input.crossStreet ?? "").trim(),
    city: (input.city ?? "").trim(),
    county: (input.county ?? "").trim(),
    workType: (input.workType ?? "").trim(),
    // A date that is not a date is stored as blank rather than as rubbish. A
    // ticket with no expiry reads as "no date on file", which is a state the
    // board shows and refuses to dig on — far better than a silent bad value.
    calledInOn: day(input.calledInOn),
    workToBeginOn: day(input.workToBeginOn),
    responseBy: day(input.responseBy),
    updateBy: day(input.updateBy),
    expiresOn: day(input.expiresOn),
    notes: (input.notes ?? "").trim(),
  };

  const saved = input.id
    ? await prisma.locateTicket.update({ where: { id: input.id }, data })
    : await prisma.locateTicket.upsert({
        where: { number_revision: { number, revision: data.revision } },
        create: data,
        update: data,
      });

  revalidatePath("/locates");
  return { ok: true as const, id: saved.id };
}

export async function closeLocateTicket(id: string, on: string) {
  await requireStaff();
  await prisma.locateTicket.update({
    where: { id },
    data: { closedOn: day(on) || new Date().toISOString().slice(0, 10) },
  });
  revalidatePath("/locates");
  return { ok: true as const };
}

export async function deleteLocateTicket(id: string) {
  await requireStaff();
  await prisma.locateTicket.delete({ where: { id } });
  revalidatePath("/locates");
  return { ok: true as const };
}

/**
 * Record what one utility said.
 *
 * Upserted per member, so the latest word replaces the last without losing
 * which member it came from — the question on site is never "is the ticket
 * done", it is "has the gas company been out".
 */
export async function setLocateResponse(input: {
  ticketId: string;
  member: string;
  status: "MARKED" | "CLEAR" | "NOT_COMPLETE" | "DELAYED" | "UNKNOWN";
  respondedOn?: string;
  note?: string;
}) {
  await requireStaff();
  const member = input.member.trim();
  if (!member) return { ok: false as const, error: "Which utility?" };

  await prisma.locateResponse.upsert({
    where: { ticketId_member: { ticketId: input.ticketId, member } },
    create: {
      ticketId: input.ticketId,
      member,
      status: input.status,
      respondedOn: day(input.respondedOn),
      note: (input.note ?? "").trim(),
    },
    update: {
      status: input.status,
      respondedOn: day(input.respondedOn),
      note: (input.note ?? "").trim(),
    },
  });
  revalidatePath("/locates");
  return { ok: true as const };
}

/**
 * Take a pile of ticket numbers and open a row for each.
 *
 * Numbers arrive pasted out of an email in whatever shape the email had them,
 * so anything that looks like a ticket number is picked out and the rest is
 * ignored. Each one is created bare — no dates — which puts it on the board as
 * "no date on file" rather than inventing a clock for it.
 */
export async function importLocateNumbers(text: string, projectId?: string | null) {
  await requireStaff();
  // A ticket number is not just a run of digits. 811 numbers carry hyphens and
  // sometimes letters, and matching bare digits split 20260809-00123 into its
  // first half and filed a ticket that does not exist. Tokens are taken whole
  // and kept when they carry enough digits to be a ticket number.
  const found = [
    ...new Set(
      text
        .split(/[\s,;|]+/)
        .map((t) => t.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
        .filter((t) => /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(t))
        .filter((t) => (t.match(/\d/g) ?? []).length >= 6)
        .map((t) => t.toUpperCase()),
    ),
  ];
  if (found.length === 0) {
    return { ok: false as const, error: "No ticket numbers found in that." };
  }

  let created = 0;
  let existing = 0;
  for (const number of found) {
    const already = await prisma.locateTicket.findUnique({
      where: { number_revision: { number, revision: "" } },
      select: { id: true },
    });
    if (already) {
      existing++;
      continue;
    }
    await prisma.locateTicket.create({
      data: { number, projectId: projectId || null },
    });
    created++;
  }

  revalidatePath("/locates");
  return { ok: true as const, created, existing, numbers: found };
}

/**
 * Ask a question about the locate board.
 *
 * The tickets are loaded server-side and handed to the model already decided —
 * each one carries whether it may be dug on and why, worked out from dates
 * rather than from language. The model picks which rows answer the question.
 */
export async function askLocates(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
) {
  await requireStaff();
  const q = question.trim();
  if (!q) return { ok: false as const, error: "Ask something." };
  if (!locateChatReady()) {
    return {
      ok: false as const,
      error: "The assistant needs ANTHROPIC_API_KEY set on this environment.",
    };
  }

  const tickets = await getLocateTickets();
  if (tickets.length === 0) {
    return {
      ok: true as const,
      answer: "There are no locate tickets on the board yet. Add some and ask again.",
    };
  }

  try {
    return { ok: true as const, answer: await askAboutLocates(q, tickets, history) };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "The assistant could not answer.",
    };
  }
}

/**
 * Read pasted ticket text and file what it says.
 *
 * This is the answer to "can it pull the information off the ticket": paste the
 * email or the portal page and every field it states is read off it — dates,
 * street, work type, and what each utility answered.
 *
 * What it will not do is fill a gap. A field the text does not state is left
 * empty, and an empty expiry shows on the board as "no date on file" and
 * returns do-not-dig. The failure mode has to be a ticket that admits it knows
 * nothing, never one that quietly states a wrong date.
 */
export async function importLocateText(text: string, projectId?: string | null) {
  await requireStaff();
  if (!text.trim()) return { ok: false as const, error: "Paste a ticket first." };
  if (!locateChatReady()) {
    return { ok: false as const, error: "Reading tickets needs ANTHROPIC_API_KEY set." };
  }

  let parsed;
  try {
    parsed = await parseLocateText(text);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not read that.",
    };
  }
  if (parsed.length === 0) {
    return { ok: false as const, error: "No ticket found in that text." };
  }

  let created = 0;
  let updated = 0;
  let responses = 0;
  const incomplete: string[] = [];

  for (const t of parsed) {
    const existing = await prisma.locateTicket.findUnique({
      where: { number_revision: { number: t.number, revision: t.revision } },
      select: { id: true },
    });

    const data = {
      number: t.number,
      revision: t.revision,
      street: t.street,
      crossStreet: t.crossStreet,
      city: t.city,
      county: t.county,
      workType: t.workType,
      ticketType: t.ticketType,
      sourceText: text.slice(0, 20000),
      lat: t.lat,
      lng: t.lng,
      locateInstructions: t.locateInstructions,
      calledInOn: t.calledInOn,
      workToBeginOn: t.workToBeginOn,
      responseBy: t.responseBy,
      updateableOn: t.updateableOn,
      updateBy: t.updateBy,
      expiresOn: t.expiresOn,
      notes: t.notes,
      ...(projectId ? { projectId } : {}),
    };

    const saved = existing
      ? await prisma.locateTicket.update({ where: { id: existing.id }, data })
      : await prisma.locateTicket.create({ data });
    if (existing) updated++;
    else created++;

    for (const m of t.members) {
      await prisma.locateResponse.upsert({
        where: { ticketId_member: { ticketId: saved.id, member: m.member } },
        create: {
          ticketId: saved.id,
          member: m.member,
          code: m.code,
          facilityType: m.facilityType,
          status: m.status as "MARKED" | "CLEAR" | "NOT_COMPLETE" | "DELAYED" | "UNKNOWN",
          respondedOn: m.respondedOn,
          note: m.note,
        },
        update: {
          code: m.code,
          facilityType: m.facilityType,
          status: m.status as "MARKED" | "CLEAR" | "NOT_COMPLETE" | "DELAYED" | "UNKNOWN",
          respondedOn: m.respondedOn,
          note: m.note,
        },
      });
      responses++;
    }

    // Said out loud rather than left to be noticed. A ticket read without an
    // expiry is the one somebody will assume was read correctly.
    if (!t.expiresOn) incomplete.push(t.number);
  }

  revalidatePath("/locates");
  return { ok: true as const, created, updated, responses, incomplete };
}

/**
 * Delete a daily.
 *
 * A daily is referenced by invoice lines through a plain id rather than a
 * foreign key, so nothing cascades — which is deliberate: deleting a day must
 * never silently strip a line off a bill somebody has seen. That means the
 * clean-up is explicit, and it means there is a line it will not cross.
 *
 * A draft is fair game. Anything issued is not: a sent invoice or a statement
 * a crew has been asked to agree is a figure that exists outside this system,
 * and taking its basis away leaves a total nobody can explain. Those need a
 * credit or a conversation.
 *
 * Call without `confirm` to be told what it would take with it.
 */
export async function deleteDaily(id: string, confirm?: boolean) {
  await requireStaff();

  const daily = await prisma.daily.findUnique({
    where: { id },
    select: { id: true, projectName: true, workDate: true, status: true, subcontractor: true, totalFt: true },
  });
  if (!daily) return { ok: false as const, error: "Daily not found." };

  const [invLines, subLines, sheets] = await Promise.all([
    prisma.invoiceLine.findMany({
      where: { dailyId: id },
      select: { id: true, invoiceId: true, invoice: { select: { number: true, status: true } } },
    }),
    prisma.subInvoiceLine.findMany({
      where: { dailyId: id },
      select: { id: true, invoiceId: true, invoice: { select: { number: true, status: true } } },
    }),
    prisma.dailySheet.findMany({ where: { dailyId: id }, select: { id: true } }),
  ]);

  const frozen = [
    ...invLines.filter((l) => l.invoice.status !== "DRAFT").map((l) => `${l.invoice.number} (${l.invoice.status})`),
    ...subLines.filter((l) => l.invoice.status !== "DRAFT").map((l) => `${l.invoice.number} (${l.invoice.status})`),
  ];
  if (frozen.length > 0) {
    return {
      ok: false as const,
      error: `This day is on ${frozen.join(" and ")}, which has already gone out. Void or credit that first — deleting the day behind it would leave a total nobody can account for.`,
    };
  }

  const affected = [
    ...new Set([
      ...invLines.map((l) => l.invoice.number),
      ...subLines.map((l) => l.invoice.number),
    ]),
  ];

  if (!confirm) {
    return {
      ok: false as const,
      needsConfirm: true as const,
      error:
        `Delete ${daily.projectName.trim() || "this daily"}${daily.workDate ? ` for ${daily.workDate}` : ""}` +
        `${daily.totalFt ? `, ${daily.totalFt} ft` : ""}?` +
        (affected.length > 0
          ? ` It comes off draft ${affected.join(" and ")} and those totals drop.`
          : "") +
        (sheets.length > 0 ? " The sheet it came from goes back to a draft." : ""),
    };
  }

  await prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { dailyId: id } }),
    prisma.subInvoiceLine.deleteMany({ where: { dailyId: id } }),
    // The sheet is the crew's own record of the day and is kept, released back
    // to a draft so it can be corrected and filed again rather than retyped.
    prisma.dailySheet.updateMany({ where: { dailyId: id }, data: { dailyId: null, status: "DRAFT" } }),
    prisma.daily.delete({ where: { id } }),
  ]);

  // Whatever it was on has to be re-totalled, or the invoice keeps the money.
  for (const invoiceId of [...new Set(invLines.map((l) => l.invoiceId))]) {
    await recalcInvoice(invoiceId);
  }
  for (const invoiceId of [...new Set(subLines.map((l) => l.invoiceId))]) {
    await recalcSubInvoice(invoiceId);
  }

  await prisma.accessLog
    .create({
      data: {
        action: "daily.deleted",
        actorEmail: (await viewer())?.email ?? "",
        subjectId: id,
        detail: `Deleted ${daily.projectName.trim()} ${daily.workDate} (${daily.status}, ${daily.totalFt} ft) filed by ${daily.subcontractor || "—"}`,
      },
    })
    .catch(() => undefined);

  revalidatePath("/dailies");
  revalidatePath("/invoicing");
  revalidatePath("/pay");
  return { ok: true as const };
}

/**
 * Import a daily off a file a crew sent in — a scan, a photo, or the PDF that
 * came attached to an email — and land it as a draft.
 *
 * A draft, never a submission. The reader is transcribing handwriting off a
 * photo taken in a truck; it is a first pass at the paper, and the paper is
 * still the record. Someone opens the draft, checks it against the original,
 * fixes what needs fixing and submits it themselves.
 *
 * Two things make the draft safe to hand over:
 *
 *   - A code the customer's card does not carry is written into the sheet as
 *     the crew wrote it, not as a guess. The sheet already warns about codes
 *     that are not on the card and already offers the card in a dropdown, so
 *     an unresolved column arrives somewhere it will be seen and fixed rather
 *     than somewhere it will quietly bill nothing.
 *
 *   - Every column is footed against the TOTALS row the crew printed. That row
 *     is an independent statement of the same numbers, so it catches a misread
 *     digit arithmetically instead of by eye.
 */
export async function importDailyFromFile(input: {
  fileUrl: string;
  mediaType: string;
  projectId: string;
  /** Which crew this day belongs to. Staff only, as with any other sheet. */
  filedForId?: string | null;
}) {
  await assertProjectAccess(input.projectId);
  const actor = await viewer();

  if (!dailyImportReady()) {
    return {
      ok: false as const,
      error: "ANTHROPIC_API_KEY isn't set in this environment, so files can't be read yet.",
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true, number: true, client: true, customerId: true },
  });
  if (!project) return { ok: false as const, error: "Project not found." };

  // The codes this customer will actually pay. Passed to the reader so it
  // matches against the right card — the same paper sheet means different
  // codes on a different job.
  const allowed = project.customerId
    ? (
        await prisma.customerRate.findMany({
          where: { customerId: project.customerId },
          select: { code: true },
        })
      )
        .filter((r) => isMainBillableCode(r.code))
        .map((r) => r.code)
    : [];

  let file: ArrayBuffer;
  try {
    const res = await fetch(input.fileUrl);
    if (!res.ok) return { ok: false as const, error: `Couldn't fetch that file (${res.status}).` };
    file = await res.arrayBuffer();
  } catch {
    return { ok: false as const, error: "Couldn't fetch that file." };
  }

  // Guard the size before spending a model call on it. Say the number rather
  // than "too large", so it is obvious whether to re-scan or split.
  const MB = file.byteLength / 1_048_576;
  if (MB > 20) {
    return {
      ok: false as const,
      error: `That file is ${MB.toFixed(1)} MB. Daily sheets are usually well under 1 MB — this looks like a map or a multi-job scan. Send the sheet on its own.`,
    };
  }

  let read: Awaited<ReturnType<typeof extractDailySheet>>;
  try {
    read = await extractDailySheet(
      Buffer.from(file).toString("base64"),
      input.mediaType,
      allowed.length ? allowed : undefined,
    );
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Couldn't read that file.",
    };
  }

  if (!read.columns.length && !read.rows.length) {
    return {
      ok: false as const,
      error: "Nothing on that file looked like a daily billing sheet.",
    };
  }

  // An unresolved column keeps what the crew wrote. Blanking it would lose the
  // work; guessing it would bill the wrong code. The sheet flags it either way.
  const laborCodes = read.columns.map((c) => c.resolved ?? c.asWritten);
  const laborRows = read.rows.map((r) => ({
    print: r.print,
    location: r.location,
    cells: r.cells,
    remarks: r.remarks,
  }));

  const footing = checkFooting(read);
  const unresolved = read.columns.filter((c) => !c.resolved);

  const sheet = await prisma.dailySheet.create({
    data: {
      projectId: project.id,
      projectName: project.name,
      workDate: read.header.dateWorked,
      crewNumber: read.header.crewNumber,
      header: asJson({
        exchange: read.header.exchange || project.number,
        crewNumber: read.header.crewNumber,
        customer: read.header.customer || project.client,
        dateWorked: read.header.dateWorked,
        projectNumber: read.header.projectNumber || project.number,
        jobName: read.header.jobName || project.name,
        employees: read.header.employees,
        complete: read.header.complete,
        supervisorSignature: "",
        supervisorDate: "",
        subcontractorSignature: "",
        subcontractorDate: "",
        sheet: "",
        sheetOf: "",
      }),
      laborCodes: asJson(laborCodes),
      laborRows: asJson(laborRows),
      matCodes: asJson([]),
      matRows: asJson([]),
      redlines: asJson([]),
      notes: read.notes,
      photos: asJson([]),
      ...(actor && isStaff(actor.role) ? { filedForId: input.filedForId || null } : {}),
    },
  });

  revalidatePath("/dailies");

  return {
    ok: true as const,
    id: sheet.id,
    columns: read.columns.map((c) => ({
      asWritten: c.asWritten,
      resolved: c.resolved,
      printedTotal: c.printedTotal,
    })),
    rowCount: laborRows.length,
    unresolved: unresolved.map((c) => c.asWritten),
    footing,
    problems: read.problems,
  };
}

/**
 * Vouch for a compliance document that has not arrived yet.
 *
 * A crew is on site and the certificate is in an email or with the broker. The
 * honest way to record that is not to mark the document received - it isn't -
 * but to say who vouched for it and until when, and let it lapse on its own.
 *
 * Short-dated on purpose. A waiver nobody has to remember to revoke is just a
 * hole in the file with a nicer name, so this caps at two weeks and the
 * document goes back to missing the moment the date passes.
 */
export async function waiveComplianceDoc(input: {
  subcontractorId: string;
  /** The compliance row's label, e.g. "General liability COI". */
  label: string;
  /** YYYY-MM-DD. */
  until: string;
  reason: string;
}) {
  const actor = await requireStaff();

  const sub = await prisma.subcontractor.findUnique({
    where: { id: input.subcontractorId },
    select: { id: true, company: true, compliance: true },
  });
  if (!sub) return { ok: false as const, error: "Crew not found." };

  const today = new Date().toISOString().slice(0, 10);
  const until = input.until.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < today) {
    return { ok: false as const, error: "Give a date on or after today for the waiver to run to." };
  }

  const cap = new Date();
  cap.setDate(cap.getDate() + 14);
  if (until > cap.toISOString().slice(0, 10)) {
    return {
      ok: false as const,
      error: `Two weeks is the longest a document can be waived (to ${cap.toISOString().slice(0, 10)}). If it needs longer than that, it isn't coming.`,
    };
  }

  if (!input.reason.trim()) {
    return { ok: false as const, error: "Say why — this is the record of who let them work without it." };
  }

  const rows = (Array.isArray(sub.compliance) ? sub.compliance : []) as {
    label?: string;
  }[];
  const target = rows.find(
    (r) => (r.label ?? "").trim().toLowerCase() === input.label.trim().toLowerCase(),
  );
  if (!target) return { ok: false as const, error: `"${input.label}" isn't a document on this crew's list.` };

  const updated = rows.map((r) =>
    r === target
      ? {
          ...r,
          waiver: {
            until,
            by: actor.name || actor.email || "Administrator",
            reason: input.reason.trim(),
            grantedOn: today,
          },
        }
      : r,
  );

  await prisma.subcontractor.update({
    where: { id: sub.id },
    data: { compliance: updated as Prisma.InputJsonValue },
  });

  await notifyStaff({
    title: `${input.label} waived for ${sub.company}`,
    detail: `${actor.name || "An administrator"} vouched for it until ${until}. ${input.reason.trim()}`,
    category: "compliance",
    tone: "warning",
  });

  revalidatePath("/subcontractors");
  revalidatePath("/");
  return { ok: true as const, until };
}

/** Take a waiver back before it lapses. */
export async function clearComplianceWaiver(subcontractorId: string, label: string) {
  await requireStaff();
  const sub = await prisma.subcontractor.findUnique({
    where: { id: subcontractorId },
    select: { id: true, compliance: true },
  });
  if (!sub) return { ok: false as const, error: "Crew not found." };

  const rows = (Array.isArray(sub.compliance) ? sub.compliance : []) as {
    label?: string;
    waiver?: unknown;
  }[];
  const updated = rows.map((r) => {
    if ((r.label ?? "").trim().toLowerCase() !== label.trim().toLowerCase()) return r;
    const { waiver: _dropped, ...rest } = r;
    return rest;
  });

  await prisma.subcontractor.update({
    where: { id: sub.id },
    data: { compliance: updated as Prisma.InputJsonValue },
  });
  revalidatePath("/subcontractors");
  revalidatePath("/");
  return { ok: true as const };
}

/**
 * Who may use the operations assistant.
 *
 * One person, by identity, not by role. There is a second ADMIN account on
 * this system (and there will be more), so checking isStaff or even ADMIN
 * would hand the assistant to whoever gets made an administrator next. The
 * owner's address is the check, overridable by env so it can move without a
 * deploy.
 */
function opsAssistantOwner(): string {
  return (process.env.OPS_ASSISTANT_OWNER ?? "sean.fogelson@fortitude-infra.com")
    .trim()
    .toLowerCase();
}

export async function canUseOpsAssistant(): Promise<boolean> {
  const me = await viewer();
  return Boolean(me && me.email.trim().toLowerCase() === opsAssistantOwner());
}

/**
 * Ask the operations assistant a question.
 *
 * The assistant can only read — every tool behind it is a query and none of
 * them write — so the worst a prompt can do is ask for information. This gate
 * is about who gets to see the whole business at once, which is a different
 * question from whether anything can be damaged.
 */
export async function askOperations(history: { role: "user" | "assistant"; content: string }[]) {
  const me = await requireUser();
  if (me.email.trim().toLowerCase() !== opsAssistantOwner()) {
    return { ok: false as const, error: "The operations assistant isn't available on this account." };
  }
  if (!opsChatReady()) {
    return { ok: false as const, error: "ANTHROPIC_API_KEY isn't set in this environment yet." };
  }

  const clean = history
    .filter((m) => m.content.trim())
    // Keep the conversation bounded; the assistant re-reads the data it needs
    // each turn rather than relying on a long scrollback.
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (!clean.length) return { ok: false as const, error: "Ask me something." };

  try {
    const answer = await askOps(clean);
    return { ok: true as const, answer };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "I couldn't get to the data just then.",
    };
  }
}
