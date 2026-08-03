"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, RefreshCw, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { toneStyles } from "@/lib/tone";
import { formatPercent } from "@/lib/format";
import type { BriefItem, BriefSeverity, Tone } from "@/lib/types";
import { Panel, PanelFooter, PanelHeader } from "@/components/common/panel";

const severityTone: Record<BriefSeverity, Tone> = {
  critical: "critical",
  opportunity: "success",
  info: "info",
};

const severityLabel: Record<BriefSeverity, string> = {
  critical: "Needs action",
  opportunity: "Opportunity",
  info: "For awareness",
};

function BriefRow({
  item,
  expanded,
  onToggle,
}: {
  item: BriefItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = getIcon(item.icon);
  const tone = toneStyles[severityTone[item.severity]];

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="focus-ring flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.035]"
      >
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border",
            tone.bg,
            tone.border,
            tone.text,
          )}
        >
          <Icon className="size-3.5" strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-foreground">
              {item.title}
            </span>
            <ChevronDown
              className={cn(
                "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                tone.bg,
                tone.text,
              )}
            >
              {item.impact}
            </span>
            <span className="rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {severityLabel[item.severity]}
            </span>
            <span className="num text-[10px] text-muted-foreground/70">
              {formatPercent(item.confidence)} confidence
            </span>
          </span>

          {/* Grid-row animation avoids the max-height guess-and-clip problem */}
          <span
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
          >
            <span className="overflow-hidden">
              <span className="block pt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {item.detail}
              </span>
              <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-foreground/[0.06] px-2 py-1 text-[11.5px] font-medium text-foreground transition-colors hover:bg-foreground/[0.1]">
                {item.action}
                <ArrowRight className="size-3" />
              </span>
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

export function AiBrief({ items }: { items: BriefItem[] }) {
  // Lead with the top signal already open — the panel should answer "what now?"
  // before the user clicks anything.
  const [expandedId, setExpandedId] = React.useState<string | null>(items[0]?.id ?? null);

  const criticalCount = items.filter((item) => item.severity === "critical").length;

  return (
    <Panel className="relative">
      {/* Intelligence accent: a violet→blue hairline along the top edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet/60 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(90%_100%_at_50%_0%,color-mix(in_oklab,var(--vq-violet)_11%,transparent),transparent_70%)]"
      />

      <PanelHeader
        title="AI operations brief"
        description={`${criticalCount} need action · generated 6 min ago`}
        icon={<Sparkles className="size-3.5 text-violet" />}
        className="relative"
      >
        <button
          type="button"
          aria-label="Regenerate brief"
          className="focus-ring grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </PanelHeader>

      <ul className="relative flex-1 space-y-0.5 p-2">
        {items.map((item) => (
          <BriefRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
          />
        ))}
      </ul>

      <PanelFooter className="justify-between">
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-violet" />
          Ranked by cash and schedule impact
        </span>
        <Link
          href="/assistant"
          className="focus-ring group inline-flex items-center gap-1 rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          Ask the assistant
          <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </PanelFooter>
    </Panel>
  );
}
