"use client";

import * as React from "react";
import { Loader2, Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import { askOperations } from "@/app/actions";

/**
 * Talk to the business.
 *
 * Speech in and speech out use the browser's own recognition and synthesis, so
 * nothing is streamed to a third party and there is no per-minute cost for
 * listening — the only call that leaves the machine is the question itself.
 *
 * The assistant can only read. Every tool behind it runs a query and none of
 * them write, so no phrasing typed or spoken into this box can change a rate,
 * a daily or an invoice. It will say as much if asked to.
 */

type Turn = { role: "user" | "assistant"; content: string };

/** Minimal shape of the Web Speech API — it is not in the DOM lib types. */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const SUGGESTIONS = [
  "Which crew makes us the most per foot?",
  "What's stopping us billing right now?",
  "Where are we losing money on rates?",
  "How did production this week compare to last?",
];

export function OpsAssistant() {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [speak, setSpeak] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const recognition = React.useRef<Recognition | null>(null);
  const scroller = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  /** Read an answer aloud, but only when the ear is on. */
  const say = React.useCallback(
    (text: string) => {
      if (!speak || typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      window.speechSynthesis.speak(u);
    },
    [speak],
  );

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

      if (res.ok) {
        setTurns([...next, { role: "assistant", content: res.answer }]);
        say(res.answer);
      } else {
        setError(res.error);
      }
    },
    [busy, turns, say],
  );

  function toggleMic() {
    if (typeof window === "undefined") return;
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition })
        .webkitSpeechRecognition;

    if (!Ctor) {
      setError("This browser can't do speech recognition — Chrome or Edge can. Typing works everywhere.");
      return;
    }

    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(" ");
      // Straight to the assistant. Speaking a question and then having to press
      // send is one step too many when your hands are busy.
      void send(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="surface flex h-[520px] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid size-8 place-items-center rounded-xl border border-brand/40 bg-brand/10 text-brand-bright">
          <Volume2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground">Ask the business</p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            Reads everything, changes nothing
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (speak && typeof window !== "undefined") window.speechSynthesis?.cancel();
            setSpeak((v) => !v);
          }}
          title={speak ? "Answers are read aloud" : "Answers are silent"}
          className={cn(
            "focus-ring grid size-8 place-items-center rounded-lg border transition",
            speak
              ? "border-brand/50 bg-brand/10 text-brand-bright"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {speak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[12.5px] text-muted-foreground">
              Ask about jobs, crews, production, rates or where the money is. It looks the
              answer up rather than guessing, and it will tell you when the data doesn&apos;t
              support one.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="focus-ring rounded-lg border border-border px-2 py-1 text-[11.5px] text-muted-foreground hover:border-brand/50 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((t, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[92%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed",
              t.role === "user"
                ? "ml-auto bg-brand/12 text-foreground"
                : "border border-border bg-foreground/[0.03] text-foreground",
            )}
          >
            {t.content.split("\n").map((line, j) => (
              <p key={j} className={j ? "mt-1.5" : undefined}>
                {line}
              </p>
            ))}
          </div>
        ))}

        {busy ? (
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Looking it up…
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-critical/40 bg-critical/[0.07] px-3 py-2 text-[12px] text-foreground">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="flex items-center gap-2 border-t border-border px-3 py-2.5"
      >
        <button
          type="button"
          onClick={toggleMic}
          title={listening ? "Listening — tap to stop" : "Speak your question"}
          className={cn(
            "focus-ring grid size-9 shrink-0 place-items-center rounded-lg border transition",
            listening
              ? "animate-pulse border-critical bg-critical/10 text-critical"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={listening ? "Listening…" : "Ask anything about the business…"}
          disabled={busy}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 text-[12.5px] text-foreground outline-none focus:border-brand disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-white transition hover:bg-brand-bright disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
