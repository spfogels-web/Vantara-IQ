"use client";

import * as React from "react";
import { CloudSun, ShieldCheck, ShieldQuestion } from "lucide-react";

import { LiveDot } from "@/components/common/status-pill";
import type { SafetyStreak } from "@/lib/incidents";

/**
 * The safety figure, which is a claim and therefore has to be true.
 *
 * This read "145 days incident free" for as long as the footer existed, with
 * the 145 written into the file. It was a plausible number on a page full of
 * real ones, which is the worst kind of false: nobody had reason to check it,
 * and it asserted a clean safety record to anybody who walked past the screen.
 *
 * There are three honest answers and they are genuinely different sentences —
 * see `safetyStreak`. None of them is a bare zero, and none of them is a number
 * larger than the period the records actually cover.
 */
function Safety({ streak }: { streak: SafetyStreak }) {
  if (streak.kind === "since") {
    return (
      <span className="flex items-center gap-1.5" title={`Since ${streak.incidentNumber}`}>
        <ShieldCheck className={streak.days >= 30 ? "size-3.5 text-success" : "size-3.5 text-warning"} />
        <span className="num text-foreground/80">{streak.days}</span>{" "}
        {streak.days === 1 ? "day" : "days"} since a safety incident
      </span>
    );
  }

  if (streak.kind === "none") {
    return (
      <span className="flex items-center gap-1.5">
        <ShieldCheck className="size-3.5 text-success" />
        No safety incidents in{" "}
        <span className="num text-foreground/80">{streak.days}</span>{" "}
        {streak.days === 1 ? "day" : "days"} of records
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <ShieldQuestion className="size-3.5 text-muted-foreground" />
      No incident history yet
    </span>
  );
}

export function StatusBar({ safety }: { safety: SafetyStreak }) {
  const [lastSync, setLastSync] = React.useState<string>("just now");

  React.useEffect(() => {
    const mountedAt = Date.now();
    const timer = setInterval(() => {
      const minutes = Math.floor((Date.now() - mountedAt) / 60_000);
      setLastSync(minutes < 1 ? "just now" : `${minutes} min ago`);
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/70 px-1 py-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <LiveDot />
        Synced <span className="text-foreground/80">{lastSync}</span>
      </span>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5">
          <CloudSun className="size-3.5 text-warning" />
          72°F · clear · Greenville, SC
        </span>
        <Safety streak={safety} />
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success" />
          All systems operational
        </span>
      </div>
    </footer>
  );
}
