/**
 * Approving a daily that has no field photographs on it.
 *
 * The rule is sound and stays: approving is what turns a daily into money, and
 * doing that on a sheet with no evidence means claiming footage nobody can
 * show. What the rule could not account for is that it arrived after the work
 * did — there are days on file from before photographs were asked for, and they
 * were never going to acquire evidence retrospectively. Refusing them for ever
 * would leave a crew unpaid for work everybody agrees they did.
 *
 * So there is a way through, and it costs a reason. In a year the difference
 * between "this predates the requirement" and "nobody bothered" is not
 * something anybody will remember, so it is written down rather than recalled.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ACTIONS = readFileSync("src/app/actions.ts", "utf8");
const VIEW = readFileSync("src/components/dailies/dailies-view.tsx", "utf8");

/** reviewDaily's source, bounded at the next export. */
const REVIEW = (() => {
  const start = ACTIONS.indexOf("export async function reviewDaily");
  expect(start, "reviewDaily is missing").toBeGreaterThan(-1);
  const next = ACTIONS.indexOf("export async function", start + 1);
  return ACTIONS.slice(start, next === -1 ? undefined : next);
})();

describe("the gate still stands", () => {
  it("refuses an approval with no photographs by default", () => {
    // The override is opt-in. If the flag had defaulted the other way, every
    // approval would quietly waive the rule and nothing would say so.
    expect(REVIEW).toMatch(/count === 0 && !input\.overrideNoPhotos/);
    expect(REVIEW).toMatch(/No field photos on this daily/);
  });

  it("tells the interface why it refused, rather than making it guess", () => {
    // A button that appears by matching the wording of an error message stops
    // working the day somebody rewrites the sentence.
    expect(REVIEW).toMatch(/needsPhotoOverride: true as const/);
    expect(VIEW).toMatch(/"needsPhotoOverride" in res/);
    expect(VIEW, "the interface matches on the error text").not.toMatch(
      /error.*includes\(.*No field photos/,
    );
  });

  it("does not apply to a denial", () => {
    // Denying a daily with no photographs was never blocked, and the override
    // has no business being involved.
    expect(REVIEW).toMatch(/input\.decision === "APPROVED"/);
  });
});

describe("going through it", () => {
  it("costs a reason", () => {
    expect(REVIEW).toMatch(/count === 0 && input\.overrideNoPhotos && !note/);
    expect(REVIEW).toMatch(/Say why this one is being approved with no photographs/);
  });

  it("says so on the daily itself", () => {
    // Somebody reading the row later should not have to find the audit log to
    // learn it was approved without evidence.
    expect(REVIEW).toMatch(/Approved without field photographs/);
    expect(REVIEW).toMatch(/reviewNote: waived \?/);
  });

  it("is written to the audit log with who did it", () => {
    expect(REVIEW).toMatch(/daily\.approved_without_photos/);
    expect(REVIEW).toMatch(/actorUserId: reviewer\.id/);
    expect(REVIEW).toMatch(/actorEmail: reviewer\.email/);
    // And what it was, so the entry means something without a second lookup.
    expect(REVIEW).toMatch(/projectName/);
    expect(REVIEW).toMatch(/totalFt/);
  });

  it("is staff only, like the approval it is part of", () => {
    expect(REVIEW).toMatch(/await requireStaff\(\)/);
  });

  it("only logs when it was actually used", () => {
    // An ordinary approval must not leave a "waived" entry behind it.
    expect(REVIEW).toMatch(/const waived =[\s\S]{0,120}input\.overrideNoPhotos === true/);
    expect(REVIEW).toMatch(/if \(waived\) \{/);
  });
});

describe("it stays an exception, one daily at a time", () => {
  /**
   * A decision, pinned so it survives the next person with a backlog.
   *
   * Waiving the evidence rule across a selection in one press is a different
   * thing from waiving it on a day somebody has looked at: it turns a judgement
   * into a bulk operation, and the reason attached to it stops meaning anything
   * because it was written once for fifty days nobody read.
   *
   * If this is ever wanted, it is a deliberate decision to take — not something
   * that should arrive as a convenience on top of the single-daily path.
   */
  it("takes one daily id, not a list", () => {
    expect(REVIEW).toMatch(/dailyId: string;/);
    expect(REVIEW, "reviewDaily accepts several dailies").not.toMatch(/dailyIds/);
  });

  it("has no bulk path anywhere that waives photographs", () => {
    /**
     * Scoped to the waiver rather than to the word "bulk".
     *
     * The first version of this banned /bulkApprove/i across actions.ts and
     * failed on `bulkApproveRows` — which approves extracted rate-import rows
     * and has nothing to do with dailies or photographs. A guard that fires on
     * an unrelated feature is a guard that gets deleted rather than heeded.
     *
     * So the question is asked of the flag itself: it belongs to reviewDaily
     * and nowhere else, and it is never reached from a loop.
     */
    const everywhere = [...ACTIONS.matchAll(/overrideNoPhotos/g)].length;
    const inReviewDaily = [...REVIEW.matchAll(/overrideNoPhotos/g)].length;
    expect(inReviewDaily, "the override is not in reviewDaily at all").toBeGreaterThan(0);
    expect(
      everywhere,
      "something outside reviewDaily waives the photograph rule",
    ).toBe(inReviewDaily);

    for (const [name, source] of [
      ["actions", ACTIONS],
      ["the dailies view", VIEW],
    ] as const) {
      expect(source, `${name} waives photographs from inside a loop`).not.toMatch(
        /overrideNoPhotos[\s\S]{0,80}(\.map\(|\.forEach\(|for \(|Promise\.all)/,
      );
    }
  });

  it("asks for the reason on the daily being approved", () => {
    // One reason per day, typed against the day it belongs to — which is what
    // makes it worth anything when somebody reads it back.
    expect(VIEW).toMatch(/value=\{note\}/);
    expect(REVIEW).toMatch(/!note/);
  });
});

describe("the button", () => {
  it("appears only after the gate has refused", () => {
    // Not standing beside Approve every day inviting itself to be used.
    expect(VIEW).toMatch(/needsPhotoOverride \? \(/);
    expect(VIEW).toMatch(/Approve without photos/);
  });

  it("will not submit without a reason", () => {
    expect(VIEW).toMatch(/disabled=\{busy \|\| !note\.trim\(\)\}/);
    expect(VIEW).toMatch(/A reason is required/);
  });

  it("passes the override explicitly", () => {
    expect(VIEW).toMatch(/decide\("APPROVED", true\)/);
    // And the ordinary approve button does not.
    expect(VIEW).toMatch(/async function decide\(decision: "APPROVED" \| "DENIED", overrideNoPhotos = false\)/);
  });
});
