import Image from "next/image";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { SMS_CONSENT_TEXT, SAMPLE_MESSAGES, HELP_REPLY } from "@/lib/sms-consent";
import { OptInForm } from "./opt-in-form";

export const metadata = {
  title: "Text message alerts",
  description:
    "How crews working with Fortitude Infrastructure LLC sign up for Vantara IQ job alert text messages, what those messages contain, and how to stop them.",
};

const GOLD = "#8a5d0a";
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#475569";

/**
 * The page a carrier opens when verifying the A2P campaign.
 *
 * The campaign was rejected for a Call to Action that could not be verified,
 * because the only consent box in the product sits inside the crew portal
 * behind a login — a reviewer with no account saw a sign-in screen.
 *
 * So this is public, and it is not a description of the opt-in. It is the
 * opt-in, working, with the box unticked. Everything a vetter is told to look
 * for is on it in plain sight: who is sending, what the messages are, real
 * examples, that frequency varies, that rates may apply, STOP, HELP, no
 * marketing, that consent is not a condition of work, and both policy links.
 *
 * Every colour is literal. This page has to read identically on a reviewer's
 * machine whatever their theme, and the version that inherited the app's
 * tokens put its body text at 5.45:1 — inside the standard by the letter and
 * faint to anybody actually reading it.
 */
export default async function SmsPage() {
  // The company mark, from the same place the rate sheets take it, so the two
  // cannot drift. Public branding, so no session is needed to read it — which
  // matters, because the reviewer looking at this page has no account.
  const org = await prisma.organization
    .findFirst({ select: { logoUrl: true } })
    .catch(() => null);

  return (
    <main className="mx-auto w-full max-w-[52rem] px-5 py-10 sm:py-14">
      {/* Both marks, together.
          The product is Vantara IQ and the company on the paperwork is
          Fortitude Infrastructure LLC. A carrier is checking that those are one
          business, so showing the two lockups side by side answers the question
          before it is asked.

          The light artwork is referenced directly rather than through
          BrandLogo, which picks its file with a dark: variant — this page is
          always light but <html> can still be carrying .dark, and the component
          would hide the very logo that belongs here. */}
      <header className="border-b-2 pb-5" style={{ borderColor: GOLD }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Image
            src="/vantara-logo-on-light.png"
            alt="Vantara IQ"
            width={2002}
            height={381}
            priority
            className="block h-9 w-auto object-contain sm:h-10"
          />
          {org?.logoUrl ? (
            <>
              <span aria-hidden className="h-8 w-px bg-slate-300" />
              {/* Resized on the way out. The original is a 2.5 MB PNG and
                  this draws it at 48 pixels tall. */}
              <Image
                src={org.logoUrl}
                alt="Fortitude Infrastructure LLC"
                width={480}
                height={480}
                priority
                className="block h-11 w-auto object-contain sm:h-12"
              />
            </>
          ) : null}
        </div>

        <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
          Fortitude Infrastructure LLC
        </p>
        <p className="mt-1 text-[13.5px]" style={{ color: MUTED }}>
          Underground utility and fiber construction · Anderson, South Carolina
        </p>
      </header>

      <h1
        className="mt-9 text-[34px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[40px]"
        style={{ color: INK }}
      >
        Text message alerts
      </h1>
      <p className="mt-3 text-[16.5px] leading-relaxed" style={{ color: BODY }}>
        <strong style={{ color: INK }}>
          Vantara IQ is operated by Fortitude Infrastructure LLC
        </strong>
        , a veteran-owned underground utility and fiber construction contractor in Anderson,
        South Carolina. We send operational text messages to the crews and staff who work on our
        jobs. This page is how somebody agrees to receive them — and how they stop.
      </p>
      <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
        Last updated 3 September 2026
      </p>

      {/* The opt-in leads the page. It is what a reviewer came to find and what
          a crew member came to do. */}
      <section className="mt-9 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/10 sm:p-7">
        <h2 className="text-[21px] font-bold tracking-[-0.01em]" style={{ color: INK }}>
          Sign up for job alerts
        </h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: BODY }}>
          This form is how a crew member agrees to receive our texts. The consent box is not
          ticked for you, and nothing is ever sent to a number that has not been through it.
        </p>
        <div className="mt-5">
          <OptInForm consentText={SMS_CONSENT_TEXT} />
        </div>
      </section>

      <Section title="How people opt in">
        <p className="text-[14.5px] leading-relaxed" style={{ color: BODY }}>
          There are three ways and no others. We never buy, rent, or import phone numbers.
        </p>
        <ol className="mt-4 space-y-3">
          <Step n={1} title="This page">
            A crew member enters their own mobile number and ticks the consent box above. The box
            is unticked by default and the button will not submit without it.
          </Step>
          <Step n={2} title="The crew onboarding packet">
            When a subcontractor is engaged, their authorized contact completes a vendor packet
            inside Vantara IQ. It carries the same unticked consent box, with the same wording,
            directly beneath the mobile number field. They may leave it unticked, finish
            onboarding, and still receive work — that is a normal outcome.
          </Step>
          <Step n={3} title="Written or verbal authorization on file">
            A crew owner may authorize alerts for a number in writing or in person, in which case
            a member of our staff records the number and the date. Staff must confirm they hold
            that authorization before any number is added.
          </Step>
        </ol>
        <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: BODY }}>
          Consent is recorded with the date, the wording agreed to as it read on that day, and
          where the agreement was made.{" "}
          <strong style={{ color: INK }}>
            Agreeing to texts is never a condition of registering, of using Vantara IQ, or of
            being awarded work.
          </strong>
        </p>
      </Section>

      <Section title="What we send">
        <p className="text-[14.5px] leading-relaxed" style={{ color: BODY }}>
          Operational messages about work only: work assignments, priorities and due dates,
          schedule changes, project updates, daily production sheet status, and invoice and
          payment updates.{" "}
          <strong style={{ color: INK }}>We never send marketing or promotional messages.</strong>{" "}
          Message frequency varies with the work — a crew on an active job might get a few
          messages a week; a crew between jobs might get none.
        </p>

        <p
          className="mt-5 text-[12px] font-bold uppercase tracking-[0.12em]"
          style={{ color: GOLD }}
        >
          Examples of what we send
        </p>
        <div className="mt-3 space-y-2.5">
          {SAMPLE_MESSAGES.map((m) => (
            <p
              key={m}
              className="rounded-xl rounded-bl-sm bg-slate-100 px-4 py-3 font-mono text-[13px] leading-relaxed ring-1 ring-slate-900/[0.06]"
              style={{ color: INK }}
            >
              {m}
            </p>
          ))}
        </div>
      </Section>

      <Section title="How to stop">
        <div className="grid gap-3 sm:grid-cols-2">
          <Callout word="STOP">
            Reply <strong>STOP</strong> to any message and we stop immediately and permanently.
            You do not need to explain, and it does not affect your contract, your work, or your
            pay. Reply <strong>START</strong> to begin again.
          </Callout>
          <Callout word="HELP">
            Reply <strong>HELP</strong> at any time and you will get:
            <span
              className="mt-2 block font-mono text-[12.5px] leading-relaxed"
              style={{ color: INK }}
            >
              {HELP_REPLY}
            </span>
          </Callout>
        </div>
        <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: BODY }}>
          <strong style={{ color: INK }}>Message and data rates may apply.</strong> Carriers are
          not liable for delayed or undelivered messages.
        </p>
      </Section>

      <Section title="Your information">
        <p className="text-[14.5px] leading-relaxed" style={{ color: BODY }}>
          Mobile information, including phone numbers and SMS opt-in consent data,{" "}
          <strong style={{ color: INK }}>
            will not be shared, sold, rented, or provided to third parties or affiliates for
            marketing or promotional purposes.
          </strong>
        </p>
        <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: BODY }}>
          Questions about these messages:{" "}
          <a
            href="mailto:support@vantaraiq.com"
            className="font-semibold underline"
            style={{ color: GOLD }}
          >
            support@vantaraiq.com
          </a>
        </p>
      </Section>

      <footer
        className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-5 text-[13.5px]"
        style={{ borderColor: "#cbd5e1", color: MUTED }}
      >
        <Link href="/privacy" className="font-semibold underline" style={{ color: GOLD }}>
          Privacy Policy
        </Link>
        <Link href="/terms" className="font-semibold underline" style={{ color: GOLD }}>
          Terms &amp; SMS Program Conditions
        </Link>
        <span>© {new Date().getFullYear()} Fortitude Infrastructure LLC</span>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[21px] font-bold tracking-[-0.01em]" style={{ color: INK }}>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5 rounded-xl bg-white p-4 ring-1 ring-slate-900/[0.08]">
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
        style={{ background: GOLD }}
      >
        {n}
      </span>
      <span className="text-[14.5px] leading-relaxed" style={{ color: BODY }}>
        <strong className="block" style={{ color: INK }}>
          {title}
        </strong>
        {children}
      </span>
    </li>
  );
}

function Callout({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-900/[0.08]">
      <p className="font-mono text-[15px] font-bold" style={{ color: GOLD }}>
        {word}
      </p>
      <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: BODY }}>
        {children}
      </p>
    </div>
  );
}
