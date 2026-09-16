import type { T } from "@/lib/i18n";

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
 *
 * Each shot takes the translator, because a Spanish reader shown English
 * screenshots is being told the product is English. The labels and the prose
 * translate; the invented street names, job numbers, unit codes and dollar
 * figures do not — those are what a US job actually looks like on the screen,
 * and a translated unit code would be a lie about the customer's own form.
 */

export const INK = "var(--mk-ink)";
export const BODY = "var(--mk-body)";
export const MUTED = "var(--mk-muted)";
export const GOLD = "var(--mk-gold)";
export const BRAND = "var(--mk-brand)";
export const OK = "var(--mk-ok)";
export const WARN = "var(--mk-warn)";
export const BAD = "var(--mk-bad)";

const CARD = "var(--mk-card)";
const LINE = "var(--mk-line)";
const SURFACE = "var(--mk-surface)";

/** A window the mockups sit in, so they read as an application. */
function Frame({ label, t, children }: { label: string; t: T; children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-2xl"
      style={{ borderColor: LINE, background: SURFACE }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: LINE, background: CARD }}
      >
        <span className="flex gap-1.5">
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} className="size-2.5 rounded-full" style={{ background: c, opacity: 0.75 }} />
          ))}
        </span>
        <span
          className="ml-2 truncate rounded-md px-2 py-0.5 text-[10.5px]"
          style={{ background: "var(--mk-card)", color: MUTED }}
        >
          {t(label)}
        </span>
        <span
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--mk-ok) 14%, transparent)", color: OK }}
        >
          <span className="size-1.5 rounded-full" style={{ background: OK }} />
          {t("Live")}
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

export function OpsCenterShot({ t }: { t: T }) {
  return (
    <Frame label="vantaraiq.com · operations" t={t}>
      <div className="p-3 sm:p-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
          {t("Overview")}
        </p>
        <p className="text-[15px] font-bold" style={{ color: INK }}>
          {t("Operations Center")}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Tile label={t("Active projects")} value="12" sub={t("3 markets")} />
          <Tile label={t("Installed this week")} value="47,820" tone={GOLD} sub={t("linear feet")} />
          <Tile label={t("Ready to bill")} value="$184,250" tone={OK} sub={t("approved production")} />
          <Tile label={t("Est. gross margin")} value="31%" tone={OK} sub={t("production spread")} />
        </div>

        {/* Exceptions, not a wall of green. The point of the screen is what
            needs somebody rather than what is fine. */}
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[1.25fr_1fr]">
          <div className="overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
            <p
              className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
              style={{ borderColor: LINE, color: MUTED, background: CARD }}
            >
              {t("Needs attention")}
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
                  {t(String(what))}
                </span>
                <span className="hidden truncate text-[9.5px] sm:block" style={{ color: MUTED }}>
                  {t(String(where))}
                </span>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
            <p
              className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
              style={{ borderColor: LINE, color: MUTED, background: CARD }}
            >
              {t("Project health")}
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
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--mk-hair)" }}>
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
          Ridgeline Utility Partners · {t("week ending 12 June")}
        </p>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * The assistant.
 * ------------------------------------------------------------------ */

export function AssistantShot({ t }: { t: T }) {
  return (
    <Frame label="vantaraiq.com · assistant" t={t}>
      <div className="space-y-2.5 p-3 sm:p-4">
        <Bubble side="right">{t("What needs my attention right now?")}</Bubble>

        <div
          className="rounded-xl rounded-bl-sm border p-3"
          style={{ borderColor: LINE, background: CARD }}
        >
          <p className="text-[11.5px] leading-relaxed" style={{ color: BODY }}>
            {t("Four things, worst first.")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {[
              [
                "Locate 260904-001234 expires today",
                "Keener Rd, ATL-204. Pace Boring is scheduled there tomorrow.",
                BAD,
              ],
              [
                "GA-118 is 8% behind target",
                "Needs 1,950 ft a day to finish on the contract date; running 1,790.",
                WARN,
              ],
              ["Two dailies missing", "Pace Boring, Tuesday and Wednesday.", WARN],
              [
                "$184,250 ready to bill",
                "Approved production across 3 projects, none invoiced yet.",
                OK,
              ],
            ].map(([label, d, c]) => (
              <li key={String(label)} className="flex gap-2">
                <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: String(c) }} />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold" style={{ color: INK }}>
                    {t(String(label))}
                  </span>
                  <span className="block text-[10.5px] leading-relaxed" style={{ color: MUTED }}>
                    {t(String(d))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Bubble side="right">{t("Break down GA-118.")}</Bubble>

        <div
          className="rounded-xl rounded-bl-sm border p-3"
          style={{ borderColor: LINE, background: CARD }}
        >
          <p className="text-[11.5px] leading-relaxed" style={{ color: BODY }}>
            {t(
              "18,400 of 31,000 ft in the ground, 59% complete. Two crews on it. The slip started three weeks ago when Hollis moved to SC-072 and has not been made up since.",
            )}
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
        style={{ background: "color-mix(in srgb, var(--mk-brand) 16%, transparent)", color: INK }}
      >
        {children}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A daily, and what it turns into.
 * ------------------------------------------------------------------ */

export function DailyShot({ t }: { t: T }) {
  return (
    <Frame label="vantaraiq.com · dailies" t={t}>
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
            style={{ background: "color-mix(in srgb, var(--mk-ok) 16%, transparent)", color: OK }}
          >
            {t("Approved")}
          </span>
        </div>

        {/* The unit codes are the customer's own and stay in their own
            spelling in every language — a translated code is a code that does
            not match the form it is billed against. */}
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

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {["Redline", "6 photos", "As-built"].map((x) => (
            <span
              key={x}
              className="rounded-md border px-1.5 py-0.5 text-[9px]"
              style={{ borderColor: LINE, color: MUTED }}
            >
              {t(x)}
            </span>
          ))}
        </div>

        {/* The point: one filing, four outcomes. */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Tile label={t("Billed to customer")} value="$7,105" tone={GOLD} />
          <Tile label={t("Crew earns")} value="$5,015" tone={BRAND} />
          <Tile label={t("Production spread")} value="$2,090" tone={OK} />
          <Tile label={t("Retainage held")} value="$355" sub="5%" />
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * Locates — the distinction nothing else draws.
 * ------------------------------------------------------------------ */

export function LocateShot({ t }: { t: T }) {
  return (
    <Frame label="vantaraiq.com · locates" t={t}>
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: BRAND }}>
            260904-001234
          </span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "color-mix(in srgb, var(--mk-ok) 16%, transparent)", color: OK }}
          >
            {t("811 ready")}
          </span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "color-mix(in srgb, var(--mk-warn) 16%, transparent)", color: WARN }}
          >
            {t("Your locate required")}
          </span>
          <span className="ml-auto text-[10px] tabular-nums" style={{ color: MUTED }}>
            {t("18d left")}
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
                {t(String(who))}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: String(colour) }}>
                {t(String(state))}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: MUTED }}>
          {t(
            "Every public utility has cleared. The locate this contractor performs on its own plant has not been signed off, so the crew’s own sheet says so before they break ground.",
          )}
        </p>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * Materials.
 * ------------------------------------------------------------------ */

export function MaterialShot({ t }: { t: T }) {
  return (
    <Frame label="vantaraiq.com · materials" t={t}>
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-1.5">
          <Tile label={t("On hand")} value="184,200" sub={t("feet, 3 yards")} />
          <Tile label={t("With crews")} value="22,450" tone={BRAND} sub={t("issued, not installed")} />
          <Tile label={t("Variance")} value="1.4%" tone={WARN} sub={t("over tolerance")} />
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          <p
            className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
            style={{ borderColor: LINE, color: MUTED, background: CARD }}
          >
            {t("Reel R-88142 · 144ct single mode")}
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
                {t(String(stage))}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: MUTED }}>
                {t(String(where))}
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

export function SpreadShot({ t }: { t: T }) {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: LINE, background: CARD }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUTED }}>
        {t("One approved daily, both sides of the book")}
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
                {t(String(label))}
              </span>
              <span className="text-[15px] font-bold tabular-nums" style={{ color: String(colour) }}>
                {amount}
              </span>
            </div>
            <p className="text-[11px] tabular-nums" style={{ color: MUTED }}>
              {t(String(detail))}
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "var(--mk-hair)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: String(colour) }} />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
        {t(
          "Both numbers come off the same approved daily at each side’s own rate card, so the invoice and the crew’s statement cannot drift apart. Figures are an illustration.",
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The pipeline before a project exists.
 * ------------------------------------------------------------------ */

export function CrmShot({ t }: { t: T }) {
  return (
    <Frame label="vantaraiq.com · pipeline" t={t}>
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
                {t(String(s))}
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
                  {t(String(stage))}
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

export function MobileShot({ t }: { t: T }) {
  return (
    <div
      className="mx-auto w-[236px] max-w-full overflow-hidden rounded-[2rem] border-[6px] shadow-2xl"
      style={{ borderColor: "var(--mk-line)", background: SURFACE }}
    >
      <div className="flex items-center justify-center py-1.5">
        <span className="h-1 w-14 rounded-full" style={{ background: "var(--mk-hair)" }} />
      </div>
      <div className="px-3 pb-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
          {t("Daily")}
        </p>
        <p className="text-[13px] font-bold" style={{ color: INK }}>
          Keener Rd
        </p>

        {/* Pre-work, before anything else. The one thing that must stop a crew. */}
        <div
          className="mt-2.5 rounded-lg border px-2.5 py-2"
          style={{ borderColor: "color-mix(in srgb, var(--mk-warn) 40%, transparent)", background: "color-mix(in srgb, var(--mk-warn) 9%, transparent)" }}
        >
          <p className="text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ color: WARN }}>
            {t("Pre-work required")}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug" style={{ color: WARN }}>
            {t("Your own locate is not signed off on this street.")}
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
              className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2"
              style={{ borderColor: LINE, background: CARD }}
            >
              <span className="min-w-0 truncate text-[10.5px]" style={{ color: BODY }}>
                {t(String(a))}
              </span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: GOLD }}>
                {b}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {["Photo", "Redline", "Notes"].map((x) => (
            <span
              key={x}
              className="truncate rounded-lg border py-2 text-center text-[9.5px]"
              style={{ borderColor: LINE, color: MUTED }}
            >
              {t(x)}
            </span>
          ))}
        </div>

        <div
          className="mt-2.5 rounded-lg py-2.5 text-center text-[11.5px] font-semibold"
          style={{ background: "var(--mk-gold-fill)", color: "var(--mk-on-gold)" }}
        >
          {t("Submit daily")}
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
        style={{ background: `color-mix(in srgb, ${tone} 10%, transparent)` }}
      >
        <span className="text-[8.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tone }}>
          {label}
        </span>
      </div>
      <div
        className="grid h-[86px] place-items-center"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--mk-card) 0 8px, transparent 8px 16px)",
        }}
      >
        <span className="text-[9.5px]" style={{ color: MUTED }}>
          {caption}
        </span>
      </div>
    </div>
  );
}

export function TaskShot({ t }: { t: T }) {
  return (
    <Frame label="vantaraiq.com · tasks" t={t}>
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "color-mix(in srgb, var(--mk-bad) 16%, transparent)", color: BAD }}
          >
            {t("High")}
          </span>
          <span className="text-[13px] font-bold" style={{ color: INK }}>
            {t("Pedestal 1847 not installed")}
          </span>
          <span
            className="ml-auto rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "color-mix(in srgb, var(--mk-warn) 16%, transparent)", color: WARN }}
          >
            {t("In progress")}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 text-[9.5px]" style={{ color: MUTED }}>
          <span>Ridgeline · ATL-204</span>
          <span style={{ color: BRAND }}>Pace Boring · {t("Crew")} 7</span>
          <span>{t("Due today, 3:00 PM")}</span>
        </div>

        {/* The proof, side by side. This is the part that settles arguments. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PhotoSlot label={t("Before")} caption={t("Reported 9:12 AM")} tone={BAD} />
          <PhotoSlot label={t("After")} caption={t("Attached 1:47 PM")} tone={OK} />
        </div>

        {/* Office and field, in one place, against the job. */}
        <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          <p
            className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
            style={{ borderColor: LINE, color: MUTED, background: CARD }}
          >
            {t("Activity")}
          </p>
          {[
            ["10:42", "Office", "Raised with photo, assigned to Crew 7", MUTED],
            ["10:42", "Vantara", "Texted the foreman", BRAND],
            ["10:51", "Foreman", "Heading back to the location now", INK],
            ["12:32", "Foreman", "Need another pedestal from the yard", INK],
            ["12:34", "Office", "Materials on the way", INK],
            ["1:47", "Foreman", "Photo attached, marked done", OK],
          ].map(([at, who, what, colour], i) => (
            <div
              key={String(at) + String(what)}
              className="flex gap-2 px-2.5 py-[6px]"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
            >
              <span className="w-[34px] shrink-0 text-[9px] tabular-nums" style={{ color: MUTED }}>
                {at}
              </span>
              <span className="w-[48px] shrink-0 text-[9px] font-semibold" style={{ color: MUTED }}>
                {t(String(who))}
              </span>
              <span className="min-w-0 flex-1 text-[10px]" style={{ color: String(colour) }}>
                {t(String(what))}
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

export function CapabilityShot({ t }: { t: T }) {
  return (
    <Frame label="vantaraiq.com · prospects" t={t}>
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold" style={{ color: INK }}>
            Marfield Underground
          </span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ background: "color-mix(in srgb, var(--mk-brand) 16%, transparent)", color: BRAND }}
          >
            {t("Prequalified")}
          </span>
          <span className="ml-auto text-right">
            <span className="block text-[15px] font-bold tabular-nums" style={{ color: OK }}>
              78
            </span>
            <span className="block text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
              {t("Score")}
            </span>
          </span>
        </div>
        <p className="mt-0.5 text-[9.5px]" style={{ color: MUTED }}>
          {t("3 crews free · available now · works GA, SC")}
        </p>

        {/* The score, shown as its parts. A number on its own is a number
            somebody argues with. */}
        <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
          <p
            className="border-b px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
            style={{ borderColor: LINE, color: MUTED, background: CARD }}
          >
            {t("Why 78")}
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
              <span className="w-[74px] shrink-0 truncate text-[10px] font-medium" style={{ color: INK }}>
                {t(String(what))}
              </span>
              <span className="w-[38px] shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: String(colour) }}>
                {score}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9.5px]" style={{ color: MUTED }}>
                {t(String(why))}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2.5" style={{ borderColor: LINE, background: CARD }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
              {t("Equipment")}
            </p>
            {[["Directional drill", "2 owned"], ["Plough", "1 owned"], ["Vac trailer", "rented"]].map(([a, bq]) => (
              <p key={String(a)} className="mt-1 flex justify-between gap-2 text-[9.5px]" style={{ color: BODY }}>
                <span className="min-w-0 truncate">{t(a)}</span>
                <span className="shrink-0" style={{ color: MUTED }}>
                  {t(bq)}
                </span>
              </p>
            ))}
          </div>
          <div className="rounded-lg border p-2.5" style={{ borderColor: LINE, background: CARD }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
              {t("What they run")}
            </p>
            {[["Directional bore", "900 ft/day"], ["Plough", "2,400 ft/day"], ["Splicing", "occasional"]].map(([a, bq]) => (
              <p key={String(a)} className="mt-1 flex justify-between gap-2 text-[9.5px]" style={{ color: BODY }}>
                <span className="min-w-0 truncate">{t(a)}</span>
                <span className="shrink-0" style={{ color: GOLD }}>
                  {t(bq)}
                </span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}
