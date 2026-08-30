import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Read an engineering print and count what is on it.
 *
 * A print carries the job before anybody builds it — road bores, handholes,
 * pedestals, footages between stations. Counting those by eye across twenty
 * sheets is an afternoon, and the number somebody arrives at is the number the
 * job gets planned and priced against.
 *
 * Two rules, both learned from the daily importer:
 *
 * 1. **Nothing is invented.** A callout it cannot read is reported as unread,
 *    not guessed. A count that is confidently wrong is worse than a gap,
 *    because a gap gets checked.
 *
 * 2. **The evidence comes back with the number.** Every count carries the
 *    callout text it was read from and where on the sheet, so a person can
 *    verify it in seconds rather than recounting from scratch.
 *
 * This is an estimate to check, never an authority. The material list remains
 * what the job is priced against.
 */

export type MapCallout = {
  /** As written on the print — "RB", "BHF 17X30", "2\" HDPE". */
  label: string;
  /** What it means, where that is unambiguous. Empty when it is not. */
  meaning: string;
  /** How many of them were found. */
  count: number;
  /** Total feet, where the callouts carry footages. */
  feet: number | null;
  /** Sheet or page it was read from, as printed. */
  sheet: string;
  /** A few of the exact strings read, so a person can spot-check. */
  samples: string[];
};

export type MapReading = {
  /** Job name, number or exchange as printed on the title block. */
  title: string;
  sheetCount: number;
  callouts: MapCallout[];
  /** Anything illegible, ambiguous, or cut off. */
  problems: string[];
};

export function mapReadReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const asText = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number.parseFloat(asText(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const MAP_TOOL: Anthropic.Tool = {
  name: "record_map_takeoff",
  description: "Record every construction callout countable on this engineering print.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Job name/number from the title block." },
      sheetCount: { type: "number", description: "How many sheets are in this document." },
      callouts: {
        type: "array",
        description:
          "One entry per distinct callout type. Group identical callouts together and count them.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Exactly as printed, e.g. RB, BHF 17X30, 2\" HDPE." },
            meaning: {
              type: "string",
              description:
                "What it stands for, only where unambiguous — RB is a road bore. Empty if unsure.",
            },
            count: { type: "number", description: "How many appear across the whole document." },
            feet: {
              type: "number",
              description: "Total footage where callouts carry lengths. Omit if they do not.",
            },
            sheet: { type: "string", description: "Sheet number(s) these appear on." },
            samples: {
              type: "array",
              items: { type: "string" },
              description: "Up to five exact strings read, so a person can spot-check the count.",
            },
          },
          required: ["label", "count"],
        },
      },
      problems: {
        type: "array",
        items: { type: "string" },
        description: "Anything illegible, ambiguous, cut off, or that you were unsure how to count.",
      },
    },
    required: ["callouts"],
  },
};

const SYSTEM = `You are reading an engineering construction print for an underground utility and fibre contractor. Count what is on it.

WHAT MATTERS MOST
Road bores are marked RB and are the single most valuable thing to count correctly — they are expensive, they drive the schedule, and they are what somebody is checking this drawing for. Count every one.

HOW THESE PRINTS LABEL WORK
Callouts are the contractor's own unit codes with a quantity after an equals
sign. This is the single most important thing to read:

  BD4MPF=1                        one pedestal
  BM2F=1  BM53F=1  BMFAF=1        one each of those units
  BM61(2)F12IN DEPTH=25'          25 feet of missile bore
  BFOV(8.5)(1W)12IN DEPTH=411'    411 feet of plow / microduct
  BM60(1)(1 1/4)PFF=50'           50 feet of bore
  BFO12RI=535'                    535 feet of ribbon fibre in duct

A trailing apostrophe means feet. A bare number means a count of units. So
BD4MPF=1 is one pedestal, and BM61(2)F12IN DEPTH=25' is twenty-five feet of
bore — not twenty-five bores. Getting that backwards is the worst mistake
you can make on this drawing.

Report the code exactly as printed in "label", the number after the equals in
"count" when it is a unit count, and in "feet" when it carries an apostrophe.
Sum repeated callouts of the same code across the sheet and say how many
instances you added up in "samples".

SHORTHAND THAT ALSO APPEARS
Some drawings use a shorter house form. Read either:

  RB   road bore
  FP   flower pot — a round buried handhole
  BD4  pedestal (BD4MPF)      BD5  pedestal (BD5MPF)
  BHF  buried handhole, usually with a size such as BHF 17X30
  BDO  pedestal

WHAT THE LINES MEAN
Route is drawn as coloured lines, and the style carries meaning. A dashed
green line is underground route. Report the footage written along a route
against the code beside it — that is the length of that run.
HOW TO COUNT
Group identical callouts and give a count. "RB" appearing eleven times is one entry with count 11, not eleven entries. Put a few of the exact strings you read into samples so a person can check you without recounting.

WHAT NOT TO DO
Do not guess. If a callout is cut off, smudged, or you cannot tell whether two marks are the same thing, say so in problems and leave it out of the counts. A count that is confidently wrong is worse than a gap, because a gap gets checked and a wrong number gets built and billed against.

Do not infer a total that is not printed. If you counted 11 road bores, say 11 — do not add a twelfth because a legend suggests there should be one.

Do not read the legend or the symbol key as if those symbols were placed on the drawing. Count what appears on the plan itself.`;

function fileBlock(base64: string, mediaType: string): Anthropic.ContentBlockParam {
  if (mediaType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: base64,
    },
  };
}

/** Read one print. Throws only when the model cannot be reached at all. */
export async function readProjectMap(
  base64: string,
  mediaType: string,
): Promise<MapReading> {
  if (!mapReadReady()) {
    throw new Error("ANTHROPIC_API_KEY is not set, so prints cannot be read.");
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    // A takeoff is counting across many sheets — worth the deliberation.
    thinking: { type: "adaptive" },
    system: SYSTEM,
    tools: [MAP_TOOL],
    tool_choice: { type: "tool", name: "record_map_takeoff" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock(base64, mediaType),
          {
            type: "text",
            text: "Count everything countable on this print. Road bores (RB) first and most carefully. Say what you could not read rather than guessing at it.",
          },
        ],
      },
    ],
  });

  const call = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_map_takeoff",
  );
  if (!call) throw new Error("Nothing readable came back from that print.");

  const raw = call.input as Record<string, unknown>;

  const callouts: MapCallout[] = (Array.isArray(raw.callouts) ? raw.callouts : [])
    .map((c) => {
      const r = c as Record<string, unknown>;
      return {
        label: asText(r.label),
        meaning: asText(r.meaning),
        count: Math.max(0, Math.round(asNum(r.count) ?? 0)),
        feet: asNum(r.feet),
        sheet: asText(r.sheet),
        samples: Array.isArray(r.samples) ? r.samples.map(asText).filter(Boolean).slice(0, 5) : [],
      };
    })
    .filter((c) => c.label && c.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    title: asText(raw.title),
    sheetCount: Math.max(0, Math.round(asNum(raw.sheetCount) ?? 0)),
    callouts,
    problems: Array.isArray(raw.problems)
      ? (raw.problems as unknown[]).map(asText).filter(Boolean)
      : [],
  };
}

/**
 * Road bores, pulled out of a reading.
 *
 * The one number somebody opens a print to find, so it is lifted rather than
 * left for a person to spot in a list. Matches RB and the spellings that turn
 * up beside it on real drawings.
 */
export function roadBores(reading: MapReading): MapCallout | null {
  return (
    reading.callouts.find((c) =>
      /^(RB|R\.B\.|ROAD ?BORE)/i.test(c.label.trim()),
    ) ?? null
  );
}

/**
 * The counts somebody opens a print to find, lifted out of the list.
 *
 * Road bores drive the schedule and the price. Flower pots and pedestals are
 * the two most-miscounted units on a drawing, because they are small marks
 * repeated across every sheet and the eye slides over them. Everything else
 * stays in `callouts` for the full takeoff.
 */
export function headlineCounts(reading: MapReading): {
  roadBores: number;
  flowerPots: number;
  pedestals: number;
  handholes: number;
} {
  const n = (re: RegExp) =>
    reading.callouts
      .filter((c) => re.test(c.label.trim()))
      .reduce((sum, c) => sum + c.count, 0);

  return {
    roadBores: n(/^(RB|R\.B\.|ROAD ?BORE)/i),
    flowerPots: n(/^(FP|FLOWER ?POT)/i),
    // BD4, BD5 and BDO are all pedestals.
    pedestals: n(/^(BD4|BD5|BDO)/i),
    // Flower pots are handholes too, but they get their own line above — this
    // is the rectangular buried ones, which price very differently.
    handholes: n(/^BHF/i),
  };
}
