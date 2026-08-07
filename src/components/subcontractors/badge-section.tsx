"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Camera,
  Check,
  IdCard,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ALL_BADGE_DOCS,
  IDENTITY_DOCS,
  LICENSE_DOCS,
  badgeStatusLabel,
  type BadgeDocKind,
} from "@/lib/badge";
import type { CrewBadgeView } from "@/data/queries";
import {
  deleteBadgeDocument,
  deleteCrewBadge,
  reviewCrewBadge,
  saveCrewBadge,
  submitCrewBadge,
  uploadBadgeDocument,
} from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * Yard badges — the people cleared to collect material.
 *
 * The yard's question is narrow: is the person in front of me the person on the
 * list. So a badge carries a licence that can be held against a face, and one
 * document proving the name. Nothing else is asked for.
 *
 * The images live in the database, not the public Blob store, and reach this
 * component only through a query that has already checked who is asking.
 */

const TONE: Record<string, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  critical: "bg-critical/12 text-critical",
  info: "bg-info/12 text-info",
  muted: "bg-foreground/[0.06] text-muted-foreground",
};

export function BadgeSection({
  subcontractorId,
  badges,
  canReview,
  inviteToken,
}: {
  subcontractorId: string;
  badges: CrewBadgeView[];
  /** Fortitude staff clear or refuse a badge; a crew never clears its own. */
  canReview: boolean;
  inviteToken?: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("add");
    setError(null);
    const res = await saveCrewBadge({ subcontractorId, personName: name, phone, inviteToken });
    setBusy(null);
    if (res.ok) {
      setName("");
      setPhone("");
      setAdding(false);
      router.refresh();
    } else setError(res.error);
  }

  const cleared = badges.filter((b) => b.status === "APPROVED" && !b.readiness.expired).length;

  return (
    <Panel>
      <PanelHeader
        title="Yard badges"
        description="Who is cleared to collect material — a licence we can hold against a face, and one document proving the name"
        count={badges.length}
        icon={<IdCard className="size-3.5" />}
      >
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
        >
          <Plus className="size-3.5" /> Add person
        </button>
      </PanelHeader>

      {adding ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-b border-border/70 p-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Name</span>
            <input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="As printed on the licence"
              className="w-56 rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 py-1.5 text-[12.5px] text-foreground outline-none focus:border-brand/60"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
              className="num w-40 rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 py-1.5 text-[12.5px] text-foreground outline-none focus:border-brand/60"
            />
          </label>
          <button
            type="submit"
            disabled={busy === "add" || !name.trim()}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy === "add" ? <Loader2 className="size-3.5 animate-spin" /> : null} Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="focus-ring inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="border-b border-border/70 px-3 py-2 text-[12px] text-critical">{error}</p>
      ) : null}

      {badges.length === 0 ? (
        <PanelBody className="py-8 text-center">
          <IdCard className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Nobody on the pickup list yet. Add each person who will collect material from the yard.
          </p>
        </PanelBody>
      ) : (
        <>
          {cleared > 0 ? (
            <p className="border-b border-border/70 px-3 py-2 text-[11.5px] text-success">
              <BadgeCheck className="mr-1 inline size-3.5" />
              {cleared} {cleared === 1 ? "person is" : "people are"} cleared for pickup.
            </p>
          ) : null}
          <ul className="divide-y divide-border/40">
            {badges.map((b) => (
              <BadgeRow
                key={b.id}
                badge={b}
                canReview={canReview}
                inviteToken={inviteToken}
                onChanged={() => router.refresh()}
              />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function BadgeRow({
  badge: b,
  canReview,
  inviteToken,
  onChanged,
}: {
  badge: CrewBadgeView;
  canReview: boolean;
  inviteToken?: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [refusing, setRefusing] = React.useState(false);
  const [expires, setExpires] = React.useState(b.licenseExpires);

  const st = badgeStatusLabel(b.status, b.readiness);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok && res.error) setError(res.error);
    else onChanged();
  }

  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-foreground">{b.personName}</span>
        {b.phone ? <span className="num text-[11.5px] text-muted-foreground">{b.phone}</span> : null}
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", TONE[st.tone])}>
          {st.label}
        </span>

        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Licence expires
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            onBlur={() => {
              if (expires !== b.licenseExpires) {
                void run("exp", () =>
                  saveCrewBadge({
                    id: b.id,
                    subcontractorId: "",
                    personName: b.personName,
                    phone: b.phone,
                    licenseExpires: expires,
                    inviteToken,
                  }),
                );
              }
            }}
            className="num rounded border border-border/70 bg-foreground/[0.03] px-1.5 py-0.5 text-[11.5px] text-foreground outline-none focus:border-brand/60"
          />
        </label>

        <button
          type="button"
          onClick={() => void run("del", () => deleteCrewBadge(b.id, inviteToken))}
          disabled={Boolean(busy)}
          title="Remove this person and their documents"
          className="focus-ring grid size-7 place-items-center rounded border border-border/70 text-muted-foreground hover:border-critical/40 hover:text-critical"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Documents. Licence first — both sides — then one proof of name. */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LICENSE_DOCS.map((spec) => (
          <DocSlot key={spec.kind} badge={b} spec={spec} inviteToken={inviteToken} onChanged={onChanged} required />
        ))}
        {IDENTITY_DOCS.map((spec) => (
          <DocSlot
            key={spec.kind}
            badge={b}
            spec={spec}
            inviteToken={inviteToken}
            onChanged={onChanged}
            // Either satisfies the requirement, so neither is individually
            // demanded once the other is on file.
            required={!b.readiness.hasIdentity}
          />
        ))}
      </div>

      {b.readiness.missing.length > 0 ? (
        <p className="mt-1.5 text-[11.5px] text-warning">
          Still needed: {b.readiness.missing.join(", ")}.
        </p>
      ) : null}
      {b.readiness.expiringSoon && !b.readiness.expired ? (
        <p className="mt-1.5 text-[11.5px] text-warning">
          Licence expires within 30 days — get the replacement before it lapses.
        </p>
      ) : null}
      {b.reviewNote ? (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          <span className="font-medium">{b.reviewedBy || "Fortitude"}:</span> {b.reviewNote}
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-[11.5px] text-critical">{error}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!canReview && b.status !== "APPROVED" ? (
          <button
            type="button"
            disabled={!b.readiness.complete || Boolean(busy)}
            onClick={() => void run("submit", () => submitCrewBadge(b.id, inviteToken))}
            title={b.readiness.complete ? undefined : "Upload the documents above first"}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy === "submit" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Send for approval
          </button>
        ) : null}

        {canReview ? (
          <>
            <button
              type="button"
              disabled={!b.readiness.complete || Boolean(busy) || b.status === "APPROVED"}
              onClick={() => void run("ok", () => reviewCrewBadge(b.id, "APPROVED"))}
              title={b.readiness.complete ? undefined : "Documents are incomplete"}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-success/15 px-3 text-[12px] font-semibold text-success hover:bg-success/25 disabled:opacity-40"
            >
              {busy === "ok" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Clear for pickup
            </button>
            {refusing ? (
              <span className="inline-flex items-center gap-1">
                <input
                  value={note}
                  autoFocus
                  placeholder="Reason"
                  onChange={(e) => setNote(e.target.value)}
                  className="w-52 rounded border border-border/70 bg-foreground/[0.04] px-2 py-1 text-[12px] text-foreground outline-none focus:border-brand/60"
                />
                <button
                  type="button"
                  disabled={!note.trim() || Boolean(busy)}
                  onClick={() =>
                    void run("no", () =>
                      reviewCrewBadge(b.id, b.status === "APPROVED" ? "REVOKED" : "REJECTED", note),
                    )
                  }
                  className="focus-ring grid size-7 place-items-center rounded text-critical hover:bg-foreground/[0.06] disabled:opacity-40"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRefusing(false)}
                  className="focus-ring grid size-7 place-items-center rounded text-muted-foreground hover:bg-foreground/[0.06]"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setRefusing(true)}
                className="focus-ring inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-[12px] text-muted-foreground hover:border-critical/40 hover:text-critical"
              >
                {b.status === "APPROVED" ? "Revoke" : "Refuse"}
              </button>
            )}
          </>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One document slot — upload, and see it once it's there.
 *
 * The image renders straight from the row rather than through a URL, because
 * there is no URL: these never reach object storage.
 */
function DocSlot({
  badge,
  spec,
  required,
  inviteToken,
  onChanged,
}: {
  badge: CrewBadgeView;
  spec: { kind: BadgeDocKind; label: string; hint: string };
  required: boolean;
  inviteToken?: string;
  onChanged: () => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const doc = badge.documents.find((d) => d.kind === spec.kind);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("badgeId", badge.id);
    fd.set("kind", spec.kind);
    if (inviteToken) fd.set("inviteToken", inviteToken);
    const res = await uploadBadgeDocument(fd);
    setBusy(false);
    if (res.ok) onChanged();
    else setError(res.error);
  }

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void send(f);
        }}
      />

      {doc ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring block w-full overflow-hidden rounded-lg border border-success/30 text-left"
        >
          <span className="relative block aspect-[8/5] bg-foreground/[0.04]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doc.dataUrl} alt={spec.label} className="size-full object-cover" />
            <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-success text-white">
              <Check className="size-2.5" />
            </span>
          </span>
          <span className="block px-1.5 py-1 text-[10.5px] text-muted-foreground">{spec.label}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className={cn(
            "focus-ring flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-4 text-center transition",
            required ? "border-warning/40 hover:border-warning" : "border-border hover:border-brand/40",
          )}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Camera className="size-4 text-muted-foreground" />
          )}
          <span className="text-[10.5px] font-medium text-foreground">{spec.label}</span>
          <span className="text-[9.5px] text-muted-foreground/80">{spec.hint}</span>
        </button>
      )}

      {error ? <p className="mt-0.5 text-[10px] text-critical">{error}</p> : null}

      {open && doc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <p className="text-[12.5px] font-medium text-foreground">
                {spec.label}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  {badge.personName} · uploaded {doc.createdAt}
                </span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => ref.current?.click()}
                  className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
                >
                  <Upload className="size-3" /> Replace
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteBadgeDocument(doc.id, inviteToken);
                    setOpen(false);
                    onChanged();
                  }}
                  className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] text-muted-foreground hover:border-critical/40 hover:text-critical"
                >
                  <Trash2 className="size-3" /> Remove
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="focus-ring grid size-7 place-items-center rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doc.dataUrl} alt={spec.label} className="max-h-[70vh] w-full object-contain" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { ALL_BADGE_DOCS };
