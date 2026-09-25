"use client";

import * as React from "react";

import { recordLocation } from "@/app/workforce-actions";
import {
  HEARTBEAT_SECONDS,
  MAX_PERIODIC_ACCURACY_METRES,
  MIN_MOVEMENT_METRES,
  MIN_SECONDS_BETWEEN_POINTS,
  metresBetween,
} from "@/lib/workforce-location";

/**
 * Follow a shift while the browser lets us, and be honest when it does not.
 *
 * This is a web page, not a native application. Everything below stops when
 * the operating system decides it should: the screen locks, the tab goes to
 * the background, the battery saver engages, the browser is swiped away. None
 * of that can be prevented from here, and pretending otherwise would be the
 * one genuinely dishonest thing this feature could do — a manager looking at
 * an unbroken line would believe it meant something it does not.
 *
 * So: capture what the browser gives, send what is worth keeping, and when
 * the page comes back after an hour asleep, simply carry on. The missing hour
 * stays missing. Nothing here interpolates, back-fills, or replays.
 */

export type TrackingStatus = "STARTING" | "ACTIVE" | "DENIED" | "UNAVAILABLE" | "STALE";

type Sent = { at: number; latitude: number; longitude: number };

export function useShiftTracking(active: boolean): {
  status: TrackingStatus;
  lastSentAt: number | null;
  lastAccuracy: number | null;
  points: number;
} {
  const [status, setStatus] = React.useState<TrackingStatus>("STARTING");
  const [lastSentAt, setLastSentAt] = React.useState<number | null>(null);
  const [lastAccuracy, setLastAccuracy] = React.useState<number | null>(null);
  const [points, setPoints] = React.useState(0);

  // Refs, not state: the watch callback must not re-subscribe on every fix.
  const lastSent = React.useRef<Sent | null>(null);
  const inFlight = React.useRef(false);

  React.useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("UNAVAILABLE");
      return;
    }

    /**
     * Whether this fix is worth a row in the database.
     *
     * The same three rules the server enforces, applied here first so a phone
     * sitting in a truck does not spend its battery and its signal telling us
     * every second that it has not moved. The server checks again because a
     * client is not a place to keep a rule.
     */
    function worthSending(p: GeolocationPosition): boolean {
      const acc = p.coords.accuracy;
      if (typeof acc === "number" && acc > MAX_PERIODIC_ACCURACY_METRES) return false;

      const prev = lastSent.current;
      if (!prev) return true;

      const since = (Date.now() - prev.at) / 1000;
      if (since < MIN_SECONDS_BETWEEN_POINTS) return false;
      if (since >= HEARTBEAT_SECONDS) return true;

      return (
        metresBetween(prev, {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        }) >= MIN_MOVEMENT_METRES
      );
    }

    async function offer(p: GeolocationPosition) {
      if (inFlight.current || !worthSending(p)) return;
      inFlight.current = true;
      try {
        const res = await recordLocation({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracyMeters: typeof p.coords.accuracy === "number" ? p.coords.accuracy : null,
        });
        if (res.ok) {
          lastSent.current = {
            at: Date.now(),
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
          };
          setLastSentAt(Date.now());
          setLastAccuracy(typeof p.coords.accuracy === "number" ? p.coords.accuracy : null);
          setPoints((n) => n + 1);
          setStatus("ACTIVE");
        }
        // A refusal is not an error worth showing: "too soon" and "hasn't
        // moved" are the throttle doing its job.
      } catch {
        /* offline, or the action failed; the next fix will try again */
      } finally {
        inFlight.current = false;
      }
    }

    const id = navigator.geolocation.watchPosition(
      (p) => {
        setStatus("ACTIVE");
        void offer(p);
      },
      (err) => {
        // 1 = PERMISSION_DENIED. Everything else is the fix being unavailable
        // rather than refused, and the two need different words.
        setStatus(err.code === 1 ? "DENIED" : "UNAVAILABLE");
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );

    /**
     * Coming back after the browser suspended us.
     *
     * No catch-up, no back-fill. The page asks for one fresh position so the
     * screen stops claiming something stale, and the gap that just happened
     * stays in the record as a gap.
     */
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      navigator.geolocation.getCurrentPosition(
        (p) => void offer(p),
        () => undefined,
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
      );
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      // Clock Out unmounts this. Tracking stops here and nowhere else.
      navigator.geolocation.clearWatch(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  /**
   * "Active" has to mean something arrived recently.
   *
   * An open shift is not evidence that tracking works — the phone may have
   * been asleep for an hour with the watch still nominally registered. This
   * ages the claim so the employee is told the truth rather than reassured.
   */
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setStatus((s) => {
        if (s === "DENIED" || s === "UNAVAILABLE") return s;
        if (!lastSentAt) return s;
        return (Date.now() - lastSentAt) / 1000 > HEARTBEAT_SECONDS ? "STALE" : s;
      });
    }, 30_000);
    return () => clearInterval(t);
  }, [active, lastSentAt]);

  return { status, lastSentAt, lastAccuracy, points };
}
