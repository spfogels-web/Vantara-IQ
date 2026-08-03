import Link from "next/link";
import { Book, LifeBuoy, Mail, MessageCircle } from "lucide-react";

import { PageShell } from "@/components/common/page-shell";
import { Panel, PanelBody } from "@/components/common/panel";

export const metadata = { title: "Support · Vantara IQ" };

const channels = [
  {
    icon: MessageCircle,
    title: "Live chat",
    detail: "Reach the team in-app, Mon–Fri 7a–7p ET. Typical reply under 10 minutes.",
    action: "Start a chat",
    href: "#",
  },
  {
    icon: Mail,
    title: "Email support",
    detail: "For account, billing and data questions. We respond within one business day.",
    action: "support@vantara-iq.com",
    href: "mailto:support@vantara-iq.com",
  },
  {
    icon: Book,
    title: "Knowledge base",
    detail: "Guides for dailies, billing rules, rate sheets and the contractor portal.",
    action: "Browse articles",
    href: "#",
  },
];

const faqs = [
  {
    q: "How do subcontractors get access?",
    a: "Invite them from the Subcontractors tab. They register their company, upload compliance docs, and a manager assigns projects — they only ever see what they're assigned.",
  },
  {
    q: "How does automatic invoicing work?",
    a: "Approved dailies are matched to the customer's rate sheet. The billing engine applies minimums and retainage per that customer's rules, then stages the invoice for your team to review and send.",
  },
  {
    q: "What does the AI actually decide?",
    a: "Nothing. It reads dailies, as-builts and maps, flags discrepancies and change-order opportunities, and prepares everything — your team makes every approval.",
  },
];

export default function SupportPage() {
  return (
    <PageShell eyebrow="Workspace" title="Support" description="Help getting the most out of Vantara IQ.">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {channels.map((c) => (
            <Panel key={c.title}>
              <PanelBody className="flex flex-col gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-white/[0.05] text-brand-bright ring-1 ring-inset ring-white/[0.06]">
                  <c.icon className="size-4" strokeWidth={1.8} />
                </span>
                <div>
                  <h3 className="text-[13.5px] font-semibold text-foreground">{c.title}</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{c.detail}</p>
                </div>
                <Link
                  href={c.href}
                  className="focus-ring mt-auto inline-flex w-fit items-center gap-1 rounded text-[12.5px] font-medium text-brand-bright hover:underline"
                >
                  {c.action} →
                </Link>
              </PanelBody>
            </Panel>
          ))}
        </div>

        <section>
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <LifeBuoy className="size-3.5" /> Frequently asked
          </p>
          <div className="flex flex-col gap-2">
            {faqs.map((f) => (
              <Panel key={f.q}>
                <PanelBody>
                  <h3 className="text-[13px] font-semibold text-foreground">{f.q}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{f.a}</p>
                </PanelBody>
              </Panel>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
