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
  /** Uploaded project map (Blob or data URL); may carry redline markup. */
  mapUrl?: string | null;
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

export type ComplianceStatus = "valid" | "expiring" | "expired" | "missing";

export interface ComplianceDoc {
  label: string;
  status: ComplianceStatus;
  /** Human date or "—" when not on file. */
  expires: string;
  daysOut: number | null;
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
  assignedProjects: string[];
  compliance: ComplianceDoc[];
  complianceTone: Tone;
  scorecard: SubScorecard;
  crewSize: number;
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
  submittedAt: string;
  status: DailyStatus;
  tone: Tone;
  totalFt: number;
  billableAmount: number;
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
