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
        <strong>Vantara IQ is operated by Fortitude Infrastructure LLC</strong>
        (&ldquo;Fortitude&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a veteran-owned underground
        utility and fiber construction contractor in Anderson, South Carolina. Vantara IQ is the
        operations system we run the work on, and the name our text messages are sent under;
        Fortitude Infrastructure LLC is the legal entity behind it. This policy explains what
        information we collect about the people who work with us, why we hold it, and what we
        do not do with it.
      </p>
      <p>
        This is not a consumer service. The people whose information we hold are our own
        employees and the authorized contacts at subcontracting firms working under a signed
        agreement with us. We do not collect information from the general public.
      </p>

      <h2>SMS Messaging Privacy</h2>
      <p>
        <strong>
          Mobile information, including phone numbers and SMS opt-in consent data, will not be
          shared, sold, rented, or provided to third parties or affiliates for marketing or
          promotional purposes.
        </strong>
      </p>

      <h3>What we collect</h3>
      <p>
        The mobile number you give us, the date you consented to receive text messages, and the
        date you withdrew that consent if you reply STOP. We keep the consent record so we can
        show, if asked, that messages went only to people who agreed to receive them.
      </p>

      <h3>How we use it</h3>
      <p>
        Only to send you operational job messages from Vantara IQ, operated by Fortitude
        Infrastructure LLC — work assignments, task priorities and due
        dates, schedule changes, and daily production sheet status. We do not use your mobile
        number for marketing, and we do not use it to build any profile of you.
      </p>

      <h3>Who we share it with</h3>
      <p>
        Only our messaging provider, Twilio, which delivers the message on our instructions and
        for no purpose of its own. Nobody else. We do not sell, rent, trade or otherwise pass
        your number or your consent record to any third party or affiliate for marketing or
        promotional purposes.
      </p>

      <h3>Frequency, cost and opting out</h3>
      <p>
        <strong>Message frequency varies</strong> and is driven entirely by job activity —
        typically a few messages per recipient per week, and none at all in a week you are not
        scheduled. <strong>Message and data rates may apply.</strong> You may withdraw consent at
        any time by replying <strong>STOP</strong> to any message; reply <strong>HELP</strong>
        {" "}
        for help. Consent is not a condition of being awarded work.
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
        Email: sean.fogelson@fortitude-infra.com
      </p>
    </>
  );
}
