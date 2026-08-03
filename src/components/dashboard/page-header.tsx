"use client";

import * as React from "react";
import { CalendarDays, Download, RefreshCw, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { organization } from "@/data/mock";
import { Button } from "@/components/ui/button";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function PageHeader() {
  // Rendered after mount so the server and client markup can't disagree about
  // the clock.
  const [now, setNow] = React.useState<Date | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const firstName = organization.user.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-gradient sm:text-[26px]">
          {now ? greeting(now.getHours()) : "Welcome back"}, {firstName}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          <span suppressHydrationWarning>
            {now
              ? now.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : " "}
          </span>
          <span className="mx-2 text-muted-foreground/40">·</span>
          14 active projects across 4 states
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12.5px] font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <CalendarDays className="size-3.5" />
          Last 7 days
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12.5px] font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <SlidersHorizontal className="size-3.5" />
          <span className="hidden sm:inline">Filters</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12.5px] font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 900);
          }}
          aria-label="Refresh data"
          className="size-9 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] p-0 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
