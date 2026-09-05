import "server-only";

/**
 * The consent language, in one place.
 *
 * Stored on every consent record as it read on the day, and rendered on the
 * opt-in page from this same constant — so the wording a carrier sees on the
 * page and the wording in the audit trail can never drift apart. That drift is
 * the thing an audit is looking for.
 *
 * Every clause here is load-bearing for A2P approval and none of it should be
 * trimmed for tone: the brand, what the messages are, that frequency varies,
 * that rates may apply, how to stop, how to get help, and that agreeing is not
 * a condition of anything.
 */
export const SMS_CONSENT_TEXT =
  "I agree to receive operational text messages from Vantara IQ (Fortitude Infrastructure LLC) " +
  "at the mobile number I provided — work assignments, priorities and due dates, schedule " +
  "changes, project updates, daily sheet status, and invoice and payment updates. " +
  "Message frequency varies. Message and data rates may apply. " +
  "Reply STOP to opt out or HELP for help. " +
  "SMS consent is not required to register, to use Vantara IQ, or to receive work.";

/**
 * The first message somebody gets, right after they agree.
 *
 * Best practice on its own terms — a text arriving the moment you tick the
 * box is how you know the number was typed correctly and that the box did
 * something. It is also the cleanest evidence a carrier can be shown that a
 * consent was real, because it is timestamped at their end as well as ours.
 *
 * Carries the same disclosures as every other message: who is sending, that
 * frequency varies, that rates may apply, and both keywords. 147 characters,
 * so it lands as one segment — a welcome that arrives as two texts is a poor
 * first impression of a programme somebody just agreed to.
 */
export const WELCOME_MESSAGE =
  "Vantara IQ (Fortitude Infrastructure LLC): job alerts are on. " +
  "Msg frequency varies. Msg&data rates may apply. Reply STOP to opt out, HELP for help.";

/** What the messages actually look like, for the campaign submission and the page. */
export const SAMPLE_MESSAGES = [
  "Vantara IQ: New work assigned — Tall Lewis, 704152839. Due Fri 08/28. Reply STOP to opt out.",
  "Vantara IQ: Your daily for 08/26 was returned — as-built missing. Reply STOP to opt out.",
  "Vantara IQ: Invoice 8 accepted, $8,508.85, NET 21. Reply STOP to opt out.",
];

/**
 * The reply to HELP, and the text the opt-in page promises.
 *
 * One constant because a vetter texts HELP and then reads the page, and the
 * two disagreeing is a rejection. It carried support@vantaraiq.com, which
 * appears nowhere else in this business — the contact below is the one the
 * privacy policy and the terms already publish.
 *
 * 159 characters, so it lands as a single segment.
 */
export const HELP_REPLY =
  "Vantara IQ (Fortitude Infrastructure LLC) job alerts. Msg&data rates may apply. " +
  "Reply STOP to opt out. Help: (864) 365-1521 or sean.fogelson@fortitude-infra.com";
