import { CheckCircle2 } from "lucide-react";

import { PanelBody } from "@/components/common/panel";
import { formatCurrency } from "@/lib/format";
import type { PlanBilling } from "@/lib/plan";

/**
 * What this company is on, and what it comes to.
 *
 * Every figure is worked out from the same user count the rest of the system
 * uses to decide who is staff, so the bill cannot disagree with who can see the
 * customer's numbers. The arithmetic is shown rather than summarised — a total
 * somebody cannot check is a total they will query, and answering that query is
 * more expensive than printing the line.
 */
export function PlanPanel({ billing: b, company }: { billing: PlanBilling; company: string }) {
  return (
    <PanelBody>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-foreground">
            {company} · Enterprise
          </p>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">
            The whole platform on a dedicated system. Unlimited projects, unlimited subcontractor
            crews, and their logins are not charged.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
            {formatCurrency(b.monthlyTotal)}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            per month
          </p>
        </div>
      </div>

      {/* The arithmetic, in full. */}
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <Line
          label="Enterprise package"
          detail="The platform, every module"
          value={formatCurrency(b.baseMonthly)}
        />
        <Line
          label={`Staff logins — ${b.billableUsers} × ${formatCurrency(b.perUserMonthly)}`}
          detail="Your own people: owners, project managers, supervisors, foremen"
          value={formatCurrency(b.usersMonthly)}
        />
        <Line
          label={`Subcontractor logins — ${b.freeSubUsers}`}
          detail={`Across ${b.crews} ${b.crews === 1 ? "crew" : "crews"}. Never charged.`}
          value="Included"
          muted
        />
        <Line label="Monthly total" value={formatCurrency(b.monthlyTotal)} total />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Implementation" value={formatCurrency(b.implementationFee)} hint="once, on signing" />
        <Stat label="First invoice" value={formatCurrency(b.firstInvoice)} hint="implementation plus month one" />
        <Stat label="Annual run rate" value={formatCurrency(b.annualRunRate)} hint="at today's user count" />
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
        Adding a subcontractor crew, or any number of their people, does not change this figure.
        Only your own staff logins do.
      </p>
    </PanelBody>
  );
}

function Line({
  label,
  detail,
  value,
  total,
  muted,
}: {
  label: string;
  detail?: string;
  value: string;
  total?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-0 ${
        total ? "bg-foreground/[0.04]" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`text-[12.5px] ${total ? "font-semibold text-foreground" : "text-foreground"}`}
        >
          {label}
        </p>
        {detail ? <p className="text-[11.5px] text-muted-foreground">{detail}</p> : null}
      </div>
      <p
        className={`num shrink-0 text-[13px] ${
          total ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="num mt-0.5 text-[17px] font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
