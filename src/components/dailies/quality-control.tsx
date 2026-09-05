"use client";

import * as React from "react";
import { AlertTriangle, BookOpen, Camera, CheckCircle2, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * What has to be photographed before a daily can be billed.
 *
 * This sits above the photo uploader rather than beside it because it is the
 * thing a crew needs to read before they leave the hole, not after. A daily
 * comes back weeks later for a missing lid-off shot, and by then the ground
 * has closed over it and somebody is driving back out.
 *
 * The two rules are separate and both bite:
 *
 *   Footage bills ped to ped. A span is billable when everything between two
 *   structures is finished, not when the plough has been through it.
 *
 *   Every structure needs two photographs — the outside with its stickers, and
 *   the inside with the lid off. One without the other is not evidence, and a
 *   grounded ped nobody photographed is indistinguishable from one that was
 *   never grounded.
 *
 * Printed, it goes away. This is guidance for the person filling the sheet in,
 * and Globe's form has no room for it.
 */

const OUTSIDE = [
  "The whole structure, in place, with the ground around it",
  "Every sticker on it, readable — the 811 sticker and the red buried-cable warning sticker",
  "The structure number and route markers — 138 @2, 7400 SWTRA — readable",
  "Base even with grade, lid secure and level",
];

/** What the redline has to carry before a span can be billed. */
const REDLINE = [
  "Footage between each ped and the next, and each handhole",
  "The work performed marked in red",
  "Peds coloured in",
  "Photos of the print, or the PDF as-built — either is accepted",
];

const LID_OFF = [
  "Ground rod, and the #6 ground wire from it",
  "Bug nuts on the ground connections",
  "2–4 inches of pea gravel",
  "Moisture barrier placed in the ped",
  "Fire ant killer",
  "Innerducts plugged or taped, trimmed 2–3 inches above the gravel",
  "Cable secured and labelled, framing neat",
];

/** Windstream's own standard, if it has been dropped into public/qc. */
const GUIDE = {
  href: "/qc/quality-assurance-guide.pdf",
  label: "Kinetic OSP Quality Assurance Guide",
  note: "Windstream's own standard — pedestals, flowerpots, FDHs, handholes, depths, restoration",
};

/** Reference sheets, if they have been dropped into public/qc. */
const SPECS = [
  { src: "/qc/fdh-pedestal.png", label: "FDH pedestal — what a finished one looks like" },
  { src: "/qc/flowerpot.png", label: "Flowerpot — grade, gravel, ducts, lid" },
];

export function QualityControl({ className }: { className?: string }) {
  // Open by default. A crew that has read it once can fold it away, and the
  // choice is theirs rather than ours.
  const [open, setOpen] = React.useState(true);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-warning/40 bg-warning/[0.04] print:hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold uppercase tracking-[0.06em] text-foreground">
            Quality control — what has to be photographed
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
            Miss any of this and the footage cannot be billed until somebody drives back out.
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-warning/25 px-3 py-3">
          {/* The billing rule comes first because it decides whether the day is
              billable at all, before any question of photographs. */}
          <p className="rounded-lg border border-warning/40 bg-warning/[0.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">
            <strong>Footage bills ped to ped.</strong> Every bit of work between one structure and
            the next has to be finished before that span can go on a sheet — plough, bore,
            restoration, the structures at both ends. A span that is half done is not billable
            footage, however many feet are in the ground.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Shot
              n={1}
              title="Outside, before the lid comes off"
              items={OUTSIDE}
            />
            <Shot
              n={2}
              title="Lid off, showing the inside"
              items={LID_OFF}
            />
          </div>

          {/* The redline is the other half of the evidence. A span with photos
              and no marked print proves the structures were built but not how
              far apart they are, which is the number being billed. */}
          <div className="mt-3">
            <Shot n={3} title="The redline print" items={REDLINE} />
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            Two photographs of every ped, handhole and FDH — one of each. A grounded ped that
            nobody photographed looks exactly like one that was never grounded, and the person
            approving your sheet was not standing there.
          </p>

          <GuideLink />
          <SpecSheets />
        </div>
      ) : null}
    </section>
  );
}

function Shot({ n, title, items }: { n: number; title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-warning/25 text-[11px] font-bold text-warning">
          {n}
        </span>
        <Camera className="size-3.5 text-muted-foreground" />
        {title}
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((i) => (
          <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
            <CheckCircle2 className="mt-[3px] size-3 shrink-0 text-success/70" />
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A link to the full standard, shown only once the file is actually there.
 *
 * A link cannot report a 404 the way an image can, so this asks for the
 * headers first. Sending a crew to a missing file is worse than not offering
 * it — they stop trusting the other links on the page.
 *
 * A 200 is not enough on its own. An unknown path in this app is caught by the
 * catch-all route and answered with a perfectly healthy placeholder page, and
 * unauthenticated it redirects to the login screen — both of which look like
 * success to fetch. So the content type has to say PDF as well.
 */
function GuideLink() {
  const [there, setThere] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetch(GUIDE.href, { method: "HEAD" })
      .then((r) => {
        const type = r.headers.get("content-type") ?? "";
        if (alive && r.ok && type.toLowerCase().includes("pdf")) setThere(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!there) return null;

  return (
    <a
      href={GUIDE.href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring mt-3 flex items-start gap-2.5 rounded-lg border border-border bg-background/40 p-3 transition-colors hover:border-brand/50"
    >
      <BookOpen className="mt-0.5 size-4 shrink-0 text-gold" />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-foreground">{GUIDE.label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
          {GUIDE.note}
        </span>
      </span>
    </a>
  );
}

/**
 * The reference sheets.
 *
 * Each hides itself if the file is not there, so the guidance above still
 * stands on a deploy where the images have not been dropped in yet — a broken
 * image icon on a compliance panel reads as a broken app.
 */
function SpecSheets() {
  const [gone, setGone] = React.useState<string[]>([]);
  const shown = SPECS.filter((s) => !gone.includes(s.src));
  if (shown.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        What a finished one looks like
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((s) => (
          <figure key={s.src} className="overflow-hidden rounded-lg border border-border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.src}
              alt={s.label}
              loading="lazy"
              onError={() => setGone((g) => [...g, s.src])}
              className="block w-full object-contain"
            />
            <figcaption className="border-t border-border bg-background px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
              {s.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
