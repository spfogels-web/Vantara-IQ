"use client";

import * as React from "react";
import { AlertTriangle, BookOpen, Camera, CheckCircle2, ChevronDown, Images } from "lucide-react";

import { cn } from "@/lib/utils";
import { QC_EXAMPLES, sourceLabel, type QcProfile } from "@/lib/qc-standards";

/**
 * The build standard, wherever somebody needs to read it.
 *
 * One component, two presentations. The project shows the whole thing before
 * anybody mobilises; the daily shows a reminder at the top and the examples
 * further down. Both take the same profile object, so the requirement a crew
 * reads on the job is the requirement they are held to on the sheet — which
 * is the entire reason this is not two pieces of markup.
 *
 * ## The profile decides what is shown, including whose name is on it
 *
 * A profile with no manual gets no manual button, no page references and no
 * carrier branding. That is not a display detail: showing a Kinetic document
 * on a job built to somebody else's specification would be actively
 * misleading, and the resolver deliberately never falls back to it.
 */

export const QC_EXAMPLES_ANCHOR = "qc-photo-examples";

/** Where the deep link lands, used by both surfaces. */
export function scrollToExamples() {
  const el = document.getElementById(QC_EXAMPLES_ANCHOR);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ManualButton({ profile }: { profile: QcProfile }) {
  if (!profile.manual) return null;
  return (
    <a
      href={profile.manual.href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-gold/50 bg-gold/[0.08] px-3 text-[12.5px] font-semibold text-foreground hover:bg-gold/[0.14]"
    >
      <BookOpen className="size-3.5 text-gold" />
      Open QCC Manual
    </a>
  );
}

function ExamplesButton({ onView }: { onView?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => (onView ? onView() : scrollToExamples())}
      className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 text-[12.5px] font-medium text-foreground hover:bg-foreground/[0.05]"
    >
      <Images className="size-3.5 text-muted-foreground" />
      View Photo Examples
    </button>
  );
}

/**
 * The approved photographs, and what the stamp on them has to carry.
 *
 * Ours, from Rock Creek Rd. They carry an id so both surfaces can link
 * straight here rather than leaving somebody to hunt the page.
 */
export function QcPhotoExamples({ className }: { className?: string }) {
  const [gone, setGone] = React.useState<string[]>([]);
  const shown = QC_EXAMPLES.filter((e) => !gone.includes(e.src));

  return (
    <section id={QC_EXAMPLES_ANCHOR} className={cn("scroll-mt-20", className)}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
        What acceptable work &amp; photos look like
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Use these before completing your work and taking your daily photos. A
        photograph should show enough detail for the work to be verified by
        somebody who was not standing there.
      </p>

      {shown.length === 0 ? null : (
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(2,minmax(0,190px))_1fr]">
          {shown.map((e) => (
            <figure
              key={e.src}
              className="self-start overflow-hidden rounded-lg border border-border bg-black"
            >
              <a href={e.src} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={e.src}
                  alt={`${e.label} — ${e.note}`}
                  loading="lazy"
                  onError={() => setGone((g) => [...g, e.src])}
                  className="block w-full object-contain"
                />
              </a>
              <figcaption className="border-t border-border bg-background px-2.5 py-1.5">
                <span className="block text-[12px] font-medium text-foreground">{e.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {e.note}
                </span>
              </figcaption>
            </figure>
          ))}

          <ul className="min-w-0 space-y-1 sm:pt-0.5">
            {[
              "Latitude and longitude, and the street address",
              "The heading, so the direction the shot was taken from is on the picture",
              "Ped or structure identification stickers — 811 and the route marker, readable",
              "Ground rod, copper ground wire and the acorn where they apply",
              "Pea gravel visible inside the ped",
              "A clean, completed installation — not a part-built one",
              "Tick marks and counts on any main line fibre or microfibre pull",
            ].map((i) => (
              <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
                <CheckCircle2 className="mt-[3px] size-3 shrink-0 text-success/70" />
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The whole standard, for the foot of a daily.
 *
 * The banner at the top is a reminder and deliberately short; this is what it
 * points at. A crew filling in a sheet should not have to open the project in
 * another tab to check what the gravel depth was supposed to be.
 */
export function QcFullStandard({
  profile,
  className,
}: {
  profile: QcProfile;
  className?: string;
}) {
  return (
    <section className={cn("print:hidden", className)}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
        What acceptable work &amp; photos look like
      </p>
      <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
        Applies to this job: <span className="text-foreground">{profile.label}</span>. Use
        these before completing your work and taking your daily photos.
      </p>
      <div className="mt-2.5">
        <Requirements profile={profile} />
      </div>
      <QcPhotoExamples className="mt-4" />
    </section>
  );
}

/** Every requirement, grouped, each carrying where it came from. */
function Requirements({ profile }: { profile: QcProfile }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {profile.groups.map((g) => (
        <div key={g.id} className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-[12.5px] font-semibold text-foreground">{g.title}</p>
          {g.note ? (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{g.note}</p>
          ) : null}
          <ul className="mt-2 space-y-1.5">
            {g.items.map((i) => (
              <li key={i.text} className="flex gap-1.5">
                <CheckCircle2 className="mt-[3px] size-3 shrink-0 text-success/70" />
                <span className="min-w-0 text-[12px] leading-relaxed text-muted-foreground">
                  {i.text}
                  {/* Whose rule this is. A crew arguing a callback needs to
                      know whether the line they missed is the carrier's
                      specification or our paperwork, because those have
                      different consequences and different people to appeal
                      to. */}
                  <span
                    className={cn(
                      "ml-1.5 whitespace-nowrap rounded px-1 py-px text-[9.5px] font-bold uppercase tracking-[0.06em]",
                      i.source.kind === "QCC"
                        ? "bg-gold/15 text-gold"
                        : "bg-foreground/[0.07] text-muted-foreground",
                    )}
                  >
                    {sourceLabel(i.source)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The full standard, for a project page.
 *
 * Collapsed requirements by default: a crew opening a job wants the actions
 * and the examples, and the full list is long enough to bury them.
 */
export function BuildStandards({
  profile,
  className,
}: {
  profile: QcProfile;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <section className={cn("rounded-xl border border-gold/35 bg-gold/[0.04] p-3.5", className)}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-gold">
        Project QC &amp; build standards
      </p>
      <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-foreground">
        Review these requirements before starting work. Your installation and field
        documentation must meet the project QC standards shown below.
      </p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        Applies to this job: <span className="text-foreground">{profile.label}</span>
        {profile.manual ? null : " — no customer manual applies to this project."}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 text-[12.5px] font-medium text-foreground hover:bg-foreground/[0.05]"
        >
          <CheckCircle2 className="size-3.5 text-muted-foreground" />
          View Build Standards
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
        <ExamplesButton />
        <ManualButton profile={profile} />
      </div>

      {open ? <div className="mt-3">{<Requirements profile={profile} />}</div> : null}

      <QcPhotoExamples className="mt-4" />
    </section>
  );
}

/**
 * The reminder version, for the top of a daily.
 *
 * Deliberately not the whole list. A crew filling in a sheet at the end of
 * the day has already built the job; what they need here is the two ways back
 * into the standard and a sentence saying why it matters before they file.
 */
export function QcReminder({
  profile,
  className,
  onViewExamples,
}: {
  profile: QcProfile;
  className?: string;
  onViewExamples?: () => void;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-gold/40 bg-gold/[0.05] p-3.5 print:hidden",
        className,
      )}
    >
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" />
        <span className="min-w-0">
          <span className="block text-[12px] font-bold uppercase tracking-[0.07em] text-foreground">
            Quality control requirements — review before starting work
          </span>
          <span className="mt-1 block max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground">
            Your work and photos must meet this project&rsquo;s QC requirements. Scroll
            below for examples of how completed ped work and the required photos have
            to look
            {profile.manual ? ", and review the QCC manual before beginning work" : ""}.
          </span>
        </span>
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
        <ExamplesButton onView={onViewExamples} />
        <ManualButton profile={profile} />
      </div>

      <p className="mt-2 pl-6 text-[11.5px] leading-relaxed text-muted-foreground">
        Work that does not meet QC requirements, or is missing required documentation,
        may be returned for correction or review.
      </p>
    </section>
  );
}

/**
 * The order a crew works in, before anything goes in the ground.
 *
 * Pre-construction documentation is the first field activity: once production
 * starts there is no way back to what the ground looked like, and a
 * homeowner's claim three weeks later is answered by those photographs or it
 * is not answered at all.
 */
export function BeforeWorkBegins({
  preConStatus,
  className,
}: {
  preConStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  className?: string;
}) {
  const steps = [
    "Review map & plans",
    "Review QC & build standards",
    "Review photo examples",
    "Capture pre-construction photos & video",
    "Document existing damage",
    "Mark pre-construction documented",
    "Begin construction",
  ];
  // Which of them are behind us. Only what the record actually says — the
  // first three are preparation nobody records, so they are never ticked.
  const doneUpTo = preConStatus === "COMPLETE" ? 6 : preConStatus === "IN_PROGRESS" ? 4 : 0;

  return (
    <section className={cn("rounded-xl border border-border/70 p-3.5", className)}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
        Before work begins
      </p>
      {preConStatus !== "COMPLETE" ? (
        <p className="mt-1.5 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>Pre-construction required.</strong> Complete field documentation
            before beginning work. Production cannot be filed on a daily until this
            project&rsquo;s pre-construction photos and video are documented.
          </span>
        </p>
      ) : null}

      <ol className="mt-2.5 flex flex-col gap-1">
        {steps.map((s, i) => {
          const done = i < doneUpTo;
          return (
            <li key={s} className="flex items-center gap-2 text-[12px]">
              <span
                className={cn(
                  "num grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                  done ? "bg-success/20 text-success" : "bg-foreground/[0.07] text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>
                {s}
              </span>
              {i === 3 ? <Camera className="size-3 text-muted-foreground" /> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
