/**
 * Is a subcontractor's vendor packet complete enough to put them to work?
 *
 * This is the same question a GC asks before anyone sets foot on site, and it
 * is deliberately not "have they filled every box". Some fields only apply to
 * some crews — a DOT number matters if they run trucks over the threshold, an
 * EMR only exists once a carrier has issued one — so requiring them all would
 * block legitimate subs and teach everyone to type junk to get past the form.
 *
 * What's required is the set Fortitude genuinely cannot pay or insure without:
 * who the legal entity is, where it is, its EIN, who signs, and where the money
 * goes. Everything else is reported as missing without blocking.
 */

export interface PacketSection {
  key: string;
  label: string;
  /** Blocks assignment when incomplete. */
  required: boolean;
  missing: string[];
  complete: boolean;
}

export interface PacketStatus {
  sections: PacketSection[];
  /** Required fields still outstanding, across every section. */
  blocking: string[];
  /** Optional fields still outstanding — worth chasing, not worth blocking. */
  optional: string[];
  complete: boolean;
  /** 0–1, across required fields only, for a progress meter. */
  progress: number;
}

export interface PacketSubject {
  legalName?: string | null;
  entityType?: string | null;
  ein?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  signatoryName?: string | null;
  apEmail?: string | null;
  paymentMethod?: string | null;
  remittanceEmail?: string | null;
  bankName?: string | null;
  accountLastFour?: string | null;
  contractorLicense?: string | null;
  dotNumber?: string | null;
  locateCert?: string | null;
  emr?: number | null;
  safetyContact?: string | null;
  references?: unknown;
}

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export function packetStatus(s: PacketSubject): PacketStatus {
  const refs = Array.isArray(s.references) ? s.references : [];

  const sections: PacketSection[] = [
    {
      key: "identity",
      label: "Business identity",
      required: true,
      missing: [
        !filled(s.legalName) && "Legal business name",
        !filled(s.entityType) && "Entity type",
        !filled(s.ein) && "EIN",
      ].filter(Boolean) as string[],
      complete: false,
    },
    {
      key: "address",
      label: "Business address",
      required: true,
      missing: [
        !filled(s.addressLine1) && "Street address",
        !filled(s.city) && "City",
        !filled(s.stateRegion) && "State",
        !filled(s.postalCode) && "ZIP",
        !filled(s.phone) && "Phone",
      ].filter(Boolean) as string[],
      complete: false,
    },
    {
      key: "signatory",
      label: "Who signs",
      required: true,
      missing: [!filled(s.signatoryName) && "Authorised signatory"].filter(Boolean) as string[],
      complete: false,
    },
    {
      key: "payment",
      label: "How you get paid",
      required: true,
      missing: [
        !filled(s.paymentMethod) && "Payment method",
        !filled(s.remittanceEmail) && "Remittance email",
        // Only chase bank identification once they've said ACH.
        s.paymentMethod === "ACH" && !filled(s.bankName) && "Bank name",
        s.paymentMethod === "ACH" && !filled(s.accountLastFour) && "Account last 4",
      ].filter(Boolean) as string[],
      complete: false,
    },
    {
      key: "licensing",
      label: "Licensing",
      required: false,
      missing: [
        !filled(s.contractorLicense) && "Contractor licence",
        !filled(s.dotNumber) && "DOT number",
        !filled(s.locateCert) && "Locate certification",
      ].filter(Boolean) as string[],
      complete: false,
    },
    {
      key: "safety",
      label: "Safety record",
      required: false,
      missing: [
        s.emr === null || s.emr === undefined ? "EMR" : "",
        !filled(s.safetyContact) && "Safety contact",
      ].filter(Boolean) as string[],
      complete: false,
    },
    {
      key: "references",
      label: "References",
      required: false,
      missing: refs.length < 2 ? [`${2 - refs.length} more reference${refs.length === 1 ? "" : "s"}`] : [],
      complete: false,
    },
  ].map((sec) => ({ ...sec, complete: sec.missing.length === 0 }));

  const required = sections.filter((s) => s.required);
  const blocking = required.flatMap((s) => s.missing);
  const optional = sections.filter((s) => !s.required).flatMap((s) => s.missing);

  const done = required.filter((s) => s.complete).length;

  return {
    sections,
    blocking,
    optional,
    complete: blocking.length === 0,
    progress: required.length === 0 ? 1 : done / required.length,
  };
}

export const ENTITY_TYPES = [
  "LLC",
  "S-Corporation",
  "C-Corporation",
  "Partnership",
  "Sole proprietor",
];

export const PAYMENT_METHODS = ["ACH", "Check"];
