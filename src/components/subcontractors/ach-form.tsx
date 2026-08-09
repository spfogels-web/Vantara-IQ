"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Camera,
  Check,
  Image as ImageIcon,
  Landmark,
  Loader2,
  Lock,
  PenLine,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { saveAchAuthorization, uploadSubDocument } from "@/app/actions";
import type { AchView } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * ACH authorisation — where a crew's money goes, signed.
 *
 * Three blocks, in the order somebody fills them: who is being paid, which
 * account, and the authorisation itself. The bank numbers are the only fields
 * on this form that are encrypted before they are stored, and they are the only
 * ones that never come back — an existing authorisation shows the last four and
 * nothing more.
 *
 * That is why the account fields are blank on an edit rather than pre-filled:
 * there is nothing to pre-fill them with, and leaving them blank keeps whatever
 * is stored, so fixing a typo in the address does not mean re-keying an account
 * number off a cheque.
 */

const input =
  "w-full rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand/60";

function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[10.5px] text-muted-foreground/80">{hint}</span> : null}
    </label>
  );
}

export function AchForm({
  subcontractorId,
  existing,
  existingProof,
  inviteToken,
  onSaved,
}: {
  subcontractorId: string;
  existing: AchView | null;
  /** Name of the voided cheque / statement already on file, if any. */
  existingProof?: string | null;
  inviteToken?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [proof, setProof] = React.useState<string | null>(existingProof ?? null);
  const [uploadingProof, setUploadingProof] = React.useState(false);
  const [proofError, setProofError] = React.useState<string | null>(null);
  const proofRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  async function uploadProof(file: File) {
    setUploadingProof(true);
    setProofError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("subcontractorId", subcontractorId);
    fd.set("section", "payment");
    if (inviteToken) fd.set("inviteToken", inviteToken);
    const res = await uploadSubDocument(fd);
    setUploadingProof(false);
    if (res.ok) setProof(res.doc.fileName);
    else setProofError(res.error ?? "That did not upload.");
  }

  const [f, setF] = React.useState({
    legalName: existing?.legalName ?? "",
    dba: existing?.dba ?? "",
    ein: existing?.ein ?? "",
    addressLine1: existing?.addressLine1 ?? "",
    addressLine2: existing?.addressLine2 ?? "",
    city: existing?.city ?? "",
    stateRegion: existing?.stateRegion ?? "",
    postalCode: existing?.postalCode ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    bankName: existing?.bankName ?? "",
    bankAddressLine1: existing?.bankAddressLine1 ?? "",
    bankCity: existing?.bankCity ?? "",
    bankStateRegion: existing?.bankStateRegion ?? "",
    bankPostalCode: existing?.bankPostalCode ?? "",
    accountType: existing?.accountType ?? "checking",
    accountNumber: "",
    routingNumber: "",
    signerName: existing?.signerName ?? "",
    signerTitle: existing?.signerTitle ?? "",
    signedDate: existing?.signedDate ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const sigRef = React.useRef<SignaturePadHandle>(null);
  const [hasSignature, setHasSignature] = React.useState(Boolean(existing?.signatureDataUrl));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    // Keep the stored signature if they didn't draw a new one.
    const drawn = sigRef.current?.toDataURL() ?? "";
    const signature = drawn || existing?.signatureDataUrl || "";

    setBusy(true);
    setError(null);
    const res = await saveAchAuthorization({
      subcontractorId,
      inviteToken,
      ...f,
      signatureDataUrl: signature,
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      onSaved?.();
      router.refresh();
      window.setTimeout(() => setSaved(false), 2500);
    } else {
      setError(res.error);
    }
  }

  const storable = existing?.canStore ?? true;

  return (
    <Panel>
      <PanelHeader
        title="ACH authorisation"
        description="Where Fortitude sends your payments, and your authorisation to send them"
        icon={<Landmark className="size-3.5" />}
      />

      <form onSubmit={submit}>
        {/* Who is being paid */}
        <PanelBody className="flex flex-col gap-3 border-b border-border/70">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Building2 className="size-3" /> Your company
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Legal business name" required>
              <input value={f.legalName} onChange={set("legalName")} placeholder="As it appears on your W-9" className={input} />
            </Field>
            <Field label="DBA / trading name">
              <input value={f.dba} onChange={set("dba")} placeholder="If different" className={input} />
            </Field>
            <Field label="EIN" required>
              <input value={f.ein} onChange={set("ein")} placeholder="12-3456789" className={cn(input, "num")} />
            </Field>
            <Field label="Phone">
              <input value={f.phone} onChange={set("phone")} placeholder="(864) 555-0100" className={cn(input, "num")} />
            </Field>
            <Field label="Street address" required className="sm:col-span-2">
              <input value={f.addressLine1} onChange={set("addressLine1")} placeholder="1 Main Street" className={input} />
            </Field>
            <Field label="Suite / unit" className="sm:col-span-2">
              <input value={f.addressLine2} onChange={set("addressLine2")} className={input} />
            </Field>
            <Field label="City" required>
              <input value={f.city} onChange={set("city")} className={input} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State" required>
                <input value={f.stateRegion} onChange={set("stateRegion")} placeholder="SC" className={cn(input, "uppercase")} />
              </Field>
              <Field label="ZIP" required>
                <input value={f.postalCode} onChange={set("postalCode")} placeholder="29601" className={cn(input, "num")} />
              </Field>
            </div>
            <Field label="Remittance email" hint="Where the payment advice goes" className="sm:col-span-2">
              <input value={f.email} onChange={set("email")} placeholder="ap@yourcompany.com" className={input} />
            </Field>
          </div>
        </PanelBody>

        {/* The account */}
        <PanelBody className="flex flex-col gap-3 border-b border-border/70">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Landmark className="size-3" /> Your bank
          </p>

          {/* Say plainly what happens to these two fields. Anyone typing an
              account number into a web form deserves to know. */}
          <p className="flex items-start gap-1.5 rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-2 text-[11px] text-muted-foreground">
            <Lock className="mt-px size-3 shrink-0 text-success" />
            <span>
              Your account and routing numbers are encrypted before they are stored and are never
              shown again — not to you here, and not to anyone at Fortitude except at the moment a
              payment is set up, which is recorded. Everything else on this form is ordinary
              business information.
            </span>
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bank name" required>
              <input value={f.bankName} onChange={set("bankName")} placeholder="First Citizens Bank" className={input} />
            </Field>
            <Field label="Account type" required>
              <select value={f.accountType} onChange={set("accountType")} className={cn(input, "appearance-none")}>
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
              </select>
            </Field>
            <Field label="Bank street address" className="sm:col-span-2">
              <input value={f.bankAddressLine1} onChange={set("bankAddressLine1")} placeholder="Branch address" className={input} />
            </Field>
            <Field label="Bank city">
              <input value={f.bankCity} onChange={set("bankCity")} className={input} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State">
                <input value={f.bankStateRegion} onChange={set("bankStateRegion")} className={cn(input, "uppercase")} />
              </Field>
              <Field label="ZIP">
                <input value={f.bankPostalCode} onChange={set("bankPostalCode")} className={cn(input, "num")} />
              </Field>
            </div>

            <Field
              label="Routing number"
              required={!existing}
              hint={
                existing?.routingLast4
                  ? `On file ending ${existing.routingLast4} — leave blank to keep it`
                  : "Nine digits, bottom-left of a cheque"
              }
            >
              <input
                value={f.routingNumber}
                onChange={set("routingNumber")}
                inputMode="numeric"
                autoComplete="off"
                placeholder={existing?.routingLast4 ? `•••••${existing.routingLast4}` : "021000021"}
                className={cn(input, "num")}
              />
            </Field>
            <Field
              label="Account number"
              required={!existing}
              hint={
                existing?.accountLast4
                  ? `On file ending ${existing.accountLast4} — leave blank to keep it`
                  : undefined
              }
            >
              <input
                value={f.accountNumber}
                onChange={set("accountNumber")}
                inputMode="numeric"
                autoComplete="off"
                placeholder={existing?.accountLast4 ? `••••••${existing.accountLast4}` : ""}
                className={cn(input, "num")}
              />
            </Field>
          </div>

          {!storable ? (
            <p className="text-[11.5px] text-warning">
              Bank details can&apos;t be stored on this environment yet — the encryption key isn&apos;t
              set. Everything else on this form saves; leave the two number fields blank for now.
            </p>
          ) : null}

          {/* Proof of the account, taken beside the numbers rather than filed
              separately. A transposed digit in a routing number is caught by
              its check digit; a transposed digit in an account number is not,
              and the only thing that catches it is a picture of the source. */}
          <div className="rounded-lg border border-border/70 bg-foreground/[0.02] p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground">
              <ImageIcon className="size-3.5 text-brand-bright" />
              Proof of account
              <span className="text-critical">*</span>
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              A photo of a voided check, or a screenshot from online banking showing the account
              number and the wire/routing details. Make sure the numbers are readable and nothing is
              cropped off — this is what we check the typed numbers against before paying you.
            </p>

            {proof ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-success/30 bg-success/[0.07] px-2.5 py-1.5 text-[11.5px] text-success">
                  <Check className="size-3.5 shrink-0" />
                  <span className="truncate">{proof}</span>
                </span>
                <button
                  type="button"
                  onClick={() => proofRef.current?.click()}
                  disabled={uploadingProof}
                  className="focus-ring rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Replace
                </button>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploadingProof}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40 sm:hidden"
                >
                  {uploadingProof ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                  Take a photo
                </button>
                <button
                  type="button"
                  onClick={() => proofRef.current?.click()}
                  disabled={uploadingProof}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
                >
                  {uploadingProof ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  Upload an image or PDF
                </button>
              </div>
            )}

            {/* Two inputs rather than one: `capture` asks the phone for the
                camera directly, which is what somebody standing at a truck
                wants, while the plain picker is what a desktop needs. */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadProof(file);
              }}
            />
            <input
              ref={proofRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadProof(file);
              }}
            />

            {proofError ? (
              <p className="mt-2 text-[11.5px] text-critical">{proofError}</p>
            ) : null}
          </div>
        </PanelBody>

        {/* The authorisation */}
        <PanelBody className="flex flex-col gap-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <PenLine className="size-3" /> Authorisation
          </p>

          <p className="rounded-lg border border-border/60 bg-foreground/[0.02] px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
            I authorise Fortitude Infrastructure LLC to send payments owed to the company named
            above by electronic transfer to the account given above, and if necessary to reverse an
            entry made in error. This authorisation stays in effect until I cancel it in writing
            with enough notice for Fortitude to act on it. I confirm I am authorised to bind the
            company and that the account details are correct.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Name of the person signing" required>
              <input value={f.signerName} onChange={set("signerName")} placeholder="Reggie Vance" className={input} />
            </Field>
            <Field label="Title">
              <input value={f.signerTitle} onChange={set("signerTitle")} placeholder="Owner" className={input} />
            </Field>
            <Field label="Date" required>
              <input type="date" value={f.signedDate} onChange={set("signedDate")} className={cn(input, "num")} />
            </Field>
          </div>

          <Field label="Signature" required>
            <SignaturePad
              ref={sigRef}
              existing={existing?.signatureDataUrl}
              onChange={(has) => setHasSignature(has)}
            />
          </Field>

          {error ? <p className="text-[12px] text-critical">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy || !hasSignature}
              title={hasSignature ? undefined : "Sign it first"}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              {existing ? "Update authorisation" : "Submit authorisation"}
            </button>
            {saved ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-success">
                <Check className="size-3.5" /> Saved
              </span>
            ) : null}
            {existing?.submittedAt ? (
              <span className="text-[11.5px] text-muted-foreground">
                On file since {existing.submittedAt}
                {existing.accountLast4 ? ` · account ending ${existing.accountLast4}` : ""}
              </span>
            ) : null}
          </div>
        </PanelBody>
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Signature pad.
 * ------------------------------------------------------------------ */

export interface SignaturePadHandle {
  /** Empty string when nothing has been drawn this session. */
  toDataURL: () => string;
  clear: () => void;
}

/**
 * Draw-to-sign, on a canvas.
 *
 * Pointer events rather than mouse or touch, so a finger, a stylus and a mouse
 * all work through one path — a crew signs this on a phone in a truck far more
 * often than at a desk.
 *
 * The canvas is sized to its own layout box times the device pixel ratio,
 * otherwise a signature drawn on a phone is stored at a third of the resolution
 * it looked like and comes back a blurry scrawl on the record.
 */
const SignaturePad = React.forwardRef<
  SignaturePadHandle,
  { existing?: string; onChange?: (hasInk: boolean) => void }
>(function SignaturePad({ existing, onChange }, ref) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const [inked, setInked] = React.useState(false);

  React.useImperativeHandle(ref, () => ({
    toDataURL: () => (inked ? (canvasRef.current?.toDataURL("image/png") ?? "") : ""),
    clear: () => {
      const c = canvasRef.current;
      if (!c) return;
      c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      setInked(false);
      onChange?.(false);
    },
  }));

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="relative overflow-hidden rounded-lg border border-border/70 bg-white">
        {/* The stored signature, until they draw a new one over it. */}
        {existing && !inked ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={existing} alt="Signature on file" className="pointer-events-none absolute inset-0 size-full object-contain" />
        ) : null}
        <canvas
          ref={canvasRef}
          className="relative block h-[120px] w-full touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d");
            if (!ctx) return;
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            drawing.current = true;
            if (!inked) {
              setInked(true);
              onChange?.(true);
            }
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d");
            if (!ctx) return;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerLeave={() => {
            drawing.current = false;
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const c = canvasRef.current;
            if (!c) return;
            c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
            setInked(false);
            onChange?.(Boolean(existing));
          }}
          className="focus-ring text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
        <span className="text-[10.5px] text-muted-foreground/80">
          {existing && !inked ? "Signature on file — draw to replace it" : "Sign with a finger, stylus or mouse"}
        </span>
      </div>
    </div>
  );
});
