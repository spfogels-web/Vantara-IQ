/**
 * The product, drawn rather than photographed.
 *
 * A screenshot of the real application would carry a real customer's rate card,
 * real crew names and real money onto a public page, and cropping is not a
 * safeguard — the next screenshot is taken by somebody in a hurry. So this is
 * built from the same shapes the product uses, filled with a company that does
 * not exist.
 *
 * Drawn also means it stays sharp on any screen, weighs nothing, and cannot go
 * stale the way a PNG of a screen does the first time the screen changes.
 *
 * Every name, street and figure below is invented. Ridgeline is not a customer.
 */

const INK = "#eef2f8";
const BODY = "#c3d0e0";
const MUTED = "#8fa0b6";
const GOLD = "#e0a82e";
const BRAND = "#818CF8";
const OK = "#34D399";
const WARN = "#F59E0B";

/** The dailies board, which is the screen a prime lives in. */
export function ProductShot() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border shadow-2xl"
      style={{ borderColor: "rgba(255,255,255,0.12)", background: "#0b1220" }}
    >
      {/* Window chrome. Enough to read as an application, not so much that it
          looks like a picture of somebody's browser. */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
      >
        <span className="flex gap-1.5">
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} className="size-2.5 rounded-full" style={{ background: c, opacity: 0.75 }} />
          ))}
        </span>
        <span
          className="ml-2 rounded-md px-2 py-0.5 text-[10.5px]"
          style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}
        >
          vantaraiq.com
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(52,211,153,0.14)", color: OK }}
        >
          <span className="size-1.5 rounded-full" style={{ background: OK }} />
          Live
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[152px_1fr]">
        {/* Rail */}
        <div
          className="hidden flex-col gap-0.5 border-r p-2.5 sm:flex"
          style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}
        >
          <p className="px-1.5 pb-1 text-[8.5px] font-bold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
            Overview
          </p>
          {[
            ["Operations", false],
            ["Projects", false],
            ["Dailies", true],
          ].map(([label, active]) => (
            <span
              key={String(label)}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10.5px]"
              style={{
                background: active ? "rgba(129,140,248,0.16)" : "transparent",
                color: active ? INK : MUTED,
                fontWeight: active ? 600 : 400,
              }}
            >
              <span
                className="size-1.5 rounded-sm"
                style={{ background: active ? BRAND : "rgba(255,255,255,0.2)" }}
              />
              {label}
            </span>
          ))}
          <p className="px-1.5 pb-1 pt-2.5 text-[8.5px] font-bold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
            Network
          </p>
          {["Subcontractors", "Locates", "Materials"].map((l) => (
            <span key={l} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10.5px]" style={{ color: MUTED }}>
              <span className="size-1.5 rounded-sm" style={{ background: "rgba(255,255,255,0.2)" }} />
              {l}
            </span>
          ))}
        </div>

        {/* Board */}
        <div className="p-3 sm:p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
            Overview
          </p>
          <p className="text-[15px] font-bold" style={{ color: INK }}>
            Dailies
          </p>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[
              ["Awaiting review", "6", WARN],
              ["Approved", "21", OK],
              ["Footage billed", "18,940", GOLD],
            ].map(([label, value, colour]) => (
              <div
                key={String(label)}
                className="rounded-lg border px-2 py-1.5"
                style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
              >
                <p className="truncate text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                  {label}
                </p>
                <p className="mt-0.5 text-[15px] font-semibold tabular-nums" style={{ color: String(colour) }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div
            className="mt-3 overflow-hidden rounded-lg border"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            {[
              ["Keener Rd", "Pace Boring", "2,450 ft", "$7,105", "Approved", OK],
              ["Oakwood Dr", "Hollis Underground", "1,900 ft", "$5,510", "Approved", OK],
              ["Ridge Line Rd", "Pace Boring", "1,275 ft", "$3,698", "In review", WARN],
              ["Mill Creek Dr", "Ashmore Utility", "2,010 ft", "$5,829", "In review", WARN],
            ].map(([street, crew, ft, money, status, colour], i) => (
              <div
                key={String(street)}
                className="flex items-center gap-2 px-2.5 py-2"
                style={{
                  borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                  background: i === 0 ? "rgba(255,255,255,0.03)" : "transparent",
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold" style={{ color: INK }}>
                    {street}
                  </span>
                  <span className="block truncate text-[9.5px]" style={{ color: BRAND }}>
                    {crew}
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="block text-[11px] font-semibold tabular-nums" style={{ color: GOLD }}>
                    {ft}
                  </span>
                  <span className="block text-[9.5px] tabular-nums" style={{ color: MUTED }}>
                    {money}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
                  style={{ background: `${String(colour)}22`, color: String(colour) }}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-2 text-[9px]" style={{ color: MUTED }}>
            Ridgeline Utility Partners · week ending 12 June
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * What happens to one daily, end to end.
 *
 * The whole pitch in four steps: it is filed once and everything downstream
 * comes off that filing. Drawn small enough to read at a glance on a phone.
 */
export function FlowShot() {
  const steps: [string, string, string][] = [
    ["Filed", "Crew, in the truck", BRAND],
    ["Approved", "Office, same day", OK],
    ["Invoiced", "To your customer", GOLD],
    ["Crew paid", "Statement, net terms", OK],
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {steps.map(([title, sub, colour], i) => (
        <div
          key={title}
          className="relative rounded-xl border p-3.5"
          style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}
        >
          <span
            className="grid size-7 place-items-center rounded-lg text-[11px] font-bold"
            style={{ background: `${colour}1f`, color: colour }}
          >
            {i + 1}
          </span>
          <p className="mt-2.5 text-[13.5px] font-semibold" style={{ color: INK }}>
            {title}
          </p>
          <p className="mt-0.5 text-[11.5px]" style={{ color: MUTED }}>
            {sub}
          </p>

          {/* The connector. Hidden on the last card and on a phone, where the
              cards stack and an arrow pointing sideways would be a lie. */}
          {i < steps.length - 1 ? (
            <span
              aria-hidden
              className="absolute -right-[7px] top-1/2 hidden size-3 -translate-y-1/2 rotate-45 border-r border-t sm:block"
              style={{ borderColor: "rgba(255,255,255,0.18)", background: "#070d18" }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** A locate ticket as the board shows it — the module people ask about most. */
export function LocateShot() {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: BRAND }}>
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
      <div className="px-3 py-2.5">
        {[
          ["Power", "Clear", OK],
          ["Telecom", "Marked", OK],
          ["Gas", "Clear", OK],
          ["Your own plant", "Not walked yet", WARN],
        ].map(([who, state, colour], i) => (
          <div
            key={String(who)}
            className="flex items-center gap-2 py-1"
            style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}
          >
            <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: BODY }}>
              {who}
            </span>
            <span className="text-[10.5px] font-semibold" style={{ color: String(colour) }}>
              {state}
            </span>
          </div>
        ))}
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: MUTED }}>
          All three utilities cleared. The locate you perform yourself has not been signed off, so
          the crew&rsquo;s sheet says so before they open it.
        </p>
      </div>
    </div>
  );
}
