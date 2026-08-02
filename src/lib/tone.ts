import type { Tone } from "@/lib/types";

/**
 * One source of truth for status colour. Components never hardcode a hex —
 * they pick a tone and read the class strings from here, so re-theming is a
 * single-file change and every surface stays consistent.
 *
 * The class names resolve against the `--color-success|warning|critical|info`
 * entries registered in globals.css `@theme inline`.
 */
export const toneStyles: Record<
  Tone,
  {
    text: string;
    bg: string;
    border: string;
    ring: string;
    dot: string;
    glow: string;
    /** Raw hex for SVG/Recharts, which can't take a class. */
    hex: string;
  }
> = {
  success: {
    text: "text-success",
    bg: "bg-success/10",
    border: "border-success/25",
    ring: "ring-success/30",
    dot: "bg-success",
    glow: "shadow-[0_0_20px_-6px_var(--success)]",
    hex: "#2fd07a",
  },
  warning: {
    text: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/25",
    ring: "ring-warning/30",
    dot: "bg-warning",
    glow: "shadow-[0_0_20px_-6px_var(--warning)]",
    hex: "#ffa23a",
  },
  critical: {
    text: "text-critical",
    bg: "bg-critical/10",
    border: "border-critical/25",
    ring: "ring-critical/30",
    dot: "bg-critical",
    glow: "shadow-[0_0_20px_-6px_var(--critical)]",
    hex: "#ff5a52",
  },
  info: {
    text: "text-info",
    bg: "bg-info/10",
    border: "border-info/25",
    ring: "ring-info/30",
    dot: "bg-info",
    glow: "shadow-[0_0_20px_-6px_var(--info)]",
    hex: "#2f80ff",
  },
  neutral: {
    text: "text-muted-foreground",
    bg: "bg-white/[0.06]",
    border: "border-white/10",
    ring: "ring-white/15",
    dot: "bg-neutral",
    glow: "",
    hex: "#8b97a8",
  },
};

/** Health score → tone. Thresholds match the ops team's RAG definition. */
export function healthTone(score: number): Tone {
  if (score >= 90) return "success";
  if (score >= 80) return "info";
  if (score >= 70) return "warning";
  return "critical";
}

export function toneHex(tone: Tone) {
  return toneStyles[tone].hex;
}
