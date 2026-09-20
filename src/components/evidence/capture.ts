"use client";

import { readPhotoExif } from "@/app/actions";

/**
 * Reading what a device or a file can honestly tell us about a capture.
 *
 * Shared between the project gallery, the pre-construction section and the
 * daily sheet, because the rule has to be the same in all three and a rule
 * written three times is a rule that will eventually differ in one of them.
 *
 * The distinction that matters: a photograph taken in the app right now
 * carries the device's own position, read at that moment. A photograph chosen
 * from the library was taken somewhere else at some other time, so its location
 * comes from the file's own EXIF or it has none. Stamping a library photo with
 * where the phone is standing would put a coordinate on a record that never had
 * anything to do with the picture — and it would look exactly like a real one.
 */

export type CaptureFacts = {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  /** "device" | "exif" | "" — never anything else, and never invented. */
  locationSource: string;
  capturedAt: string | null;
  /** "camera" | "exif" | "file" | "" */
  capturedAtSource: string;
};

const NOTHING: CaptureFacts = {
  lat: null,
  lng: null,
  accuracyM: null,
  locationSource: "",
  capturedAt: null,
  capturedAtSource: "",
};

/**
 * Wait for a position fix, or give up cleanly.
 *
 * Denied, unavailable and timed out all mean the same thing here: no location.
 * The capture still goes through. Blocking a field record on a GPS fix would
 * lose the photograph, and the photograph is the thing that actually matters —
 * a crew standing in a subdivision with location services off must still be
 * able to file their day.
 */
export function getFix(timeoutMs = 12_000): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (p: GeolocationPosition | null) => {
      if (settled) return;
      settled = true;
      resolve(p);
    };
    navigator.geolocation.getCurrentPosition(
      (p) => done(p),
      () => done(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
    // Some browsers never call either callback when permission is dismissed
    // rather than answered. This is the floor under that.
    window.setTimeout(() => done(null), timeoutMs + 500);
  });
}

export function looksLikeVideo(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi)$/i.test(file.name);
}

/**
 * Everything we can honestly say about where and when this file was captured.
 *
 * Returns blanks rather than guesses. A caller may not fill them in from
 * anywhere else — see the note at the top of this file, and the server-side
 * refusal in src/lib/evidence.ts, which is the one that actually holds.
 */
export async function captureFacts(file: File, source: "CAMERA" | "LIBRARY"): Promise<CaptureFacts> {
  const isVideo = looksLikeVideo(file);

  if (source === "CAMERA") {
    // Taken here, now: the device's position is the photograph's position.
    const fix = await getFix();
    return {
      lat: fix ? fix.coords.latitude : null,
      lng: fix ? fix.coords.longitude : null,
      accuracyM: fix && Number.isFinite(fix.coords.accuracy) ? fix.coords.accuracy : null,
      locationSource: fix ? "device" : "",
      capturedAt: new Date().toISOString(),
      capturedAtSource: "camera",
    };
  }

  // From the library: only the file can say where and when.
  const facts: CaptureFacts = { ...NOTHING };

  if (!isVideo) {
    const fd = new FormData();
    fd.set("file", file);
    try {
      const exif = await readPhotoExif(fd);
      if (exif.ok) {
        if (exif.lat != null && exif.lng != null) {
          facts.lat = exif.lat;
          facts.lng = exif.lng;
          facts.locationSource = "exif";
        }
        if (exif.capturedAt) {
          facts.capturedAt = exif.capturedAt;
          facts.capturedAtSource = "exif";
        }
      }
    } catch {
      // No EXIF is ordinary — phones strip it on a share sheet. Carry on with
      // nothing rather than failing the upload.
    }
  }

  if (!facts.capturedAt && file.lastModified) {
    // Weaker, and labelled as such: a file's modified time is often the
    // capture time and is sometimes the time it was copied off the phone.
    facts.capturedAt = new Date(file.lastModified).toISOString();
    facts.capturedAtSource = "file";
  }

  return facts;
}
