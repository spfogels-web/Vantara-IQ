"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import { ENTITY_TYPES, PAYMENT_METHODS, packetStatus } from "@/lib/vendor-packet";
import type { VendorPacketView } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { saveCrewContact, saveVendorPacket } from "@/app/actions";
import { CrewPeople, type CrewPerson } from "@/components/subcontractors/crew-people";

/**
 * The vendor packet — what a crew supplies before they can be given work.
 *
 * It mirrors the paper subcontractor agreement so a sub filling this in
 * recognises what they're being asked, and so the office isn't reconciling two
 * different sets of fields. Every value saves together; there is no per-field
 * autosave, because a half-saved banking block is worse than an unsaved one.
 *
 * Banking is the exception to "show what's stored": the routing and account
 * numbers come back masked and the inputs start empty. Typing a new number
 * replaces it; leaving it alone keeps what's on file. That means the real
 * number is never sent to a browser, so it can't leak through a cached page or
 * a screenshot of this form.
 */
export function VendorPacketForm({
  packet,
  people = [],
  canEdit = true,
}: {
  packet: VendorPacketView;
  /** Everyone at this crew, so a job alert can reach the right person. */
  people?: CrewPerson[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [f, setF] = React.useState(() => ({ ...packet }));
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = <K extends keyof VendorPacketView>(k: K, v: VendorPacketView[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  const status = React.useMemo(
    () => packetStatus({ ...f, emr: f.emr ? Number(f.emr) : null }),
    [f],
  );

  async function submit(auto = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await saveVendorPacket(packet.id, {
        ...f,
      });
      if (res.ok) {
        setSaved(true);
        // A refresh mid-sentence re-renders the form under the cursor, so an
        // autosave stays quiet and the reconcile waits for a deliberate save.
        if (!auto) router.refresh();
      } else {
        setError(res.error ?? "Could not save.");
      }
    } catch {
      setError("Could not save.");
    }
    setBusy(false);
  }

  /**
   * Save as they type.
   *
   * The form used to save only on a button somebody had to find, at the top of
   * a long page, while they typed at the bottom of it — so a crew filled the
   * whole thing in, navigated away, and lost it. Typing is the intent to
   * record something; it should not need confirming.
   *
   * Held back until they stop typing, and skipped while the one required field
   * is empty, so a half-typed name never overwrites a good one and the
   * "required" complaint waits until somebody actually tries to finish.
   */
  /**
   * Write who they are, on its own, straight away.
   *
   * The autosave above is gated on a legal business name, so a crew who typed
   * their name, number and email and then stopped at the EIN saved absolutely
   * nothing — and there was no way to ring and ask what stopped them. This
   * does not wait for the rest of the form to be valid, because a phone number
   * is worth keeping whether or not the packet is ever finished.
   */
  async function saveContact(extra?: { smsConsent?: boolean }) {
    if (!canEdit) return;
    try {
      await saveCrewContact(packet.id, {
        lead: f.lead,
        email: f.email,
        phone: f.phone,
        ...(extra ?? {}),
      });
    } catch {
      // Silent. The full save reports its own failures, and a blur is not a
      // moment to interrupt somebody mid-form.
    }
  }

  const save = React.useRef(submit);
  save.current = submit;
  const mounted = React.useRef(false);

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!canEdit || !f.legalName?.trim()) return;
    const t = window.setTimeout(() => void save.current(true), 900);
    return () => window.clearTimeout(t);
  }, [f, canEdit]);

  return (
    <div className="flex flex-col gap-3">
      {/* What's still outstanding, stated before the form rather than after a
          failed save. */}
      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">
              {status.complete ? "Packet complete" : "Packet incomplete"}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {status.complete
                ? "Everything required is on file. Fortitude reviews it from here."
                : `Still needed before you can be assigned work: ${status.blocking.join(", ")}.`}
            </p>
            {status.complete && status.optional.length > 0 ? (
              <p className="mt-1 text-[11.5px] text-muted-foreground/80">
                Not required, but asked for: {status.optional.join(", ")}.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {/* Says which of the three states it is in, because "did that go
                in?" is the whole question autosave has to answer out loud. */}
            {busy ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Saving…
              </span>
            ) : saved ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
                <Check className="size-3.5" /> Saved
              </span>
            ) : (
              <span className="text-[11.5px] text-muted-foreground/80">
                Saves as you type
              </span>
            )}
            <Button
              onClick={() => void submit()}
              disabled={busy || !canEdit}
              className="brand-gradient h-9 gap-1.5 rounded-lg px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {busy ? "Saving…" : "Save packet"}
            </Button>
          </div>
        </PanelBody>
        {error ? (
          <p className="border-t border-critical/25 bg-critical/[0.06] px-4 py-2.5 text-[12px] text-critical sm:px-5">
            {error}
          </p>
        ) : null}
      </Panel>

      {/* First, and saved on its own.
          Everything below this writes in one go when Save packet is pressed,
          which is right for a banking block and wrong for the three fields
          that say who you are: a crew who started the form and gave up at the
          EIN left nothing behind, and nobody could ring to ask what stopped
          them. These write the moment you leave the field. */}
      <Section
        title="Who you are"
        hint="Saved as soon as you type it, so we can reach you even if you finish the rest later"
      >
        <Field
          label="Your name"
          required
          value={f.lead}
          onChange={(v) => set("lead", v)}
          onBlur={() => void saveContact()}
        />
        <Field
          label="Mobile phone"
          required
          value={f.phone}
          onChange={(v) => set("phone", v)}
          onBlur={() => void saveContact()}
        />
        <Field
          label="Email"
          required
          value={f.email}
          onChange={(v) => set("email", v)}
          onBlur={() => void saveContact()}
        />

        {/* Consent sits with the number it is about, and is kept the moment it
            is ticked — someone who agrees and then closes the tab has still
            agreed. */}
        <label className="flex items-start gap-2.5 rounded-xl border border-border bg-foreground/[0.02] p-3 sm:col-span-2">
          <input
            type="checkbox"
            checked={f.smsConsent}
            onChange={(e) => {
              set("smsConsent", e.target.checked);
              void saveContact({ smsConsent: e.target.checked });
            }}
            className="mt-0.5 size-4 shrink-0 accent-[var(--vq-blue)]"
          />
          <span className="text-[12.5px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Text me job alerts.</span> I agree to
            receive operational text messages from Vantara IQ at the mobile number above —
            work assignments, priorities and due dates, schedule changes, project updates,
            daily sheet status, and invoice and payment updates. Message frequency varies.
            Message and data rates may apply. Reply STOP to opt out or HELP for help. SMS
            consent is not required to register, use Vantara IQ, or receive work.
          </span>
        </label>

        <CrewPeople
          subcontractorId={packet.id}
          initial={people}
          canEdit={canEdit}
        />
      </Section>

      <Section title="Business identity" hint="As it appears on your W-9">
        <Field label="Legal business name" required value={f.legalName} onChange={(v) => set("legalName", v)} />
        <Field label="DBA / trading name" value={f.dba} onChange={(v) => set("dba", v)} />
        <Select label="Entity type" required value={f.entityType} onChange={(v) => set("entityType", v)} options={ENTITY_TYPES} />
        <Field label="State of incorporation" value={f.stateOfIncorporation} onChange={(v) => set("stateOfIncorporation", v)} />
        <Field label="EIN" required value={f.ein} onChange={(v) => set("ein", v)} placeholder="12-3456789" />
        <Field label="Website" value={f.website} onChange={(v) => set("website", v)} />
      </Section>

      <Section title="Business address">
        <Field label="Street address" required value={f.addressLine1} onChange={(v) => set("addressLine1", v)} className="sm:col-span-2" />
        <Field label="Suite / unit" value={f.addressLine2} onChange={(v) => set("addressLine2", v)} />
        <Field label="City" required value={f.city} onChange={(v) => set("city", v)} />
        <Field label="State" required value={f.stateRegion} onChange={(v) => set("stateRegion", v)} />
        <Field label="ZIP" required value={f.postalCode} onChange={(v) => set("postalCode", v)} />
        <Field
          label="Office phone"
          required
          value={f.phone}
          onChange={(v) => set("phone", v)}
        />
        <Field label="Mobile phone" value={f.mobilePhone} onChange={(v) => set("mobilePhone", v)} />
        <Field label="Emergency contact" value={f.emergencyContactName} onChange={(v) => set("emergencyContactName", v)} />
        <Field label="Emergency phone" value={f.emergencyContactPhone} onChange={(v) => set("emergencyContactPhone", v)} />

      </Section>

      <Section title="Who signs" hint="Authorised to bind the company to a contract">
        <Field label="Authorised representative" required value={f.signatoryName} onChange={(v) => set("signatoryName", v)} />
        <Field label="Title" value={f.signatoryTitle} onChange={(v) => set("signatoryTitle", v)} />
      </Section>

      <Section
        title="Billing contact"
        hint="Every invoice, daily, as-built and payment query goes through this person"
      >
        <Field label="Billing contact name" value={f.billingContactName} onChange={(v) => set("billingContactName", v)} />
        <Field label="Title / position" value={f.billingContactTitle} onChange={(v) => set("billingContactTitle", v)} />
        <Field label="Company email" value={f.billingEmail} onChange={(v) => set("billingEmail", v)} />
        <Field label="Mobile" value={f.billingMobile} onChange={(v) => set("billingMobile", v)} />
        <Field label="Office phone" value={f.billingOfficePhone} onChange={(v) => set("billingOfficePhone", v)} />
        <Field label="Mailing address" value={f.billingMailingAddress} onChange={(v) => set("billingMailingAddress", v)} className="sm:col-span-2" />
      </Section>

      <Section title="How you get paid">
        <Select label="Payment method" required value={f.paymentMethod} onChange={(v) => set("paymentMethod", v)} options={PAYMENT_METHODS} />
        <Field label="Payment terms" value={f.paymentTerms} onChange={(v) => set("paymentTerms", v)} placeholder="Net 21" />
        <Field label="Remittance email" required value={f.remittanceEmail} onChange={(v) => set("remittanceEmail", v)} />
      </Section>

      <Section title="Licensing" hint="Leave blank anything that doesn't apply to your operation">
        <Field label="Contractor licence" value={f.contractorLicense} onChange={(v) => set("contractorLicense", v)} />
        <Field label="DOT number" value={f.dotNumber} onChange={(v) => set("dotNumber", v)} />
        <Field label="Locate certification" value={f.locateCert} onChange={(v) => set("locateCert", v)} />
      </Section>

      <Section title="Safety record">
        <Field label="EMR" value={f.emr} onChange={(v) => set("emr", v)} placeholder="0.87" />
        <Field label="OSHA recordables (last 12 months)" value={f.oshaRecordables} onChange={(v) => set("oshaRecordables", v)} />
        <Field label="Safety contact" value={f.safetyContact} onChange={(v) => set("safetyContact", v)} />
      </Section>

      <References
        refs={f.references}
        onChange={(references) => set("references", references)}
      />
    </div>
  );
}

/* ---- pieces --------------------------------------------------------------- */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <PanelHeader title={title} description={hint} />
      <PanelBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</PanelBody>
    </Panel>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-foreground/[0.03] px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand/50 focus:bg-brand/[0.04]";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
      {children}
      {required ? <span className="ml-0.5 text-warning">*</span> : null}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  className,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  /** Fired when they leave the field — used to write contact details early. */
  onBlur?: () => void;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <Label required={required}>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <Label required={required}>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function References({
  refs,
  onChange,
}: {
  refs: { company: string; contact: string; phone: string; email: string }[];
  onChange: (r: { company: string; contact: string; phone: string; email: string }[]) => void;
}) {
  const rows = refs.length >= 2 ? refs : [...refs, ...Array(2 - refs.length).fill({ company: "", contact: "", phone: "", email: "" })];

  const edit = (i: number, key: string, v: string) =>
    onChange(rows.map((r, j) => (i === j ? { ...r, [key]: v } : r)));

  return (
    <Panel>
      <PanelHeader
        title="References"
        description="Two contractors you've worked for — we call them before the first assignment"
      />
      <PanelBody className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label={`Company ${i + 1}`} value={r.company} onChange={(v) => edit(i, "company", v)} />
            <Field label="Contact" value={r.contact} onChange={(v) => edit(i, "contact", v)} />
            <Field label="Phone" value={r.phone} onChange={(v) => edit(i, "phone", v)} />
            <Field label="Email" value={r.email} onChange={(v) => edit(i, "email", v)} />
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...rows, { company: "", contact: "", phone: "", email: "" }])}
          className="focus-ring self-start rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Add another reference
        </button>
      </PanelBody>
    </Panel>
  );
}

export function PacketGate({ blocking }: { blocking: string[] }) {
  if (blocking.length === 0) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-[12px] text-foreground">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span>Vendor packet incomplete: {blocking.join(", ")}.</span>
    </p>
  );
}
