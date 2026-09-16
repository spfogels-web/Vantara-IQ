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
import { FlowShot, LocateShot, ProductShot } from "@/components/marketing/product-shot";

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
 * Two rules it is built under:
 *
 *   No real data. The page makes no database call at all, and the product
 *   imagery is drawn rather than screenshotted, so there is no path by which a
 *   customer's rate card or a crew's name reaches a stranger. A screenshot
 *   would have been quicker and would have put a real customer's pricing on the
 *   internet.
 *
 *   No invented proof. No customer logos, no counts, no testimonials — the
 *   buyer is a contractor who will ask, and being caught inventing one costs
 *   more than every claim on this page is worth. What is here is true: it was
 *   built running underground fibre jobs.
 *
 * Palette is literal rather than tokenised, for the same reason the SMS page's
 * is: this renders for strangers on unknown machines and should look the same
 * to all of them.
 */

const INK = "#f4f7fb";
const BODY = "#c7d2e1";
const MUTED = "#93a3b8";
const GOLD = "#e0a82e";
const HAIR = "rgba(255,255,255,0.09)";

export function MarketingHome() {
  return (
    <div style={{ background: "#060b14", color: INK }} className="min-h-svh">
      <Header />
      <Hero />
      <Flow />
      <Features />
      <Pricing />
      <Demo />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{ borderColor: HAIR, background: "rgba(6,11,20,0.82)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <BrandLogo height={30} />
        <nav className="ml-auto flex items-center gap-1 sm:gap-2.5">
          <a
            href="#what"
            className="hidden rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:text-white sm:inline-flex"
            style={{ color: BODY }}
          >
            What it does
          </a>
          <a
            href="#pricing"
            className="hidden rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:text-white sm:inline-flex"
            style={{ color: BODY }}
          >
            Pricing
          </a>
          {/* The door for everybody who already has an account, and there are
              more of those every week than there are new prospects. It reads as
              a button rather than a faint link for that reason: a customer
              arriving at the brand should not hunt for the way into their own
              system. */}
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-lg border px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
            style={{ borderColor: "rgba(255,255,255,0.22)" }}
          >
            Sign in
          </Link>
          <a
            href="#demo"
            className="inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-semibold text-[#0a1220] transition-transform hover:-translate-y-px"
            style={{ background: GOLD, boxShadow: "0 8px 24px -10px rgba(224,168,46,0.7)" }}
          >
            Book a demo
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Depth in three layers: a cool wash behind the words, a warm one behind
          the product, and a hairline grid that stops the whole thing reading as
          a flat gradient. The grid is masked so it fades out rather than
          stopping at an edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(1000px 520px at 8% -12%, rgba(79,140,255,0.26), transparent 62%)," +
            "radial-gradient(820px 460px at 96% 4%, rgba(224,168,46,0.16), transparent 58%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(72% 58% at 50% 0%, black, transparent 78%)",
          WebkitMaskImage: "radial-gradient(72% 58% at 50% 0%, black, transparent 78%)",
        }}
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div>
          <p
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.13em]"
            style={{
              borderColor: "rgba(224,168,46,0.35)",
              background: "rgba(224,168,46,0.08)",
              color: GOLD,
            }}
          >
            For prime contractors running crews
          </p>

          <h1
            className="mt-5 max-w-[15ch] text-[36px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[50px]"
            style={{
              backgroundImage: "linear-gradient(180deg, #ffffff 32%, #a9bdd8 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Every crew, every daily, every dollar — in one place.
          </h1>

          <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed sm:text-[18.5px]" style={{ color: BODY }}>
            Vantara IQ runs the work between a prime and its subcontractors. A crew files a daily
            from the truck; it comes back approved, billed to your customer, and on that crew&rsquo;s pay
            statement — without anyone re-keying a line.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <a
              href="#demo"
              className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-[#0a1220] transition-transform hover:-translate-y-px"
              style={{ background: GOLD, boxShadow: "0 14px 34px -12px rgba(224,168,46,0.75)" }}
            >
              Book a demo <ArrowRight className="size-4" />
            </a>
            <a
              href="#pricing"
              className="inline-flex h-12 items-center rounded-xl border px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.07]"
              style={{ borderColor: "rgba(255,255,255,0.2)" }}
            >
              See pricing
            </a>
          </div>

          {/* True things only. A contractor checks. */}
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
            {["Built on live underground fibre jobs", "Veteran-owned", "Your own isolated system"].map(
              (x) => (
                <span key={x} className="flex items-center gap-1.5 text-[12.5px]" style={{ color: MUTED }}>
                  <ShieldCheck className="size-3.5 shrink-0" style={{ color: GOLD }} />
                  {x}
                </span>
              ),
            )}
          </div>
        </div>

        {/* The product itself, sat on a soft glow so it lifts off the page
            without a drop shadow doing the work. */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-2xl"
            style={{
              background: "radial-gradient(60% 60% at 50% 40%, rgba(79,140,255,0.28), transparent 70%)",
            }}
          />
          <ProductShot />
        </div>
      </div>
    </section>
  );
}

function Flow() {
  return (
    <section className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="text-[24px] font-bold tracking-[-0.015em] sm:text-[30px]">
          Filed once. Everything else follows.
        </h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed" style={{ color: BODY }}>
          The same filing becomes the invoice to your customer and the crew&rsquo;s pay statement, so the
          two cannot disagree.
        </p>
        <div className="mt-8">
          <FlowShot />
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="what" className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="max-w-2xl text-[26px] font-bold tracking-[-0.015em] sm:text-[34px]">
          The work between the office and the ditch
        </h2>
        <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed" style={{ color: BODY }}>
          Most of what goes wrong on a job is not the digging. It is a daily that never arrived, a
          locate nobody checked, a reel nobody can account for, and an invoice that does not match
          what the crew says they built.
        </p>

        {/* Locates get their own panel because it is the module people ask
            about, and because "811 is clear but your own locate is not done" is
            a distinction nothing else draws. */}
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div>
            <span
              className="grid size-10 place-items-center rounded-xl"
              style={{ background: "rgba(224,168,46,0.14)", color: GOLD }}
            >
              <MapPin className="size-5" />
            </span>
            <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">
              Knows the difference between cleared and safe
            </h3>
            <p className="mt-2.5 max-w-lg text-[14.5px] leading-relaxed" style={{ color: BODY }}>
              Every 811 ticket with its clock, whose response is outstanding, and which locates your
              own crews perform. A ticket can be perfectly clear with 811 and still not safe to open
              the ground, and the crew&rsquo;s own sheet says so before they start.
            </p>
          </div>
          <LocateShot />
        </div>

        <div className="mt-14 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={<ClipboardList className="size-4" />}
            title="Dailies that bill themselves"
            body="Crews file production on your customer's own form, with the redlined map and photos attached. Approve it and the line items price against that job's rate card."
          />
          <Feature
            icon={<Receipt className="size-4" />}
            title="One set of numbers"
            body="What you bill and what you pay a crew come from the same filed daily. Statements, retainage and fast-pay terms are worked out, not typed."
          />
          <Feature
            icon={<Users className="size-4" />}
            title="Onboarding that ends"
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
          <Feature
            icon={<ShieldCheck className="size-4" />}
            title="Your numbers stay yours"
            body="Crews see their own work, their own pay and nothing else. No rate card, no margin, no other company's jobs — enforced in the queries, not hidden behind a button."
          />
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-[26px] font-bold tracking-[-0.015em] sm:text-[34px]">
          One package. No tiers to work out.
        </h2>
        <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed" style={{ color: BODY }}>
          Your company runs on its own dedicated system — your database, your jobs, your rates.
          Nothing you put in is visible to any other contractor using Vantara IQ.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
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

        <div
          className="mt-4 rounded-2xl border p-6"
          style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
        >
          <p className="text-[12px] font-bold uppercase tracking-[0.11em]" style={{ color: GOLD }}>
            What that includes
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {[
              "Your own isolated database and deployment",
              "Unlimited subcontractor crews and their logins",
              "Unlimited projects, dailies and invoices",
              "Text alerts to crews, carrier-registered",
              "Customer rate cards and per-crew pay rates",
              "Locates, materials, documents and onboarding",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2 text-[14.5px]" style={{ color: BODY }}>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: GOLD }} />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section id="demo" className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2">
        <div>
          <h2 className="text-[26px] font-bold tracking-[-0.015em] sm:text-[34px]">
            See it on your own jobs
          </h2>
          <p className="mt-3 text-[15.5px] leading-relaxed" style={{ color: BODY }}>
            Half an hour, walked through with one of your live jobs in front of us — your customer,
            your crews, your rates. You will know inside ten minutes whether it fits how you work.
          </p>
          <ul className="mt-7 flex flex-col gap-3">
            {[
              "No obligation and no card",
              "We use your real job numbers, not a sample",
              "Your data stays yours, on your own system",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2.5 text-[14.5px]" style={{ color: BODY }}>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: GOLD }} />
                {x}
              </li>
            ))}
          </ul>
        </div>

        <DemoRequestForm />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: HAIR }}>
      <div
        className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-9 text-[12.5px] sm:flex-row sm:items-center sm:px-6"
        style={{ color: MUTED }}
      >
        <BrandLogo height={22} />
        <span className="sm:ml-2">© {new Date().getFullYear()} Vantara IQ</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 sm:ml-auto">
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
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div
      className="rounded-2xl border p-5 transition-colors hover:border-white/20"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
    >
      <span
        className="grid size-9 place-items-center rounded-xl"
        style={{ background: "rgba(224,168,46,0.13)", color: GOLD }}
      >
        {icon}
      </span>
      <h3 className="mt-3.5 text-[15.5px] font-semibold tracking-[-0.005em]">{title}</h3>
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
      className="relative rounded-2xl border p-6"
      style={{
        borderColor: feature ? "rgba(224,168,46,0.45)" : "rgba(255,255,255,0.1)",
        background: feature ? "rgba(224,168,46,0.06)" : "rgba(255,255,255,0.03)",
        boxShadow: feature ? "0 20px 50px -30px rgba(224,168,46,0.6)" : undefined,
      }}
    >
      <p className="text-[11.5px] font-bold uppercase tracking-[0.11em]" style={{ color: MUTED }}>
        {label}
      </p>
      <p className="mt-2.5 flex items-baseline gap-1.5">
        <span className="text-[38px] font-bold tracking-[-0.03em] tabular-nums" style={{ color: INK }}>
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
