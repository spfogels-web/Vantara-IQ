import { Check, Plug } from "lucide-react";

import { getOrganization, getOrganizationLogo } from "@/data/queries";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/common/page-shell";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { ProfileCard } from "@/components/settings/profile-card";
import { OrgLogo } from "@/components/settings/org-logo";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  PM: "Project manager",
  OFFICE: "Office",
  SUBCONTRACTOR: "Subcontractor",
};

export const metadata = { title: "Settings · Vantara IQ" };

const integrations = [
  {
    name: "QuickBooks Online",
    detail: "Sync approved invoices and pay applications for accounting.",
    status: "Connected" as const,
    tone: "success" as const,
  },
  {
    name: "ACH / Bill Pay",
    detail: "Export approved pay-app batches as NACHA files.",
    status: "Connected" as const,
    tone: "success" as const,
  },
  {
    name: "Procore",
    detail: "Two-way project and document sync.",
    status: "Not connected" as const,
    tone: "neutral" as const,
  },
  {
    name: "DocuSign",
    detail: "Digital subcontracts and change orders.",
    status: "Not connected" as const,
    tone: "neutral" as const,
  },
];

export default async function SettingsPage() {
  const [org, me, orgLogoUrl] = await Promise.all([
    getOrganization(),
    getCurrentUser(),
    getOrganizationLogo(),
  ]);

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
        <Panel>
          <PanelHeader title="Organization" />
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
          <PanelHeader title="Roles & access" description="Managers assign projects; subs see only what they're assigned" />
          <PanelBody className="flex flex-col gap-2.5">
            <Row label="Operations Director" value="Full access" />
            <Row label="Office / Billing" value="Billing, dailies, reports" />
            <Row label="Project Manager" value="Assigned projects" />
            <Row label="Subcontractor" value="Assigned projects only" />
            <Button variant="outline" size="sm" className="mt-1 h-8 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12px] text-muted-foreground hover:text-foreground">
              Manage team
            </Button>
          </PanelBody>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Integrations" icon={<Plug className="size-3.5" />} />
          <ul className="p-2">
            {integrations.map((it) => (
              <li key={it.name} className="flex flex-wrap items-center gap-3 rounded-lg px-2.5 py-3 hover:bg-foreground/[0.02]">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{it.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{it.detail}</p>
                </div>
                <StatusPill label={it.status} tone={it.tone} dot={it.tone === "success"} />
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-8 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12px] hover:text-foreground",
                    it.tone === "success" ? "text-muted-foreground" : "text-brand-bright",
                  )}
                >
                  {it.tone === "success" ? (
                    <>
                      <Check className="size-3.5" /> Manage
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
              </li>
            ))}
          </ul>
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
