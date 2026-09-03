import Link from "next/link";

import { SMS_CONSENT_TEXT, SAMPLE_MESSAGES, HELP_REPLY } from "@/lib/sms-consent";
import { OptInForm } from "./opt-in-form";

export const metadata = {
  title: "Text message alerts · Vantara IQ",
  description:
    "How crews working with Fortitude Infrastructure LLC sign up for Vantara IQ job alert text messages, what those messages contain, and how to stop them.",
};

/**
 * The page a carrier opens when verifying the A2P campaign.
 *
 * The campaign was rejected for a Call to Action that could not be verified,
 * and the reason was simple: the only consent box in the product sits inside
 * the crew portal, behind a login. A reviewer with no account saw a sign-in
 * screen, which reads as a company claiming an opt-in flow that does not
 * exist.
 *
 * So this page is public, and it is not a description of the opt-in — it is
 * the opt-in, working, with the box unticked. Everything a reviewer is told to
 * look for is on it in plain sight: who is sending, what the messages are,
 * what they look like, how often, that rates may apply, how to stop, how to
 * get help, and the two policy links.
 */
export default function SmsPage() {
  return (
    <>
      <h1>Text message alerts</h1>
      <p className="lede">Last updated 3 September 2026</p>

      <p>
        <strong>Vantara IQ is operated by Fortitude Infrastructure LLC</strong>, a veteran-owned
        underground utility and fiber construction contractor in Anderson, South Carolina. We
        send operational text messages to the crews and staff who work on our jobs. This page
        explains exactly how somebody agrees to receive them, and lets you sign up or stop.
      </p>

      <h2>Sign up for job alerts</h2>
      <p>
        This form is how a crew member agrees to receive our texts. The consent box is not
        ticked for you, and nothing is sent to a number that has not been through it.
      </p>

      <OptInForm consentText={SMS_CONSENT_TEXT} />

      <h2>How people opt in</h2>
      <p>There are three ways, and no others. We never buy, rent, or import phone numbers.</p>
      <ol>
        <li>
          <strong>This page.</strong> A crew member enters their own mobile number and ticks the
          consent box above. The box is unticked by default and the button will not submit
          without it.
        </li>
        <li>
          <strong>The crew onboarding packet.</strong> When a subcontractor is engaged, their
          authorized contact completes a vendor packet inside Vantara IQ. It contains the same
          unticked consent box, with the same wording as above, sitting directly beneath the
          mobile number field. They may complete the packet and leave it unticked; that is a
          normal outcome and they still get work.
        </li>
        <li>
          <strong>Written or verbal authorization on file.</strong> A crew owner may authorize
          alerts for a number in writing or in person, in which case a member of our staff
          records the number and the date. Our staff must confirm they hold that authorization
          before any number can be added.
        </li>
      </ol>
      <p>
        Consent is recorded with the date, the wording agreed to as it read on that day, and
        where the agreement was made. Agreeing to texts is never a condition of registering,
        of using Vantara IQ, or of being awarded work.
      </p>

      <h2>What we send</h2>
      <p>
        Operational messages about work only: work assignments, priorities and due dates,
        schedule changes, project updates, daily production sheet status, and invoice and
        payment updates. <strong>We never send marketing or promotional messages.</strong>{" "}
        Message frequency varies with the work — a crew on an active job might get a few
        messages a week; a crew between jobs might get none.
      </p>

      <h3>Examples of the messages we send</h3>
      <ul>
        {SAMPLE_MESSAGES.map((m) => (
          <li key={m}>
            <code>{m}</code>
          </li>
        ))}
      </ul>

      <h2>How to stop</h2>
      <p>
        Reply <strong>STOP</strong> to any message and we stop immediately and permanently. You
        do not need to explain, and it does not affect your contract, your work, or your pay.
        Reply <strong>START</strong> to begin again, or use the form above.
      </p>
      <p>
        Reply <strong>HELP</strong> at any time and you will get: <code>{HELP_REPLY}</code>
      </p>
      <p>
        <strong>Message and data rates may apply.</strong> Carriers are not liable for delayed
        or undelivered messages.
      </p>

      <h2>Your information</h2>
      <p>
        Mobile information, including phone numbers and SMS opt-in consent data, will not be
        shared, sold, rented, or provided to third parties or affiliates for marketing or
        promotional purposes. See our <Link href="/privacy">Privacy Policy</Link> and{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>
      <p>
        Questions about these messages: <a href="mailto:support@vantaraiq.com">support@vantaraiq.com</a>.
      </p>
    </>
  );
}
