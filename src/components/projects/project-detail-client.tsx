"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  Download,
  ImagePlus,
  Loader2,
  Map as MapIcon,
  Maximize2,
  Pencil,
  PenLine,
  Trash2,
  Upload,
} from "lucide-react";

import { deleteProject, saveProjectMapUrl, saveProjectPhotoUrl, uploadProjectMap } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { MapMarkupEditor, MapRedlinePreview, parseShapes } from "@/components/projects/map-markup";
import { MapTakeoff } from "@/components/projects/map-takeoff";

/** A map is a PDF whether it's a Blob https URL ending in .pdf or a data: URL. */
export function isPdfUrl(u: string) {
  return u.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(u);
}

export function ProjectHeaderActions({ projectId, photoUrl }: { projectId: string; photoUrl?: string | null }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);
  const [photoBusy, setPhotoBusy] = React.useState(false);

  async function del() {
    if (deleting) return;
    if (!window.confirm("Delete this project? This can't be undone. Its dailies are kept but unlinked.")) return;
    setDeleting(true);
    await deleteProject(projectId);
    router.push("/projects");
  }

  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    try {
      const blob = await blobUpload(`project-photos/${projectId}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type || undefined,
      });
      await saveProjectPhotoUrl(projectId, blob.url);
      router.refresh();
    } catch {
      window.alert("Photo upload failed. Large photos need Blob storage enabled.");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground">
        {photoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
        {photoUrl ? "Change photo" : "Cover photo"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={photoBusy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto(f);
            e.target.value = "";
          }}
        />
      </label>
      <Link
        href={`/projects/${projectId}/edit`}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-3.5" /> Edit
      </Link>
      <button
        type="button"
        onClick={del}
        disabled={deleting}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-critical/25 bg-critical/10 px-2.5 text-[12px] font-medium text-critical hover:bg-critical/15 disabled:opacity-50"
      >
        {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete
      </button>
    </div>
  );
}

/**
 * The project map, and the office's master as-built over it.
 *
 * Editing is staff-only, and that is a correctness rule rather than a
 * permission preference. The redline is one field on the project: the editor
 * loads the whole set of shapes and writes the whole set back, so two crews on
 * one job would not merely see each other's marks — whichever saved second
 * would erase the first's work with no warning and no history.
 *
 * A crew's own redline belongs on their daily, where it is already private to
 * them and already attached to the production being billed. Here they get the
 * master plan read-only, which is what it is for: direction, not a canvas.
 */
export function ProjectMapPanel({
  projectId,
  initialMapUrl,
  initialMapOriginalUrl,
  initialMarkups,
  canEdit,
}: {
  projectId: string;
  initialMapUrl?: string | null;
  /**
   * The file as it was uploaded, before anything was done to it for display.
   * This is what a download should hand over — a flattened copy has lost the
   * text layer and, with it, every callout small enough to matter.
   */
  initialMapOriginalUrl?: string | null;
  initialMarkups?: unknown;
  /** Fortitude staff. A crew reads this map; it never redraws it. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [mapUrl, setMapUrl] = React.useState<string | null | undefined>(initialMapUrl);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [redlining, setRedlining] = React.useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Preferred path: upload straight to Vercel Blob (no size limit, real URL).
      try {
        const blob = await blobUpload(`project-maps/${projectId}/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          contentType: file.type || undefined,
        });
        const res = await saveProjectMapUrl(projectId, blob.url);
        if (!res.ok) throw new Error(res.error);
        setMapUrl(blob.url);
        router.refresh();
        return;
      } catch (blobErr) {
        // Fallback for when Blob isn't configured yet: small files can still go
        // through the server (stored in the DB). Large files need Blob.
        if (file.size > 4 * 1024 * 1024) throw blobErr;
        const fd = new FormData();
        fd.set("file", file);
        fd.set("projectId", projectId);
        const res = await uploadProjectMap(fd);
        if (!res.ok) throw new Error(res.error);
        setMapUrl(res.dataUrl);
        router.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Upload failed. Large maps need Blob storage enabled — ask to turn it on.",
      );
    } finally {
      setBusy(false);
    }
  }

  const isPdf = mapUrl ? isPdfUrl(mapUrl) : false;
  const originalUrl = initialMapOriginalUrl ?? initialMapUrl ?? null;
  const markups = React.useMemo(() => parseShapes(initialMarkups), [initialMarkups]);

  return (
    <>
      <Panel>
        <PanelHeader
          title="Project map"
          description={
            canEdit
              ? "Upload the construction map, then redline the as-built."
              : "The plan for this job. Redline your own work on your daily sheet."
          }
          icon={<MapIcon className="size-3.5" />}
        >
          <div className="flex items-center gap-2">
            {mapUrl && canEdit ? (
              <button
                type="button"
                onClick={() => setRedlining(true)}
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                <PenLine className="size-3.5" /> Redline
              </button>
            ) : null}
            {mapUrl ? (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Maximize2 className="size-3.5" /> Full size
              </a>
            ) : null}
            {/* Replacing the construction map is an office job. A crew doing it
                by accident swaps the drawing under everyone else's feet. */}
            <label
              hidden={!canEdit}
              className="focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {mapUrl ? "Replace" : "Upload"}
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </PanelHeader>
        <PanelBody>
          {error ? <p className="mb-2 text-[12px] text-critical">{error}</p> : null}
          {mapUrl && markups.length > 0 ? (
            // The redline was only ever visible inside the editor, so anybody
            // who could not open it — every crew, now — saw a blank plan. The
            // overlay costs a client-side render of the pages, which is why it
            // is only paid for when there is something to draw.
            <MapRedlinePreview
              mapUrl={mapUrl}
              isPdf={isPdf}
              shapes={markups}
              className="rounded-lg border border-border/60 p-1"
            />
          ) : mapUrl ? (
            isPdf ? (
              <object data={mapUrl} type="application/pdf" className="h-[78vh] w-full rounded-lg border border-border/60">
                <p className="p-4 text-[12px] text-muted-foreground">
                  PDF preview isn&apos;t supported here.{" "}
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-brand-bright underline">Open the PDF</a>.
                </p>
              </object>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mapUrl} alt="Project map" className="w-full rounded-lg border border-border/60 object-contain" />
            )
          ) : (
            <div className="grid h-48 place-items-center rounded-lg border border-dashed border-border/70 bg-foreground/[0.02] text-center">
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <MapIcon className="size-6 opacity-60" />
                <p className="text-[12.5px]">No map uploaded yet</p>
                <p className="text-[11px] text-muted-foreground/70">Upload a PNG, JPG, or PDF of the construction map.</p>
              </div>
            </div>
          )}
        </PanelBody>

        {/* Take it with you.
            Deliberately not gated on canEdit: the crew standing in the ditch
            is the one who needs the print on their phone, and until now the
            only thing offered was a link that opened a tab. A crew can read
            this map and download it; only the office can replace it. */}
        {mapUrl ? <MapDownload projectId={projectId} original={originalUrl} /> : null}

        {/* Counting a print by eye is an afternoon, and the number somebody
            lands on is what the job gets scheduled and priced against. Only
            offered when there is a drawing to read. */}
        {mapUrl && canEdit ? <MapTakeoff projectId={projectId} /> : null}
      </Panel>

      {redlining && mapUrl && canEdit ? (
        <MapMarkupEditor
          projectId={projectId}
          mapUrl={mapUrl}
          isPdf={isPdf}
          initialMarkups={initialMarkups}
          onClose={() => {
            setRedlining(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}


/**
 * The print, as a file you can keep.
 *
 * It goes through our own route rather than linking the storage URL. Three
 * reasons, and the first is the one that mattered: `download` on an anchor is
 * ignored across origins, so a link to Blob storage opens a tab and leaves the
 * crew to work out how to save what is in it. The route also names the file
 * after the job instead of whatever the upload was called, and checks that the
 * person asking is on this job before handing anything over.
 *
 * Two buttons only when they are two different files. A print that was
 * flattened on the way in has a display copy that no longer matches the
 * original, and which one you want depends on why you are downloading it — to
 * read on a phone, or to print at full size and mark up.
 */
function MapDownload({ projectId, original }: { projectId: string; original: string | null }) {
  const isPdf = original ? isPdfUrl(original) : false;
  const kind = isPdf ? "PDF" : "image";

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-border/60 px-3 py-3">
      <Download className="size-4 shrink-0 text-gold" />
      <span className="text-[12.5px] font-semibold text-foreground">Download the print</span>
      <span className="hidden text-[11.5px] text-muted-foreground sm:block">
        Named after the job, so a folder of these still reads in a month.
      </span>

      <a
        href={`/api/project-map/${projectId}`}
        className="focus-ring ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright"
      >
        <Download className="size-3.5" />
        {kind === "PDF" ? "Download PDF" : "Download map"}
      </a>
    </div>
  );
}
