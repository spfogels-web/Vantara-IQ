"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { messagesPulse } from "@/app/messages/pulse";

/**
 * Keep the messages page current without a reload.
 *
 * Asks the server every few seconds whether the newest message it can see has
 * changed, and re-renders only when it has. The pulse returns a stamp rather
 * than any content, so the common case — nothing new — costs one small query
 * and changes nothing on screen.
 *
 * Three things it deliberately does:
 *
 *   Stops when the tab is hidden. Nobody is reading a background tab, and a
 *   phone left open on this page overnight should not be asking the database a
 *   question every four seconds until morning. It checks once immediately on
 *   coming back, so returning to the tab feels instant rather than taking a
 *   full interval to catch up.
 *
 *   Backs off when the answer keeps failing. A dropped connection or a
 *   deploying server should not be hammered by every open tab at the same
 *   cadence; the gap doubles up to a minute and resets the moment a poll
 *   succeeds.
 *
 *   Never refreshes on the first answer. The first stamp is what was already
 *   on screen when the page rendered — treating it as new would re-render
 *   every page load for nothing.
 */
export function useLiveMessages(everyMs = 5000) {
  const router = useRouter();
  const seen = React.useRef<string | null>(null);
  const failures = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (cancelled) return;

      // A hidden tab is not being read. Come back when it is.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = setTimeout(tick, everyMs);
        return;
      }

      try {
        const { stamp } = await messagesPulse();
        failures.current = 0;

        if (seen.current === null) {
          // First answer: this is what the page already rendered.
          seen.current = stamp;
        } else if (stamp !== seen.current) {
          seen.current = stamp;
          router.refresh();
        }
      } catch {
        // Silent on purpose. A poll that failed is not something to put in
        // front of somebody reading their messages — the next one will either
        // work or the page will still be showing the last good state.
        failures.current += 1;
      }

      const backoff = Math.min(everyMs * 2 ** Math.min(failures.current, 4), 60_000);
      if (!cancelled) timer = setTimeout(tick, failures.current ? backoff : everyMs);
    }

    // Coming back to the tab should feel immediate.
    function onVisible() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    timer = setTimeout(tick, everyMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [everyMs, router]);
}
