"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  Send,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel } from "@/components/common/panel";
import { useBlobUpload } from "@/components/layout/org-provider";
import { captureFacts, looksLikeVideo } from "@/components/evidence/capture";
import { attachHoldEvidence, submitDocumentation } from "@/app/billing/hold-actions";
import type { DocumentationRequest } from "@/lib/types";

/**
 * What the office is waiting on from this crew, and the one screen to clear it.
 *
 * Written for a phone in a truck. Every card says the same four things in the
 * same order — which job, which day, which code and how much of it, and what to
 * send — because a crew reading this is standing somewhere with one hand free
 * and no interest in working out what the office meant.
 *
 * What is deliberately not here: the rate, the amount, the invoice, and any
 * figure the customer is charged. A crew needs to know the photograph is
 * missing. Telling them what the footage bills at tells them our margin on
 * their own work, and it would arrive on the screen they open every day.
 */
export function CrewDocumentationRequests({
  requests,
  compact = false,
}: {
  requests: DocumentationRequest[];
  /** The banner form, for the top of a page that is about something else. */
  compact?: boolean;
}) {
  const open = requests.filter((r) => r.status === "NEEDS_DOCUMENTATION");

  if (requests.length === 0) {
    if (compact) return null;
    return (
      <Panel>
        <div className="flex flex-col items-center gap-1.5 px-5 py-14 text-center">
          <CheckCircle2 className="size-6 text-success" />
          <p className="text-[14px] font-semibold text-foreground">Nothing outstanding</p>
          <p className="max-w-sm text-[12.5px] text-muted-foreground">
            The office is not waiting on documentation from you. Keep sending tick-mark photographs
            with your dailies and this page stays empty.
          </p>
        </div>
      </Panel>
    );
  }

  if (compact) {
    return (
      <Link
        href="/billing-readiness"
        className="focus-ring flex items-center gap-3 rounded-xl border border-critical/35 bg-critical/[0.08] px-4 py-3 transition-colors hover:bg-critical/[0.12]"
      >
        <AlertTriangle className="size-5 shrink-0 text-critical" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            Action required — {open.length || requests.length} thing
            {(open.length || requests.length) === 1 ? "" : "s"} the office needs
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {requests
              .slice(0, 3)
              .map((r) => `${r.code} on ${r.projectName}`)
              .join(" · ")}
            {requests.length > 3 ? ` · +${requests.length - 3} more` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-critical/15 px-2 py-1 text-[11.5px] font-semibold text-critical">
          Open
        </span>
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl border border-critical/35 bg-critical/[0.08] px-4 py-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-critical" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-foreground">
            Your work is approved. These quantities cannot be invoiced until the documentation is in.
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Nothing has been taken off your dailies and nothing has changed about what you are owed.
            Send what is listed on each card and the office takes it from there.
          </p>
        </div>
      </div>

      {requests.map((r) => (
        <RequestCard key={r.holdId} request={r} />
      ))}
    </div>
  );
}

function RequestCard({ request: r }: { request: DocumentationRequest }) {
  const router = useRouter();
  const blobUpload = useBlobUpload();
  const pickRef = React.useRef<HTMLInputElement>(null);
  const shootRef = React.useRef<HTMLInputElement>(null);

  const [sent, setSent] = React.useState<{ url: string }[]>(r.evidence);
  const [busy, setBusy] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const answered = r.status === "CREW_RESPONDED";

  /**
   * Upload, then tag the file to this request.
   *
   * The hold id is the only thing named. The project comes off the hold on the
   * server, so there is no field here that could put a photograph onto another
   * company's job.
   */
  async function add(files: FileList | null, source: "CAMERA" | "LIBRARY") {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    setBusy(list.length);
    for (const file of list) {
      try {
        const facts = await captureFacts(file, source);
        const blob = await blobUpload(
          `billing-docs/${r.holdId}/${Date.now()}-${file.name}`,
          file,
          { access: "public", handleUploadUrl: "/api/blob/upload" },
        );
        const saved = await attachHoldEvidence({
          holdId: r.holdId,
          url: blob.url,
          mediaType: file.type || "",
          sizeBytes: file.size,
          kind: looksLikeVideo(file) ? "VIDEO" : "PHOTO",
          source,
          capturedAt: facts.capturedAt,
          capturedAtSource: facts.capturedAtSource,
          lat: facts.lat,
          lng: facts.lng,
          accuracyM: facts.accuracyM,
          locationSource: facts.locationSource,
        }).catch(() => null);

        if (!saved?.ok) {
          setError(saved?.error ?? "That upload did not save. Try again.");
        } else {
          setSent((prev) => [...prev, { url: saved.url }]);
        }
      } catch {
        setError("Upload failed. Check your signal and try again.");
        break;
      } finally {
        setBusy((n) => Math.max(0, n - 1));
      }
    }
  }

  async function send() {
    setSaving(true);
    setError(null);
    const res = await submitDocumentation({ holdId: r.holdId, note }).catch(() => ({
      ok: false as const,
      error: "That didn't go through.",
    }));
    setSaving(false);
    if (!res.ok) return setError(res.error ?? "That didn't go through.");
    router.refresh();
  }

  return (
    <Panel>
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        {/* Which job, which day. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-semibold text-foreground">{r.projectName}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="num text-[12.5px] text-muted-foreground">{r.workDate}</span>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
              answered ? "bg-warning/15 text-warning" : "bg-critical/15 text-critical",
            )}
          >
            {answered ? <Clock className="size-3" /> : <AlertTriangle className="size-3" />}
            {answered ? "With the office" : "Action required"}
          </span>
        </div>

        {/* Which code, how much. Big, because it is what they have to match
            against their own sheet. */}
        <div className="flex items-baseline gap-2">
          <span className="num rounded bg-foreground/[0.06] px-2 py-1 text-[15px] font-bold tracking-tight text-foreground ring-1 ring-inset ring-foreground/[0.08]">
            {r.code}
          </span>
          <span className="num text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            {r.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[13px] font-medium text-muted-foreground">{r.unit}</span>
        </div>

        {/* Why it is not billing, and exactly what to send. */}
        <div className="rounded-lg border border-border/70 bg-foreground/[0.02] p-3">
          <p className="eyebrow">Why it is held</p>
          <p className="mt-0.5 text-[12.5px] font-medium text-foreground">
            {r.requirement || "Documentation required before billing"}
          </p>
          {r.missing.length ? (
            <>
              <p className="eyebrow mt-2.5">Send these</p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {r.missing.map((m) => (
                  <li key={m} className="flex items-start gap-2 text-[12.5px] text-foreground">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-critical" />
                    {m}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {r.note ? (
            <p className="mt-2.5 rounded border border-border/60 bg-foreground/[0.03] px-2 py-1.5 text-[12px] text-muted-foreground">
              From the office: {r.note}
            </p>
          ) : null}
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Asked {r.ageDays === 0 ? "today" : `${r.ageDays} day${r.ageDays === 1 ? "" : "s"} ago`}
          </p>
        </div>

        {/* What they have already sent. */}
        {sent.length ? (
          <div>
            <p className="eyebrow">Uploaded ({sent.length})</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {sent.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${s.url}-${i}`}
                  src={s.url}
                  alt={`Documentation ${i + 1}`}
                  className="size-16 rounded-lg border border-border object-cover"
                />
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="text-[12px] font-medium text-critical">{error}</p> : null}

        {answered ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-warning/25 bg-warning/[0.07] px-3 py-2 text-[12.5px] text-foreground">
            <Check className="size-4 shrink-0 text-warning" />
            Sent. The office is looking at it — you can add more if you have it.
          </p>
        ) : null}

        {/* Upload. Take photo first: on a phone that is the action, and a file
            picker is what somebody reaches for second. */}
        <div className="flex flex-wrap gap-2">
          <input
            ref={shootRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              void add(e.target.files, "CAMERA");
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={pickRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void add(e.target.files, "LIBRARY");
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => shootRef.current?.click()}
            disabled={busy > 0}
            className="brand-gradient focus-ring inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-white disabled:opacity-60 sm:flex-none"
          >
            {busy > 0 ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            Take photo
          </button>
          <button
            type="button"
            onClick={() => pickRef.current?.click()}
            disabled={busy > 0}
            className="focus-ring inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.05] disabled:opacity-60 sm:flex-none"
          >
            <ImagePlus className="size-4" /> Upload
          </button>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Anything the office should know (optional)"
          className="focus-ring w-full rounded-lg border border-border bg-transparent px-2.5 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
        />

        <button
          type="button"
          onClick={send}
          disabled={saving || (sent.length === 0 && !note.trim())}
          className="focus-ring inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 text-[13px] font-semibold text-success hover:bg-success/15 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {answered ? "Send an update" : "Send to the office"}
        </button>
        {sent.length === 0 && !note.trim() ? (
          <p className="text-[11.5px] text-muted-foreground">
            Add a photograph, or write what happened, before sending.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
