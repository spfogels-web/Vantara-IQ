"use client";

import * as React from "react";

// Leaflet ships its own stylesheet and the map is unusable without it —
// tiles stack rather than tile. Imported here rather than globally so a page
// without a map does not carry it.
import "leaflet/dist/leaflet.css";

import { cn } from "@/lib/utils";

type Point = {
  id: string;
  kind: string;
  capturedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

type Segment = { points: Point[]; gapAfterSeconds: number | null };

/**
 * Where a device reported during one shift.
 *
 * Leaflet with OpenStreetMap tiles: no key, no account, no per-view cost, and
 * the attribution the licence requires rendered on the map rather than tucked
 * away. The tile URL is one constant so a different provider is a one-line
 * change if this ever outgrows the OSM tile policy — nothing else here knows
 * where the pictures come from.
 *
 * THE LINE IS NOT A ROUTE. It joins reported positions in the order they were
 * reported. It is not the road driven, it has not been snapped to anything,
 * and where reporting stopped the line stops with it — one polyline per
 * segment, never a stitch across a gap. A continuous line through a
 * thirty-four minute hole would be Vantara claiming to have seen something it
 * did not, on a screen somebody might rely on in a dispute.
 */

/** Swap this for a keyed provider if volume ever outgrows the OSM policy. */
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function ShiftMap({
  segments,
  selectedId,
  onSelect,
  className,
}: {
  segments: Segment[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const map = React.useRef<import("leaflet").Map | null>(null);
  const markers = React.useRef<Map<string, import("leaflet").CircleMarker>>(new Map());
  const [ready, setReady] = React.useState(false);

  const all = React.useMemo(() => segments.flatMap((s) => s.points), [segments]);

  React.useEffect(() => {
    if (!host.current || all.length === 0) return;
    let cancelled = false;

    // Loaded in the browser only: Leaflet touches window at import time, so a
    // server render would fail on it.
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !host.current) return;

      const m = L.map(host.current, { scrollWheelZoom: false, attributionControl: true });
      map.current = m;
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);

      // One polyline per segment. This is the whole gap rule, in two lines.
      for (const seg of segments) {
        if (seg.points.length < 2) continue;
        L.polyline(
          seg.points.map((p) => [p.latitude, p.longitude] as [number, number]),
          { color: "#6ea8ff", weight: 3, opacity: 0.85 },
        ).addTo(m);
      }

      for (const p of all) {
        const isStart = p.kind === "CLOCK_IN";
        const isEnd = p.kind === "CLOCK_OUT";
        const marker = L.circleMarker([p.latitude, p.longitude], {
          radius: isStart || isEnd ? 8 : 4,
          color: isStart ? "#22c55e" : isEnd ? "#ef4444" : "#6ea8ff",
          fillColor: isStart ? "#22c55e" : isEnd ? "#ef4444" : "#6ea8ff",
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(m);

        marker.bindPopup(
          `<strong>${label(p.kind)}</strong><br/>${time(p.capturedAt)}<br/>` +
            (p.accuracyMeters === null
              ? "accuracy not reported"
              : `accuracy ${Math.round(p.accuracyMeters)} m`),
        );
        marker.on("click", () => onSelect?.(p.id));
        markers.current.set(p.id, marker);
      }

      m.fitBounds(
        L.latLngBounds(all.map((p) => [p.latitude, p.longitude] as [number, number])),
        { padding: [24, 24], maxZoom: 17 },
      );
      setReady(true);
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markers.current.clear();
    };
  }, [segments, all, onSelect]);

  // The timeline and the map are two views of one list; selecting in either
  // should move the other.
  React.useEffect(() => {
    if (!ready || !selectedId) return;
    const marker = markers.current.get(selectedId);
    if (!marker) return;
    marker.openPopup();
    map.current?.panTo(marker.getLatLng());
  }, [ready, selectedId]);

  if (all.length === 0) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-xl border border-border/60 bg-foreground/[0.02] p-8 text-center",
          className,
        )}
      >
        <p className="text-[13px] text-muted-foreground">
          No locations were recorded for this shift.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border/60", className)}>
      <div ref={host} className="h-[360px] w-full" />
      <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        The line joins reported positions in the order they were reported. It is
        not the exact road or path travelled, and it breaks wherever reporting
        stopped.
      </p>
    </div>
  );
}

function label(kind: string): string {
  return kind === "CLOCK_IN" ? "Clock in" : kind === "CLOCK_OUT" ? "Clock out" : "Location";
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}
