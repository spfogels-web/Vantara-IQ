import "server-only";

/**
 * Make a string the standard PDF fonts can actually draw.
 *
 * pdf-lib's built-in fonts encode WinAnsi and *throw* on anything outside it.
 * A single stray character therefore takes down a whole download - a minus
 * sign in an invoice retainage line did exactly that, and every invoice with
 * retainage returned an error page the browser dutifully saved as a .pdf.
 *
 * Rather than hunt for the next one, everything drawn goes through here.
 * Descriptions come off imported rate cards, crews type location numbers by
 * hand, and notes get written on a phone, so the character that breaks this
 * next was never going to be one we predicted. The common typographic ones are
 * mapped to their plain equivalents so the page still reads correctly;
 * anything else is dropped.
 *
 * Escapes rather than literal characters throughout: several of these are
 * invisible or indistinguishable in an editor, and a non-breaking space typed
 * into a character class is a bug nobody will ever spot by reading it.
 */
export function safe(text: string): string {
  return text
    .replace(/[\u2212\u2012\u2013\u2014\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    // Anything left outside Latin-1 has no glyph in these fonts. Dropping it
    // loses a character; keeping it loses the document.
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
}
