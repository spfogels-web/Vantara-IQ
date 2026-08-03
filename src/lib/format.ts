const currency0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const number0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatCurrency(value: number) {
  return currency0.format(value);
}

/** $482K / $1.2M — for tiles where the full figure would wrap. */
export function formatCompactCurrency(value: number) {
  return compactCurrency.format(value);
}

export function formatNumber(value: number) {
  return number0.format(value);
}

export function formatFeet(value: number) {
  return `${number0.format(value)} ft`;
}

export function formatPercent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSigned(value: number, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function formatKpi(value: number, format: "number" | "currency" | "feet") {
  switch (format) {
    case "currency":
      return formatCurrency(value);
    case "feet":
      return formatFeet(value);
    default:
      return formatNumber(value);
  }
}

/** Compact day counters: "Today", "Tomorrow", "in 6 days". */
export function formatDaysOut(days: number) {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

const whenFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

/**
 * Render a submission timestamp. Real ISO timestamps (from `createDaily`) become
 * "Aug 3, 1:24 PM ET" — pinned to Eastern so the server and client agree (no
 * hydration mismatch). Non-date strings (mock "10 min ago") pass through as-is.
 */
export function formatWhen(value: string) {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value;
  return `${whenFmt.format(new Date(t))} ET`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
