/**
 * Who Apex is, who works there, and who works for them.
 *
 * Four crews on Apex's own payroll and seven subcontractors, because the
 * product has to show both and they behave differently in every module that
 * touches money: a subcontractor has a rate card, an invoice and a payment; a
 * self-perform crew has none of those, and the demo must not invent them.
 */
import type { CustomerKey, MarketId } from "./catalog";

export const ORG = {
  key: "apex",
  legalName: "Apex Construction Group, LLC",
  shortName: "Apex",
  /** A demonstration organisation. Nothing it does reaches the outside world. */
  isDemo: true,
  smsEnabled: false,
  assistantEnabled: false,
  customerTerms: "Net 45",
  subTerms: "Net 30",
  retainagePct: 0.05,
  locateProvider: "Sunshine811",
  defaultState: "FL",
  supportPhone: "(813) 555-0142",
} as const;

/** Office staff. Roles are the app's own: ADMIN, PM, OFFICE, SUPERVISOR. */
export const STAFF = [
  { key: "owner", name: "Dana Whitfield", email: "dana.whitfield@apexcg.test", role: "ADMIN", title: "Owner" },
  { key: "pm-north", name: "Reggie Alvarado", email: "reggie.alvarado@apexcg.test", role: "PM", title: "Project Manager — North" },
  { key: "pm-south", name: "Priya Nandakumar", email: "priya.nandakumar@apexcg.test", role: "PM", title: "Project Manager — South" },
  { key: "office", name: "Marcy Woodbine", email: "marcy.woodbine@apexcg.test", role: "OFFICE", title: "Billing & Contracts" },
  { key: "super-aerial", name: "Cal Brennig", email: "cal.brennig@apexcg.test", role: "SUPERVISOR", title: "Aerial Superintendent" },
  { key: "super-ug", name: "Toby Marchetti", email: "toby.marchetti@apexcg.test", role: "SUPERVISOR", title: "Underground Superintendent" },
] as const;

export type StaffKey = (typeof STAFF)[number]["key"];

/**
 * Apex's own crews.
 *
 * These are not subcontractors and must never be given a subcontractor's
 * apparatus. There is no pay rate, no sub invoice and no payment for them,
 * because the schema holds no labour, equipment or burden cost — and a project
 * margin computed without those numbers would be a number the database cannot
 * actually support. Self-perform work carries production and billing only.
 */
export const IN_HOUSE_CREWS = [
  { key: "apex-aerial-1", name: "Apex Aerial 1", discipline: "aerial", supervisor: "super-aerial" as StaffKey },
  { key: "apex-ug-1", name: "Apex Underground 1", discipline: "underground", supervisor: "super-ug" as StaffKey },
  { key: "apex-hdd-1", name: "Apex HDD 1", discipline: "drilling", supervisor: "super-ug" as StaffKey },
  { key: "apex-splice-1", name: "Apex Splice 1", discipline: "splicing", supervisor: "super-aerial" as StaffKey },
] as const;

export type CrewKey = (typeof IN_HOUSE_CREWS)[number]["key"];

/**
 * Subcontractors, with the onboarding states the compliance screens exist to
 * show. `payFactor` is what Apex pays them against what it bills — the only
 * honest basis for a margin in this schema.
 */
export const SUBS = [
  { key: "vanmeer", company: "Van Meer Directional", lead: "Sam Van Meer", email: "sam@vanmeer.test", state: "ACTIVE", discipline: "drilling", payFactor: 0.62, onboarding: { nda: true, agreement: true, w9: true, coi: true, ach: true } },
  { key: "ridgeline", company: "Ridgeline Aerial", lead: "Ana Ridge", email: "ana@ridgelineaerial.test", state: "ACTIVE", discipline: "aerial", payFactor: 0.65, onboarding: { nda: true, agreement: true, w9: true, coi: true, ach: true } },
  { key: "colter", company: "Colter Trenching", lead: "Bo Colter", email: "bo@coltertrench.test", state: "ACTIVE", discipline: "plow", payFactor: 0.6, onboarding: { nda: true, agreement: true, w9: true, coi: true, ach: false } },
  { key: "pelham", company: "Pelham Splice Services", lead: "Nia Pelham", email: "nia@pelhamsplice.test", state: "ACTIVE", discipline: "splicing", payFactor: 0.68, onboarding: { nda: true, agreement: true, w9: true, coi: true, ach: true } },
  { key: "quarry", company: "Quarry Road Restoration", lead: "Ed Quarry", email: "ed@quarryroad.test", state: "ACTIVE", discipline: "restoration", payFactor: 0.7, onboarding: { nda: true, agreement: true, w9: true, coi: false, ach: true } },
  { key: "sable", company: "Sable Civil Works", lead: "Grace Sable", email: "grace@sablecivil.test", state: "ONBOARDING", discipline: "civil", payFactor: 0.66, onboarding: { nda: true, agreement: true, w9: false, coi: false, ach: false } },
  { key: "tarpon", company: "Tarpon Fiber Crews", lead: "Luis Tarpon", email: "luis@tarponfiber.test", state: "INVITED", discipline: "ftth", payFactor: 0.64, onboarding: { nda: false, agreement: false, w9: false, coi: false, ach: false } },
] as const;

export type SubKey = (typeof SUBS)[number]["key"];
export const subOf = (key: SubKey) => SUBS.find((s) => s.key === key)!;

/**
 * Crew logins, so the subcontractor's own view of the product exists.
 *
 * Two of them, on purpose, belonging to different subcontractors. One proves
 * a crew sees its own work; two prove a crew cannot see the other's — rates,
 * payments, dailies or jobs — which is the property a prime contractor will
 * want demonstrated before they put their subs on somebody else's software.
 *
 * Demo identities. The addresses are on a .test domain that cannot receive
 * mail, there is no password hash, and nothing in the seed invites, texts or
 * emails anybody: these rows are written directly.
 */
export const SUB_USERS = [
  {
    key: "vanmeer-lead",
    name: "Sam Van Meer",
    email: "sam.vanmeer@vanmeer.test",
    sub: "vanmeer" as SubKey,
    subUserRole: "OWNER",
  },
  {
    key: "ridgeline-lead",
    name: "Ana Ridge",
    email: "ana.ridge@ridgelineaerial.test",
    sub: "ridgeline" as SubKey,
    subUserRole: "OWNER",
  },
] as const;

export type SubUserKey = (typeof SUB_USERS)[number]["key"];

/** Yards, so materials have somewhere to live. */
export const YARDS = [
  { key: "tampa-yard", name: "Apex Tampa Yard", market: "tampa-bay" as MarketId, city: "Plant City", state: "FL", manager: "Toby Marchetti" },
  { key: "orlando-yard", name: "Apex Orlando Yard", market: "orlando-metro" as MarketId, city: "Ocoee", state: "FL", manager: "Cal Brennig" },
  { key: "ocala-yard", name: "Apex Ocala Yard", market: "north-florida" as MarketId, city: "Ocala", state: "FL", manager: "Reggie Alvarado" },
] as const;

export type YardKey = (typeof YARDS)[number]["key"];

/** Who bills whom, for the CRM pipeline. */
export type ProspectSeed = {
  key: string;
  name: string;
  kind: "SUBCONTRACTOR" | "CUSTOMER";
  stage: string;
  market: MarketId;
  owner: StaffKey;
  /** Days before the anchor the last activity happened. */
  lastTouchDays: number;
  /** Days from the anchor the next follow-up is due; negative is overdue. */
  followUpDays: number;
};

export const PROSPECTS: ProspectSeed[] = [
  { key: "kestrel", name: "Kestrel Underground", kind: "SUBCONTRACTOR", stage: "QUALIFYING", market: "tampa-bay", owner: "pm-south", lastTouchDays: 3, followUpDays: 2 },
  { key: "brightline", name: "Brightline Boring", kind: "SUBCONTRACTOR", stage: "CONTACTED", market: "orlando-metro", owner: "pm-north", lastTouchDays: 9, followUpDays: -2 },
  { key: "sandhill", name: "Sandhill Communications", kind: "CUSTOMER", stage: "PROPOSAL", market: "north-florida", owner: "owner", lastTouchDays: 1, followUpDays: 4 },
  { key: "gulfport", name: "Gulfport Networks", kind: "CUSTOMER", stage: "NEGOTIATION", market: "gulf-coast", owner: "owner", lastTouchDays: 5, followUpDays: 1 },
  { key: "arbor", name: "Arbor Line Services", kind: "SUBCONTRACTOR", stage: "NEW", market: "space-coast", owner: "pm-north", lastTouchDays: 14, followUpDays: -6 },
  { key: "redfish", name: "Redfish Splice Co", kind: "SUBCONTRACTOR", stage: "QUALIFYING", market: "gulf-coast", owner: "pm-south", lastTouchDays: 2, followUpDays: 6 },
  { key: "marlow", name: "Marlow Utility", kind: "CUSTOMER", stage: "CONTACTED", market: "tampa-bay", owner: "owner", lastTouchDays: 21, followUpDays: -9 },
  { key: "everglade", name: "Everglade Fiber", kind: "CUSTOMER", stage: "WON", market: "orlando-metro", owner: "owner", lastTouchDays: 30, followUpDays: 25 },
  { key: "pinecrest", name: "Pinecrest Boring", kind: "SUBCONTRACTOR", stage: "LOST", market: "north-florida", owner: "pm-north", lastTouchDays: 45, followUpDays: 60 },
  { key: "tallow", name: "Tallow Creek Civil", kind: "SUBCONTRACTOR", stage: "PROPOSAL", market: "gulf-coast", owner: "pm-south", lastTouchDays: 6, followUpDays: 3 },
  { key: "seabreeze", name: "Seabreeze Broadband", kind: "CUSTOMER", stage: "QUALIFYING", market: "space-coast", owner: "owner", lastTouchDays: 11, followUpDays: 8 },
  { key: "oakvale", name: "Oakvale Directional", kind: "SUBCONTRACTOR", stage: "CONTACTED", market: "tampa-bay", owner: "pm-south", lastTouchDays: 4, followUpDays: 5 },
];

/** Customers whose pipeline entries became real customers. */
export const WON_TO_CUSTOMER: Partial<Record<string, CustomerKey>> = { everglade: "mereside" };
