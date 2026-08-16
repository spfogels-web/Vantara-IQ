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

      <h2>Job alert text message program</h2>
      <p>
        Fortitude Infrastructure LLC sends operational text messages to its own field employees
        and to authorized contacts at subcontracting firms working under an active agreement with
        us. This is a closed program. We do not text the general public, and there is no way to
        sign up other than by being engaged to work with us.
      </p>

      <h3>How you join</h3>
      <p>
        By ticking the consent box on the onboarding form in our system, beside the mobile number
        the messages will go to. The box is not ticked for you. Consent is not a condition of
        being awarded work, and declining it changes nothing about your contract — you will
        simply be contacted another way.
      </p>

      <h3>What we send</h3>
      <ul>
        <li>Work assignments — the job, the site and the scheduled date</li>
        <li>Task priority and due dates</li>
        <li>Schedule and crew reassignment changes</li>
        <li>Daily production sheet status — submitted, approved, or returned for correction</li>
        <li>Reminders when a required document or task is close to its due date</li>
      </ul>
      <p>
        Messages are operational only. We do not send marketing, promotional, advertising or
        sales messages through this program.
      </p>

      <h3>How often</h3>
      <p>
        Message frequency varies and is driven entirely by job activity — typically a few
        messages per recipient per week, and none at all in a week you are not scheduled.
      </p>

      <h3>How to stop</h3>
      <p>
        Reply <strong>STOP</strong> to any message and we will stop immediately. STOP, STOPALL,
        UNSUBSCRIBE, CANCEL, END and QUIT are all honored. Reply <strong>START</strong> to begin
        receiving them again. Reply <strong>HELP</strong> for our contact details, or call{" "}
        <strong>(864) 365-1521</strong>.
      </p>

      <h3>Costs and carriers</h3>
      <p>
        Message and data rates may apply. Fortitude does not charge for these messages; whatever
        your mobile plan charges for receiving a text is between you and your carrier. Delivery
        is not guaranteed — carriers may delay or fail to deliver a message, and you should not
        treat a text as the only notice of anything safety-critical. Carriers are not liable for
        delayed or undelivered messages.
      </p>
      <p>
        For how we handle your mobile number, see our{" "}
        <Link href="/privacy">Privacy Policy</Link>. In short: it is never shared or sold to third
        parties for marketing.
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
