"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Prospect, ProspectKind, ProspectStage } from "@/lib/types";
import { saveProspect } from "@/app/actions";

const KINDS: { value: ProspectKind; label: string; hint: string }[] = [
  { value: "Worker", label: "Worker", hint: "An individual we'd hire" },
  { value: "Crew", label: "Crew", hint: "A company that'd run production" },
  { value: "Prime", label: "Prime", hint: "A contractor we'd work for" },
];

const STAGES: ProspectStage[] = [
  "New",
  "Contacted",
  "Qualifying",
  "In discussion",
  "Won",
  "Lost",
  "Dormant",
];

/** Comma-separated in, clean array out — this is how the office actually types. */
const split = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function ProspectForm({
  prospect,
  knownStates,
  knownMarkets,
  onClose,
}: {
  prospect: Prospect | null;
  knownStates: string[];
  knownMarkets: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [kind, setKind] = React.useState<ProspectKind>(prospect?.kind ?? "Crew");
  const [stage, setStage] = React.useState<ProspectStage>(prospect?.stage ?? "New");
  const [name, setName] = React.useState(prospect?.name ?? "");
  const [contactName, setContactName] = React.useState(prospect?.contactName ?? "");
  const [contactRole, setContactRole] = React.useState(prospect?.contactRole ?? "");
  const [email, setEmail] = React.useState(prospect?.email ?? "");
  const [phone, setPhone] = React.useState(prospect?.phone ?? "");
  const [website, setWebsite] = React.useState(prospect?.website ?? "");
  const [city, setCity] = React.useState(prospect?.city ?? "");
  const [homeState, setHomeState] = React.useState(prospect?.homeState ?? "");
  const [states, setStates] = React.useState((prospect?.states ?? []).join(", "));
  const [markets, setMarkets] = React.useState((prospect?.markets ?? []).join(", "));
  const [trades, setTrades] = React.useState((prospect?.trades ?? []).join(", "));
  const [equipment, setEquipment] = React.useState((prospect?.equipment ?? []).join(", "));
  const [crewSize, setCrewSize] = React.useState(String(prospect?.crewSize ?? 0));
  const [rating, setRating] = React.useState(prospect?.rating ?? 0);
  const [source, setSource] = React.useState(prospect?.source ?? "");
  const [owner, setOwner] = React.useState(prospect?.owner ?? "");
  const [nextStep, setNextStep] = React.useState(prospect?.nextStep ?? "");
  const [nextStepDue, setNextStepDue] = React.useState(prospect?.nextStepDue ?? "");
  const [notes, setNotes] = React.useState(prospect?.notes ?? "");

  // Esc closes — a form this tall is easier to abandon than to scroll out of.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await saveProspect({
      id: prospect?.id,
      kind,
      stage,
      name,
      contactName,
      contactRole,
      email,
      phone,
      website,
      city,
      homeState,
      states: split(states),
      markets: split(markets),
      trades: split(trades),
      equipment: split(equipment),
      crewSize: Number(crewSize) || 0,
      rating,
      source,
      owner,
      nextStep,
      nextStepDue,
      notes,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  const isPrime = kind === "Prime";
  const isWorker = kind === "Worker";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="surface my-8 w-full max-w-2xl overflow-hidden rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <h2 className="text-[14px] font-semibold text-foreground">
            {prospect ? `Edit ${prospect.name}` : "Add a prospect"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto px-4 py-4">
          {/* Kind first — it changes which of the fields below matter. */}
          <div>
            <Label>Who is this?</Label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={cn(
                    "focus-ring rounded-lg border px-2 py-2 text-left transition",
                    kind === k.value
                      ? "border-brand/40 bg-brand/10"
                      : "border-border hover:bg-foreground/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "block text-[12.5px] font-semibold",
                      kind === k.value ? "text-brand" : "text-foreground",
                    )}
                  >
                    {k.label}
                  </span>
                  <span className="block text-[10.5px] leading-tight text-muted-foreground">
                    {k.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Row>
            <Field
              label={isWorker ? "Name" : "Company"}
              value={name}
              onChange={setName}
              required
              placeholder={isWorker ? "Walter Reyes" : "Reyes Underground Inc"}
            />
            <div>
              <Label>Stage</Label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as ProspectStage)}
                className="focus-ring mt-1 h-9 w-full rounded-lg border border-border bg-foreground/[0.04] px-2 text-[12.5px] text-foreground"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </Row>

          {!isWorker ? (
            <Row>
              <Field label="Contact" value={contactName} onChange={setContactName} placeholder="Who we talk to" />
              <Field label="Their role" value={contactRole} onChange={setContactRole} placeholder="Owner, PM…" />
            </Row>
          ) : null}

          <Row>
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="(864) 555-0134" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="name@company.com" />
          </Row>

          <Field
            label="Website"
            value={website}
            onChange={setWebsite}
            placeholder="reyesunderground.com"
          />

          <Row>
            <Field label="City" value={city} onChange={setCity} placeholder="Greenville" />
            <Field
              label="Home state"
              value={homeState}
              onChange={setHomeState}
              placeholder="SC"
              list="known-states"
            />
          </Row>
          <datalist id="known-states">
            {knownStates.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <Field
            label={isPrime ? "States they hold work in" : "States they'll work"}
            value={states}
            onChange={setStates}
            placeholder="SC, NC, GA"
            hint="Comma separated"
          />
          <Field
            label={isPrime ? "Markets they hold" : "Markets they want work in"}
            value={markets}
            onChange={setMarkets}
            placeholder="Greenville-Spartanburg, Atlanta Metro"
            hint="Comma separated"
            list="known-markets"
          />
          <datalist id="known-markets">
            {knownMarkets.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <Field
            label={isPrime ? "What they build" : "Trades"}
            value={trades}
            onChange={setTrades}
            placeholder="Directional bore, plow, fiber splice"
            hint="Comma separated"
          />

          {!isPrime ? (
            <Row>
              <Field
                label="Equipment"
                value={equipment}
                onChange={setEquipment}
                placeholder="D20x22, plow, mini-ex"
                hint="Comma separated"
              />
              <Field
                label={isWorker ? "Years experience" : "Crew size"}
                value={crewSize}
                onChange={setCrewSize}
                type="number"
              />
            </Row>
          ) : null}

          <Row>
            <Field label="Where we found them" value={source} onChange={setSource} placeholder="Referral, jobsite, cold call" />
            <Field label="Who owns this" value={owner} onChange={setOwner} placeholder="Sean" />
          </Row>

          <div>
            <Label>Rating</Label>
            <div className="mt-1 flex items-center gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(rating === i + 1 ? 0 : i + 1)}
                  className="focus-ring rounded p-0.5"
                  aria-label={`${i + 1} of 5`}
                >
                  <Star
                    className={cn(
                      "size-4",
                      i < rating ? "fill-warning text-warning" : "text-muted-foreground/40",
                    )}
                  />
                </button>
              ))}
              {rating > 0 ? (
                <button
                  type="button"
                  onClick={() => setRating(0)}
                  className="focus-ring ml-1 rounded text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {/* The next step is what stops a pipeline going quiet, so it sits in
              the form rather than being something you remember to add later. */}
          <Row>
            <Field label="Next step" value={nextStep} onChange={setNextStep} placeholder="Send the packet" />
            <Field label="Due" value={nextStepDue} onChange={setNextStepDue} type="date" />
          </Row>

          <div>
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything the office should know."
              className="focus-ring mt-1 w-full rounded-lg border border-border bg-foreground/[0.04] px-2.5 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {error ? <p className="text-[12px] text-critical">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring h-9 rounded-lg px-3 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="focus-ring h-9 rounded-lg bg-brand px-4 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy ? "Saving…" : prospect ? "Save changes" : "Add prospect"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
  required,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  required?: boolean;
  list?: string;
}) {
  return (
    <label className="block">
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      <input
        type={type}
        value={value}
        list={list}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="focus-ring mt-1 h-9 w-full rounded-lg border border-border bg-foreground/[0.04] px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground"
      />
      {hint ? <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
