"use client";

import * as React from "react";
import { ArrowUp, Loader2, Mic, Square, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import { askOperations } from "@/app/actions";
import { NeuralBrain } from "@/components/dashboard/neural-brain";

/**
 * The operations assistant — ask the business a question and hear the answer.
 *
 * It sits directly under the KPI row because it is the thing that explains
 * those numbers: the tiles say production is 7,326 ft and nothing is billable,
 * and this says why and what to do about it.
 *
 * Listening and speaking both use the browser's own engines. Nothing is
 * streamed to a third party, there is no per-minute cost, and it works offline
 * once the page is open — the only call that leaves the machine is the
 * question itself.
 *
 * What gets spoken is not what is on screen. The written answer carries
 * tables, exact figures and code strings, all of which are unbearable read
 * aloud, so the assistant writes a separate line for the ear and this speaks
 * that instead.
 *
 * It can only read. Every tool behind it runs a query and none of them write,
 * so nothing said or typed here can change a rate, a daily or an invoice.
 */

type Turn = { role: "user" | "assistant"; content: string; spoken?: string };

/** The Web Speech API is not in the DOM lib types. Only what is used here. */
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
  "How did this week compare to last?",
  "What needs my attention today?",
];

/** Bars that move while it is working or talking. Decorative. */
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
  const [voice, setVoice] = React.useState(true);
  const [listening, setListening] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);

  const recognition = React.useRef<Recognition | null>(null);
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const input = React.useRef<HTMLTextAreaElement | null>(null);

  /**
   * Chrome garbage-collects an utterance that nothing references, mid-sentence,
   * and it simply stops. Holding it here is the documented workaround.
   */
  const utterance = React.useRef<SpeechSynthesisUtterance | null>(null);

  /**
   * Browsers will not speak until something the user did has unlocked audio,
   * and by the time an answer arrives — several seconds and several database
   * reads later — the tap that started it is long gone. So the engine is
   * unlocked on the tap itself with an empty utterance, and stays unlocked.
   */
  const [diag, setDiag] = React.useState<string | null>(null);
  const unlocked = React.useRef(false);
  const unlock = React.useCallback(() => {
    if (unlocked.current || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      // A space, not an empty string: Chrome drops empty utterances without
      // unlocking anything. resume() clears the known stuck-paused state.
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
      unlocked.current = true;
    } catch {
      // Nothing to do — say() reports it properly if speech really is blocked.
    }
  }, []);

  /**
   * getVoices() is empty on the first call in Chrome and fills in later. Asking
   * once at mount and again on voiceschanged means the good voice is available
   * by the time there is something to say.
   */
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  /** Stop mid-sentence — barge-in, muting, and leaving the page. */
  const hush = React.useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  React.useEffect(() => hush, [hush]);

  const say = React.useCallback(
    (line: string) => {
      if (!voice || !line) return;
      if (typeof window === "undefined" || !window.speechSynthesis) {
        setError("This browser has no speech engine, so answers stay on screen.");
        return;
      }

      const synth = window.speechSynthesis;
      synth.cancel();
      synth.resume();

      const u = new SpeechSynthesisUtterance(line);
      // Slightly quick and slightly low reads as composed rather than chirpy.
      u.rate = 1.04;
      u.pitch = 0.92;
      const preferred = voices.find((v) =>
        /Daniel|Google UK English Male|Microsoft Guy|Alex/i.test(v.name),
      );
      if (preferred) u.voice = preferred;

      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      // A silent failure is the worst outcome — it looks like the feature is
      // simply broken. Say what happened instead.
      u.onerror = (e) => {
        setSpeaking(false);
        if (e.error !== "canceled" && e.error !== "interrupted") {
          setError(
            `The browser wouldn't speak (${e.error}). The answer is above — check the tab isn't muted, or turn the speaker off.`,
          );
        }
      };

      utterance.current = u;
      synth.speak(u);

      // Chrome will accept speak(), report nothing, and stay silent when audio
      // was never unlocked. If it has not started shortly, say so rather than
      // leave the user tapping a mic that appears to do nothing.
      window.setTimeout(() => {
        if (utterance.current === u && !synth.speaking && !synth.pending) {
          setError(
            "The answer is above, but the browser didn't play it. Tap the speaker icon once to allow audio, then ask again.",
          );
        }
      }, 1200);
    },
    [voice, voices],
  );

  const send = React.useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      // Unlock audio while the click is still in scope — the answer that will
      // be spoken is several seconds and several database reads away.
      unlock();

      setDraft("");
      setError(null);
      const next: Turn[] = [...turns, { role: "user", content: question }];
      setTurns(next);
      setBusy(true);

      const res = await askOperations(next);
      setBusy(false);

      if (res.ok) {
        setTurns([...next, { role: "assistant", content: res.answer, spoken: res.spoken }]);
        say(res.spoken || res.answer);
      } else {
        setError(res.error);
      }

      input.current?.focus();
    },
    [busy, turns, say, unlock],
  );

  /** Tap to talk. Talking over it stops it talking. */
  const toggleMic = React.useCallback(() => {
    if (typeof window === "undefined") return;
    unlock();
    hush();

    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }

    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition })
        .webkitSpeechRecognition;
    if (!Ctor) {
      setError("This browser can't listen — Chrome, Edge and Safari can. Typing works everywhere.");
      return;
    }

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const heard = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript)
        .join(" ")
        .trim();
      // Straight through. Speaking a question and then having to press send is
      // one step too many when your hands are full.
      if (heard) void send(heard);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, [listening, hush, send, unlock]);

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

      {/* Brain on the left, conversation on the right. It stacks below lg,
          where a 300px canvas beside a chat would leave neither room. */}
      <div className="relative z-10 flex flex-col lg:flex-row">
        <div className="relative flex shrink-0 items-center justify-center border-b border-border/70 px-6 py-6 lg:w-[340px] lg:border-b-0 lg:border-r">
          {/* Glow behind the mesh, brightening as it wakes up. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 blur-3xl"
            style={{
              background:
                "radial-gradient(circle at 50% 48%, var(--vq-blue) 0%, transparent 62%)",
              opacity: speaking ? 0.65 : listening ? 0.5 : busy ? 0.42 : 0.26,
              transition: "opacity 500ms ease",
            }}
          />
          <div className="relative w-full max-w-[300px]">
            <NeuralBrain
              state={speaking ? "speaking" : busy || listening ? "thinking" : "idle"}
              className="aspect-[4/3] w-full"
            />
            <p
              className={cn(
                "mt-1 text-center text-[10.5px] font-semibold uppercase tracking-[0.16em] transition-colors",
                speaking || listening ? "text-brand-bright" : "text-muted-foreground",
              )}
            >
              {listening ? "Listening" : speaking ? "Speaking" : busy ? "Thinking" : "Standing by"}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em] text-foreground">
              Ask the business
              <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-success">
                <span className="size-1.5 rounded-full bg-success" /> Online
              </span>
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {listening
                ? "Listening…"
                : speaking
                  ? "Speaking — tap the square to stop"
                  : "Reads every job, crew, rate and invoice — and can change none of them"}
            </p>
          </div>
          {busy || speaking ? <Thinking /> : null}
          <button
            type="button"
            onClick={() => {
              if (voice) {
                hush();
                setVoice(false);
                return;
              }
              // Turning it on says something straight away. That proves the
              // speakers work and unlocks audio for every answer after it,
              // rather than leaving the first real answer to fail silently.
              setVoice(true);
              setError(null);
              unlocked.current = true;

              const synth = window.speechSynthesis;
              if (!synth) {
                setDiag("No speech engine in this browser.");
                return;
              }

              synth.cancel();
              synth.resume();
              const u = new SpeechSynthesisUtterance("Voice on.");
              u.rate = 1.04;
              u.pitch = 0.92;
              const pick = voices.find((v) =>
                /Daniel|Google UK English Male|Microsoft Guy|Alex/i.test(v.name),
              );
              if (pick) u.voice = pick;

              // Report what the browser actually did, rather than leaving a
              // silent speaker to be interpreted as a broken feature.
              u.onstart = () => setDiag(null);
              u.onerror = (e) => setDiag(`Browser refused: ${e.error}.`);
              utterance.current = u;
              synth.speak(u);

              window.setTimeout(() => {
                if (!synth.speaking && !synth.pending) {
                  setDiag(
                    `No sound came out. Engine present, ${voices.length} voices loaded${
                      pick ? `, using "${pick.name}"` : ", none matched so using the default"
                    }. Check the tab isn't muted (right-click the tab) and the system output device.`,
                  );
                }
              }, 1500);
            }}
            title={voice ? "Answers are spoken — tap to silence" : "Tap to turn the voice on"}
            className={cn(
              "focus-ring grid size-8 shrink-0 place-items-center rounded-lg border transition",
              voice
                ? "border-brand/50 bg-brand/10 text-brand-bright"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        </div>

        {/* ── Conversation ───────────────────────────────────────── */}
        <div
          ref={scroller}
          className={cn(
            "space-y-3 overflow-y-auto px-4 py-4 transition-[height] duration-300",
            started ? "h-[340px]" : "h-auto",
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

          {/* What the speech engine reported, in its own words. Guessing at
              this from here is how it stayed broken twice. */}
          {diag ? (
            <p className="rounded-xl border border-warning/40 bg-warning/[0.07] px-3 py-2 text-[12px] text-foreground">
              <span className="font-semibold">Voice check: </span>
              {diag}
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
            <button
              type="button"
              onClick={speaking ? hush : toggleMic}
              title={speaking ? "Stop speaking" : listening ? "Listening — tap to stop" : "Tap to talk"}
              className={cn(
                "focus-ring grid size-9 shrink-0 place-items-center rounded-lg border transition",
                listening
                  ? "vq-ai-core border-critical bg-critical/10 text-critical"
                  : speaking
                    ? "border-brand/50 bg-brand/10 text-brand-bright"
                    : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {speaking ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
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
              placeholder={listening ? "Listening…" : "Ask anything, or tap the mic…"}
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
    </div>
  );
}
