import type { IconKey } from "@/lib/icons";

/** Semantic tone drives every status colour in the app. */
export type Tone = "success" | "warning" | "critical" | "info" | "neutral";

export type Trend = "up" | "down" | "flat";

export interface Kpi {
  id: string;
  label: string;
  value: number;
  /** Rendered form — keeps currency/unit formatting out of the component. */
  format: "number" | "currency" | "feet";
  delta: number | null;
  deltaLabel: string;
  trend: Trend;
  tone: Tone;
  icon: IconKey;
  href: string;
  /** 12 points, oldest → newest. Powers the inline sparkline. */
  series: number[];
}

export type ProjectStatus =
  | "Ahead of schedule"
  | "On schedule"
  | "At risk"
  | "Behind schedule";

export interface Project {
  id: string;
  /** Fortitude job / project number. */
  number: string;
  name: string;
  client: string;
  location: string;
  status: ProjectStatus;
  tone: Tone;
  /** Which market the job sits in. Empty until somebody sets it. */
  market: string;
  /** Linear feet still to install. */
  remainingFt: number;
  requiredFtPerDay: number;
  actualFtPerDay: number;
  forecast: string;
  forecastTone: Tone;
  /** 0–100 composite of schedule, budget, quality and safety. */
  health: number;
  pctComplete: number;
  crew: string;
  updatedAt: string;
  /**
   * Uploaded project map. Present on a single project; on a list it is only
   * carried when it is a real URL, because a map held inline is megabytes and a
   * list draws thumbnails. Use `hasMap` to ask whether a plan exists.
   */
  mapUrl?: string | null;
  /** Whether a map has been uploaded — answerable without shipping the map. */
  hasMap?: boolean;
  /** Jobsite cover photo shown on the project card. */
  photoUrl?: string | null;
  /** As-built redline markups (lines + dots) drawn over the map. */
  markups?: unknown;
}

export interface HealthBucket {
  label: string;
  count: number;
  tone: Tone;
}

export interface HealthSummary {
  score: number;
  delta: number;
  totalProjects: number;
  buckets: HealthBucket[];
  onTimeRate: number;
  budgetVariance: number;
  safetyDays: number;
}

export type BriefSeverity = "critical" | "opportunity" | "info";

export interface BriefItem {
  id: string;
  severity: BriefSeverity;
  title: string;
  detail: string;
  /** Model confidence, 0–1. Shown as a percentage chip. */
  confidence: number;
  impact: string;
  action: string;
  icon: IconKey;
}

export interface ProductionPoint {
  day: string;
  date: string;
  actual: number;
  target: number;
}

export interface CrewProductionRow {
  crew: string;
  ft: number;
  tone: Tone;
}

export interface ProductionSummary {
  today: number;
  target: number;
  weekTotal: number;
  weekDelta: number;
  series: ProductionPoint[];
  byCrew: CrewProductionRow[];
}

export interface RevenueBucket {
  id: string;
  label: string;
  amount: number;
  count: number;
  caption: string;
  tone: Tone;
  icon: IconKey;
  /** Share of the total pipeline, 0–1. Drives the meter width. */
  share: number;
}

export interface RevenueSummary {
  total: number;
  buckets: RevenueBucket[];
  avgDaysToPay: number;
  collectedThisMonth: number;
}

export type CrewState = "available" | "deployed" | "scheduled" | "off";

export interface Crew {
  id: string;
  name: string;
  lead: string;
  state: CrewState;
  assignment: string;
  availableIn: number;
  availableOn: string;
  /** Rolling 7-day utilisation, 0–1. */
  utilization: number;
}

export interface Deadline {
  id: string;
  project: string;
  milestone: string;
  date: string;
  daysOut: number;
  tone: Tone;
  owner: string;
}

export interface MissingDocument {
  id: string;
  project: string;
  documents: string[];
  blocking: boolean;
  daysOverdue: number;
}

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: Tone;
  unread: boolean;
  icon: IconKey;
  category: "daily" | "billing" | "compliance" | "crew" | "system";
  /** Where to go to act on it. Empty when there is nowhere to go. */
  href?: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: IconKey;
  badge?: number;
  shortcut?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface Organization {
  name: string;
  plan: string;
  user: {
    name: string;
    email: string;
    role: string;
  };
}

/* ------------------------------------------------------------------ *
 * Customers — every customer carries its own billing identity: rate
 * sheet, unit codes, minimums, retainage and invoice format. The
 * billing engine reads these rules rather than hardcoding anything.
 * ------------------------------------------------------------------ */

export interface CustomerContact {
  name: string;
  title: string;
  email: string;
  phone: string;
  primary: boolean;
}

export interface RateSheetItem {
  /** Unit code as it appears on the daily / invoice (e.g. "BDD", "BM6"). */
  code: string;
  description: string;
  unit: "ft" | "ea" | "hr" | "ls";
  rate: number;
}

export interface Customer {
  id: string;
  name: string;
  /** Short code used on POs and invoices. */
  shortCode: string;
  industry: "Telecom" | "Power" | "Water" | "Gas";
  tone: Tone;
  status: "Active" | "Prospect" | "Inactive";
  logoTint: Tone;
  location: string;
  contacts: CustomerContact[];
  billingEmail: string;
  paymentTerms: string;
  retainagePct: number;
  invoiceMinimum: number;
  activeProjects: number;
  contractValue: number;
  billedToDate: number;
  openAr: number;
  avgDaysToPay: number;
  rateSheet: RateSheetItem[];
  notes: string;
  since: string;
}

/* ------------------------------------------------------------------ *
 * Subcontractors — the contractor portal side. Compliance docs,
 * banking, equipment and a running performance scorecard.
 * ------------------------------------------------------------------ */

/**
 * "waived" is a document the office has seen but that is not in the system
 * yet - a COI read off an email while the broker sends the PDF. It is its own
 * status rather than a "valid", because a crew working on a promise is a
 * different fact from a crew working on a filed certificate, and the
 * difference is the one that matters if something happens on site.
 */
export type ComplianceStatus =
  | "valid"
  | "expiring"
  | "expired"
  | "missing"
  | "waived";

export interface ComplianceDoc {
  label: string;
  status: ComplianceStatus;
  /** Human date or "—" when not on file. */
  expires: string;
  daysOut: number | null;
  /**
   * A short-dated pass, granted by a named person, on the promise that the
   * document is coming. It carries its own expiry so it lapses on its own -
   * a waiver nobody has to remember to revoke is just a hole in the file.
   */
  waiver?: {
    until: string;
    by: string;
    reason: string;
    grantedOn: string;
  };
}

export interface SubScorecard {
  rating: number;
  projectsCompleted: number;
  avgApprovalDays: number;
  avgDailyFt: number;
  docAccuracy: number;
  safetyIncidents: number;
  disputes: number;
  avgProductionPct: number;
}

/** A job a crew is assigned to. Carries the number so two jobs that share one
 *  are still told apart on screen. */
export interface AssignedProject {
  id: string;
  name: string;
  number: string;
}

export interface Subcontractor {
  id: string;
  company: string;
  lead: string;
  email: string;
  phone: string;
  location: string;
  trades: string[];
  state: "Active" | "Onboarding" | "Pending review" | "Invited" | "Inactive";
  tone: Tone;
  /** Vendor-packet verdict, computed server-side so the roster can count it. */
  packet: { complete: boolean; started: boolean; blocking: string[] };
  /** Real project records, not typed names — this is what gates their access. */
  assignedProjects: AssignedProject[];
  /** Whether this crew may see their own pay statements in their portal. */
  showPayToCrew: boolean;
  /** Whether their login may see the owner’s EIN, banking and signatory. */
  showOwnerDetailsToCrew: boolean;
  compliance: ComplianceDoc[];
  complianceTone: Tone;
  scorecard: SubScorecard;
  crewSize: number;
  /** Internal note — why rates differ, what kit they run. Staff only. */
  notes: string;
  /** From the required capabilities statement submitted at onboarding. */
  equipment: string[];
  since: string;
}

/* ------------------------------------------------------------------ *
 * Dailies — the digital version of the paper daily billing sheet.
 * ------------------------------------------------------------------ */

export type DailyStatus =
  | "Submitted"
  | "In review"
  | "Approved"
  | "Denied"
  | "Flagged"
  | "Draft";

export interface DailyLineItem {
  location: string;
  code: string;
  quantity: number;
  unit: "ft" | "ea";
}

export interface DailyFlag {
  tone: Tone;
  message: string;
}

export interface DailyReport {
  id: string;
  sheetNumber: string;
  project: string;
  projectId: string;
  customer: string;
  subcontractor: string;
  crew: string;
  workDate: string;
  /** The Friday this bills to. Saturday-to-Friday unless the office moved it. */
  billingWeekEnd: string;
  /** Whether that Friday came from an override rather than the work date. */
  billingWeekOverridden: boolean;
  submittedAt: string;
  status: DailyStatus;
  tone: Tone;
  totalFt: number;
  /** Gross at the customer's rate card — what this day is worth to us. */
  billableAmount: number;
  /** The same day costed against the filing sub's own signed card. */
  subCost: number | null;
  /** Gross less sub cost. Null when the sub has no rate card loaded. */
  grossMargin: number | null;
  /** Codes on this daily with no rate — the totals above exclude them. */
  unpricedCodes: number;
  lineItems: DailyLineItem[];
  photos: number;
  hasAsBuilt: boolean;
  hasBoreLog: boolean;
  flags: DailyFlag[];
  /** Supervisor decision — why it was approved or denied, and by whom. */
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

/* ------------------------------------------------------------------ *
 * Materials — every reel, vault, ped and marker tracked to a project.
 * ------------------------------------------------------------------ */

export interface Material {
  id: string;
  item: string;
  category: "Fiber" | "Conduit" | "Structures" | "Hardware";
  unit: "ft" | "ea";
  issued: number;
  installed: number;
  onHand: number;
  reelNumber: string;
  project: string;
  tone: Tone;
}

/* ------------------------------------------------------------------ *
 * Billing + subcontractor pay.
 * ------------------------------------------------------------------ */

export type InvoiceStatus =
  | "Ready to bill"
  | "Submitted"
  | "Approved"
  | "Paid"
  | "Past due";

export interface Invoice {
  id: string;
  number: string;
  customer: string;
  project: string;
  amount: number;
  status: InvoiceStatus;
  tone: Tone;
  issued: string;
  due: string;
  daysOut: number;
  backupReady: boolean;
}

export type PayAppStatus =
  | "Pending review"
  | "Approved"
  | "Scheduled"
  | "Paid"
  | "Held";

export interface PayApplication {
  id: string;
  number: string;
  subcontractor: string;
  project: string;
  period: string;
  amount: number;
  retainage: number;
  status: PayAppStatus;
  tone: Tone;
  submitted: string;
  fastPayEligible: boolean;
}

export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  category: "Production" | "Financial" | "Compliance" | "Customer";
  icon: IconKey;
  cadence: string;
}

/* ---- Prospects ----------------------------------------------------------- */

/**
 * Who this is, which decides the direction of the money: a worker or a crew is
 * somebody Fortitude would pay, a prime is somebody who would pay Fortitude.
 */
export type ProspectKind = "Worker" | "Crew" | "Prime";

export type ProspectStage =
  | "New"
  | "Contacted"
  | "Qualifying"
  | "In discussion"
  | "Won"
  | "Lost"
  | "Dormant";

export interface ProspectActivity {
  id: string;
  kind: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface Prospect {
  id: string;
  kind: ProspectKind;
  stage: ProspectStage;
  name: string;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  website: string;
  city: string;
  homeState: string;
  states: string[];
  markets: string[];
  trades: string[];
  crewSize: number;
  equipment: string[];
  rating: number;
  source: string;
  notes: string;
  nextStep: string;
  nextStepDue: string;
  lastContact: string;
  owner: string;
  convertedSubcontractorId: string | null;
  createdAt: string;
  updatedAt: string;
  activities: ProspectActivity[];
}
