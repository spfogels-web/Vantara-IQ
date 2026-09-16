import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  Image as ImageIcon,
  Layers,
  Lock,
  MapPin,
  MessageSquare,
  Radio,
  Receipt,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
} from "lucide-react";

import { BrandLogo } from "@/components/common/brand-logo";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";
import {
  AssistantShot,
  CrmShot,
  DailyShot,
  LocateShot,
  MaterialShot,
  MobileShot,
  OpsCenterShot,
  SpreadShot,
  TaskShot,
} from "@/components/marketing/shots";

/**
 * The public site.
 *
 * It lives inside the application rather than as a separate site on purpose.
 * The A2P campaign is registered against /sms on this domain and Twilio posts
 * opt-outs to /api/sms/inbound on it; moving the domain to a marketing site
 * elsewhere takes both down, and a campaign whose opt-in URL has gone dead is
 * one that gets suspended. Splitting them is a deliberate job for the day a
 * second customer needs their own address.
 *
 * Three rules it is built under, and all three cost something:
 *
 *   No real data. The page makes no database call at all and every product
 *   image is drawn, so there is no path by which a customer's rate card or a
 *   crew's name reaches a stranger. Screenshots would have been quicker.
 *
 *   No invented proof. No customer logos, counts or testimonials. The buyer is
 *   a contractor who will ask, and being caught inventing one costs more than
 *   every claim here is worth.
 *
 *   Nothing claimed that is not built. What exists was checked against the
 *   schema and the routes before it went on the page. Equipment and fleet,
 *   safety and incidents, a customer portal, and reading a material label from
 *   a photograph have no models behind them, so they sit under a heading that
 *   says they are not built yet rather than among the features. A contractor
 *   who buys on a promise finds out in week one.
 */

const INK = "#f4f7fb";
const BODY = "#c7d2e1";
const MUTED = "#93a3b8";
const GOLD = "#e0a82e";
const HAIR = "rgba(255,255,255,0.09)";
const CARD = "rgba(255,255,255,0.032)";

export function MarketingHome() {
  return (
    <div style={{ background: "#060b14", color: INK }} className="min-h-svh">
      <Header />
      <Hero />
      <Lifecycle />
      <Assistant />
      <OpsCenter />
      <FieldToInvoice />
      <Accountability />
      <Locates />
      <Materials />
      <Subs />
      <Modules />
      <Industries />
      <Difference />
      <Security />
      <Roadmap />
      <Pricing />
      <Demo />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header() {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{ borderColor: HAIR, background: "rgba(6,11,20,0.85)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <BrandLogo height={30} />
        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          {[
            ["Platform", "#platform"],
            ["AI", "#ai"],
            ["Industries", "#industries"],
            ["Pricing", "#pricing"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="hidden rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:text-white md:inline-flex"
              style={{ color: BODY }}
            >
              {label}
            </a>
          ))}
          {/* The door for everybody who already has an account, and there are
              more of those every week than there are new prospects. */}
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
            Request a demo
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
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

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        <div className="max-w-3xl">
          <p
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.13em]"
            style={{ borderColor: "rgba(224,168,46,0.35)", background: "rgba(224,168,46,0.08)", color: GOLD }}
          >
            Built for infrastructure contractors
          </p>

          <h1
            className="mt-5 text-[38px] font-bold leading-[1.04] tracking-[-0.025em] sm:text-[56px]"
            style={{
              backgroundImage: "linear-gradient(180deg, #ffffff 34%, #a9bdd8 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            The operating system for infrastructure construction
          </h1>

          <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed sm:text-[19px]" style={{ color: BODY }}>
            Vantara IQ connects your projects, crews, dailies, redlines, locates, materials, billing,
            subcontractors and financial intelligence in one platform.
          </p>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: MUTED }}>
            From underground and aerial fibre to power, gas, water and civil infrastructure — know
            exactly what is happening across your operation.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <a
              href="#demo"
              className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-[#0a1220] transition-transform hover:-translate-y-px"
              style={{ background: GOLD, boxShadow: "0 14px 34px -12px rgba(224,168,46,0.75)" }}
            >
              Request a demo <ArrowRight className="size-4" />
            </a>
            <a
              href="#platform"
              className="inline-flex h-12 items-center rounded-xl border px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.07]"
              style={{ borderColor: "rgba(255,255,255,0.2)" }}
            >
              Explore the platform
            </a>
          </div>
        </div>

        <div className="relative mt-12">
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-2xl"
            style={{ background: "radial-gradient(55% 55% at 50% 40%, rgba(79,140,255,0.26), transparent 70%)" }}
          />
          <OpsCenterShot />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2">
          {["Underground", "Aerial", "Fibre", "Telecom", "Power", "Gas", "Water", "Civil"].map((t) => (
            <span
              key={t}
              className="rounded-full border px-3 py-1 text-[12px] font-medium"
              style={{ borderColor: HAIR, color: MUTED, background: CARD }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** The chain, which is the whole argument. */
function Lifecycle() {
  const phases: [string, string, string[]][] = [
    ["Win it", GOLD, ["Opportunity", "Estimate", "Award"]],
    ["Plan it", "#818CF8", ["Project", "Engineering", "Locates", "Materials"]],
    ["Build it", "#34D399", ["Crew", "Daily", "Redline / as-built", "Approval"]],
    ["Get paid", "#4F8CFF", ["Customer billing", "Subcontractor pay", "Retainage"]],
    ["Know where you stand", "#F59E0B", ["Project margin", "Executive intelligence"]],
  ];

  return (
    <section className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="max-w-2xl text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
          One system. From field production to financial performance.
        </h2>
        <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed" style={{ color: BODY }}>
          Most infrastructure contractors run on paper dailies, PDFs, spreadsheets, text messages,
          an 811 portal, accounting software, a separate inventory list, rate sheets, engineering
          maps and subcontractor invoices. Every handoff between them is somewhere a number gets
          retyped, and every retyped number is somewhere the story stops matching.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {phases.map(([phase, colour, steps], i) => (
            <div
              key={phase}
              className="relative rounded-2xl border p-4"
              style={{ borderColor: HAIR, background: CARD }}
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.09em]"
                style={{ background: `${colour}1f`, color: colour }}
              >
                {String(i + 1).padStart(2, "0")} · {phase}
              </span>
              <ul className="mt-3 space-y-1.5">
                {steps.map((s) => (
                  <li key={s} className="flex items-start gap-1.5 text-[13px]" style={{ color: BODY }}>
                    <span
                      className="mt-[7px] size-1 shrink-0 rounded-full"
                      style={{ background: colour }}
                    />
                    {s}
                  </li>
                ))}
              </ul>

              {/* The connector, only where cards actually sit side by side. */}
              {i < phases.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute -right-[7px] top-1/2 hidden size-3 -translate-y-1/2 rotate-45 border-r border-t lg:block"
                  style={{ borderColor: "rgba(255,255,255,0.2)", background: "#0a1019" }}
                />
              ) : null}
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-[14.5px] leading-relaxed" style={{ color: MUTED }}>
          Each step feeds the next. The footage a crew files becomes the invoice to your customer,
          the crew&rsquo;s own pay statement and the project&rsquo;s margin — off one filing, at each side&rsquo;s own
          rate card, with a trail back from any figure to the daily it came from.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Assistant() {
  return (
    <section id="ai" className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <span
            className="grid size-10 place-items-center rounded-xl"
            style={{ background: "rgba(224,168,46,0.14)", color: GOLD }}
          >
            <Brain className="size-5" />
          </span>
          <h2 className="mt-4 text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
            Ask your operation anything.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed" style={{ color: BODY }}>
            Your operational data should not just sit in a database. Ask it what happened today,
            which projects are behind, which crews have not filed, what is ready to bill — and get an
            answer built from your own records rather than a guess.
          </p>

          <ul className="mt-6 space-y-2">
            {[
              "Which projects are behind, and by how much?",
              "Which crews haven't submitted their dailies?",
              "How many feet did we install this week?",
              "Which locates are holding up production?",
              "What's ready to bill right now?",
            ].map((q) => (
              <li
                key={q}
                className="rounded-lg border px-3 py-2 text-[13.5px]"
                style={{ borderColor: HAIR, background: CARD, color: BODY }}
              >
                &ldquo;{q}&rdquo;
              </li>
            ))}
          </ul>

          <p className="mt-5 text-[13px] leading-relaxed" style={{ color: MUTED }}>
            It answers from the records it is given and says when it has none. It will not call a
            street clear because the sentence would read better that way.
          </p>
        </div>

        <AssistantShot />
      </div>
    </section>
  );
}

function OpsCenter() {
  return (
    <section id="platform" className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="max-w-2xl text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
          Your entire operation. One screen.
        </h2>
        <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed" style={{ color: BODY }}>
          Production today, this week and this month. What is approved and ready to bill. Which
          projects are behind, which locates are blocking crews, which dailies never arrived. Then
          drill from the company down to a market, a project, a crew, a day, a single line of
          production.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Company", "Every market, every project, one figure"],
            ["Market", "How a region is performing against target"],
            ["Project", "Rates, crews, margin, documents, locates"],
            ["Crew · Daily · Line", "Down to the individual production item"],
          ].map(([t, d], i) => (
            <div key={t} className="rounded-2xl border p-4" style={{ borderColor: HAIR, background: CARD }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                Level {i + 1}
              </p>
              <p className="mt-1.5 text-[14.5px] font-semibold">{t}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
                {d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FieldToInvoice() {
  return (
    <section className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="max-w-2xl text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
          One daily drives the entire workflow.
        </h2>
        <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed" style={{ color: BODY }}>
          A crew files production from the truck with the redlined map and the photos attached. A
          supervisor reviews it. From that one approval comes the customer invoice, the crew&rsquo;s pay
          statement, the retainage held on both sides, and the project&rsquo;s margin.
        </p>

        <div className="mt-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1fr]">
          <DailyShot />
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-[1fr_auto] lg:grid-cols-1">
            <SpreadShot />
            <div className="lg:hidden">
              <MobileShot />
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span
              className="grid size-10 place-items-center rounded-xl"
              style={{ background: "rgba(224,168,46,0.14)", color: GOLD }}
            >
              <Smartphone className="size-5" />
            </span>
            <h3 className="mt-4 text-[21px] font-semibold tracking-[-0.01em]">
              Filed from the truck, not the office
            </h3>
            <p className="mt-2.5 max-w-lg text-[14.5px] leading-relaxed" style={{ color: BODY }}>
              Big targets, little typing, photographs first. A foreman opens the job, enters what
              went in the ground, marks the map, attaches the photos and submits — in the time it
              takes to finish a coffee.
            </p>
            <p className="mt-3 max-w-lg text-[14.5px] leading-relaxed" style={{ color: MUTED }}>
              And if a locate the crew is responsible for has not been signed off, the sheet says so
              before they start, not after.
            </p>
          </div>
          <div className="hidden lg:block">
            <MobileShot />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Tasks, as they actually work today.
 *
 * Written against what the schema and the actions do, and nothing else. The
 * before-and-after photographs are real — TaskPhoto carries PROBLEM and
 * RESOLUTION as distinct kinds — as are the text on assignment, the thread,
 * the crew-only scoping and the reason required to block something.
 *
 * What is deliberately not claimed: an acknowledgement timestamp, a
 * ready-for-verification step, office approval, a rework loop, response-time
 * analytics. None of those are built. They are named in the roadmap instead,
 * because a contractor shown a verification workflow in a demo will look for
 * it in week one.
 */
function Accountability() {
  return (
    <section className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <span
            className="grid size-10 place-items-center rounded-xl"
            style={{ background: "rgba(224,168,46,0.14)", color: GOLD }}
          >
            <ClipboardCheck className="size-5" />
          </span>
          <h2 className="mt-4 text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
            When something is wrong in the field, one person owns it.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed" style={{ color: BODY }}>
            A pedestal that never went in. A handhole left open. A redline nobody sent. Raise it
            against the job with a photograph of what you found, put one name on it, and the
            foreman gets a text where he is standing.
          </p>

          <ul className="mt-6 space-y-2.5">
            {[
              ["The photograph of the fault, and the photograph of the fix", "Held as two different things and shown side by side. It settles an argument words never will."],
              ["One owner, never two", "An employee or a crew — the system refuses both, so nobody can assume the other one had it."],
              ["A text, not an email nobody opens", "Sent the moment it is assigned, to the company number and to every person the crew has invited."],
              ["The conversation lives on the job", "Office and field talking in one thread against the project, not in somebody's phone."],
              ["Blocked needs a reason", "You cannot park a task without saying what it is waiting on."],
              ["Crews see only their own", "Scoped in the query. One crew cannot read another crew's problems."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: GOLD }} />
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold">{t}</span>
                  <span className="block text-[13.5px] leading-relaxed" style={{ color: BODY }}>
                    {d}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-[13.5px] leading-relaxed" style={{ color: MUTED }}>
            Every task stays on that project&rsquo;s record, so the punch list at closeout is the list of
            what was actually raised and what was actually done about it.
          </p>
        </div>

        <TaskShot />
      </div>
    </section>
  );
}

function Locates() {
  return (
    <section className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <span
            className="grid size-10 place-items-center rounded-xl"
            style={{ background: "rgba(224,168,46,0.14)", color: GOLD }}
          >
            <MapPin className="size-5" />
          </span>
          <h2 className="mt-4 text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
            Know before you dig.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed" style={{ color: BODY }}>
            Every 811 ticket with its clock, every utility&rsquo;s response, and the one distinction that
            matters most: a ticket can be entirely clear with 811 and still not safe to open the
            ground, because the locate on your own plant has not been walked.
          </p>

          <div className="mt-6 flex flex-wrap gap-1.5">
            {[
              ["Expiring soon", "#F59E0B"],
              ["Response pending", "#F59E0B"],
              ["Re-mark required", "#F87171"],
              ["Your locate required", "#F59E0B"],
              ["Ready to excavate", "#34D399"],
            ].map(([label, colour]) => (
              <span
                key={label}
                className="rounded-md border px-2 py-1 text-[11.5px] font-semibold"
                style={{ borderColor: `${colour}59`, background: `${colour}14`, color: colour }}
              >
                {label}
              </span>
            ))}
          </div>

          <p className="mt-5 text-[13.5px] leading-relaxed" style={{ color: MUTED }}>
            Who performs which locate is set per project, so a utility your own crews walk stops
            holding up the ticket and starts holding up the dig — which is the truthful way round.
          </p>
        </div>

        <LocateShot />
      </div>
    </section>
  );
}

function Materials() {
  return (
    <section className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_1fr]">
        <MaterialShot />
        <div>
          <span
            className="grid size-10 place-items-center rounded-xl"
            style={{ background: "rgba(224,168,46,0.14)", color: GOLD }}
          >
            <Boxes className="size-5" />
          </span>
          <h2 className="mt-4 text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
            Know where every reel went.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed" style={{ color: BODY }}>
            Receiving, yard, checkout, crew, project, installed. Fibre reels by number, conduit,
            vaults, handholes, pedestals, hardware — held by yard, so a reel in one yard is
            never confused with one three counties away.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: BODY }}>
            What was issued against what the dailies say went in the ground, with a tolerance. A
            variance outside it is raised with a reason attached rather than quietly written off.
          </p>
        </div>
      </div>
    </section>
  );
}

function Subs() {
  return (
    <section className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="max-w-2xl text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
          Manage every subcontractor without losing control of your numbers.
        </h2>
        <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed" style={{ color: BODY }}>
          W-9, insurance, signed agreements, ACH and yard badges, chased by the system until the
          file is complete — a crew cannot be assigned work until it is. The packet stays on your
          side of the fence: you hold the record, not a folder on somebody&rsquo;s laptop.
        </p>

        {/* The half a prime usually underestimates: the crew is doing work in
            here too, which is what stops the office re-keying it. */}
        <div className="mt-9 rounded-2xl border p-6" style={{ borderColor: HAIR, background: CARD }}>
          <h3 className="text-[19px] font-semibold tracking-[-0.01em]">
            Every crew gets a login of their own
          </h3>
          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed" style={{ color: BODY }}>
            Assign them a project and they work inside it — which is what stops your office
            re-typing what they have already written down.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {[
              ["File their own dailies", "Production on your customer's form, from the truck."],
              ["Redline the map and attach the as-built", "Marked on the job's own map, tied to that day's production."],
              ["Check and accept their statement", "Or dispute it with a reason, which comes back to your office."],
              ["Take the remittance advice", "Their own payment record, downloadable, nobody else's."],
              ["Invite their own people", "Owner, office admin, project manager, supervisor, foreman — each with their own access."],
              ["Send in their locate tickets", "Filed to their company, and they see the clock on each one."],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: GOLD }} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{t}</span>
                  <span className="block text-[13px] leading-relaxed" style={{ color: MUTED }}>
                    {d}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.05)" }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "#34D399" }}>
              What a subcontractor sees
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                "Their own crews, projects and dailies",
                "Their own pay statements and retainage",
                "Their own documents and compliance dates",
                "Locate tickets filed to their company",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2 text-[13.5px]" style={{ color: BODY }}>
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" style={{ color: "#34D399" }} />
                  {x}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.045)" }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "#F87171" }}>
              What they never see
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                "What you bill your customer",
                "Your margin on any job",
                "Any other subcontractor's work or pay",
                "Rate cards that are not their own",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2 text-[13.5px]" style={{ color: BODY }}>
                  <Lock className="mt-0.5 size-3.5 shrink-0" style={{ color: "#F87171" }} />
                  {x}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
              Enforced in the queries that fetch the data, not by hiding a button.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Modules() {
  const items: [React.ReactNode, string, string][] = [
    [<ClipboardList key="d" className="size-4" />, "Dailies", "Production on your customer's own form, with redlines and photos attached."],
    [<Layers key="r" className="size-4" />, "Redlines & as-builts", "Engineering prints, field markups and as-builts tied to the daily and the billing."],
    [<Brain key="m" className="size-4" />, "Print reading", "Count bores, handholes, pedestals and footages off an engineering print instead of by eye across twenty sheets."],
    [<Receipt key="b" className="size-4" />, "Billing", "Approved production to customer invoice, with the trail back to the daily it came from."],
    [<Users key="s" className="size-4" />, "Subcontractors", "Onboarding, compliance, rate cards, statements, retainage and disputes."],
    [<TrendingUp key="f" className="size-4" />, "Financial intelligence", "Revenue, subcontractor cost and production spread by project and market."],
    [<MessageSquare key="g" className="size-4" />, "Messaging", "Assignments, approvals and pay notices reaching a foreman by text, with consent handled to carrier rules."],
    [<FileText key="doc" className="size-4" />, "Documents", "Contracts, COIs, W-9s, permits and as-builts filed against the company or project they belong to."],
    [<Radio key="c" className="size-4" />, "Pipeline", "Opportunities, estimates and bids before a project exists — awarded ones become projects."],
    [<ImageIcon key="p" className="size-4" />, "The job's own record", "Aerials, field photographs, the engineering map and every document filed against the project they belong to — not a shared drive."],
    [<FileSignature key="rs" className="size-4" />, "Rate sheets in one click", "A priced rate sheet for a project or a crew, generated as a PDF with your company's logo on it, from the rates already on file."],
  ];

  return (
    <section className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-[24px] font-bold tracking-[-0.015em] sm:text-[30px]">
          Everything else it does
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([icon, title, body]) => (
            <div
              key={title}
              className="rounded-2xl border p-5 transition-colors hover:border-white/20"
              style={{ borderColor: HAIR, background: CARD }}
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
          ))}
        </div>

        <div className="mt-10">
          <CrmShot />
        </div>
      </div>
    </section>
  );
}

function Industries() {
  const rows: [string, string][] = [
    ["Telecom & broadband", "FTTH, backbone, middle-mile and last-mile. Underground, aerial and splicing."],
    ["Electric utilities", "Underground and overhead electrical infrastructure."],
    ["Gas utilities", "Distribution and mainline construction."],
    ["Water & sewer", "Water, sewer and civil utility projects."],
    ["Civil infrastructure", "Contractors running multiple crews, subcontractors and markets."],
    ["Prime contractors", "Central operational control across every subcontractor and project."],
  ];

  return (
    <section id="industries" className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-[24px] font-bold tracking-[-0.015em] sm:text-[30px]">Who it is for</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: BODY }}>
          Whether you run two crews or two hundred, in one market or across several states.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([t, d]) => (
            <div key={t} className="rounded-2xl border p-5" style={{ borderColor: HAIR, background: CARD }}>
              <h3 className="text-[15.5px] font-semibold">{t}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
                {d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Difference() {
  return (
    <section className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="max-w-3xl text-[27px] font-bold leading-tight tracking-[-0.015em] sm:text-[38px]">
          Most construction software records what happened.
          <span style={{ color: GOLD }}> Vantara IQ tells you what needs you now.</span>
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <div className="rounded-2xl border p-6" style={{ borderColor: HAIR, background: CARD }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
              Run on separate systems
            </p>
            <ul className="mt-3.5 space-y-2">
              {[
                "Dailies in one place, maps in another",
                "Locates in a portal nobody checks daily",
                "Inventory on a spreadsheet",
                "Subcontractor pay worked out by hand",
                "Billing reconciled at month end",
                "Management assembles the story afterwards",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2 text-[14px]" style={{ color: BODY }}>
                  <span className="mt-[9px] size-1 shrink-0 rounded-full" style={{ background: MUTED }} />
                  {x}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="rounded-2xl border p-6"
            style={{ borderColor: "rgba(224,168,46,0.4)", background: "rgba(224,168,46,0.05)" }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: GOLD }}>
              Run on Vantara IQ
            </p>
            <ul className="mt-3.5 space-y-2">
              {[
                "One filing feeds billing, pay and margin",
                "Locates on the crew's own sheet before they dig",
                "Material custody by reel, crew and yard",
                "Statements calculated at each crew's own rates",
                "What is ready to bill, today",
                "The exceptions come to you",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2 text-[14px]" style={{ color: BODY }}>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: GOLD }} />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-[15px] leading-relaxed" style={{ color: MUTED }}>
          Management by exception instead of management by spreadsheet.
        </p>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <span
          className="grid size-10 place-items-center rounded-xl"
          style={{ background: "rgba(224,168,46,0.14)", color: GOLD }}
        >
          <ShieldCheck className="size-5" />
        </span>
        <h2 className="mt-4 text-[24px] font-bold tracking-[-0.015em] sm:text-[30px]">
          Your numbers stay yours
        </h2>
        <div className="mt-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Your own system", "A dedicated database and deployment per company. Nothing you enter is visible to another contractor."],
            ["Role-based access", "Owner, project manager, supervisor, foreman, inventory, office, subcontractor — each sees what their job needs."],
            ["Rates and margin protected", "What you bill and what you pay are separate figures with separate permissions."],
            ["Auditable", "Every approval, rate change and payment carries who did it and when."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border p-5" style={{ borderColor: HAIR, background: CARD }}>
              <h3 className="text-[14.5px] font-semibold">{t}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: BODY }}>
                {d}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-3xl text-[13px] leading-relaxed" style={{ color: MUTED }}>
          We do not claim a security certification we have not been through. What is described here
          is how the software is built, and we will walk you through any of it.
        </p>
      </div>
    </section>
  );
}

/**
 * What is not built.
 *
 * On the page rather than left out, because a contractor asks about equipment
 * and safety in the first meeting, and "on the roadmap" said plainly buys more
 * trust than a feature list that turns out to be aspirational in week one.
 */
function Roadmap() {
  return (
    <section className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="text-[20px] font-bold tracking-[-0.01em] sm:text-[24px]">
          Being built next — not available today
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed" style={{ color: MUTED }}>
          Named here so nobody buys on a promise. If one of these decides it for you, say so in the
          demo and we will tell you honestly where it stands.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            "Task acknowledgement, office verification & rework",
            "Equipment & fleet",
            "Safety, JSAs & incident reporting",
            "Customer portal",
            "Reading a material label from a photograph",
          ].map((x) => (
            <span
              key={x}
              className="rounded-lg border px-3 py-1.5 text-[13px]"
              style={{ borderColor: HAIR, background: CARD, color: BODY }}
            >
              {x}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="border-t" style={{ borderColor: HAIR, background: "rgba(255,255,255,0.018)" }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-[27px] font-bold tracking-[-0.015em] sm:text-[36px]">
          One package. No tiers to work out.
        </h2>
        <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed" style={{ color: BODY }}>
          Your company runs on its own dedicated system — your database, your jobs, your rates.
          Nothing you put in is visible to any other contractor using Vantara IQ.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
          <Price amount="$1,000" unit="once" label="Implementation" body="Your own system, stood up and configured — rate cards loaded, crews and projects brought across, your people trained on it." />
          <Price amount="$250" unit="per month" label="Enterprise package" body="The whole platform. Every module, unlimited projects, unlimited subcontractor crews, and their logins are free." feature />
          <Price amount="$35" unit="per user, per month" label="Your staff" body="Each of your own people with a login — owners, project managers, supervisors, foremen. Your subcontractors' logins are not charged." />
        </div>

        <div className="mt-4 rounded-2xl border p-6" style={{ borderColor: HAIR, background: CARD }}>
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
    <section id="demo" className="border-t" style={{ borderColor: HAIR }}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-3xl">
          <h2 className="text-[28px] font-bold leading-tight tracking-[-0.02em] sm:text-[40px]">
            Run your entire infrastructure operation from one platform.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed" style={{ color: BODY }}>
            Projects. Crews. Dailies. Redlines. Locates. Materials. Billing. Subcontractors.
            Financials. Vantara IQ connects the field to the office and turns operational data into
            decisions.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-[20px] font-semibold tracking-[-0.01em]">See it on your own jobs</h3>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: BODY }}>
              Half an hour, walked through with one of your live jobs in front of us — your customer,
              your crews, your rates. You will know inside ten minutes whether it fits how you work.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
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
        borderColor: feature ? "rgba(224,168,46,0.45)" : HAIR,
        background: feature ? "rgba(224,168,46,0.06)" : CARD,
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
