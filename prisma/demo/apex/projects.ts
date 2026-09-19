/**
 * Eighteen jobs, each one there to make a question answerable.
 *
 * A demo dataset is usually a pile of plausible rows that no question can be
 * asked of. These are the other way round: every project exists because some
 * screen or some question needs a job in exactly that condition, and the
 * storyline tag says which. The validator reads these tags and proves the
 * condition is real in the data rather than merely labelled — a project tagged
 * `missing-daily` has to have an actual gap in its production history, not a
 * flag claiming one.
 */
import type { CodeId, CustomerKey, MarketId } from "./catalog";
import type { CrewKey, SubKey } from "./org";

/** What a project is here to demonstrate. One project may carry several. */
export type Storyline =
  | "healthy"
  | "behind-production"
  | "waiting-on-locates"
  | "locate-expiring"
  | "missing-daily"
  | "missing-asbuilt"
  | "awaiting-verification"
  | "material-constrained"
  | "punch-list"
  | "ready-to-bill"
  | "billed-unpaid"
  | "sub-payment-pending"
  | "completed"
  | "upcoming";

export type ProjectSeed = {
  key: string;
  number: string;
  name: string;
  customer: CustomerKey;
  market: MarketId;
  location: string;
  /** The work this job actually is, which decides the codes its dailies carry. */
  codes: CodeId[];
  /** Who performs it. A sub key means billable cost exists; a crew key means it does not. */
  performedBy: { kind: "sub"; key: SubKey } | { kind: "crew"; key: CrewKey };
  pm: "pm-north" | "pm-south";
  status: "Active" | "Completed" | "Upcoming";
  storylines: Storyline[];
  /** Feet of the job, and how much is left, so pace is computable rather than typed. */
  totalFt: number;
  remainingFt: number;
  requiredFtPerDay: number;
  /** Working days of production history to generate. */
  historyDays: number;
  /** Days from the anchor the job is due. Negative is already past. */
  deadlineDays: number;
};

export const PROJECTS: ProjectSeed[] = [
  // ---- Calderon · Tampa Bay -------------------------------------------------
  {
    key: "riverview-ftth", number: "APX-1041", name: "Riverview FTTH Phase 2",
    customer: "calderon", market: "tampa-bay", location: "Riverview, FL",
    codes: ["AFO144I", "AFOSTR", "FTHDRP", "FTHNAP", "FTHONT", "SPLRIB"],
    performedBy: { kind: "crew", key: "apex-aerial-1" }, pm: "pm-south",
    status: "Active", storylines: ["healthy"],
    totalFt: 42000, remainingFt: 11800, requiredFtPerDay: 1350, historyDays: 45, deadlineDays: 24,
  },
  {
    key: "brandon-backbone", number: "APX-1042", name: "Brandon Backbone Reroute",
    customer: "calderon", market: "tampa-bay", location: "Brandon, FL",
    codes: ["UFO288I", "UFOCND2", "DD4IN", "UFOVLT", "RSTASP"],
    performedBy: { kind: "sub", key: "vanmeer" }, pm: "pm-south",
    status: "Active", storylines: ["behind-production", "punch-list", "sub-payment-pending"],
    totalFt: 28000, remainingFt: 17400, requiredFtPerDay: 900, historyDays: 42, deadlineDays: 9,
  },
  {
    key: "plantcity-drop", number: "APX-1043", name: "Plant City Drop Build",
    customer: "calderon", market: "tampa-bay", location: "Plant City, FL",
    codes: ["FTHDRP", "FTHONT", "PLW12"],
    performedBy: { kind: "sub", key: "colter" }, pm: "pm-south",
    status: "Active", storylines: ["missing-daily", "awaiting-verification"],
    totalFt: 16500, remainingFt: 6100, requiredFtPerDay: 620, historyDays: 38, deadlineDays: 20,
  },
  {
    key: "lutz-crossing", number: "APX-1044", name: "Lutz Highway Crossings",
    customer: "calderon", market: "tampa-bay", location: "Lutz, FL",
    codes: ["DD4IN", "DDRCK", "MSL2IN", "RSTASP"],
    performedBy: { kind: "sub", key: "vanmeer" }, pm: "pm-south",
    status: "Active", storylines: ["waiting-on-locates", "locate-expiring"],
    totalFt: 4200, remainingFt: 3100, requiredFtPerDay: 180, historyDays: 24, deadlineDays: 15,
  },
  // ---- Calderon · Gulf Coast ------------------------------------------------
  {
    key: "sarasota-aerial", number: "APX-1051", name: "Sarasota Aerial Rebuild",
    customer: "calderon", market: "gulf-coast", location: "Sarasota, FL",
    // Same code as Riverview, different market — the price must differ.
    codes: ["AFO144I", "AFO288I", "AFOANC", "AFOSTR", "RSTCON"],
    performedBy: { kind: "sub", key: "ridgeline" }, pm: "pm-south",
    status: "Active", storylines: ["ready-to-bill", "sub-payment-pending"],
    totalFt: 31000, remainingFt: 9200, requiredFtPerDay: 1100, historyDays: 48, deadlineDays: 18,
  },
  {
    key: "venice-restore", number: "APX-1052", name: "Venice Restoration Package",
    customer: "calderon", market: "gulf-coast", location: "Venice, FL",
    codes: ["RSTASP", "RSTCON", "RSTSOD"],
    performedBy: { kind: "sub", key: "quarry" }, pm: "pm-south",
    status: "Active", storylines: ["punch-list", "awaiting-verification", "sub-payment-pending"],
    totalFt: 9800, remainingFt: 2400, requiredFtPerDay: 0, historyDays: 34, deadlineDays: 11,
  },
  {
    key: "northport-blow", number: "APX-1053", name: "North Port Fiber Blow",
    customer: "calderon", market: "gulf-coast", location: "North Port, FL",
    codes: ["BLW144", "BLW288", "SPLCAS", "SPLTST"],
    performedBy: { kind: "crew", key: "apex-splice-1" }, pm: "pm-south",
    status: "Active", storylines: ["material-constrained"],
    totalFt: 22000, remainingFt: 13500, requiredFtPerDay: 800, historyDays: 30, deadlineDays: 22,
  },
  // ---- Mereside · Orlando Metro --------------------------------------------
  {
    key: "ocoee-ftth", number: "APX-2011", name: "Ocoee FTTH Release 4",
    customer: "mereside", market: "orlando-metro", location: "Ocoee, FL",
    codes: ["FTHDRP", "FTHNAP", "FTHONT", "AFO48I", "SPLRIB"],
    performedBy: { kind: "sub", key: "tarpon" }, pm: "pm-north",
    status: "Active", storylines: ["healthy", "ready-to-bill"],
    totalFt: 38000, remainingFt: 12900, requiredFtPerDay: 1250, historyDays: 46, deadlineDays: 26,
  },
  {
    key: "apopka-splice", number: "APX-2012", name: "Apopka Splice & Test",
    customer: "mereside", market: "orlando-metro", location: "Apopka, FL",
    codes: ["SPLRIB", "SPLCAS", "SPLTST"],
    performedBy: { kind: "sub", key: "pelham" }, pm: "pm-north",
    status: "Active", storylines: ["billed-unpaid"],
    totalFt: 0, remainingFt: 0, requiredFtPerDay: 0, historyDays: 70, deadlineDays: 6,
  },
  {
    key: "clermont-ug", number: "APX-2013", name: "Clermont Underground Extension",
    customer: "mereside", market: "orlando-metro", location: "Clermont, FL",
    codes: ["UFO144I", "UFOCND2", "UFOHH24", "TRN24", "RSTSOD"],
    performedBy: { kind: "crew", key: "apex-ug-1" }, pm: "pm-north",
    status: "Active", storylines: ["behind-production", "missing-asbuilt"],
    totalFt: 26500, remainingFt: 16800, requiredFtPerDay: 850, historyDays: 44, deadlineDays: 7,
  },
  // ---- Mereside · Space Coast ----------------------------------------------
  {
    key: "melbourne-aerial", number: "APX-2021", name: "Melbourne Aerial Overlash",
    customer: "mereside", market: "space-coast", location: "Melbourne, FL",
    codes: ["AFO48I", "AFO144I", "AFOSTR", "AFOANC"],
    performedBy: { kind: "sub", key: "ridgeline" }, pm: "pm-north",
    status: "Active", storylines: ["healthy", "sub-payment-pending"],
    totalFt: 19500, remainingFt: 5400, requiredFtPerDay: 700, historyDays: 42, deadlineDays: 19,
  },
  {
    key: "palmbay-drop", number: "APX-2022", name: "Palm Bay Drop Program",
    customer: "mereside", market: "space-coast", location: "Palm Bay, FL",
    codes: ["FTHDRP", "FTHONT", "AFO48I"],
    performedBy: { kind: "sub", key: "tarpon" }, pm: "pm-north",
    status: "Upcoming", storylines: ["upcoming"],
    totalFt: 14000, remainingFt: 14000, requiredFtPerDay: 560, historyDays: 0, deadlineDays: 48,
  },
  // ---- Halstead · North Florida --------------------------------------------
  {
    key: "gainesville-ug", number: "APX-3011", name: "Gainesville Conduit Package",
    customer: "halstead", market: "north-florida", location: "Gainesville, FL",
    codes: ["UFOCND2", "UFO144I", "UFOVLT", "DD2IN", "RSTASP"],
    performedBy: { kind: "sub", key: "colter" }, pm: "pm-north",
    status: "Active", storylines: ["waiting-on-locates", "material-constrained", "sub-payment-pending"],
    totalFt: 21000, remainingFt: 14200, requiredFtPerDay: 720, historyDays: 36, deadlineDays: 17,
  },
  {
    key: "ocala-bore", number: "APX-3012", name: "Ocala Rock Bore Series",
    customer: "halstead", market: "north-florida", location: "Ocala, FL",
    codes: ["DDRCK", "DD4IN", "RSTASP"],
    performedBy: { kind: "sub", key: "vanmeer" }, pm: "pm-north",
    status: "Active", storylines: ["locate-expiring", "awaiting-verification", "billed-unpaid"],
    totalFt: 3600, remainingFt: 1500, requiredFtPerDay: 150, historyDays: 70, deadlineDays: 13,
  },
  {
    key: "lakecity-plow", number: "APX-3013", name: "Lake City Plow Route",
    customer: "halstead", market: "north-florida", location: "Lake City, FL",
    codes: ["PLW12", "TRN24", "MSL2IN", "RSTSOD"],
    performedBy: { kind: "crew", key: "apex-ug-1" }, pm: "pm-north",
    status: "Completed", storylines: ["completed"],
    totalFt: 18000, remainingFt: 0, requiredFtPerDay: 750, historyDays: 52, deadlineDays: -12,
  },
  // ---- Brightwater · Gulf Coast (no crew number on file) --------------------
  {
    key: "osprey-civil", number: "APX-4011", name: "Osprey Equipment Pads",
    customer: "brightwater", market: "gulf-coast", location: "Osprey, FL",
    codes: ["CIVPAD", "CIVBOL", "RSTSOD", "TRN24"],
    performedBy: { kind: "sub", key: "sable" }, pm: "pm-south",
    status: "Active", storylines: ["missing-asbuilt", "punch-list", "billed-unpaid"],
    totalFt: 5200, remainingFt: 1900, requiredFtPerDay: 260, historyDays: 70, deadlineDays: 14,
  },
  // ---- Ardent · North Florida ----------------------------------------------
  {
    key: "ardent-duct", number: "APX-5011", name: "Ardent Duct Bank Phase 1",
    customer: "ardent", market: "north-florida", location: "Ocala, FL",
    codes: ["UFOCND2", "UFOVLT", "DD4IN", "CIVPAD", "RSTASP"],
    performedBy: { kind: "sub", key: "sable" }, pm: "pm-north",
    status: "Active", storylines: ["billed-unpaid", "ready-to-bill"],
    totalFt: 12500, remainingFt: 4800, requiredFtPerDay: 520, historyDays: 74, deadlineDays: 21,
  },
  {
    key: "ardent-restore", number: "APX-5012", name: "Ardent Restoration Closeout",
    customer: "ardent", market: "north-florida", location: "Alachua, FL",
    codes: ["RSTASP", "RSTSOD", "CIVBOL"],
    performedBy: { kind: "sub", key: "quarry" }, pm: "pm-north",
    status: "Completed", storylines: ["completed"],
    totalFt: 7400, remainingFt: 0, requiredFtPerDay: 0, historyDays: 40, deadlineDays: -25,
  },
];

/** Every storyline the dataset promises to contain. The validator checks all. */
export const REQUIRED_STORYLINES: Storyline[] = [
  "healthy", "behind-production", "waiting-on-locates", "locate-expiring",
  "missing-daily", "missing-asbuilt", "awaiting-verification", "material-constrained",
  "punch-list", "ready-to-bill", "billed-unpaid", "sub-payment-pending",
  "completed", "upcoming",
];

export const projectsWith = (s: Storyline) => PROJECTS.filter((p) => p.storylines.includes(s));
