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

/**
 * What the messages actually look like.
 *
 * Rendered on the opt-in page and copied into the campaign submission from the
 * same array, because a carrier compares the two and any difference reads as a
 * programme that does not know its own traffic.
 *
 * Each of these is a real template, not an illustration. In order: a daily
 * approved and a daily sent back (notifyCrew from reviewDaily), a pay statement
 * issued (notifyCrew from issuing a statement), a message a person typed in the
 * messaging hub with SMS ticked, and the reply to HELP. Everything a crew
 * receives comes from one of these paths — nothing is sent on a timer.
 */
export const SAMPLE_MESSAGES = [
  "Vantara IQ: Tall Lewis — 2026-08-26 approved — It will appear on your next pay statement. Reply STOP to opt out.",
  "Vantara IQ: Tall Lewis — 2026-08-26 sent back — As-built photo is missing. Check the sheet and file it again. Reply STOP to opt out.",
  "Vantara IQ: Pay statement PS-0042 is ready — Check it against your sheets, then accept it or tell us what is wrong. Reply STOP to opt out.",
  "Vantara IQ: BFO48 reel 11427 has been issued to your crew — 4,500 ft picked up by J. Bates. Count it before you start. Reply STOP to opt out.",
  "Vantara IQ (Fortitude Infrastructure LLC) job alerts. Msg&data rates may apply. Reply STOP to opt out. Help: (864) 365-1521 or sean.fogelson@fortitude-infra.com",
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
