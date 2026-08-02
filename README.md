# Vantara IQ — Operations Center

Operations intelligence for infrastructure contractors. Next.js 15 · React 19 ·
TypeScript · Tailwind CSS v4 · shadcn/ui.

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint
```

## What's here

The Operations Center dashboard, built end to end against mock data. No database
is wired up yet — every fixture goes through one query seam, so swapping in real
data is a per-function change rather than a refactor.

| Section | Component |
| --- | --- |
| KPI row (6 metrics, sparklines, trend deltas) | `dashboard/kpi-row.tsx` |
| Projects requiring attention | `dashboard/projects-table.tsx` |
| AI operations brief | `dashboard/ai-brief.tsx` |
| Daily production (chart + per-crew) | `dashboard/production-chart.tsx` |
| Project health | `dashboard/project-health.tsx` |
| Revenue ready to bill | `dashboard/revenue-cards.tsx` |
| Crew availability | `dashboard/crew-availability.tsx` |
| Upcoming deadlines | `dashboard/upcoming-deadlines.tsx` |
| Missing documents | `dashboard/missing-documents.tsx` |
| Activity / notifications | `dashboard/notifications-panel.tsx` |

Shell: collapsible sidebar (⌘/Ctrl+B, persisted), sticky glass topbar, ⌘/Ctrl+K
command palette, notifications popover, quick-actions and profile menus, and a
mobile drawer.

## Architecture

```
src/
  app/
    layout.tsx          root shell + Geist fonts
    page.tsx            Operations Center — one Suspense boundary per section
    loading.tsx         route-level skeleton mirroring the dashboard grid
    [...slug]/          placeholder for modules not yet built
  components/
    layout/             sidebar, topbar, command palette, logo, app shell
    dashboard/          the ten sections above
    common/             Panel, HealthRing, Sparkline, Meter, StatusPill, skeletons
    ui/                 shadcn primitives
  data/
    mock.ts             fixtures — plain serializable data, no React
    queries.ts          THE SEAM: async accessors the UI calls
  lib/
    types.ts            domain types
    tone.ts             semantic colour system
    format.ts           currency / feet / percent formatters
    icons.ts            icon registry (keys, not components, cross the RSC boundary)
    nav.ts              navigation config
```

**The query seam.** Components never import `mock.ts`. They receive data from
`data/queries.ts`, whose functions are already `async` and return plain objects.
Connecting the database means changing the body of `getKpis()` and friends —
nothing above them moves.

**Streaming.** The page is `force-dynamic` and each section sits behind its own
`<Suspense>`, so a slow panel never blocks the rest. `queries.ts` carries
staggered artificial latency so the skeletons are actually visible; delete the
`LATENCY` map when real queries replace it.

**Icons across the boundary.** Server components can't pass component references
to client components, so the data layer stores icon *keys* (`"projects"`,
`"alert"`) that `lib/icons.ts` resolves. Payloads stay serializable and the data
layer stays free of presentation.

**Tone system.** Nothing hardcodes a hex. Components pick a `Tone`
(`success | warning | critical | info | neutral`) and read classes from
`lib/tone.ts`, which resolves against CSS variables in `globals.css`.

## Design system

Dark-only. Tokens live in `src/app/globals.css`.

| Token | Value |
| --- | --- |
| Background | `#0B0F14` |
| Electric blue (primary) | `#2F80FF` |
| Success | `#2FD07A` |
| Warning | `#FFA23A` |
| Critical | `#FF5A52` |
| Type | Geist Sans / Geist Mono (tabular numerals) |

Surfaces are white washes over the base rather than separate fill colours, so
cards stack without muddying. `.surface`, `.glass`, `.eyebrow`, `.num` and
`.skeleton` are the shared component classes.

## Branding

The sidebar renders a built-in vector mark plus a type-set "VANTARA IQ" wordmark.
To use the real asset, drop a **transparent-background** export of the cube at:

```
public/vantara-mark.png
```

It is picked up automatically — `components/layout/logo.tsx` probes for the file
and swaps the vector out on a successful load.

The full lockup PNG is deliberately not used in the rail: its wordmark is dark
navy and would disappear against the near-black background. The wordmark is set
in type instead so it stays legible on dark.

## Notes

- `_legacy/` holds the original single-file JSX prototype, kept for reference.
  It is excluded from lint and the build.
- Nav links other than the Operations Center resolve to a styled placeholder
  rather than a 404.
