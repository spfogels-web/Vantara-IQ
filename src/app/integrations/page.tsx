import {
  Banknote,
  Boxes,
  FileText,
  HardHat,
  MessagesSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { isConfigured } from "@/lib/extract";
import { cn } from "@/lib/utils";
import { PageShell, StatStrip } from "@/components/common/page-shell";
import { Panel } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations · Vantara IQ" };

type Status = "Connected" | "Available" | "Coming soon";
type Tone = "success" | "info" | "neutral";
type Item = { name: string; blurb: string; status: Status; mono: string; tint: Tone };
type Group = { title: string; icon: LucideIcon; items: Item[] };

const STATUS_TONE: Record<Status, Tone> = {
  Connected: "success",
  Available: "info",
  "Coming soon": "neutral",
};

function catalog(claudeConnected: boolean): Group[] {
  return [
    {
      title: "AI & automation",
      icon: Sparkles,
      items: [
        {
          name: "Claude (Anthropic)",
          blurb: "The AI engine behind daily review, rate extraction and the assistant.",
          status: claudeConnected ? "Connected" : "Available",
          mono: "AI",
          tint: "info",
        },
        { name: "OpenAI", blurb: "Alternate AI provider for extraction and drafting.", status: "Available", mono: "AI", tint: "info" },
        { name: "Google Gemini", blurb: "Additional AI provider option.", status: "Coming soon", mono: "G", tint: "neutral" },
      ],
    },
    {
      title: "Accounting & invoicing",
      icon: Banknote,
      items: [
        { name: "QuickBooks Online", blurb: "Push approved invoices and pay applications to accounting.", status: "Connected", mono: "QB", tint: "success" },
        { name: "QuickBooks Desktop", blurb: "Sync invoices to on-prem QuickBooks via Web Connector.", status: "Available", mono: "QB", tint: "info" },
        { name: "Xero", blurb: "Cloud accounting sync for invoices and bills.", status: "Available", mono: "XO", tint: "info" },
        { name: "Sage 100/300 Construction", blurb: "Job-cost accounting built for contractors.", status: "Available", mono: "SG", tint: "info" },
        { name: "Foundation", blurb: "Construction accounting and job costing.", status: "Coming soon", mono: "FN", tint: "neutral" },
        { name: "Viewpoint Vista (Trimble)", blurb: "Enterprise construction ERP sync.", status: "Coming soon", mono: "VP", tint: "neutral" },
        { name: "Bill.com", blurb: "AP/AR automation and payments.", status: "Available", mono: "BC", tint: "info" },
      ],
    },
    {
      title: "Project & field management",
      icon: HardHat,
      items: [
        { name: "Procore", blurb: "Two-way project, budget and document sync.", status: "Available", mono: "PC", tint: "info" },
        { name: "Autodesk Construction Cloud", blurb: "Plans, RFIs and field data.", status: "Available", mono: "AC", tint: "info" },
        { name: "B2W / HeavyJob", blurb: "Heavy-civil estimating and field production.", status: "Coming soon", mono: "B2", tint: "neutral" },
        { name: "Raken", blurb: "Field daily reports and time.", status: "Available", mono: "RK", tint: "info" },
        { name: "Fieldwire", blurb: "Task and plan management for crews.", status: "Coming soon", mono: "FW", tint: "neutral" },
      ],
    },
    {
      title: "Documents & plans",
      icon: FileText,
      items: [
        { name: "DocuSign", blurb: "E-sign subcontracts, change orders and rate cards.", status: "Available", mono: "DS", tint: "info" },
        { name: "Bluebeam", blurb: "As-built and plan markups.", status: "Coming soon", mono: "BB", tint: "neutral" },
        { name: "Google Drive", blurb: "Sync photos, as-builts and backup packages.", status: "Available", mono: "GD", tint: "info" },
        { name: "Dropbox", blurb: "Cloud file storage for project documents.", status: "Available", mono: "DB", tint: "info" },
        { name: "Egnyte", blurb: "Construction-grade content governance.", status: "Coming soon", mono: "EG", tint: "neutral" },
      ],
    },
    {
      title: "Payments & payroll",
      icon: Boxes,
      items: [
        { name: "ACH / Bill Pay", blurb: "Export approved pay-app batches as NACHA files.", status: "Connected", mono: "AC", tint: "success" },
        { name: "Stripe", blurb: "Card and bank payments for customer invoices.", status: "Available", mono: "ST", tint: "info" },
        { name: "Plaid", blurb: "Bank account verification for ACH and Fast Pay.", status: "Available", mono: "PL", tint: "info" },
        { name: "ADP", blurb: "Payroll and certified payroll export.", status: "Coming soon", mono: "AD", tint: "neutral" },
        { name: "Gusto", blurb: "Payroll and benefits for crews.", status: "Coming soon", mono: "GU", tint: "neutral" },
      ],
    },
    {
      title: "Communication & storage",
      icon: MessagesSquare,
      items: [
        { name: "Slack", blurb: "Alerts for dailies, approvals and expirations.", status: "Available", mono: "SL", tint: "info" },
        { name: "Microsoft Teams", blurb: "Notifications and approvals in Teams.", status: "Available", mono: "MT", tint: "info" },
        { name: "Twilio", blurb: "SMS reminders and invite links to crews.", status: "Available", mono: "TW", tint: "info" },
        { name: "Microsoft 365", blurb: "Email, calendar and SharePoint.", status: "Coming soon", mono: "M365", tint: "neutral" },
      ],
    },
  ];
}

const TINT: Record<Tone, string> = {
  success: "bg-success/12 text-success ring-success/25",
  info: "bg-brand/12 text-brand-bright ring-brand/25",
  neutral: "bg-foreground/[0.06] text-muted-foreground ring-foreground/[0.08]",
};

export default async function IntegrationsPage() {
  const claudeConnected = isConfigured();
  const groups = catalog(claudeConnected);
  const all = groups.flatMap((g) => g.items);
  const connected = all.filter((i) => i.status === "Connected").length;
  const available = all.filter((i) => i.status === "Available").length;

  return (
    <PageShell
      eyebrow="Intelligence"
      title="Integrations"
      description="Connect Vantara IQ to the tools contractors already run on — accounting, project management, field, payments, storage, comms, and AI."
    >
      <div className="flex flex-col gap-6">
        <StatStrip
          stats={[
            { label: "Connected", value: String(connected), tone: "text-success" },
            { label: "Available", value: String(available) },
            { label: "Total integrations", value: String(all.length) },
            { label: "AI engine", value: claudeConnected ? "Claude · on" : "Not set", tone: claudeConnected ? "text-success" : "text-warning" },
          ]}
        />

        {!claudeConnected ? (
          <div className="rounded-xl border border-warning/25 bg-warning/[0.08] px-4 py-3 text-[12.5px] text-warning">
            <span className="font-semibold">Claude AI isn&apos;t connected.</span> Add an{" "}
            <span className="num">ANTHROPIC_API_KEY</span> to enable AI daily review, rate extraction and the assistant.
          </div>
        ) : null}

        {groups.map((g) => {
          const Icon = g.icon;
          return (
            <section key={g.title}>
              <p className="eyebrow mb-2 flex items-center gap-1.5">
                <Icon className="size-3.5" /> {g.title}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((it) => (
                  <Panel key={it.name} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-[12px] font-bold ring-1 ring-inset", TINT[it.tint])}>
                        {it.mono}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[13.5px] font-semibold text-foreground">{it.name}</h3>
                        </div>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{it.blurb}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <StatusPill label={it.status} tone={STATUS_TONE[it.status]} dot={it.status === "Connected"} className="text-[10px]" />
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-8 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12px] hover:text-foreground",
                          it.status === "Connected" ? "text-muted-foreground" : "text-brand-bright",
                        )}
                      >
                        {it.status === "Connected" ? "Manage" : it.status === "Available" ? "Connect" : "Notify me"}
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
