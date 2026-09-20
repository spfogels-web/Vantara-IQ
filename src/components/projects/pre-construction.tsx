"use client";

/**
 * What the route looked like before anybody touched it.
 *
 * This section exists for one conversation. Three weeks after the crew has
 * gone, a homeowner rings up and says the bore rig cracked their driveway.
 * What decides that conversation is whether somebody photographed the driveway
 * beforehand, and whether the time and place on that photograph can be
 * accounted for. Nothing else in the application is worth as much per minute
 * spent as the ten minutes a crew spends here.
 *
 * So the section is built to be used at walking pace, one-handed, on a phone,
 * by somebody who would rather be boring. Marking existing damage is one tap —
 * not a form — because a crew that has to fill in a form will photograph the
 * cracked driveway and say nothing about the crack.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Upload,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useBlobUpload } from "@/components/layout/org-provider";
import { captureFacts, looksLikeVideo } from "@/components/evidence/capture";
import { classifyEvidence, notePreConStarted, saveDailyEvidence, setPreConStatus } from "@/app/evidence-actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/** What a baseline photograph is usually of. Ordered by how often it is used. */
const CATEGORIES = [
  ["DRIVEWAY", "Driveway"],
  ["CURB_SIDEWALK", "Curb / sidewalk"],
  ["LANDSCAPING_LAWN", "Landscaping / lawn"],
  ["IRRIGATION", "Irrigation"],
  ["MAILBOX", "Mailbox"],
  ["FENCE", "Fence"],
  ["ROAD_SHOULDER", "Road / shoulder"],
  ["DRAINAGE", "Drainage"],
  ["UTILITY_PEDESTAL", "Utility pedestal"],
  ["GENERAL_ROUTE", "General route"],
] as const;

const STATUS_LABEL = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Documented",
} as const;

export function PreConstruction({
  projectId,
  status,
  completedBy,
  completedAt,
  count,
  canComplete,
}: {
  projectId: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  completedBy: string;
  completedAt: string | null;
  /** How many baseline photographs the route already has. */
  count: number;
  /** Saying a route is documented is an office decision, not a field one. */
  canComplete: boolean;
}) {
  const router = useRouter();
  const blobUpload = useBlobUpload();
  const shootRef = React.useRef<HTMLInputElement>(null);
  const pickRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLInputElement>(null);

  /**
   * What the next shots are of, and whether they show damage that was already
   * there. Set before shooting rather than after, because a crew walking a
   * route will not come back and reclassify forty photographs.
   */
  const [category, setCategory] = React.useState<string>("GENERAL_ROUTE");
  const [damage, setDamage] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [marking, setMarking] = React.useState(false);

  async function add(files: FileList | null, source: "CAMERA" | "LIBRARY") {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    setBusy(list.length);

    let failed = 0;
    for (const file of list) {
      try {
        const facts = await captureFacts(file, source);
        const blob = await blobUpload(
          `project-photos/${projectId}/${Date.now()}-${file.name}`,
          file,
          { access: "public", handleUploadUrl: "/api/blob/upload" },
        );

        const saved = await saveDailyEvidence({
          projectId,
          // Baseline evidence belongs to the route, not to any day's work.
          // A daily would be the wrong parent and a false one.
          dailySheetId: null,
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
        });

        if (!saved.ok) {
          failed += 1;
          continue;
        }

        // Written as a work record first, then classified — one path into the
        // table, so a baseline photograph and a production photograph are the
        // same kind of thing with a different label on it.
        await classifyEvidence(saved.id, {
          stage: "PRE_CONSTRUCTION",
          category,
          existingDamage: damage,
          damageNote: damage ? note.trim() : "",
        });
      } catch {
        failed += 1;
      }
      setBusy((n) => n - 1);
    }

    setBusy(0);
    if (failed) {
      setError(
        failed === list.length
          ? "Nothing uploaded. Check your signal and try again."
          : `${failed} of ${list.length} didn't upload. The rest are saved.`,
      );
    }
    // The route is being documented; that much is simply true now.
    if (status === "NOT_STARTED") await notePreConStarted(projectId).catch(() => undefined);
    router.refresh();
  }

  async function mark(next: "IN_PROGRESS" | "COMPLETE") {
    setMarking(true);
    await setPreConStatus(projectId, next).catch(() => undefined);
    setMarking(false);
    router.refresh();
  }

  const done = status === "COMPLETE";

  return (
    <Panel>
      <input
        ref={shootRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void add(e.target.files, "CAMERA");
          e.target.value = "";
        }}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files, "LIBRARY");
          e.target.value = "";
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          void add(e.target.files, "LIBRARY");
          e.target.value = "";
        }}
      />

      <PanelHeader
        title="Pre-construction documentation"
        description="What the route looked like before the crew touched it"
        count={count}
        icon={<ClipboardList className="size-3.5" />}
      >
        <button
          type="button"
          onClick={() => shootRef.current?.click()}
          disabled={busy > 0}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
        >
          {busy > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          Take photo
        </button>
        <button
          type="button"
          onClick={() => pickRef.current?.click()}
          disabled={busy > 0}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
        >
          <Upload className="size-3.5" /> Upload photos
        </button>
        <button
          type="button"
          onClick={() => videoRef.current?.click()}
          disabled={busy > 0}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
        >
          <Video className="size-3.5" /> Upload video
        </button>
      </PanelHeader>

      {/* Why it is worth ten minutes. Said once, here, where somebody deciding
          whether to bother is standing. */}
      <div className="border-b border-border/70 bg-foreground/[0.02] px-3 py-2">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Photograph driveways, curbs, mailboxes, irrigation and landscaping{" "}
          <strong className="font-semibold text-foreground">before work starts</strong> — and
          anything already cracked, sunken or broken. When a homeowner calls three weeks later,
          this is the record that answers them.
        </p>
      </div>

      <PanelBody className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Next shots are
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="What the next photographs are of"
            className="focus-ring h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground"
          >
            {CATEGORIES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>

          {/* One tap. A crew that has to fill in a form to flag a crack will
              photograph the crack and say nothing about it. */}
          <button
            type="button"
            onClick={() => setDamage((v) => !v)}
            aria-pressed={damage}
            className={cn(
              "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition",
              damage
                ? "border-critical/50 bg-critical/10 text-critical"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <AlertTriangle className="size-3.5" />
            Already damaged
          </button>
        </div>

        {damage ? (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's already wrong — cracked apron, sunken curb, broken sprinkler head"
            className="w-full rounded-lg border border-critical/30 bg-critical/[0.04] px-2.5 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-critical/60"
          />
        ) : null}

        {busy > 0 ? (
          <p className="text-[12px] text-muted-foreground">
            <Loader2 className="mr-1.5 inline size-3 animate-spin" />
            Uploading {busy}…
          </p>
        ) : null}
        {error ? <p className="text-[12px] text-critical">{error}</p> : null}

        {/* Status last: it is a statement about the work above, so it reads
            after it. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
              done
                ? "bg-positive/10 text-positive"
                : status === "IN_PROGRESS"
                  ? "bg-caution/10 text-caution"
                  : "bg-foreground/[0.06] text-muted-foreground",
            )}
          >
            {done ? <CheckCircle2 className="size-3" /> : null}
            {STATUS_LABEL[status]}
          </span>

          {done && completedBy ? (
            <span className="text-[11.5px] text-muted-foreground">
              by {completedBy}
              {completedAt ? ` · ${new Date(completedAt).toLocaleDateString()}` : ""}
            </span>
          ) : null}

          {canComplete ? (
            <button
              type="button"
              onClick={() => void mark(done ? "IN_PROGRESS" : "COMPLETE")}
              disabled={marking || (!done && count === 0)}
              title={
                !done && count === 0
                  ? "Photograph the route first"
                  : done
                    ? "Reopen — more of the route still needs documenting"
                    : "Say this route has been documented"
              }
              className="focus-ring ml-auto inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11.5px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
            >
              {marking ? <Loader2 className="size-3 animate-spin" /> : null}
              {done ? "Reopen" : "Mark documented"}
            </button>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}
