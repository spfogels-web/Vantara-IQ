"use client";

import * as React from "react";
import { ImagePlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { addIncidentEvidence } from "@/app/incidents/incident-actions";

/**
 * Tagging the job's photographs to this incident.
 *
 * Not an uploader. The photographs are already in the project's evidence store,
 * put there by the crew or the office through the gallery that already exists,
 * and this marks which of them are evidence for this incident. Nothing is
 * copied and no file moves — which is what lets a pre-construction photograph
 * of a driveway sit beside the incident photograph of the same driveway
 * afterwards, instead of living in two systems that disagree.
 */
export function EvidencePicker({
  incidentId,
  photos,
}: {
  incidentId: string;
  photos: { id: string; url: string; caption: string; capturedAt: Date | null; incidentId: string | null }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Already on this incident, or on another one. Showing them greyed rather
  // than hiding them answers "where did that photo go" without a search.
  const available = photos.filter((p) => p.incidentId !== incidentId);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1.5 self-start rounded-lg border border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ImagePlus className="size-3.5" />
        Tag photographs as evidence
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
      <p className="text-[11.5px] text-muted-foreground">
        The job&rsquo;s photographs. Tick the ones that are evidence for this incident.
      </p>

      {available.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-muted-foreground">
          Nothing left to tag. Upload through Project evidence first.
        </p>
      ) : (
        <div className="grid max-h-[320px] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
          {available.map((p) => {
            const taken = p.incidentId !== null;
            const on = picked.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={taken}
                onClick={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  })
                }
                className={cn(
                  "focus-ring relative aspect-square overflow-hidden rounded border-2 transition-colors",
                  on ? "border-brand-bright" : "border-transparent",
                  taken && "opacity-35",
                )}
                title={taken ? "Already evidence for another incident" : p.caption}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || "Project photograph"} className="size-full object-cover" />
                {on ? (
                  <span className="absolute inset-0 bg-brand-bright/20" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {error ? <p className="text-[11.5px] text-critical">{error}</p> : null}

      <div className="flex gap-2">
        <button
          disabled={busy || picked.size === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await addIncidentEvidence({ incidentId, photoIds: [...picked] });
            setBusy(false);
            if (!res.ok) setError(res.error ?? "That did not work.");
            else {
              setPicked(new Set());
              setOpen(false);
            }
          }}
          className="focus-ring rounded-lg bg-foreground/[0.08] px-3 py-1.5 text-[12px] font-medium text-foreground disabled:opacity-40"
        >
          Tag {picked.size > 0 ? `${picked.size} ` : ""}as evidence
        </button>
        <button
          onClick={() => setOpen(false)}
          className="focus-ring px-2 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
