"use client";

import * as React from "react";
import { ArrowUp, Loader2, Mic, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { askOperations } from "@/app/actions";

/**
 * The operations assistant — ask the business a question in plain English.
 *
 * It sits directly under the KPI row because it is the thing that explains
 * those numbers: the tiles say production is 7,326 ft and nothing is billable,
 * and this says why and what to do about it.
 *
 * Text for now. The speech path works and is deliberately parked behind a
 * disabled control rather than deleted — shipping the typing first means the
 * answers can be judged on their own before a microphone is involved.
 *
 * It can only read. Every tool behind it runs a query and none of them write,
 * so nothing typed here can change a rate, a daily or an invoice.
 */

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Which crew makes us the most per foot?",
  "What's stopping us billing right now?",
  "Where are we losing money on rates?",
  "How did this week compare to last?",
  "What needs my attention today?",
];

/** Three bars that move while it is working. Purely decorative. */
function Thinking() {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="vq-ai-bar block h-3 w-[3px] rounded-full bg-brand-bright"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

export function OpsAssistant() {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const scroller = React.useRef<HTMLDivElement | null>(null);
  const input = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const send = React.useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      setDraft("");
      setError(null);
      const next: Turn[] = [...turns, { role: "user", content: question }];
      setTurns(next);
      setBusy(true);

      const res = await askOperations(next);
      setBusy(false);

      if (res.ok) setTurns([...next, { role: "assistant", content: res.answer }]);
      else setError(res.error);

      input.current?.focus();
    },
    [busy, turns],
  );

  const started = turns.length > 0 || busy;

  return (
    <div className="vq-ai-frame surface relative overflow-hidden rounded-2xl">
      {/* Two drifting blooms behind everything. pointer-events-none so they can
          never intercept a click meant for the input. */}
      <span
        aria-hidden
        className="vq-ai-glow pointer-events-none absolute -left-24 -top-28 z-0 size-72 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--vq-blue) 0%, transparent 70%)", opacity: 0.4 }}
      />
      <span
        aria-hidden
        className="vq-ai-glow pointer-events-none absolute -bottom-32 right-0 z-0 size-80 rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, var(--vq-indigo) 0%, transparent 70%)",
          opacity: 0.32,
          animationDelay: "2.4s",
        }}
      />

      <div className="relative z-10 flex flex-col">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <span
            className="vq-ai-core grid size-9 shrink-0 place-items-center rounded-xl text-white"
            style={{ background: "var(--grad-brand)" }}
          >
            <Sparkles className="size-[17px]" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em] text-foreground">
              Ask the business
              <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-success">
                <span className="size-1.5 rounded-full bg-success" /> Online
              </span>
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground">
              Reads every job, crew, rate and invoice — and can change none of them
            </p>
          </div>
          {busy ? <Thinking /> : null}
        </div>

        {/* ── Conversation ───────────────────────────────────────── */}
        <div
          ref={scroller}
          className={cn(
            "space-y-3 overflow-y-auto px-4 transition-[height] duration-300",
            started ? "h-[340px] py-4" : "h-auto py-4",
          )}
        >
          {!started ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="focus-ring rounded-xl border border-border bg-foreground/[0.02] px-3 py-2 text-left text-[12px] text-muted-foreground transition hover:border-brand/50 hover:text-foreground"
                  style={{
                    animation: "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          {turns.map((t, i) => (
            <div
              key={i}
              style={{ animation: "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both" }}
              className={cn(
                "max-w-[min(680px,88%)] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                t.role === "user"
                  ? "ml-auto border border-brand/30 bg-brand/[0.12] text-foreground"
                  : "border border-border bg-foreground/[0.03] text-foreground",
              )}
            >
              {t.content.split("\n").map((line, j) =>
                line.trim() ? (
                  <p key={j} className={j ? "mt-1.5" : undefined}>
                    {line}
                  </p>
                ) : null,
              )}
            </div>
          ))}

          {busy ? (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Reading the data…
            </p>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-critical/40 bg-critical/[0.07] px-3 py-2 text-[12px] text-foreground">
              {error}
            </p>
          ) : null}
        </div>

        {/* ── Composer ───────────────────────────────────────────── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="border-t border-border/70 p-3"
        >
          <div className="flex items-end gap-2 rounded-xl border border-border bg-foreground/[0.02] p-1.5 transition focus-within:border-brand/60">
            {/* Step two. Disabled rather than hidden so it is visibly coming. */}
            <button
              type="button"
              disabled
              title="Voice is next — typing for now"
              className="grid size-9 shrink-0 cursor-not-allowed place-items-center rounded-lg text-muted-foreground/50"
            >
              <Mic className="size-4" />
            </button>
            <textarea
              ref={input}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is a new line.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Ask anything about the business…"
              disabled={busy}
              className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-white transition disabled:opacity-30"
              style={{ background: "var(--grad-brand)" }}
            >
              <ArrowUp className="size-4" strokeWidth={2.4} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
