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

/** The subset of a pdf-lib font this module needs, so it imports no types. */
type Measurable = { widthOfTextAtSize: (text: string, size: number) => number };

/**
 * Shorten a string until it actually fits the column it is drawn in.
 *
 * Clipping by character count is the obvious thing and it is wrong: these are
 * proportional fonts, so seventeen narrow digits and seventeen capital Ws are
 * not the same width, and a count chosen for one overflows for the other. The
 * first version of the invoice location column was clipped at 17 characters
 * and ran into the unit code at 246pt in a 166pt column.
 *
 * Measured against the real font instead, so a column holds whatever its width
 * allows and no more. The ellipsis is counted too.
 */
export function clip(text: string, maxWidth: number, font: Measurable, size: number): string {
  const s = safe(text);
  if (!s) return s;
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;

  // "..." rather than a single glyph: safe() maps the ellipsis to three dots
  // anyway, so measuring it any other way would measure the wrong string.
  const tail = "...";
  const room = maxWidth - font.widthOfTextAtSize(tail, size);
  if (room <= 0) return "";

  let cut = s.length;
  while (cut > 0 && font.widthOfTextAtSize(s.slice(0, cut), size) > room) cut--;
  return cut === 0 ? "" : s.slice(0, cut) + tail;
}
