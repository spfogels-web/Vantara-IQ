"use client";

import * as React from "react";
import {
  Building2,
  Check,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  Search,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import type { Customer } from "@/lib/types";
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  initials,
} from "@/lib/format";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { CustomerBilling } from "@/components/customers/customer-billing";

export function CustomersView({ customers }: { customers: Customer[] }) {
  const [list, setList] = React.useState(customers);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(customers[0]?.id ?? null);
  const [adding, setAdding] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q),
    );
  }, [list, query]);

  const selected = list.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  function handleCreate(c: Customer) {
    setList((prev) => [c, ...prev]);
    setSelectedId(c.id);
    setAdding(false);
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Directory */}
      <div className="lg:col-span-5 xl:col-span-4">
        <Panel>
          <PanelHeader
            title="Directory"
            count={filtered.length}
            icon={<Building2 className="size-3.5" />}
          >
            <Button
              size="sm"
              onClick={() => setAdding(true)}
              className="h-8 gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </PanelHeader>

          <div className="border-b border-border/70 p-2.5">
            <label className="flex items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 py-1.5 ring-1 ring-inset ring-foreground/[0.06] focus-within:ring-brand/40">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers…"
                className="w-full bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </label>
          </div>

          <ul className="max-h-[70vh] flex-1 overflow-y-auto p-1.5">
            {filtered.map((c) => {
              const s = toneStyles[c.logoTint];
              const active = selected?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "focus-ring flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                      active ? "bg-foreground/[0.055]" : "hover:bg-foreground/[0.03]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-semibold ring-1 ring-inset",
                        s.bg,
                        s.text,
                        s.border,
                      )}
                    >
                      {c.shortCode}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {c.name}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <MapPin className="size-3" />
                        {c.location}
                        <span className="text-muted-foreground/40">·</span>
                        {c.industry}
                      </span>
                    </span>
                    <span className="num shrink-0 text-right text-[11.5px] font-medium text-muted-foreground">
                      {c.contractValue > 0 ? formatCompactCurrency(c.contractValue) : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {/* Detail / add form */}
      <div className="lg:col-span-7 xl:col-span-8">
        {adding ? (
          <AddCustomerForm onCancel={() => setAdding(false)} onCreate={handleCreate} />
        ) : selected ? (
          <CustomerDetail customer={selected} />
        ) : (
          <Panel className="items-center justify-center py-24 text-center text-[13px] text-muted-foreground">
            No customer selected
          </Panel>
        )}
      </div>
    </div>
  );
}

function CustomerDetail({ customer: c }: { customer: Customer }) {
  const billedPct = c.contractValue > 0 ? c.billedToDate / c.contractValue : 0;

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <PanelBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-3">
            <span
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-xl text-[15px] font-semibold ring-1 ring-inset",
                toneStyles[c.logoTint].bg,
                toneStyles[c.logoTint].text,
                toneStyles[c.logoTint].border,
              )}
            >
              {c.shortCode}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
                  {c.name}
                </h2>
                <StatusPill label={c.status} tone={c.tone} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {c.location}
                </span>
                <span className="text-muted-foreground/40">·</span>
                {c.industry}
                <span className="text-muted-foreground/40">·</span>
                Customer since {c.since}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12.5px] text-muted-foreground hover:text-foreground"
            >
              Edit
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Contract value" value={c.contractValue > 0 ? formatCompactCurrency(c.contractValue) : "—"} />
            <MiniStat label="Billed to date" value={c.billedToDate > 0 ? formatCompactCurrency(c.billedToDate) : "—"} hint={c.contractValue > 0 ? formatPercent(billedPct) : undefined} />
            <MiniStat label="Open AR" value={c.openAr > 0 ? formatCompactCurrency(c.openAr) : "—"} tone={c.openAr > 0 ? "text-warning" : undefined} />
            <MiniStat label="Avg days to pay" value={c.avgDaysToPay > 0 ? String(c.avgDaysToPay) : "—"} />
          </div>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* Contacts */}
        <Panel>
          <PanelHeader title="Contacts" count={c.contacts.length} icon={<Mail className="size-3.5" />} action="Add contact" />
          <ul className="flex-1 p-2">
            {c.contacts.length === 0 ? (
              <li className="px-2.5 py-6 text-center text-[12.5px] text-muted-foreground">
                No contacts on file yet.
              </li>
            ) : (
              c.contacts.map((contact) => (
                <li
                  key={contact.email}
                  className="flex items-start gap-3 rounded-lg px-2.5 py-2.5 hover:bg-foreground/[0.03]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                    {initials(contact.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground">{contact.name}</span>
                      {contact.primary ? (
                        <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-bright">
                          Primary
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11.5px] text-muted-foreground">{contact.title}</p>
                    <div className="mt-1 flex flex-col gap-0.5">
                      <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-brand-bright">
                        <Mail className="size-3" /> {contact.email}
                      </a>
                      <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-brand-bright">
                        <Phone className="size-3" /> {contact.phone}
                      </a>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Panel>

        {/* Billing rules */}
        <Panel>
          <PanelHeader title="Billing rules" icon={<Receipt className="size-3.5" />} />
          <PanelBody className="flex flex-col gap-2.5">
            <RuleRow label="AP / billing email" value={c.billingEmail} mono />
            <RuleRow label="Payment terms" value={c.paymentTerms} />
            <RuleRow label="Retainage" value={formatPercent(c.retainagePct)} />
            <RuleRow label="Invoice minimum" value={c.invoiceMinimum > 0 ? formatCurrency(c.invoiceMinimum) : "—"} />
            <RuleRow label="Active projects" value={String(c.activeProjects)} />
            {c.notes ? (
              <div className="mt-1 rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
                <p className="eyebrow mb-1">Notes</p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">{c.notes}</p>
              </div>
            ) : null}
          </PanelBody>
        </Panel>
      </div>

      {/* Contract, documents & live editable rate card */}
      <CustomerBilling customerId={c.id} />
    </div>
  );
}

function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-foreground/[0.02] px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-0.5 text-[16px] font-semibold tracking-[-0.02em] text-foreground", tone)}>{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint} complete</p> : null}
    </div>
  );
}

function RuleRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cn("text-[12.5px] font-medium text-foreground", mono && "num")}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Add-customer form — captures the identity a new account needs. It
 * writes to local state today; the same payload becomes an insert once
 * the database is wired.
 * ------------------------------------------------------------------ */

function AddCustomerForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (c: Customer) => void;
}) {
  const [form, setForm] = React.useState({
    name: "",
    shortCode: "",
    industry: "Telecom" as Customer["industry"],
    location: "",
    contactName: "",
    contactTitle: "",
    contactEmail: "",
    contactPhone: "",
    billingEmail: "",
    paymentTerms: "Net 30",
    retainagePct: "10",
    invoiceMinimum: "5000",
    notes: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const canSave = form.name.trim() && form.contactEmail.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const industryTone: Record<Customer["industry"], Customer["tone"]> = {
      Telecom: "info",
      Power: "warning",
      Water: "success",
      Gas: "critical",
    };
    onCreate({
      id: `cust-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: form.name.trim(),
      shortCode: (form.shortCode || form.name.slice(0, 3)).toUpperCase(),
      industry: form.industry,
      tone: industryTone[form.industry],
      status: "Prospect",
      logoTint: industryTone[form.industry],
      location: form.location.trim() || "—",
      contacts: [
        {
          name: form.contactName.trim() || "—",
          title: form.contactTitle.trim() || "—",
          email: form.contactEmail.trim(),
          phone: form.contactPhone.trim() || "—",
          primary: true,
        },
      ],
      billingEmail: form.billingEmail.trim() || "—",
      paymentTerms: form.paymentTerms,
      retainagePct: (Number(form.retainagePct) || 0) / 100,
      invoiceMinimum: Number(form.invoiceMinimum) || 0,
      activeProjects: 0,
      contractValue: 0,
      billedToDate: 0,
      openAr: 0,
      avgDaysToPay: 0,
      rateSheet: [],
      notes: form.notes.trim(),
      since: "2026",
    });
  }

  return (
    <Panel>
      <PanelHeader title="New customer" description="Capture the account identity — billing rules and rate sheet can be added after." icon={<Plus className="size-3.5" />}>
        <button onClick={onCancel} className="focus-ring rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Cancel">
          <X className="size-4" />
        </button>
      </PanelHeader>
      <form onSubmit={submit}>
        <PanelBody className="flex flex-col gap-4">
          <Fieldset legend="Company">
            <Field label="Company name" required>
              <Input value={form.name} onChange={set("name")} placeholder="Windstream Communications" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Short code">
                <Input value={form.shortCode} onChange={set("shortCode")} placeholder="WIN" />
              </Field>
              <Field label="Industry">
                <Select value={form.industry} onChange={set("industry")}>
                  <option>Telecom</option>
                  <option>Power</option>
                  <option>Water</option>
                  <option>Gas</option>
                </Select>
              </Field>
            </div>
            <Field label="Location">
              <Input value={form.location} onChange={set("location")} placeholder="Little Rock, AR" />
            </Field>
          </Fieldset>

          <Fieldset legend="Primary contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={form.contactName} onChange={set("contactName")} placeholder="Rachel Okafor" />
              </Field>
              <Field label="Title">
                <Input value={form.contactTitle} onChange={set("contactTitle")} placeholder="Construction Manager" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" required>
                <Input type="email" value={form.contactEmail} onChange={set("contactEmail")} placeholder="name@company.com" />
              </Field>
              <Field label="Phone">
                <Input value={form.contactPhone} onChange={set("contactPhone")} placeholder="(501) 555-0142" />
              </Field>
            </div>
          </Fieldset>

          <Fieldset legend="Billing rules">
            <Field label="AP / billing email">
              <Input type="email" value={form.billingEmail} onChange={set("billingEmail")} placeholder="ap@company.com" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Payment terms">
                <Select value={form.paymentTerms} onChange={set("paymentTerms")}>
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Net 60</option>
                </Select>
              </Field>
              <Field label="Retainage %">
                <Input value={form.retainagePct} onChange={set("retainagePct")} inputMode="decimal" />
              </Field>
              <Field label="Invoice min ($)">
                <Input value={form.invoiceMinimum} onChange={set("invoiceMinimum")} inputMode="numeric" />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={set("notes")} placeholder="Billing cadence, documentation requirements, special terms…" />
            </Field>
          </Fieldset>
        </PanelBody>

        <div className="mt-auto flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} className="h-9 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12.5px] text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSave} className="h-9 gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40">
            <Check className="size-3.5" /> Create customer
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="eyebrow mb-1">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

function Input(props: React.ComponentProps<"input">) {
  return <input {...props} className={inputClass} />;
}
function Select(props: React.ComponentProps<"select">) {
  return <select {...props} className={cn(inputClass, "appearance-none")} />;
}
function Textarea(props: React.ComponentProps<"textarea">) {
  return <textarea {...props} rows={3} className={cn(inputClass, "resize-none")} />;
}
