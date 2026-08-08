"use client";

import * as React from "react";
import {
  Circle,
  ImagePlus,
  Square,
  Type,
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

import { upload as blobUpload } from "@vercel/blob/client";

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
/**
 * A box. Drawn corner to corner, which is how a handhole gets marked on a
 * print — the crew draws the footprint, not a symbol at a point.
 */
export type RectShape = {
  id: string;
  type: "rect";
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
  /** Filled boxes read as solid structures; outlines read as annotation. */
  filled?: boolean;
};

/**
 * A note on the map — station marks, footages, "rock here".
 *
 * Font size rides on the same size control as everything else, so a title and
 * a tick mark are set with the same two clicks rather than a separate scale.
 */
export type TextShape = {
  id: string;
  type: "text";
  page: number;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
};

/**
 * A photograph dropped onto the print.
 *
 * Placed by dragging its box, so the crew decides how large it lands rather
 * than placing it and then hunting for a resize handle. Stored by URL — the
 * file itself goes to Blob like every other field photo.
 */
export type ImageShape = {
  id: string;
  type: "image";
  page: number;
  x: number;
  y: number;
  /** Width and height as a fraction of the page. */
  w: number;
  h: number;
  url: string;
};

export type Shape = LineShape | DotShape | RectShape | TextShape | ImageShape;

type Tool = "line" | "rect" | "dot" | "text" | "image" | "erase";
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

const SHAPE_TYPES = ["line", "dot", "rect", "text", "image"] as const;

export function parseShapes(markups: unknown): Shape[] {
  if (!Array.isArray(markups)) return [];
  return markups.filter(
    (s): s is Shape =>
      !!s &&
      typeof s === "object" &&
      SHAPE_TYPES.includes((s as Shape).type as (typeof SHAPE_TYPES)[number]),
  );
}

/** A shape's bounding box, normalized. Used for hit tests and rendering. */
function boxOf(s: Shape): { x1: number; y1: number; x2: number; y2: number } | null {
  if (s.type === "rect") {
    return {
      x1: Math.min(s.x1, s.x2),
      y1: Math.min(s.y1, s.y2),
      x2: Math.max(s.x1, s.x2),
      y2: Math.max(s.y1, s.y2),
    };
  }
  if (s.type === "image") return { x1: s.x, y1: s.y, x2: s.x + s.w, y2: s.y + s.h };
  return null;
}

/**
 * One shape, drawn.
 *
 * Shared by the editor and the read-only sheet preview, so what a crew draws is
 * exactly what comes out of the printer. Two copies of this drifted apart once
 * already — the preview knew about lines and dots and silently dropped anything
 * else, which would have made a handhole vanish from the as-built.
 *
 * `vbH` is the page's viewBox height; x is always over 1000.
 */
function renderShape(s: Shape, vbH: number, key?: string) {
  const k = key ?? s.id;
  switch (s.type) {
    case "line":
      return (
        <line
          key={k}
          x1={s.x1 * 1000}
          y1={s.y1 * vbH}
          x2={s.x2 * 1000}
          y2={s.y2 * vbH}
          stroke={s.color}
          strokeWidth={s.size}
          strokeLinecap="round"
        />
      );
    case "dot":
      return <circle key={k} cx={s.x * 1000} cy={s.y * vbH} r={s.size} fill={s.color} />;
    case "rect": {
      const b = boxOf(s)!;
      return (
        <rect
          key={k}
          x={b.x1 * 1000}
          y={b.y1 * vbH}
          width={(b.x2 - b.x1) * 1000}
          height={(b.y2 - b.y1) * vbH}
          stroke={s.color}
          strokeWidth={s.size}
          fill={s.filled ? s.color : "none"}
          fillOpacity={s.filled ? 0.25 : 0}
        />
      );
    }
    case "text":
      return (
        // paint-order puts the halo behind the glyphs, so text stays readable
        // over a dark aerial or a busy print without a plate behind it.
        <text
          key={k}
          x={s.x * 1000}
          y={s.y * vbH}
          fill={s.color}
          stroke="#000"
          strokeWidth={Math.max(1, s.size * 0.35)}
          paintOrder="stroke"
          strokeLinejoin="round"
          fontSize={s.size * 3.2}
          fontWeight={700}
          style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
        >
          {s.text}
        </text>
      );
    case "image":
      return (
        <image
          key={k}
          href={s.url}
          x={s.x * 1000}
          y={s.y * vbH}
          width={s.w * 1000}
          height={s.h * vbH}
          preserveAspectRatio="xMidYMid slice"
        />
      );
    default:
      return null;
  }
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
  /** Lines, boxes and images are all dragged out, so they share one draft. */
  const [draft, setDraft] = React.useState<LineShape | RectShape | ImageShape | null>(null);
  const [saving, setSaving] = React.useState(false);

  /**
   * Where a note is being typed, in page coordinates.
   *
   * The input floats over the map at the point that was clicked rather than
   * living in the toolbar, so a crew sees the note land where they meant it.
   */
  const [typing, setTyping] = React.useState<{ page: number; x: number; y: number } | null>(null);
  const [typed, setTyped] = React.useState("");

  /**
   * A photo chosen but not yet placed.
   *
   * Uploading first and dragging second means the crew sizes the image on the
   * print itself. Placing it at some default and then hunting for a resize
   * handle is the version everybody gets wrong on a tablet in the sun.
   */
  const [pendingImage, setPendingImage] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

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
    if (tool === "text") {
      // Commit whatever is already being typed before moving the caret, so a
      // second click places a second note rather than losing the first.
      commitTyping();
      setTyping({ page, x, y });
      setTyped("");
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "image") {
      if (!pendingImage) return; // Nothing chosen yet; the toolbar says so.
      setDraft({ id: uid(), type: "image", page, x, y, w: 0, h: 0, url: pendingImage });
      return;
    }
    if (tool === "rect") {
      setDraft({ id: uid(), type: "rect", page, x1: x, y1: y, x2: x, y2: y, color, size });
      return;
    }
    setDraft({ id: uid(), type: "line", page, x1: x, y1: y, x2: x, y2: y, color, size });
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = draft;
    if (!d) return;
    const { x, y } = pointOnPage(e);
    if (d.type === "image") {
      // Anchored at the corner it started from, so dragging in any direction
      // still produces a positive box.
      setDraft({ ...d, w: Math.abs(x - d.x), h: Math.abs(y - d.y) });
      return;
    }
    setDraft({ ...d, x2: x, y2: y });
  }

  function onUp() {
    const d = draft;
    if (!d) return;

    if (d.type === "image") {
      // Anything smaller than this is a mis-tap, not a photo somebody wanted.
      if (d.w > 0.02 && d.h > 0.02) {
        commit([...shapes, d]);
        setPendingImage(null);
      }
      setDraft(null);
      return;
    }

    const moved = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 0.002;
    if (moved) commit([...shapes, d]);
    setDraft(null);
  }

  /** Write the note being typed onto the map, if there is one. */
  function commitTyping() {
    if (!typing || !typed.trim()) {
      setTyping(null);
      setTyped("");
      return;
    }
    commit([
      ...shapes,
      { id: uid(), type: "text", page: typing.page, x: typing.x, y: typing.y, text: typed.trim(), color, size },
    ]);
    setTyping(null);
    setTyped("");
  }

  /**
   * Upload a photo, then wait for the crew to drag its box.
   *
   * Straight to Blob like every other field photo — a map with three site
   * photos on it would otherwise be a megabyte of base64 in the markup JSON.
   */
  async function pickImage(file: File) {
    setUploading(true);
    try {
      const blob = await blobUpload(`map-markup/${projectId}/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      setPendingImage(blob.url);
      setTool("image");
    } catch {
      setPendingImage(null);
    } finally {
      setUploading(false);
    }
  }

  /**
   * Erase the topmost shape under the cursor.
   *
   * Newest first, because the thing somebody wants gone is almost always the
   * thing they just drew — and on a busy print several shapes overlap.
   */
  function eraseAt(page: number, x: number, y: number) {
    const tol = 0.012 + size / 2000;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.page !== page) continue;

      let hit = false;
      if (s.type === "dot") {
        hit = Math.hypot(x - s.x, y - s.y) < tol + s.size / 2000;
      } else if (s.type === "line") {
        hit = segDist(x, y, s.x1, s.y1, s.x2, s.y2) < tol;
      } else if (s.type === "rect" || s.type === "image") {
        // Boxes catch anywhere inside them, so a photo can be removed by
        // tapping it rather than by finding its edge.
        const b = boxOf(s)!;
        hit = x >= b.x1 - tol && x <= b.x2 + tol && y >= b.y1 - tol && y <= b.y2 + tol;
      } else if (s.type === "text") {
        // Text has no geometry, so approximate its run from the glyph size.
        const w = Math.max(0.02, s.text.length * s.size * 0.0016);
        const h = s.size * 0.004;
        hit = x >= s.x - tol && x <= s.x + w + tol && y >= s.y - h - tol && y <= s.y + tol;
      }

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
        {/* Boxes are how a handhole gets marked — the footprint, not a symbol. */}
        <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} icon={<Square className="size-4" />} label="Box" />
        <ToolBtn active={tool === "dot"} onClick={() => setTool("dot")} icon={<Circle className="size-4" />} label="Dot" />
        {/* Wheeled footages, station marks, "rock here". */}
        <ToolBtn active={tool === "text"} onClick={() => setTool("text")} icon={<Type className="size-4" />} label="Text" />
        <ToolBtn
          active={tool === "image"}
          onClick={() => imageInputRef.current?.click()}
          icon={uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          label={uploading ? "Uploading" : "Photo"}
        />
        <ToolBtn active={tool === "erase"} onClick={() => setTool("erase")} icon={<Eraser className="size-4" />} label="Erase" />

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void pickImage(file);
          }}
        />

        {/* The one piece of state a crew cannot guess at: a photo is loaded
            and waiting to be sized. */}
        {pendingImage ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/20 px-2 py-1 text-[11.5px] font-medium text-brand-bright">
            Drag a box to place the photo
          </span>
        ) : null}

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
                        style={{
                          width: pg.width,
                          height: pg.height,
                          // The cursor is the only thing telling somebody which
                          // tool is live once their eyes are on the print.
                          cursor:
                            tool === "erase"
                              ? "cell"
                              : tool === "text"
                                ? "text"
                                : tool === "image" && !pendingImage
                                  ? "not-allowed"
                                  : "crosshair",
                          touchAction: "none",
                        }}
                        onPointerDown={(e) => onDown(pi, e)}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerLeave={onUp}
                      >
                        {shapes.filter((s) => s.page === pi).map((s) => renderShape(s, vbH))}
                        {/* The shape being dragged, at reduced opacity so it
                            reads as not yet committed. */}
                        {draw ? <g opacity={0.8}>{renderShape(draw, vbH, "draft")}</g> : null}
                      </svg>

                      {/* The note being typed, floating at the point that was
                          clicked. Sized and coloured like the shape it will
                          become, so what is on screen is what lands. */}
                      {typing && typing.page === pi ? (
                        <input
                          value={typed}
                          autoFocus
                          onChange={(e) => setTyped(e.target.value)}
                          onBlur={commitTyping}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitTyping();
                            if (e.key === "Escape") {
                              setTyping(null);
                              setTyped("");
                            }
                          }}
                          placeholder="Type, then Enter"
                          style={{
                            position: "absolute",
                            left: `${typing.x * 100}%`,
                            // Sit on the baseline the glyphs will use.
                            top: `${typing.y * 100}%`,
                            transform: "translateY(-100%)",
                            fontSize: size * 3.2 * (pg.width / 1000),
                            color,
                            fontWeight: 700,
                          }}
                          className="min-w-[120px] rounded border-2 border-brand bg-black/80 px-1 outline-none"
                        />
                      ) : null}

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
              {shapes.filter((s) => s.page === pi).map((s) => renderShape(s, vbH))}
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
