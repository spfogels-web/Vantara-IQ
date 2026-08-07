/**
 * The subcontractor agreement, as readable sections.
 *
 * Shown in the onboarding flow so a crew can actually read what they are
 * signing before they download it. The signed copy still comes back as a wet
 * signature on paper — a scanned signature on a document the signer demonstrably
 * read is a stronger position than a checkbox, and it is what Fortitude asked
 * for.
 *
 * This mirrors the executed agreement. It is a reading copy, not the contract:
 * the PDF they download and sign is the operative document, and this file must
 * be updated alongside it if the agreement changes.
 */

export interface AgreementSection {
  heading: string;
  body: string[];
}

export const AGREEMENT_TITLE = "Subcontractor Agreement";

export const AGREEMENT_INTRO =
  "This agreement is subject to arbitration pursuant to applicable state arbitration laws. " +
  "It is entered into between Fortitude Infrastructure LLC, 1309 Coffeen Avenue, Suite 1200, " +
  "Sheridan, Wyoming 82801, and the subcontractor named below.";

export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    heading: "Description of work",
    body: [
      "Subcontractor agrees to perform safe, quality work in a timely manner and in accordance with all customer specifications, engineering requirements, utility requirements, prints, maps, safety standards and applicable project standards.",
      "Subcontractor acknowledges responsibility for all work performed by its employees, subcontractors, agents, operators, laborers and representatives.",
      "Subcontractor shall provide all labor, supervision, equipment, fuel, tools, transportation and incidentals necessary to complete the work unless otherwise agreed in writing.",
    ],
  },
  {
    heading: "Scope of work",
    body: [
      "Plowing, directional boring, missile boring, trenching, conduit placement, cable placement, restoration, clean-up, potholing, utility locating coordination and related telecommunications construction services.",
      "Fortitude may furnish conduit, fiber, materials, maps and associated project materials depending on the scope of work.",
      "Rates are provided separately upon execution of this agreement and completion of onboarding requirements.",
    ],
  },
  {
    heading: "Term",
    body: [
      "Construction begins after Subcontractor completes onboarding and satisfies all insurance and compliance requirements.",
      "Fortitude reserves the right to terminate immediately for safety violations, poor workmanship, customer complaints, project delays, non-compliance, insurance lapses or failure to follow specifications.",
    ],
  },
  {
    heading: "Safety & compliance",
    body: [
      "Subcontractor agrees to comply with all OSHA requirements, state and local regulations, utility owner specifications, customer standards and traffic control requirements.",
      "Any damage to utilities, property, roadways, landscaping, irrigation or third-party infrastructure caused by Subcontractor is the sole responsibility of Subcontractor.",
      "Subcontractor agrees to immediately report all damages, incidents, injuries, utility strikes or safety violations to Fortitude.",
      "Subcontractor is responsible for all repair costs, utility claims, fines, penalties, restoration costs, legal claims and customer chargebacks resulting from its operations.",
    ],
  },
  {
    heading: "Insurance",
    body: [
      "Subcontractor shall obtain, deliver and maintain Certificates of Insurance listing Fortitude Infrastructure LLC as Additional Insured.",
      "Coverage must include Workers Compensation, Commercial General Liability, Comprehensive Automobile Liability and Umbrella Liability.",
      "Limits must meet project and customer requirements prior to commencement of any work. Failure to maintain active coverage is grounds for immediate suspension or termination.",
    ],
  },
  {
    heading: "Independent contractor status",
    body: [
      "Subcontractor is an independent contractor and not an employee of Fortitude.",
      "Subcontractor is solely responsible for payroll taxes, workers compensation, employee benefits, licensing, permits, equipment, fuel, labor and compliance obligations.",
      "Nothing here creates a partnership, joint venture or employment relationship.",
    ],
  },
  {
    heading: "Invoicing",
    body: [
      "Invoices must specify type of work performed, footage completed, project/work order number, job address, daily production reports, any supplemental or additional approved work, and as-built documentation showing where work was performed.",
      "Daily sheets are required from each crew every day showing production, footage, locations worked and completed work activity.",
      "All invoices must be submitted no later than Friday at 4:00 PM EST for processing in the current billing cycle. Later submissions may be processed in the following cycle.",
      "Fortitude reserves the right to reject incomplete, inaccurate, duplicate, unsupported or unapproved invoices.",
    ],
  },
  {
    heading: "Retainage",
    body: [
      "A ten percent (10%) retainage may be held from each payment to ensure project completion and cover damages, deficiencies, incomplete work, safety violations or customer chargebacks.",
      "Retainage begins to be released after projects are inspected, approved and signed off by the customer.",
    ],
  },
  {
    heading: "Payment",
    body: [
      "NET 21 terms. Payments are made via direct deposit with the explicit consent of the recipient.",
      "Payments are subject to Fortitude's receipt of funds from the contractor; absent such receipt, Fortitude may defer payment without liability.",
      "Fortitude may withhold payment for defective or incomplete work, missing documentation, damages, safety violations, customer disputes or contract non-compliance until resolved.",
    ],
  },
  {
    heading: "Non-compete & non-circumvention",
    body: [
      "Subcontractor agrees not to enter into direct agreements with any customer, client, municipality, utility provider, contractor or project introduced by Fortitude within the applicable project areas for two (2) years following termination, without written consent.",
      "Subcontractor agrees not to solicit Fortitude employees, crews, customers, vendors or business relationships during the term and for two (2) years thereafter.",
    ],
  },
  {
    heading: "Confidentiality",
    body: [
      "Rates, contracts, customer relationships, pricing, vendor information, utility contacts, engineering and construction methods, project details, maps, prints and operational procedures are confidential.",
      "Subcontractor agrees not to disclose, copy, distribute or use such information outside the scope of this agreement.",
    ],
  },
  {
    heading: "Disputes & governing law",
    body: [
      "Both parties agree to binding arbitration. Arbitration takes place in the State of Wyoming or in the state where the work is performed, as determined by Fortitude.",
      "This agreement is governed by the laws of the State of Wyoming unless otherwise required by the laws of the state where the project is performed.",
    ],
  },
];
