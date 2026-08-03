"use client";

import * as React from "react";
import {
  Circle,
  Eraser,
  Loader2,
  Redo2,
  Save,
  Slash,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { saveProjectMarkups } from "@/app/actions";

/* Redline markups are stored normalized (0..1 of each page) so they stay
   aligned no matter what size the map renders at or how far it's zoomed. */
export type LineShape = {
  id: string;
  type: "line";
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
};
export type DotShape = {
  id: string;
  type: "dot";
  page: number;
  x: number;
  y: number;
  color: string;
  size: number;
};
export type Shape = LineShape | DotShape;

type Tool = "line" | "dot" | "erase";
type Page = { width: number; height: number; src: string };

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#111827", "#ffffff"];
const SIZES = [3, 6, 10, 16, 26];
const GAP = 24; // px gap between pages, in unscaled coords

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${performance.now()}_${Math.round(performance.now() * 1000) % 100000}`;
  }
}

export function parseShapes(markups: unknown): Shape[] {
  if (!Array.isArray(markups)) return [];
  return markups.filter(
    (s): s is Shape =>
      !!s &&
      typeof s === "object" &&
      (s as Shape).type !== undefined &&
      ((s as Shape).type === "line" || (s as Shape).type === "dot"),
  );
}

// Distance from point p to segment ab (all normalized), for the eraser hit test.
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Rasterises a map — a plain image, or every page of a PDF — into pages we can
 * draw over. Shared by the full editor and the read-only sheet preview so the
 * pdf.js plumbing lives in exactly one place.
 */
export function useMapPages(mapUrl: string, isPdf: boolean) {
  const [pages, setPages] = React.useState<Page[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (!isPdf) {
          const dims = await new Promise<Page>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () =>
              resolve({ width: img.naturalWidth || 1200, height: img.naturalHeight || 900, src: mapUrl });
            img.onerror = () => reject(new Error("Could not load the image."));
            img.src = mapUrl;
          });
          if (!cancelled) setPages([dims]);
        } else {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
          const src = mapUrl.startsWith("data:")
            ? { data: dataUrlToBytes(mapUrl) }
            : { url: mapUrl };
          const doc = await pdfjs.getDocument(src).promise;
          const out: Page[] = [];
          const outputScale = Math.min(2, window.devicePixelRatio || 1.5);
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d")!;
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            ctx.scale(outputScale, outputScale);
            await page.render({ canvasContext: ctx, viewport }).promise;
            out.push({ width: viewport.width, height: viewport.height, src: canvas.toDataURL("image/jpeg", 0.85) });
            if (cancelled) return;
          }
          if (!cancelled) setPages(out);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not open this map.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapUrl, isPdf]);

  return { pages, loading, loadError };
}

export function MapMarkupEditor({
  projectId,
  mapUrl,
  isPdf,
  initialMarkups,
  onClose,
  onSave,
  title,
}: {
  projectId: string;
  mapUrl: string;
  isPdf: boolean;
  initialMarkups?: unknown;
  onClose: () => void;
  /** Where the redline goes. Defaults to the project's own as-built markup. */
  onSave?: (shapes: Shape[]) => void | Promise<void>;
  title?: string;
}) {
  const { pages, loading, loadError } = useMapPages(mapUrl, isPdf);

  const [tool, setTool] = React.useState<Tool>("line");
  const [color, setColor] = React.useState(COLORS[0]);
  const [size, setSize] = React.useState(SIZES[1]);
  const [scale, setScale] = React.useState(1);

  const [shapes, setShapes] = React.useState<Shape[]>(() => parseShapes(initialMarkups));
  const [redo, setRedo] = React.useState<Shape[]>([]);
  const [draft, setDraft] = React.useState<LineShape | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Fit-to-width once pages are known.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentW = pages.reduce((m, p) => Math.max(m, p.width), 0);
  const contentH = pages.reduce((s, p) => s + p.height, 0) + Math.max(0, pages.length - 1) * GAP;
  React.useEffect(() => {
    if (!contentW || !scrollRef.current) return;
    const avail = scrollRef.current.clientWidth - 32;
    setScale(Math.min(1.4, Math.max(0.15, avail / contentW)));
  }, [contentW]);

  function commit(next: Shape[]) {
    setShapes(next);
    setRedo([]);
  }
  function undo() {
    setShapes((s) => {
      if (!s.length) return s;
      setRedo((r) => [...r, s[s.length - 1]]);
      return s.slice(0, -1);
    });
  }
  function redoLast() {
    setRedo((r) => {
      if (!r.length) return r;
      setShapes((s) => [...s, r[r.length - 1]]);
      return r.slice(0, -1);
    });
  }

  function pointOnPage(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onDown(page: number, e: React.PointerEvent<SVGSVGElement>) {
    const { x, y } = pointOnPage(e);
    if (tool === "dot") {
      commit([...shapes, { id: uid(), type: "dot", page, x, y, color, size }]);
      return;
    }
    if (tool === "erase") {
      eraseAt(page, x, y);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft({ id: uid(), type: "line", page, x1: x, y1: y, x2: x, y2: y, color, size });
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!draft) return;
    const { x, y } = pointOnPage(e);
    setDraft({ ...draft, x2: x, y2: y });
  }
  function onUp() {
    if (!draft) return;
    const moved = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 0.002;
    if (moved) commit([...shapes, draft]);
    setDraft(null);
  }

  function eraseAt(page: number, x: number, y: number) {
    const tol = 0.012 + size / 2000;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.page !== page) continue;
      const hit =
        s.type === "dot"
          ? Math.hypot(x - s.x, y - s.y) < tol + s.size / 2000
          : segDist(x, y, s.x1, s.y1, s.x2, s.y2) < tol;
      if (hit) {
        commit(shapes.filter((_, idx) => idx !== i));
        return;
      }
    }
  }

  async function save() {
    setSaving(true);
    if (onSave) await onSave(shapes);
    else await saveProjectMarkups(projectId, shapes);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0d12]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#12151c] px-3 py-2">
        <button
          onClick={onClose}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[12px] font-medium text-white/70 hover:text-white"
        >
          <X className="size-4" /> Close
        </button>

        {title ? (
          <span className="max-w-[280px] truncate text-[12.5px] font-semibold text-white/90">{title}</span>
        ) : null}

        <div className="mx-1 h-5 w-px bg-white/10" />

        <ToolBtn active={tool === "line"} onClick={() => setTool("line")} icon={<Slash className="size-4" />} label="Line" />
        <ToolBtn active={tool === "dot"} onClick={() => setTool("dot")} icon={<Circle className="size-4" />} label="Dot" />
        <ToolBtn active={tool === "erase"} onClick={() => setTool("erase")} icon={<Eraser className="size-4" />} label="Erase" />

        <div className="mx-1 h-5 w-px bg-white/10" />

        {/* Color */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`size-6 rounded-full border transition ${
                color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#12151c]" : "border-white/20"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="mx-1 h-5 w-px bg-white/10" />

        {/* Size */}
        <div className="flex items-center gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`grid size-7 place-items-center rounded-lg border ${
                size === s ? "border-white bg-white/10" : "border-white/15"
              }`}
              title={`${s}px`}
            >
              <span className="rounded-full" style={{ width: Math.min(18, s), height: Math.min(18, s), backgroundColor: "#fff" }} />
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setScale((z) => Math.max(0.15, z - 0.2))} className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-white">
            <ZoomOut className="size-4" />
          </button>
          <span className="num w-10 text-center text-[12px] text-white/70">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((z) => Math.min(4, z + 0.2))} className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-white">
            <ZoomIn className="size-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-white/10" />

          <button onClick={undo} disabled={!shapes.length} className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-white disabled:opacity-40">
            <Undo2 className="size-4" />
          </button>
          <button onClick={redoLast} disabled={!redo.length} className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-white disabled:opacity-40">
            <Redo2 className="size-4" />
          </button>
          <button onClick={() => commit([])} disabled={!shapes.length} className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-critical disabled:opacity-40" title="Clear all">
            <Trash2 className="size-4" />
          </button>

          <button
            onClick={save}
            disabled={saving}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto bg-[#0b0d12] p-4">
        {loading ? (
          <div className="grid h-full place-items-center text-white/60">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-[12.5px]">Rendering map…</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="grid h-full place-items-center text-center text-white/70">
            <div>
              <p className="text-[13px]">{loadError}</p>
              <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12px] text-brand-bright underline">
                Open the map directly
              </a>
            </div>
          </div>
        ) : (
          <div style={{ width: contentW * scale, height: contentH * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <div className="flex flex-col items-center" style={{ gap: GAP }}>
                {pages.map((pg, pi) => {
                  const vbH = 1000 * (pg.height / pg.width);
                  const draw = draft && draft.page === pi ? draft : null;
                  return (
                    <div key={pi} className="relative shadow-2xl" style={{ width: pg.width, height: pg.height }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pg.src} alt={`Map page ${pi + 1}`} className="block select-none" style={{ width: pg.width, height: pg.height }} draggable={false} />
                      <svg
                        viewBox={`0 0 1000 ${vbH}`}
                        preserveAspectRatio="none"
                        className="absolute inset-0"
                        style={{ width: pg.width, height: pg.height, cursor: tool === "erase" ? "cell" : "crosshair", touchAction: "none" }}
                        onPointerDown={(e) => onDown(pi, e)}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerLeave={onUp}
                      >
                        {shapes
                          .filter((s) => s.page === pi)
                          .map((s) =>
                            s.type === "line" ? (
                              <line
                                key={s.id}
                                x1={s.x1 * 1000}
                                y1={s.y1 * vbH}
                                x2={s.x2 * 1000}
                                y2={s.y2 * vbH}
                                stroke={s.color}
                                strokeWidth={s.size}
                                strokeLinecap="round"
                              />
                            ) : (
                              <circle key={s.id} cx={s.x * 1000} cy={s.y * vbH} r={s.size} fill={s.color} />
                            ),
                          )}
                        {draw ? (
                          <line
                            x1={draw.x1 * 1000}
                            y1={draw.y1 * vbH}
                            x2={draw.x2 * 1000}
                            y2={draw.y2 * vbH}
                            stroke={draw.color}
                            strokeWidth={draw.size}
                            strokeLinecap="round"
                            opacity={0.8}
                          />
                        ) : null}
                      </svg>
                      {pages.length > 1 ? (
                        <span className="num absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {pi + 1}/{pages.length}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The same map with the same redline burned over it, read-only. Used on the
 * daily billing sheet so what the crew drew is what comes out of the printer.
 */
export function MapRedlinePreview({
  mapUrl,
  isPdf,
  shapes,
  className,
}: {
  mapUrl: string;
  isPdf: boolean;
  shapes: Shape[];
  className?: string;
}) {
  const { pages, loading, loadError } = useMapPages(mapUrl, isPdf);

  if (loading) {
    return (
      <div className={`grid min-h-[180px] place-items-center text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (loadError || !pages.length) {
    return (
      <div className={`grid min-h-[180px] place-items-center px-4 text-center text-[12.5px] text-muted-foreground ${className ?? ""}`}>
        {loadError ?? "No map to show."}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {pages.map((pg, pi) => {
        const vbH = 1000 * (pg.height / pg.width);
        return (
          <div key={pi} className="relative w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pg.src} alt={`Map page ${pi + 1}`} className="block w-full select-none" draggable={false} />
            <svg viewBox={`0 0 1000 ${vbH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {shapes
                .filter((s) => s.page === pi)
                .map((s) =>
                  s.type === "line" ? (
                    <line
                      key={s.id}
                      x1={s.x1 * 1000}
                      y1={s.y1 * vbH}
                      x2={s.x2 * 1000}
                      y2={s.y2 * vbH}
                      stroke={s.color}
                      strokeWidth={s.size}
                      strokeLinecap="round"
                    />
                  ) : (
                    <circle key={s.id} cx={s.x * 1000} cy={s.y * vbH} r={s.size} fill={s.color} />
                  ),
                )}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function ToolBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition ${
        active ? "border-brand bg-brand/20 text-white" : "border-white/10 text-white/70 hover:text-white"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
