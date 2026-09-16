/**
 * The product, drawn rather than photographed.
 *
 * A screenshot of the real application would carry a real customer's rate card,
 * real crew names and real money onto a public page, and cropping is not a
 * safeguard — the next screenshot is taken by somebody in a hurry. These are
 * built from the same shapes the product uses, filled with a company that does
 * not exist.
 *
 * Drawn also means they stay sharp at any size, weigh nothing, and cannot go
 * stale the way a PNG of a screen does the first time the screen changes.
 *
 * Every name, street, ticket and figure below is invented. Ridgeline Utility
 * Partners is not a customer, and neither is anybody else named here.
 */

export const INK = "#eef2f8";
export const BODY = "#c3d0e0";
export const MUTED = "#8fa0b6";
export const GOLD = "#e0a82e";
export const BRAND = "#818CF8";
export const OK = "#34D399";
export const WARN = "#F59E0B";
export const BAD = "#F87171";

const CARD = "rgba(255,255,255,0.035)";
const LINE = "rgba(255,255,255,0.09)";

/** A window the mockups sit in, so they read as an application. */
function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-2xl"
      style={{ borderColor: "rgba(255,255,255,0.12)", background: "#0b1220" }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: LINE, background: "rgba(255,255,255,0.03)" }}
      >
        <span className="flex gap-1.5">
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} className="size-2.5 rounded-full" style={{ background: c, opacity: 0.75 }} />
          ))}
        </span>
        <span
          className="ml-2 truncate rounded-md px-2 py-0.5 text-[10.5px]"
          style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}
        >
          {label}
        </span>
        <span
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(52,211,153,0.14)", color: OK }}
        >
          <span className="size-1.5 rounded-full" style={{ background: OK }} />
          Live
        </span>
      </div>
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: LINE, background: CARD }}>
      <p className="truncate text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
        {label}
      </p>
      <p className="mt-0.5 text-[16px] font-semibold tabular-nums" style={{ color: tone ?? INK }}>
        {value}
      </p>
      {sub ? (
        <p className="truncate text-[8.5px]" style={{ color: MUTED }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Operations Center — the executive screen, and the hero image.
 * ------------------------------------------------------------------ */

export function OpsCenterShot() {
  return (
    <Frame label="vantaraiq.com · operations">
      <div className="p-3 sm:p-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
          Overview
        </p>
        <p className="text-[15px] font-bold" style={{ color: INK }}>
          Operations Center
        </p>

        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Tile label="Active projects" value="12" sub="3 markets" />
          <Tile label="Installed this week" value="47,820" tone={GOLD} sub="linear feet" />
          <Tile label="Ready to bill" value="$184,250" tone={OK} sub="approved production" />
          <Tile label="Est. gross margin" value="31%" tone={OK} sub="production spread" />
        </div>

        {/* Exceptions, not a wall of green. The point of the screen is what
            needs somebody rather than what is fine. */}
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[1.25fr_1fr]">
          <div className="overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
            <p
              className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
              style={{ borderColor: LINE, color: MUTED, background: CARD }}
            >
              Needs attention
            </p>
            {[
              ["Locate expires today", "ATL-204 · Keener Rd", BAD],
              ["Daily missing", "Pace Boring · Tuesday", WARN],
              ["Project behind target", "GA-118 · 8% under", WARN],
              ["Fibre reel low", "Bellwood yard · 2,400 ft left", WARN],
              ["Invoice ready", "Ridgeline · $42,180", OK],
            ].map(([what, where, colour], i) => (
              <div
                key={String(what)}
                className="flex items-center gap-2 px-2.5 py-[7px]"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: String(colour) }} />
                <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium" style={{ color: INK }}>
                  {what}
                </span>
                <span className="hidden truncate text-[9.5px] sm:block" style={{ color: MUTED }}>
                  {where}
                </span>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
            <p
              className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
              style={{ borderColor: LINE, color: MUTED, background: CARD }}
            >
              Project health
            </p>
            <div className="p-2.5">
              {[
                ["ATL-204", 62, WARN],
                ["GA-118", 41, BAD],
                ["SC-072", 88, OK],
                ["NC-310", 74, OK],
              ].map(([name, pct, colour]) => (
                <div key={String(name)} className="mb-2 last:mb-0">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-medium" style={{ color: INK }}>
                      {name}
                    </span>
                    <span className="text-[9.5px] tabular-nums" style={{ color: MUTED }}>
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: String(colour) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-2.5 text-[9px]" style={{ color: MUTED }}>
          Ridgeline Utility Partners · week ending 12 June
        </p>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * The assistant.
 * ------------------------------------------------------------------ */

export function AssistantShot() {
  return (
    <Frame label="vantaraiq.com · assistant">
      <div className="space-y-2.5 p-3 sm:p-4">
        <Bubble side="right">What needs my attention right now?</Bubble>

        <div
          className="rounded-xl rounded-bl-sm border p-3"
          style={{ borderColor: LINE, background: CARD }}
        >
          <p className="text-[11.5px] leading-relaxed" style={{ color: BODY }}>
            Four things, worst first.
          </p>
          <ul className="mt-2 space-y-1.5">
            {[
              ["Locate 260904-001234 expires today", "Keener Rd, ATL-204. Pace Boring is scheduled there tomorrow.", BAD],
              ["GA-118 is 8% behind target", "Needs 1,950 ft a day to finish on the contract date; running 1,790.", WARN],
              ["Two dailies missing", "Pace Boring, Tuesday and Wednesday.", WARN],
              ["$184,250 ready to bill", "Approved production across 3 projects, none invoiced yet.", OK],
            ].map(([t, d, c]) => (
              <li key={String(t)} className="flex gap-2">
                <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: String(c) }} />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold" style={{ color: INK }}>
                    {t}
                  </span>
                  <span className="block text-[10.5px] leading-relaxed" style={{ color: MUTED }}>
                    {d}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Bubble side="right">Break down GA-118.</Bubble>

        <div
          className="rounded-xl rounded-bl-sm border p-3"
          style={{ borderColor: LINE, background: CARD }}
        >
          <p className="text-[11.5px] leading-relaxed" style={{ color: BODY }}>
            18,400 of 31,000 ft in the ground, 59% complete. Two crews on it. The slip started three
            weeks ago when Hollis moved to SC-072 and has not been made up since.
          </p>
        </div>
      </div>
    </Frame>
  );
}

function Bubble({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  return (
    <div className={side === "right" ? "flex justify-end" : "flex justify-start"}>
      <span
        className="max-w-[80%] rounded-xl rounded-br-sm px-3 py-2 text-[11.5px] font-medium"
        style={{ background: "rgba(129,140,248,0.16)", color: INK }}
      >
        {children}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A daily, and what it turns into.
 * ------------------------------------------------------------------ */

export function DailyShot() {
  return (
    <Frame label="vantaraiq.com · dailies">
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-[13px] font-bold" style={{ color: INK }}>
            Keener Rd
          </p>
          <p className="text-[10px]" style={{ color: BRAND }}>
            Pace Boring
          </p>
          <span
            className="ml-auto rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "rgba(52,211,153,0.16)", color: OK }}
          >
            Approved
          </span>
        </div>

        <div className="mt-2.5 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          {[
            ["BFOV(12.7)(2W) 12IN", "1,450 ft", "$4,205"],
            ["BM61(2)F road bore", "310 ft", "$2,108"],
            ["BHF(30x48x36) vault", "2 ea", "$792"],
          ].map(([code, qty, money], i) => (
            <div
              key={String(code)}
              className="flex items-center gap-2 px-2.5 py-1.5"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
            >
              <span className="min-w-0 flex-1 truncate text-[10.5px] tabular-nums" style={{ color: BODY }}>
                {code}
              </span>
              <span className="shrink-0 text-[10.5px] font-semibold tabular-nums" style={{ color: GOLD }}>
                {qty}
              </span>
              <span className="w-[54px] shrink-0 text-right text-[10.5px] tabular-nums" style={{ color: MUTED }}>
                {money}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2.5 flex gap-1.5">
          {["Redline", "6 photos", "As-built"].map((x) => (
            <span
              key={x}
              className="rounded-md border px-1.5 py-0.5 text-[9px]"
              style={{ borderColor: LINE, color: MUTED }}
            >
              {x}
            </span>
          ))}
        </div>

        {/* The point: one filing, four outcomes. */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Tile label="Billed to customer" value="$7,105" tone={GOLD} />
          <Tile label="Crew earns" value="$5,015" tone={BRAND} />
          <Tile label="Production spread" value="$2,090" tone={OK} />
          <Tile label="Retainage held" value="$355" sub="5%" />
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * Locates — the distinction nothing else draws.
 * ------------------------------------------------------------------ */

export function LocateShot() {
  return (
    <Frame label="vantaraiq.com · locates">
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: BRAND }}>
            260904-001234
          </span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "rgba(52,211,153,0.16)", color: OK }}
          >
            811 ready
          </span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "rgba(245,158,11,0.16)", color: WARN }}
          >
            Your locate required
          </span>
          <span className="ml-auto text-[10px] tabular-nums" style={{ color: MUTED }}>
            18d left
          </span>
        </div>

        <div className="mt-2.5 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          {[
            ["Power", "Clear", OK],
            ["Telecom", "Marked", OK],
            ["Gas", "Clear", OK],
            ["Water", "Marked", OK],
            ["Your own plant", "Not walked yet", WARN],
          ].map(([who, state, colour], i) => (
            <div
              key={String(who)}
              className="flex items-center gap-2 px-2.5 py-[7px]"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
            >
              <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: BODY }}>
                {who}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: String(colour) }}>
                {state}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: MUTED }}>
          Every public utility has cleared. The locate this contractor performs on its own plant has
          not been signed off, so the crew&rsquo;s own sheet says so before they break ground.
        </p>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * Materials.
 * ------------------------------------------------------------------ */

export function MaterialShot() {
  return (
    <Frame label="vantaraiq.com · materials">
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-1.5">
          <Tile label="On hand" value="184,200" sub="feet, 3 yards" />
          <Tile label="With crews" value="22,450" tone={BRAND} sub="issued, not installed" />
          <Tile label="Variance" value="1.4%" tone={WARN} sub="over tolerance" />
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          <p
            className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
            style={{ borderColor: LINE, color: MUTED, background: CARD }}
          >
            Reel R-88142 · 144ct single mode
          </p>
          {[
            ["Received", "Bellwood yard", "24,000 ft", OK],
            ["Issued", "Pace Boring · ATL-204", "12,000 ft", BRAND],
            ["Installed", "From 3 dailies", "11,840 ft", OK],
            ["Unaccounted", "Over tolerance", "160 ft", WARN],
          ].map(([stage, where, qty, colour], i) => (
            <div
              key={String(stage)}
              className="flex items-center gap-2 px-2.5 py-[7px]"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
            >
              <span className="w-[62px] shrink-0 text-[10px] font-semibold" style={{ color: String(colour) }}>
                {stage}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: MUTED }}>
                {where}
              </span>
              <span className="shrink-0 text-[10.5px] font-semibold tabular-nums" style={{ color: INK }}>
                {qty}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * The spread — the number a prime actually runs on.
 * ------------------------------------------------------------------ */

export function SpreadShot() {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: LINE, background: CARD }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUTED }}>
        One approved daily, both sides of the book
      </p>

      <div className="mt-4 space-y-3">
        {[
          ["Billed to your customer", "10,000 LF × $8.50", "$85,000", GOLD, 100],
          ["Paid to the crew", "10,000 LF × $6.00", "$60,000", BRAND, 70],
          ["Production spread", "What the job earns", "$25,000", OK, 30],
        ].map(([label, detail, amount, colour, pct]) => (
          <div key={String(label)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-[12.5px] font-semibold" style={{ color: INK }}>
                {label}
              </span>
              <span className="text-[15px] font-bold tabular-nums" style={{ color: String(colour) }}>
                {amount}
              </span>
            </div>
            <p className="text-[11px] tabular-nums" style={{ color: MUTED }}>
              {detail}
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: String(colour) }} />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
        Both numbers come off the same approved daily at each side&rsquo;s own rate card, so the invoice
        and the crew&rsquo;s statement cannot drift apart. Figures are an illustration.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The pipeline before a project exists.
 * ------------------------------------------------------------------ */

export function CrmShot() {
  return (
    <Frame label="vantaraiq.com · pipeline">
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {[
            ["Qualified", "6", MUTED],
            ["Estimating", "4", WARN],
            ["Bid submitted", "3", BRAND],
            ["Awarded", "2", OK],
          ].map(([s, n, c]) => (
            <div key={String(s)} className="rounded-lg border px-2.5 py-2" style={{ borderColor: LINE, background: CARD }}>
              <p className="truncate text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                {s}
              </p>
              <p className="text-[16px] font-semibold tabular-nums" style={{ color: String(c) }}>
                {n}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          {[
            ["Cartersville FTTH", "Bid submitted", "62,000 LF", "$520k", WARN],
            ["Westbrook backbone", "Estimating", "31,500 LF", "$268k", MUTED],
            ["Hall County aerial", "Awarded", "18,200 LF", "$154k", OK],
          ].map(([name, stage, ft, value, colour], i) => (
            <div
              key={String(name)}
              className="flex items-center gap-2 px-2.5 py-2"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold" style={{ color: INK }}>
                  {name}
                </span>
                <span className="block text-[9.5px]" style={{ color: String(colour) }}>
                  {stage}
                </span>
              </span>
              <span className="hidden shrink-0 text-[10px] tabular-nums sm:block" style={{ color: MUTED }}>
                {ft}
              </span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: GOLD }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * The phone, which is where a daily is actually filed.
 * ------------------------------------------------------------------ */

export function MobileShot() {
  return (
    <div
      className="mx-auto w-[236px] overflow-hidden rounded-[2rem] border-[6px] shadow-2xl"
      style={{ borderColor: "#1a2436", background: "#0b1220" }}
    >
      <div className="flex items-center justify-center py-1.5">
        <span className="h-1 w-14 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
      </div>
      <div className="px-3 pb-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
          Daily
        </p>
        <p className="text-[13px] font-bold" style={{ color: INK }}>
          Keener Rd
        </p>

        {/* Pre-work, before anything else. The one thing that must stop a crew. */}
        <div
          className="mt-2.5 rounded-lg border px-2.5 py-2"
          style={{ borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)" }}
        >
          <p className="text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ color: WARN }}>
            Pre-work required
          </p>
          <p className="mt-0.5 text-[10px] leading-snug" style={{ color: WARN }}>
            Your own locate is not signed off on this street.
          </p>
        </div>

        <div className="mt-2.5 space-y-1.5">
          {[
            ["Plow 12.7 2W", "1,450 ft"],
            ["Road bore", "310 ft"],
            ["Vault set", "2 ea"],
          ].map(([a, b]) => (
            <div
              key={String(a)}
              className="flex items-center justify-between rounded-lg border px-2.5 py-2"
              style={{ borderColor: LINE, background: CARD }}
            >
              <span className="text-[10.5px]" style={{ color: BODY }}>
                {a}
              </span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: GOLD }}>
                {b}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {["Photo", "Redline", "Notes"].map((x) => (
            <span
              key={x}
              className="rounded-lg border py-2 text-center text-[9.5px]"
              style={{ borderColor: LINE, color: MUTED }}
            >
              {x}
            </span>
          ))}
        </div>

        <div
          className="mt-2.5 rounded-lg py-2.5 text-center text-[11.5px] font-semibold"
          style={{ background: GOLD, color: "#0a1220" }}
        >
          Submit daily
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A task, and the proof attached to it.
 * ------------------------------------------------------------------ */

/**
 * The photo panels are drawn frames with captions, not stand-in images.
 *
 * A stock photograph of a pedestal would be the only untrue thing on this page
 * — it would not be a Vantara screen and it would not be this contractor's
 * work. A labelled slot says what goes there without pretending a picture of
 * somebody else's job is ours.
 */
function PhotoSlot({ label, caption, tone }: { label: string; caption: string; tone: string }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{ background: `${tone}1a` }}
      >
        <span className="text-[8.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tone }}>
          {label}
        </span>
      </div>
      <div
        className="grid h-[86px] place-items-center"
        style={{
          background:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.028) 0 8px, rgba(255,255,255,0.012) 8px 16px)",
        }}
      >
        <span className="text-[9.5px]" style={{ color: MUTED }}>
          {caption}
        </span>
      </div>
    </div>
  );
}

export function TaskShot() {
  return (
    <Frame label="vantaraiq.com · tasks">
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "rgba(248,113,113,0.16)", color: BAD }}
          >
            High
          </span>
          <span className="text-[13px] font-bold" style={{ color: INK }}>
            Pedestal 1847 not installed
          </span>
          <span
            className="ml-auto rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "rgba(245,158,11,0.16)", color: WARN }}
          >
            In progress
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 text-[9.5px]" style={{ color: MUTED }}>
          <span>Ridgeline · ATL-204</span>
          <span style={{ color: BRAND }}>Pace Boring · Crew 7</span>
          <span>Due today, 3:00 PM</span>
        </div>

        {/* The proof, side by side. This is the part that settles arguments. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PhotoSlot label="Before" caption="Reported 9:12 AM" tone={BAD} />
          <PhotoSlot label="After" caption="Attached 1:47 PM" tone={OK} />
        </div>

        {/* Office and field, in one place, against the job. */}
        <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          <p
            className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
            style={{ borderColor: LINE, color: MUTED, background: CARD }}
          >
            Activity
          </p>
          {[
            ["10:42", "Office", "Raised with photo, assigned to Crew 7", MUTED],
            ["10:42", "Vantara", "Texted the foreman", BRAND],
            ["10:51", "Foreman", "Heading back to the location now", INK],
            ["12:32", "Foreman", "Need another pedestal from the yard", INK],
            ["12:34", "Office", "Materials on the way", INK],
            ["1:47", "Foreman", "Photo attached, marked done", OK],
          ].map(([t, who, what, colour], i) => (
            <div
              key={String(t) + String(what)}
              className="flex gap-2 px-2.5 py-[6px]"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
            >
              <span className="w-[34px] shrink-0 text-[9px] tabular-nums" style={{ color: MUTED }}>
                {t}
              </span>
              <span className="w-[48px] shrink-0 text-[9px] font-semibold" style={{ color: MUTED }}>
                {who}
              </span>
              <span className="min-w-0 flex-1 text-[10px]" style={{ color: String(colour) }}>
                {what}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * A crew you have not hired yet, and what you know about them.
 * ------------------------------------------------------------------ */

export function CapabilityShot() {
  return (
    <Frame label="vantaraiq.com · prospects">
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold" style={{ color: INK }}>
            Marfield Underground
          </span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "rgba(129,140,248,0.16)", color: BRAND }}
          >
            Prequalified
          </span>
          <span className="ml-auto text-right">
            <span className="block text-[15px] font-bold tabular-nums" style={{ color: OK }}>
              78
            </span>
            <span className="block text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
              Score
            </span>
          </span>
        </div>
        <p className="mt-0.5 text-[9.5px]" style={{ color: MUTED }}>
          3 crews free · available now · works GA, SC
        </p>

        {/* The score, shown as its parts. A number on its own is a number
            somebody argues with. */}
        <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          <p
            className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
            style={{ borderColor: LINE, color: MUTED, background: CARD }}
          >
            Why 78
          </p>
          {[
            ["Capacity", "20/20", "3 crews they say are free", OK],
            ["Equipment", "16/20", "2 drills, 1 plough, no vac trailer", WARN],
            ["Market fit", "20/20", "Works GA and SC", OK],
            ["Availability", "20/20", "Free from the 4th", OK],
            ["Documentation", "2/10", "W-9 in, insurance and references missing", BAD],
            ["Rate fit", "0/10", "They have not quoted a rate", MUTED],
          ].map(([what, score, why, colour], i) => (
            <div
              key={String(what)}
              className="flex items-center gap-2 px-2.5 py-[6px]"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
            >
              <span className="w-[74px] shrink-0 text-[10px] font-medium" style={{ color: INK }}>
                {what}
              </span>
              <span className="w-[38px] shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: String(colour) }}>
                {score}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9.5px]" style={{ color: MUTED }}>
                {why}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2.5" style={{ borderColor: LINE, background: CARD }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
              Equipment
            </p>
            {[["Directional drill", "2 owned"], ["Plough", "1 owned"], ["Vac trailer", "rented"]].map(([a, bq]) => (
              <p key={String(a)} className="mt-1 flex justify-between text-[9.5px]" style={{ color: BODY }}>
                <span>{a}</span>
                <span style={{ color: MUTED }}>{bq}</span>
              </p>
            ))}
          </div>
          <div className="rounded-lg border p-2.5" style={{ borderColor: LINE, background: CARD }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
              What they run
            </p>
            {[["Directional bore", "900 ft/day"], ["Plough", "2,400 ft/day"], ["Splicing", "occasional"]].map(([a, bq]) => (
              <p key={String(a)} className="mt-1 flex justify-between text-[9.5px]" style={{ color: BODY }}>
                <span>{a}</span>
                <span style={{ color: GOLD }}>{bq}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}
