import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,

  MapPin,
  MessageSquare,
  Receipt,
  ShieldCheck,
  Users,
} from "lucide-react";

import { BrandLogo } from "@/components/common/brand-logo";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";

/**
 * The front door.
 *
 * Until now vantaraiq.com was a sign-in form, which tells somebody evaluating
 * the product nothing at all. This is what a prime contractor sees before they
 * have an account.
 *
 * It lives inside the application rather than as a separate site on purpose.
 * The A2P campaign is registered against /sms on this domain and Twilio posts
 * opt-outs to /api/sms/inbound on it; moving the domain to a marketing site
 * elsewhere would take both down, and a campaign whose opt-in URL has gone dead
 * is a campaign that gets suspended. Splitting them is a deliberate job for the
 * day a second customer needs their own address, not a side effect of wanting a
 * homepage.
 *
 * Palette is literal rather than tokenised, for the same reason the SMS page's
 * is: this renders for strangers on unknown machines, and it should look the
 * same to all of them.
 */

const INK = "#f1f5f9";
const BODY = "#c7d2e1";
const MUTED = "#93a3b8";
const GOLD = "#e0a82e";

export function MarketingHome() {
  return (
    <div style={{ background: "#070d18", color: INK }} className="min-h-svh">
      {/* Top bar. Sign in stays reachable from every scroll position on a
          phone, because the people who already have an account are the ones
          who visit most often. */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070d18]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <BrandLogo height={30} />
          <nav className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <a
              href="#what"
              className="hidden rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-white/70 transition-colors hover:text-white sm:inline-flex"
            >
              What it does
            </a>
            <a
              href="#pricing"
              className="hidden rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-white/70 transition-colors hover:text-white sm:inline-flex"
            >
              Pricing
            </a>
            {/* The door for everybody who already has an account, and there are
                more of those every week than there are new prospects. It reads
                as a button rather than a faint link for that reason: a
                customer arriving at the brand should not have to hunt for the
                way into their own system. */}
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-lg border border-white/25 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              Sign in
            </Link>
            <a
              href="#demo"
              className="inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-semibold text-[#0b1220]"
              style={{ background: GOLD }}
            >
              Book a demo
            </a>
          </nav>
        </div>
      </header>

      {/* The claim. Written for one buyer — the prime running subcontractors —
          rather than for everybody, because a page that speaks to everybody
          persuades nobody. */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(900px 480px at 15% -10%, rgba(59,130,246,0.22), transparent 60%)," +
              "radial-gradient(760px 420px at 88% 0%, rgba(224,168,46,0.14), transparent 58%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
          <p
            className="text-[12px] font-bold uppercase tracking-[0.16em]"
            style={{ color: GOLD }}
          >
            For prime contractors running subcontractor crews
          </p>
          <h1 className="mt-3 max-w-3xl text-[34px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[52px]">
            Every crew, every daily, every dollar — in one place.
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed sm:text-[18px]" style={{ color: BODY }}>
            Vantara IQ runs the work between a prime and its subcontractors. A crew files a daily
            from the truck; it comes back approved, billed to your customer, and on that crew&rsquo;s
            pay statement — without anyone re-keying a line.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <a
              href="#demo"
              className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14.5px] font-semibold text-[#0b1220]"
              style={{ background: GOLD }}
            >
              Book a demo <ArrowRight className="size-4" />
            </a>
            <a
              href="#pricing"
              className="inline-flex h-11 items-center rounded-xl border border-white/20 px-5 text-[14.5px] font-semibold text-white transition-colors hover:bg-white/5"
            >
              See pricing
            </a>
          </div>

          {/* Said plainly and early, because it is the objection. */}
          <p className="mt-6 flex items-center gap-2 text-[13px]" style={{ color: MUTED }}>
            <ShieldCheck className="size-4 shrink-0" style={{ color: GOLD }} />
            Built and run on live underground fibre jobs — not demo data.
          </p>
        </div>
      </section>

      {/* What it actually is. Concrete over adjectives: a contractor knows
          whether they have this problem, and naming the problem is what tells
          them the software was written by somebody who has had it. */}
      <section id="what" className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-[26px] font-bold tracking-[-0.01em] sm:text-[32px]">
            The work between the office and the ditch
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: BODY }}>
            Most of what goes wrong on a job is not the digging. It is a daily that never arrived, a
            locate nobody checked, a reel nobody can account for, and an invoice that does not match
            what the crew says they built.
          </p>

          <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={<ClipboardList className="size-4" />}
              title="Dailies that bill themselves"
              body="Crews file production on your customer's own form, with the redlined map and the photos attached. Approve it and the line items price against that job's rate card."
            />
            <Feature
              icon={<Receipt className="size-4" />}
              title="Invoices and crew pay from one set of numbers"
              body="What you bill and what you pay a crew come from the same filed daily, so they cannot drift. Statements, retainage and fast-pay terms are worked out, not typed."
            />
            <Feature
              icon={<MapPin className="size-4" />}
              title="Locates that say who is blocking"
              body="811 tickets with their clocks, whose response is outstanding, and which locates you perform yourself. A crew's sheet says 'do not dig' before they open it."
            />
            <Feature
              icon={<Users className="size-4" />}
              title="Subcontractor onboarding that ends"
              body="W-9, insurance, signed agreements, ACH and yard badges, chased by the system. A crew cannot be assigned work until the file is complete."
            />
            <Feature
              icon={<Boxes className="size-4" />}
              title="Material you can account for"
              body="Every reel, vault and pedestal from receiving through installation, with custody by crew and yard, and a variance nobody can quietly write off."
            />
            <Feature
              icon={<MessageSquare className="size-4" />}
              title="Messages that reach the truck"
              body="Assignments, approvals and pay notices reach a foreman by text, with consent and opt-outs handled to carrier rules — not a group chat nobody can audit."
            />
          </div>
        </div>
      </section>

      {/* Pricing, in the open. A buyer who cannot afford it finds out here
          rather than after two calls, and a buyer who can reads it as
          confidence. */}
      <section id="pricing" className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-[26px] font-bold tracking-[-0.01em] sm:text-[32px]">
            One package. No tiers to work out.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: BODY }}>
            Your company runs on its own dedicated system — your database, your jobs, your rates.
            Nothing you put in is visible to any other contractor using Vantara IQ.
          </p>

          <div className="mt-9 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Price
              amount="$1,000"
              unit="once"
              label="Implementation"
              body="Your own system, stood up and configured — rate cards loaded, crews and projects brought across, your people trained on it."
            />
            <Price
              amount="$250"
              unit="per month"
              label="Enterprise package"
              body="The whole platform. Every module, unlimited projects, unlimited subcontractor crews, and their logins are free."
              feature
            />
            <Price
              amount="$35"
              unit="per user, per month"
              label="Your staff"
              body="Each of your own people with a login — owners, project managers, supervisors, foremen. Your subcontractors' logins are not charged."
            />
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: GOLD }}>
              What that includes
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                "Your own isolated database and deployment",
                "Unlimited subcontractor crews and their logins",
                "Unlimited projects, dailies and invoices",
                "Text alerts to crews, carrier-registered",
                "Customer rate cards and per-crew pay rates",
                "Locates, materials, documents and onboarding",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2 text-[14px]" style={{ color: BODY }}>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: GOLD }} />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* The form. Below the pricing, because somebody who has read the number
          and kept scrolling is the enquiry worth having. */}
      <section id="demo" className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-[26px] font-bold tracking-[-0.01em] sm:text-[32px]">
              See it on your own jobs
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: BODY }}>
              Half an hour, walked through with one of your live jobs in front of us — your customer,
              your crews, your rates. You will know inside ten minutes whether it fits how you work.
            </p>
            <ul className="mt-6 flex flex-col gap-2.5">
              {[
                "No obligation and no card",
                "We use your real job numbers, not a sample",
                "Your data stays yours, on your own system",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2 text-[14px]" style={{ color: BODY }}>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: GOLD }} />
                  {x}
                </li>
              ))}
            </ul>
          </div>

          <DemoRequestForm />
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[12.5px] sm:flex-row sm:items-center sm:px-6" style={{ color: MUTED }}>
          <BrandLogo height={22} />
          <span className="sm:ml-2">© {new Date().getFullYear()} Vantara IQ</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
            <Link href="/sms" className="transition-colors hover:text-white">
              Text message alerts
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
            <Link href="/login" className="transition-colors hover:text-white">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <span
        className="grid size-9 place-items-center rounded-xl"
        style={{ background: "rgba(224,168,46,0.14)", color: GOLD }}
      >
        {icon}
      </span>
      <h3 className="mt-3 text-[15.5px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
        {body}
      </p>
    </div>
  );
}

function Price({
  amount,
  unit,
  label,
  body,
  feature,
}: {
  amount: string;
  unit: string;
  label: string;
  body: string;
  feature?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{
        borderColor: feature ? "rgba(224,168,46,0.45)" : "rgba(255,255,255,0.10)",
        background: feature ? "rgba(224,168,46,0.07)" : "rgba(255,255,255,0.03)",
      }}
    >
      <p className="text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="num text-[34px] font-bold tracking-[-0.02em]" style={{ color: INK }}>
          {amount}
        </span>
        <span className="text-[13px]" style={{ color: MUTED }}>
          {unit}
        </span>
      </p>
      <p className="mt-2.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
        {body}
      </p>
    </div>
  );
}

