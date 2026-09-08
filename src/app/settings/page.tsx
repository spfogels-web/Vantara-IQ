import Link from "next/link";
import { Building2, Plug, Radio, ShieldCheck, Smartphone } from "lucide-react";

import { getOrganization, getOrganizationLogo } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { ProfileCard } from "@/components/settings/profile-card";
import { OrgLogo } from "@/components/settings/org-logo";
import { MyAlerts } from "@/components/settings/my-alerts";
import { SmsStatus } from "@/components/settings/sms-status";
import { smsReady, smsSenderLabel } from "@/lib/sms";
import { getMyAlertSettings } from "@/app/actions";
import { SMS_CONSENT_TEXT } from "@/lib/sms-consent";
import { alertsState } from "@/lib/alerts-switch";
import { AlertsSwitchPanel } from "@/components/settings/alerts-switch-panel";
import { getCurrentUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  PM: "Project manager",
  OFFICE: "Office",
  SUPERVISOR: "Supervisor",
  SUBCONTRACTOR: "Subcontractor",
};

export const metadata = { title: "Settings · Vantara IQ" };

/**
 * Integrations.
 *
 * Every one of these reads "Not connected", because none of them are. Two of
 * them used to claim "Connected" with a green dot, which is the kind of thing
 * that gets an office manager to assume invoices are syncing to QuickBooks
 * when nothing is happening at all. A status badge has to be true or it is
 * worse than absent.
 *
 * The marks are lettermarks in each product's brand colour rather than the
 * real logos — no third-party assets fetched, nothing to break under a strict
 * content policy, and no trademark lifted.
 */
const integrations = [
  {
    name: "QuickBooks Online",
    detail: "Sync approved invoices and pay applications for accounting.",
    mark: "qb",
    tint: "#2CA01C",
  },
  {
    name: "ACH / Bill Pay",
    detail: "Export approved pay-app batches as NACHA files.",
    mark: "ACH",
    tint: "#3B82F6",
  },
  {
    name: "Procore",
    detail: "Two-way project and document sync.",
    mark: "P",
    tint: "#F47E42",
  },
  {
    name: "DocuSign",
    detail: "Digital subcontracts and change orders.",
    mark: "DS",
    tint: "#D8B72E",
  },
  {
    name: "Anthropic Claude",
    detail: "Reads material lists and rate sheets into structured rows.",
    mark: "AI",
    tint: "#D97757",
    live: true,
  },
  {
    name: "Vercel Blob",
    detail: "Stores maps, jobsite photos and uploaded documents.",
    mark: "BL",
    tint: "#8B8B8B",
    live: true,
  },
];

export default async function SettingsPage() {
  const [org, me, orgLogoUrl, myAlerts, alerts] = await Promise.all([
    getOrganization(),
    getCurrentUser(),
    getOrganizationLogo(),
    getMyAlertSettings(),
    alertsState(),
  ]);

  const staff = !!me && isStaff(me.role);

  return (
    <PageShell eyebrow="Workspace" title="Settings" description="Organization, team and the integrations that keep billing and pay in sync.">
      {me ? (
        <div className="mb-3">
          <ProfileCard
            name={me.name}
            email={me.email}
            role={me.role}
            organizationName={me.organizationName}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* The master switch first. Everything below it is somebody's own
            number and their own consent; this is whether any of it leaves
            the building at all, so it reads first and it is staff only. */}
        {staff ? (
          <Panel className="lg:col-span-2 scroll-mt-6" id="alerts">
            <PanelHeader
              title="Job alerts"
              description="Whether text messages are going out at all. This governs every alert in Vantara IQ."
              icon={<Radio className="size-3.5 text-gold" />}
            />
            <AlertsSwitchPanel state={alerts} />
          </Panel>
        ) : null}

        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Job alerts to your phone"
            description="Your own number and your own consent. Nothing is sent until you agree, and replying STOP stops it."
            icon={<Smartphone className="size-3.5 text-gold" />}
          />
          <MyAlerts initial={myAlerts} consentText={SMS_CONSENT_TEXT} />
        </Panel>

        {/* Staff only, and only because it is diagnostics: it names environment
            variables and sends live traffic. A crew has nothing to do with
            either. */}
        {staff ? (
          <Panel className="lg:col-span-2">
            <PanelHeader
              title="Text messaging"
              description="Whether messages can actually leave this environment, and what they are sent as."
              icon={<Smartphone className="size-3.5 text-brand-bright" />}
            />
            <SmsStatus
              ready={smsReady()}
              credentials={alerts.credentials}
              enabled={alerts.enabled}
              sender={smsSenderLabel()}
              webhook={process.env.SMS_WEBHOOK_URL ?? null}
              hasNumber={Boolean(myAlerts.phone && myAlerts.consented)}
            />
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Organization" icon={<Building2 className="size-3.5" />} />
          <PanelBody className="flex flex-col gap-2.5">
            <div className="border-b border-border/40 pb-3">
              <OrgLogo name={org.name} initialUrl={orgLogoUrl} />
            </div>
            <Row label="Company" value={org.name} />
            <Row label="Plan" value={org.plan} />
            <Row label="Signed in as" value={me?.name ?? "—"} />
            <Row label="Email" value={me?.email ?? "—"} />
            <Row label="Role" value={me ? ROLE_LABEL[me.role] ?? me.role : "—"} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Roles & access"
            description="Managers assign projects; subs see only what they're assigned"
            icon={<ShieldCheck className="size-3.5" />}
          />
          <PanelBody className="flex flex-col gap-2.5">
            <Row label="Operations Director" value="Full access" />
            <Row label="Office / Billing" value="Billing, dailies, reports" />
            <Row label="Project Manager" value="Assigned projects" />
            <Row label="Subcontractor" value="Assigned projects only" />
            {/* The old "Manage team" button did nothing. Point at the screens
                that genuinely manage people rather than leave a dead control. */}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Subcontractor accounts are managed on{" "}
              <Link href="/subcontractors" className="text-brand-bright hover:underline">
                Subcontractors
              </Link>
              . Staff logins are provisioned directly — ask for one to be added.
            </p>
          </PanelBody>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Integrations" icon={<Plug className="size-3.5" />} />
          <ul className="grid grid-cols-1 gap-1 p-2 lg:grid-cols-2">
            {integrations.map((it) => (
              <li
                key={it.name}
                className="flex flex-wrap items-center gap-3 rounded-lg px-2.5 py-3 hover:bg-foreground/[0.02]"
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold uppercase tracking-tight ring-1 ring-inset"
                  style={{
                    backgroundColor: `${it.tint}1f`,
                    color: it.tint,
                    boxShadow: `inset 0 0 0 1px ${it.tint}33`,
                  }}
                >
                  {it.mark}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{it.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{it.detail}</p>
                </div>
                {it.live ? (
                  <StatusPill label="In use" tone="success" />
                ) : (
                  <StatusPill label="Not connected" tone="neutral" dot={false} />
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-border/70 px-4 py-2.5 text-[11.5px] text-muted-foreground">
            Claude and Blob are wired and running. The accounting and document
            integrations aren&apos;t built yet — nothing syncs to them today.
          </p>
        </Panel>
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-2 text-[12.5px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
