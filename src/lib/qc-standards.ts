/**
 * What a crew is held to on a job, and who says so.
 *
 * One source for both surfaces. The project shows it before anybody
 * mobilises; the daily reminds them and asks them to confirm it at submit.
 * They read from here, so the two cannot drift apart — which is the whole
 * reason this is a module and not markup in two components.
 *
 * ## Attribution is load-bearing
 *
 * Every requirement carries where it came from. That is not decoration: a
 * crew arguing a callback needs to know whether the line they missed is
 * Windstream's specification or Fortitude's paperwork rule, and those have
 * different consequences and different people to appeal to. Anything tagged
 * QCC is quoted from the manual in public/qc and carries its page; anything
 * tagged FORTITUDE is ours and says so.
 *
 * The manual's buried pages are images — the requirements live inside the
 * artwork as callout boxes, not as text — so these were read off pages 25,
 * 26, 28 and 29 rather than extracted. If the guide is revised, they have to
 * be re-read the same way.
 *
 * ## Kinetic is not the default
 *
 * A profile is resolved from the customer, and a job whose customer is not a
 * Kinetic prime gets none of it: no Kinetic manual, no page references, no
 * Kinetic-derived measurements. Falling back to Kinetic would put another
 * carrier's specification in front of a crew building to somebody else's,
 * which is worse than showing them only our own documentation rules.
 *
 * ## Not billing
 *
 * Nothing here resolves a rate, reads a rate card, or knows what anything is
 * worth. QC and money are separate questions and this module answers one.
 */

/** Where a requirement comes from, and therefore who can waive it. */
export type QcSource =
  | { kind: "QCC"; page: number }
  | { kind: "FORTITUDE" };

export type QcRequirement = {
  text: string;
  source: QcSource;
  /**
   * Whether Vantara can check this before a daily is filed.
   *
   *   "enforced"     the submit path already refuses without it
   *   "checkable"    could be checked with work, and is not today
   *   "acknowledged" only the crew can say — gravel depth is not visible to
   *                  code, and inferring it from a photograph would be
   *                  inventing compliance
   */
  verify: "enforced" | "checkable" | "acknowledged";
};

export type QcGroup = {
  id: string;
  title: string;
  /** One line on when this group applies, where that is not obvious. */
  note?: string;
  items: QcRequirement[];
};

const qcc = (page: number): QcSource => ({ kind: "QCC", page });
const ours: QcSource = { kind: "FORTITUDE" };

/* ─────────────────────────────────────────────────────────────────────────
   Kinetic OSP — read from the manual in public/qc, page by page.

   The measurements differ by structure and are NOT interchangeable. This
   file previously carried the flowerpot's trim figure under pedestals, which
   is the kind of error that reads as authoritative and sends a crew back to
   a hole for the wrong reason:

     pedestal   innerducts sealed & secured — the manual gives no trim figure
     flowerpot  duct trimmed 2–3" above gravel          (p26)
     handhole   innerducts cut 4–6" above gravel        (p29)

   Do not add a measurement to a structure the manual does not give one for.
   ──────────────────────────────────────────────────────────────────────── */

const KINETIC_GROUPS: QcGroup[] = [
  {
    id: "pedestal",
    title: "Pedestals",
    items: [
      { text: "All cables grounded independently to the GBB", source: qcc(25), verify: "acknowledged" },
      { text: "Ground rod connection visible and connected to the GBB — no higher than the top of the pedestal base", source: qcc(25), verify: "acknowledged" },
      { text: "Lid labelled with Route/Lead and Ped #, and carrying the 811 sticker", source: qcc(25), verify: "acknowledged" },
      { text: "All cables labelled correctly", source: qcc(25), verify: "acknowledged" },
      { text: "Innerducts sealed and secured", source: qcc(25), verify: "acknowledged" },
      { text: "Fire ant killer placed", source: qcc(25), verify: "acknowledged" },
      { text: "2–4 inches of pea gravel, and a moisture barrier installed", source: qcc(25), verify: "acknowledged" },
    ],
  },
  {
    id: "flowerpot",
    title: "Flowerpots",
    items: [
      { text: "Base even with grade", source: qcc(26), verify: "acknowledged" },
      { text: "Innerducts — used and spare — plugged with duct-seal putty or taped, so debris cannot enter", source: qcc(26), verify: "acknowledged" },
      { text: "2–4 inches of pea gravel for drainage, and fire ant killer", source: qcc(26), verify: "acknowledged" },
      { text: "Innerduct, microduct or dual-channel duct trimmed 2–3 inches above the gravel", source: qcc(26), verify: "acknowledged" },
    ],
  },
  {
    id: "fdh",
    title: "FDH pedestals",
    items: [
      { text: "Cable secured with ty-wraps, framing neat, labelled and tagged", source: qcc(28), verify: "acknowledged" },
      { text: "Colour-coded vinyl tape for marking cables — not colour-coded ty-wraps, which are not UV resistant and rot off", source: qcc(28), verify: "acknowledged" },
      { text: "Ground rod installed, #6 ground from the rod to the GBB, every cable grounded individually to the GBB", source: qcc(28), verify: "acknowledged" },
    ],
  },
  {
    id: "handhole",
    title: "Handholes",
    items: [
      { text: "Innerducts — used and spare — cut within 4–6 inches above the gravel", source: qcc(29), verify: "acknowledged" },
      { text: "Clutter eliminated, and ducts sealed with tape, foam or putty", source: qcc(29), verify: "acknowledged" },
      { text: "Fibre coiled neatly at the bottom, using the entire circumference of the opening", source: qcc(29), verify: "acknowledged" },
      { text: "Splice case placed on top of the fibre coil, to keep it out of water", source: qcc(29), verify: "acknowledged" },
      { text: "Fibre cables tagged within 2–3 inches of the splice case", source: qcc(29), verify: "acknowledged" },
      { text: "Approximately 2–3 inches of pea gravel in the bottom for drainage", source: qcc(29), verify: "acknowledged" },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   Fortitude's own rules. Ours, on every job, whoever the customer is.

   These are documentation and commercial rules rather than construction
   specification, and they are labelled so nobody mistakes them for the
   carrier's. A crew can be right about the build and still not be paid,
   because the evidence is what survives once the ground has closed.
   ──────────────────────────────────────────────────────────────────────── */

const FORTITUDE_GROUPS: QcGroup[] = [
  {
    id: "photos",
    title: "Photographs",
    note: "Two of every ped, handhole and FDH — one outside, one with the lid off.",
    items: [
      { text: "At least one photograph of the structures placed", source: ours, verify: "enforced" },
      { text: "Outside, before the lid comes off — the whole structure in place, with the ground around it", source: ours, verify: "acknowledged" },
      { text: "Lid off, showing the inside", source: ours, verify: "acknowledged" },
      { text: "Every photograph taken with the location stamp on — coordinates, address and heading", source: ours, verify: "acknowledged" },
      {
        // No store link. The approved application has not been confirmed by
        // name and version, and sending a crew to the wrong one of the dozen
        // apps called some variant of this is worse than sending them to ask.
        text: "Use the approved timestamp camera app on the phone, so the date, time and location are burned into the picture",
        source: ours,
        verify: "acknowledged",
      },
      { text: "Structure number and route markers in frame and readable", source: ours, verify: "acknowledged" },
    ],
  },
  {
    id: "tickmarks",
    title: "Tick marks — main line fibre and microfibre",
    note: "Any main line pull. The footage is measured off the cable, so the cable has to be photographed.",
    items: [
      { text: "Photograph the tick marks on the cable — the count has to be readable", source: ours, verify: "acknowledged" },
      { text: "The in and the out at each structure, photographed at the structure", source: ours, verify: "acknowledged" },
      { text: "The same counts entered on the daily under Tick marks, In and Out", source: ours, verify: "acknowledged" },
    ],
  },
  {
    id: "redline",
    title: "The redline print",
    items: [
      { text: "The redline print — photographs of it, or the PDF as-built", source: ours, verify: "enforced" },
      { text: "Footage between each ped and the next, and each handhole", source: ours, verify: "acknowledged" },
      { text: "Work performed marked in red, peds coloured in", source: ours, verify: "acknowledged" },
    ],
  },
  {
    id: "precon",
    title: "Before work begins",
    items: [
      { text: "Pre-construction photographs and video of the route, before anything is disturbed", source: ours, verify: "enforced" },
      { text: "Existing damage documented and classified as such", source: ours, verify: "acknowledged" },
    ],
  },
  {
    id: "billing",
    title: "What can be billed",
    items: [
      { text: "Footage bills ped to ped — a span is billable when everything between two structures is finished, not when the plow has been through", source: ours, verify: "acknowledged" },
      { text: "The road or roads worked, on every daily", source: ours, verify: "enforced" },
    ],
  },
];

/** The approved example photographs. Ours, from Rock Creek Rd. */
export const QC_EXAMPLES = [
  {
    src: "/qc/pedestal-BD4MPF.jpg",
    label: "Lid off, stamped",
    note: "811 and route markers in frame, IN and OUT written on the tray",
  },
  {
    src: "/qc/pedestal-BD4MPFrear.jpg",
    label: "The grounding, called out",
    note: "ground rod, acorn and copper wire, labelled on the picture",
  },
];

export type QcProfile = {
  id: string;
  /** What to call this standard on screen. Never a carrier a job is not on. */
  label: string;
  /** The customer's own manual, when there is one. */
  manual: { href: string; label: string; note: string } | null;
  groups: QcGroup[];
};

const KINETIC: QcProfile = {
  id: "kinetic-osp",
  label: "Kinetic OSP build standard",
  manual: {
    href: "/qc/quality-assurance-guide.pdf",
    label: "Kinetic OSP Quality Assurance Guide",
    note: "Windstream's own standard — pedestals, flowerpots, FDHs, handholes, depths, restoration",
  },
  groups: [...KINETIC_GROUPS, ...FORTITUDE_GROUPS],
};

const FORTITUDE_ONLY: QcProfile = {
  id: "fortitude-general",
  label: "Fortitude field standard",
  // No manual. This job is not built to Kinetic's specification and must not
  // be shown Kinetic's document.
  manual: null,
  groups: FORTITUDE_GROUPS,
};

const PROFILES: Record<string, QcProfile> = {
  [KINETIC.id]: KINETIC,
  [FORTITUDE_ONLY.id]: FORTITUDE_ONLY,
};

/**
 * Customer short codes that build to the Kinetic OSP standard.
 *
 * Keyed on the customer rather than the market. Both current customers happen
 * to sit in one market each — WIN in north Georgia, TRA in south — so market
 * would work today and break the first time Trawick takes a job north. The
 * customer is the thing that actually decides whose specification applies.
 *
 * WIN is Windstream: Globe Communications is the prime, Kinetic is the brand
 * on the manual, and the project rows name Windstream in their client field.
 */
const KINETIC_CUSTOMER_CODES = new Set(["WIN"]);

/**
 * Which standard applies to a job.
 *
 * Deliberately not defaulting to Kinetic. A job whose customer is unknown, or
 * known and not a Kinetic prime, gets Fortitude's own rules and nothing else —
 * showing a crew another carrier's specification because we could not work
 * out whose job it was is worse than showing them only what we require.
 */
export function qcProfileFor(project: {
  customerShortCode?: string | null;
}): QcProfile {
  const code = (project.customerShortCode ?? "").trim().toUpperCase();
  if (code && KINETIC_CUSTOMER_CODES.has(code)) return KINETIC;
  return FORTITUDE_ONLY;
}

export function qcProfileById(id: string): QcProfile {
  return PROFILES[id] ?? FORTITUDE_ONLY;
}

/** How a source reads on screen. */
export function sourceLabel(s: QcSource): string {
  return s.kind === "QCC" ? `QCC p${s.page}` : "Fortitude";
}
