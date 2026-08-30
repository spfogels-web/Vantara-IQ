import Link from "next/link";

export const metadata = {
  title: "Terms & SMS Program Conditions · Fortitude Infrastructure LLC",
  description:
    "Terms of use for Vantara IQ and the conditions of the Fortitude Infrastructure job alert text message program.",
};

/**
 * The terms a carrier reads alongside the privacy policy.
 *
 * The SMS program section is first and complete on its own: who the messages
 * go to, what they contain, how often, how to stop, and that rates may apply.
 * A vetter should not have to read the software terms to find any of it.
 */
export default function TermsPage() {
  return (
    <>
      <h1>Terms &amp; SMS Program Conditions</h1>
      <p className="lede">Last updated 16 August 2026</p>

      <h2>Vantara IQ SMS Notifications</h2>

      <h3>Program description</h3>
      <p>
        Fortitude Infrastructure LLC operates Vantara IQ SMS Notifications, a text message
        program that sends operational job alerts to its own field employees and to authorized
        contacts at subcontracting firms working under an active agreement with us. This is a
        closed program: we do not text the general public, and there is no way to join other
        than by being engaged to work with us. Messages include work assignments with the job
        and scheduled date, task priorities and due dates, schedule and crew changes, and daily
        production sheet status. We do not send marketing, promotional or advertising messages
        through this program.
      </p>

      <h3>How to join</h3>
      <p>
        By ticking the consent box on the onboarding form in our system, beside the mobile
        number the messages will go to. The box is not ticked for you, and consent is not a
        condition of being awarded work.
      </p>

      <h3>Message frequency</h3>
      <p>
        <strong>Message frequency varies.</strong> It is driven entirely by job activity —
        typically a few messages per recipient per week, and none at all in a week you are not
        scheduled.
      </p>

      <h3>Message and data rates</h3>
      <p>
        <strong>Message and data rates may apply.</strong> Fortitude does not charge for these
        messages; whatever your mobile plan charges for receiving a text is between you and your
        carrier.
      </p>

      <h3>HELP</h3>
      <p>
        Reply <strong>HELP</strong> to any message for help and our contact details, or contact
        us using the support information below.
      </p>

      <h3>STOP — opting out</h3>
      <p>
        Reply <strong>STOP</strong> to any message to stop receiving them. STOP, STOPALL,
        UNSUBSCRIBE, CANCEL, END and QUIT are all honored, and you will receive one final
        message confirming you have been unsubscribed. Reply <strong>START</strong> to begin
        receiving messages again.
      </p>

      <h3>Support</h3>
      <p>
        Fortitude Infrastructure LLC, Anderson, South Carolina. Call{" "}
        <strong>(864) 365-1521</strong> or email{" "}
        <strong>sean.fogelson@fortitude-infra.com</strong>.
      </p>

      <h3>Carrier liability</h3>
      <p>
        Delivery is not guaranteed. Carriers may delay or fail to deliver a message, and you
        should not treat a text as the only notice of anything safety-critical.
        <strong>
          {" "}
          Carriers are not liable for delayed or undelivered messages.
        </strong>
      </p>

      <h3>Privacy</h3>
      <p>
        See our <Link href="/privacy">Privacy Policy</Link> for how we handle your mobile
        number. In short: mobile information, including phone numbers and SMS opt-in consent
        data, will not be shared, sold, rented, or provided to third parties or affiliates for
        marketing or promotional purposes.
      </p>
      <h2>Use of Vantara IQ</h2>
      <p>
        Vantara IQ is Fortitude&rsquo;s internal operations system. Access is granted to
        employees and to subcontractors engaged by us, for the purpose of doing that work.
      </p>
      <ul>
        <li>
          Your login is yours. Do not share it. Tell us immediately if you think someone else has
          it.
        </li>
        <li>
          What you can see is scoped to your own company. Do not attempt to reach another
          company&rsquo;s records, rates or documents.
        </li>
        <li>
          Rates, pricing and customer information in the system are confidential and covered by
          the non-disclosure agreement you signed.
        </li>
        <li>
          Production you file — daily sheets, quantities, photographs and as-builts — must be an
          accurate record of the work performed. It is what we bill and what we pay against.
        </li>
      </ul>
      <p>
        We may suspend access at the end of an engagement or where these terms are breached. The
        system is provided for operational use and we do not warrant it will be uninterrupted or
        error-free. Nothing here replaces your subcontract agreement, which governs where the two
        conflict.
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
