"use client";

import * as React from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel } from "@/components/common/panel";

type Message = { role: "user" | "assistant"; content: string };

/**
 * A canned but data-grounded assistant. Each suggested question maps to an
 * answer drawn from the same fixtures the dashboard renders, so the demo reads
 * like the real thing. When the model is wired, only `answerFor` changes.
 */
const SUGGESTED = [
  "Which crews are falling behind?",
  "Show me all change order opportunities.",
  "Which dailies don't match the as-builts?",
  "Which projects will finish in the next two weeks?",
  "How many feet did ABC Utilities install this month?",
  "Which invoices are waiting on documentation?",
  "Find all jobs where installed footage exceeds material issued.",
  "Why did profit drop on Windstream White Plains?",
];

function answerFor(q: string): string {
  const k = q.toLowerCase();
  if (k.includes("falling behind") || k.includes("crews"))
    return "Two crews are below the pace needed to hit their dates. Crew 4 on Windstream White Plains is running 2,410 ft/day against a required 3,850 (63%) — 4 days behind. Crew 3 on Duke Energy is at 1,180 of 1,600 ft/day (74%), 2 days behind. Crew 7 frees up on Piedmont Water in 4 days and could recover White Plains.";
  if (k.includes("change order"))
    return "Two likely change-order opportunities. Windstream White Plains daily GLS-203155 shows BM6 missile bore 18% above the material issued for that ped — consistent with unmarked rock. AT&T backhaul has repeated bore footage at station 14+00 not covered by the current work order.";
  if (k.includes("as-built") || k.includes("don't match") || k.includes("dont match"))
    return "One daily is missing its as-built: AT&T Fiber Backhaul GLS-203158 (Carolina Bore, 1,180 ft at station 14+00). It's also missing photos and a locate ticket number, so AT&T will reject the invoice as submitted. It's currently flagged.";
  if (k.includes("finish") || k.includes("two weeks"))
    return "Piedmont Water Main finishes first — 1,800 ft left at 1,910 ft/day, roughly 1 day out, tracking 5 days early. Commerce GA Expansion is next with 6,250 ft remaining at 2,240 ft/day, about 3 days out. Duke Energy has 8,900 ft left but is behind pace.";
  if (k.includes("abc utilities") || k.includes("how many feet"))
    return "ABC Utilities is averaging 2,850 ft/day across 2 active assignments (Windstream White Plains and Charter Node Split). Their most recent daily reported 918 ft on White Plains. Month-to-date they're the second-highest producer behind Summit Underground.";
  if (k.includes("invoice") && (k.includes("documentation") || k.includes("waiting")))
    return "Two ready-to-bill invoices are held on backup: INV-00443 (Charter, $92,850) needs make-ready sign-off, and INV-00442 (AT&T, $88,500) needs the as-built and locate ticket from the flagged daily. Clearing both releases $181,350.";
  if (k.includes("exceeds material") || k.includes("installed footage"))
    return 'One item is over-installed: 4" HDPE conduit on AT&T Fiber Backhaul shows 18,240 ft installed against 18,000 ft issued (−240 on hand). Verify the reel reconciliation before billing the affected dailies — this is a common source of over-billing.';
  if (k.includes("profit") && k.includes("windstream"))
    return "Windstream White Plains margin is compressed because Crew 4 is producing at 63% of required pace — the same fixed crew cost spread over fewer billable feet. Every day at this rate adds ~1,440 ft of shortfall. Reassigning Crew 7 restores pace and recovers roughly 4 days of margin.";
  return "I can answer against your live operations data — production, dailies, as-builts, billing and crew history. Try one of the suggested questions, or ask about a specific project, crew or invoice.";
}

export function AssistantView() {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  function ask(q: string) {
    const question = q.trim();
    if (!question || thinking) return;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setThinking(true);
    window.setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", content: answerFor(question) }]);
      setThinking(false);
    }, 650);
  }

  const empty = messages.length === 0;

  return (
    <Panel className="h-[calc(100vh-13rem)] min-h-[560px]">
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {empty ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
            <span className="grid size-12 place-items-center rounded-2xl border border-white/[0.08] bg-brand/10 text-brand-bright">
              <Sparkles className="size-5" />
            </span>
            <h2 className="mt-4 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
              Ask your operations data anything
            </h2>
            <p className="mt-1.5 max-w-md text-[13px] text-muted-foreground">
              Not a decision-maker — your smartest project engineer. It reads dailies, as-builts and
              billing, then hands you the answer with the numbers behind it.
            </p>
            <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="focus-ring rounded-xl border border-border/70 bg-white/[0.02] px-3.5 py-2.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-brand/30 hover:bg-white/[0.04] hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                {m.role === "assistant" ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand-bright">
                    <Sparkles className="size-3.5" />
                  </span>
                ) : null}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                    m.role === "user"
                      ? "bg-brand text-white"
                      : "border border-border/70 bg-white/[0.02] text-foreground",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {thinking ? (
              <div className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand-bright">
                  <Sparkles className="size-3.5 animate-pulse" />
                </span>
                <div className="rounded-2xl border border-border/70 bg-white/[0.02] px-3.5 py-3">
                  <span className="flex gap-1">
                    <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="mt-auto border-t border-border/70 p-3 sm:p-4"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 focus-within:ring-2 focus-within:ring-brand/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            placeholder="Ask about a project, crew, daily or invoice…"
            className="max-h-32 flex-1 resize-none bg-transparent py-1 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || thinking}
            className="focus-ring grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white transition-colors hover:bg-brand-bright disabled:opacity-30"
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[10.5px] text-muted-foreground/70">
          Answers are grounded in your operations data. The assistant prepares — your team decides.
        </p>
      </form>
    </Panel>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="size-1.5 rounded-full bg-muted-foreground/60"
      style={{ animation: "pulse 1.2s ease-in-out infinite", animationDelay: delay }}
    />
  );
}
