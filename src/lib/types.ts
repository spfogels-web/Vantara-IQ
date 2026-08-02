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
