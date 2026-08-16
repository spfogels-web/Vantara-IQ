"use client";

import * as React from "react";

/**
 * The assistant's face — a neural mesh in the shape of a brain.
 *
 * Canvas rather than SVG or a video: a few hundred nodes and edges redrawn
 * every frame is trivial work for canvas and thousands of DOM nodes for SVG,
 * and unlike a video it reacts. It is idle, thinking or speaking, and it looks
 * different in each — energy travels the edges when it talks, so the movement
 * means something rather than being decoration on a loop.
 *
 * Everything is generated from a seeded shape, so there is no asset to load,
 * nothing to hit the network for, and it renders identically every time.
 */

export type BrainState = "idle" | "thinking" | "speaking";

type Node = { x: number; y: number; ox: number; oy: number; ph: number; r: number };
type Edge = { a: number; b: number; d: number };

/**
 * A brain silhouette, as a closed outline in unit space.
 *
 * Traced rather than computed — a parametric blob reads as a cloud, and the
 * recognisable thing about a brain from the side is the frontal bulge, the
 * notch above the temple, and the stem trailing off the back.
 */
const OUTLINE: [number, number][] = [
  [0.18, 0.46], [0.20, 0.36], [0.26, 0.27], [0.35, 0.20], [0.45, 0.16],
  [0.56, 0.14], [0.67, 0.16], [0.76, 0.21], [0.83, 0.28], [0.87, 0.37],
  [0.89, 0.46], [0.88, 0.55], [0.84, 0.63], [0.78, 0.69], [0.72, 0.72],
  [0.70, 0.79], [0.64, 0.84], [0.56, 0.86], [0.48, 0.85], [0.43, 0.80],
  [0.38, 0.83], [0.31, 0.82], [0.25, 0.77], [0.22, 0.70], [0.23, 0.62],
  [0.19, 0.55],
];

/** Even-odd test so nodes only ever land inside the silhouette. */
function inside(x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i];
    const [xj, yj] = OUTLINE[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Deterministic pseudo-random, so the mesh is the same on every render. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildMesh(count: number) {
  const rand = seeded(20260816);
  const nodes: Node[] = [];
  let guard = 0;
  while (nodes.length < count && guard++ < count * 60) {
    const x = rand();
    const y = rand();
    if (!inside(x, y)) continue;
    nodes.push({ x, y, ox: x, oy: y, ph: rand() * Math.PI * 2, r: 0.6 + rand() * 1.6 });
  }

  // Join near neighbours only — long edges across the middle read as a web,
  // not as tissue.
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < 0.085) edges.push({ a: i, b: j, d });
    }
  }
  return { nodes, edges };
}

export function NeuralBrain({
  state = "idle",
  className,
}: {
  state?: BrainState;
  className?: string;
}) {
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  const stateRef = React.useRef<BrainState>(state);
  stateRef.current = state;

  React.useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    /**
     * Two palettes. The mesh is pale blue so it glows against the dark app,
     * and pale blue on white is very nearly nothing — so light mode gets deep
     * saturated blues that read as ink instead.
     */
    const PALETTE = {
      dark: { edge: "96,165,250", node: "219,234,254", dust: "125,190,255", lift: 0.15 },
      light: { edge: "29,78,216", node: "30,58,138", dust: "37,99,235", lift: 0.3 },
    };
    let ink = PALETTE.dark;
    const readTheme = () => {
      const light = document.documentElement.classList.contains("light");
      ink = light ? PALETTE.light : PALETTE.dark;
    };
    readTheme();
    // The theme is a class on <html>, so watch it rather than sampling once.
    const themeWatch = new MutationObserver(readTheme);
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const { nodes, edges } = buildMesh(320);
    // Sparks travel an edge and respawn; more of them when it is talking.
    const sparks = Array.from({ length: 70 }, (_, i) => ({
      e: (i * 37) % Math.max(edges.length, 1),
      t: (i / 70) % 1,
      v: 0.004 + (i % 5) * 0.0015,
    }));

    // Loose motes drifting around the mesh, unattached to any edge. They give
    // the thing air — a mesh alone reads as a diagram, and these make it read
    // as something switched on.
    const dust = Array.from({ length: 60 }, (_, i) => {
      const r = seeded(9000 + i);
      return {
        x: r(),
        y: r(),
        vx: (r() - 0.5) * 0.0006,
        vy: (r() - 0.5) * 0.0006,
        r: 0.4 + r() * 1.3,
        ph: r() * Math.PI * 2,
      };
    });

    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = el.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      el.width = Math.max(1, Math.floor(w * dpr));
      el.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let t = 0;
    const draw = () => {
      const s = stateRef.current;
      const energy = s === "speaking" ? 1 : s === "thinking" ? 0.55 : 0.22;
      const drift = reduced ? 0 : s === "speaking" ? 0.9 : s === "thinking" ? 0.55 : 0.3;

      t += reduced ? 0 : 0.016;
      ctx.clearRect(0, 0, w, h);

      // Fit the unit-space silhouette to the canvas with a little padding.
      const pad = 0.06;
      const sx = w * (1 - pad * 2);
      const sy = h * (1 - pad * 2);
      const px = (n: { x: number }) => w * pad + n.x * sx;
      const py = (n: { y: number }) => h * pad + n.y * sy;

      // Breathe the nodes around where they were born.
      for (const n of nodes) {
        const a = t * 0.7 + n.ph;
        n.x = n.ox + Math.cos(a) * 0.004 * drift * 3;
        n.y = n.oy + Math.sin(a * 1.3) * 0.004 * drift * 3;
      }

      // Edges first, so nodes sit on top of them.
      ctx.lineWidth = 0.6;
      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        // Nearer pairs are brighter — gives the mesh depth without shading.
        const alpha = (1 - e.d / 0.085) * 0.32 * (0.6 + energy * 0.8) + ink.lift * 0.35;
        ctx.strokeStyle = `rgba(${ink.edge},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
        ctx.stroke();
      }

      // Energy running the edges. Idle keeps a couple alive so it never looks
      // frozen; speaking lights the lot.
      const live = Math.round(sparks.length * (s === "speaking" ? 1 : s === "thinking" ? 0.5 : 0.18));
      for (let i = 0; i < live; i++) {
        const sp = sparks[i];
        const e = edges[sp.e % edges.length];
        if (!e) continue;
        const a = nodes[e.a];
        const b = nodes[e.b];
        const x = px(a) + (px(b) - px(a)) * sp.t;
        const y = py(a) + (py(b) - py(a)) * sp.t;

        const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
        g.addColorStop(0, `rgba(${ink.node},${(0.85 * energy + ink.lift).toFixed(3)})`);
        g.addColorStop(1, `rgba(${ink.edge},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();

        if (!reduced) {
          sp.t += sp.v * (s === "speaking" ? 3.4 : s === "thinking" ? 2 : 1);
          if (sp.t > 1) {
            sp.t = 0;
            sp.e = (sp.e + 7 + i) % edges.length;
          }
        }
      }

      // Nodes, twinkling out of phase.
      for (const n of nodes) {
        const tw = 0.55 + 0.45 * Math.sin(t * 1.6 + n.ph);
        const r = n.r * (1 + energy * 0.5) * (0.7 + tw * 0.5);
        ctx.fillStyle = `rgba(${ink.node},${(0.35 + tw * 0.5 * energy + ink.lift).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px(n), py(n), r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Loose motes, drifting and wrapping at the edges.
      for (const d of dust) {
        if (!reduced) {
          d.x += d.vx * (1 + energy * 2.5);
          d.y += d.vy * (1 + energy * 2.5);
          if (d.x < 0) d.x = 1;
          if (d.x > 1) d.x = 0;
          if (d.y < 0) d.y = 1;
          if (d.y > 1) d.y = 0;
        }
        const tw = 0.4 + 0.6 * Math.sin(t * 1.1 + d.ph);
        ctx.fillStyle = `rgba(${ink.dust},${(0.12 + tw * 0.4 * energy + ink.lift * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px(d), py(d), d.r * (0.8 + energy * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeWatch.disconnect();
    };
  }, []);

  return <canvas ref={canvas} className={className} aria-hidden />;
}
