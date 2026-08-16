export const metadata = {
  title: "Privacy Policy · Fortitude Infrastructure LLC",
  description:
    "How Fortitude Infrastructure LLC collects and uses information from its employees and subcontractor crews, including mobile phone numbers used for job alerts.",
};

/**
 * The privacy policy a carrier reads before approving the SMS campaign.
 *
 * The paragraph that decides approval is the one stating that mobile opt-in
 * data is never shared or sold. Vetters look for that sentence specifically,
 * and its absence is one of the most common rejection reasons — so it is its
 * own section rather than a clause buried in a list.
 */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="lede">Last updated 16 August 2026</p>

      <p>
        Fortitude Infrastructure LLC (&ldquo;Fortitude&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
        operates Vantara IQ, an internal operations system used to run underground utility and
        fiber construction work. This policy explains what information we collect about the
        people who work with us, why we hold it, and what we do not do with it.
      </p>
      <p>
        This is not a consumer service. The people whose information we hold are our own
        employees and the authorized contacts at subcontracting firms working under a signed
        agreement with us. We do not collect information from the general public.
      </p>

      <h2>Your mobile number and text messages</h2>
      <p>
        <strong>
          No mobile information will be shared with third parties or affiliates for marketing or
          promotional purposes. Information sharing to subcontractors or vendors for support
          services, such as customer service, is permitted. All other use case categories exclude
          text messaging originator opt-in data and consent; this information will not be shared
          with any third parties.
        </strong>
      </p>
      <p>
        We collect a mobile number only when you provide it to us, and we send operational text
        messages to it only if you have separately ticked the consent box during onboarding.
        Consent is not a condition of being awarded work, and you may withdraw it at any time by
        replying <strong>STOP</strong> to any message. Replying <strong>HELP</strong> returns our
        contact details. Message frequency varies with job activity. Message and data rates may
        apply.
      </p>
      <p>
        We record the date consent was given, and the date it was withdrawn if you reply STOP. We
        keep that record so we can show, if asked, that messages were sent only to people who
        agreed to receive them.
      </p>

      <h2>What else we collect</h2>
      <ul>
        <li>
          <strong>Business and contact details</strong> — legal business name, EIN, address, the
          name, phone number and email of your contact, and who signs on your behalf.
        </li>
        <li>
          <strong>Compliance documents</strong> — certificates of insurance, W-9s, executed
          agreements and non-disclosure agreements you upload.
        </li>
        <li>
          <strong>Banking details</strong> — where you have asked to be paid by ACH. Account and
          routing numbers are stored encrypted, are never returned to a browser, and every access
          is logged.
        </li>
        <li>
          <strong>Work records</strong> — daily production sheets, job site photographs, as-built
          markups and the unit quantities we bill and pay against.
        </li>
      </ul>

      <h2>Why we hold it</h2>
      <p>
        To assign work, to pay you, to meet the insurance and licensing requirements our
        customers impose on us, and to keep an accurate record of what was built. We do not use
        any of it for advertising, and we do not sell it.
      </p>

      <h2>Who can see it</h2>
      <p>
        Fortitude staff who need it to run the work. A subcontractor signed into the system sees
        only their own company&rsquo;s records — their own rates, their own documents and their
        own crews&rsquo; production. They cannot see another company&rsquo;s.
      </p>
      <p>
        We use service providers to operate the system — cloud hosting, file storage, and a
        messaging provider to deliver text messages. They process data on our instructions and
        for no purpose of their own.
      </p>
      <p>
        We may disclose information where we are required to by law, or where a customer&rsquo;s
        contract requires us to evidence insurance or licensing.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Work records and executed agreements are kept for as long as we may need them for tax,
        contractual or legal reasons. Opt-out records are kept indefinitely, so that a number
        that has asked to stop receiving messages is never re-subscribed by accident.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us what we hold about you, ask us to correct it, or withdraw your consent to
        text messages. Withdrawing consent to texts does not affect your contract with us.
      </p>

      <h2>Contact</h2>
      <p>
        Fortitude Infrastructure LLC
        <br />
        Anderson, South Carolina
        <br />
        Phone: (864) 365-1521
        <br />
        Email: office@fortitude-infra.com
      </p>
    </>
  );
}
