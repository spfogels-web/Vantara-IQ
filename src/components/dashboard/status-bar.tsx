"use client";

import * as React from "react";
import { CloudSun, ShieldCheck } from "lucide-react";

import { LiveDot } from "@/components/common/status-pill";

export function StatusBar() {
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
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-success" />
          <span className="num text-foreground/80">145</span> days incident free
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success" />
          All systems operational
        </span>
      </div>
    </footer>
  );
}
