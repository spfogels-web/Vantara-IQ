"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload as blobUpload } from "@vercel/blob/client";
import { ImagePlus, Loader2, Map as MapIcon, Maximize2, Pencil, PenLine, Trash2, Upload } from "lucide-react";

import { deleteProject, saveProjectMapUrl, saveProjectPhotoUrl, uploadProjectMap } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { MapMarkupEditor } from "@/components/projects/map-markup";

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

export function ProjectMapPanel({
  projectId,
  initialMapUrl,
  initialMarkups,
}: {
  projectId: string;
  initialMapUrl?: string | null;
  initialMarkups?: unknown;
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

  return (
    <>
      <Panel>
        <PanelHeader title="Project map" description="Upload the construction map, then redline the as-built." icon={<MapIcon className="size-3.5" />}>
          <div className="flex items-center gap-2">
            {mapUrl ? (
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
            <label className="focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright">
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
          {mapUrl ? (
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
      </Panel>

      {redlining && mapUrl ? (
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
