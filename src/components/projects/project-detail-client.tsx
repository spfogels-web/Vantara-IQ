"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Map as MapIcon, Maximize2, Pencil, Trash2, Upload } from "lucide-react";

import { deleteProject, uploadProjectMap } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

export function ProjectHeaderActions({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);

  async function del() {
    if (deleting) return;
    if (!window.confirm("Delete this project? This can't be undone. Its dailies are kept but unlinked.")) return;
    setDeleting(true);
    await deleteProject(projectId);
    router.push("/projects");
  }

  return (
    <div className="flex items-center gap-2">
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
}: {
  projectId: string;
  initialMapUrl?: string | null;
}) {
  const router = useRouter();
  const [mapUrl, setMapUrl] = React.useState<string | null | undefined>(initialMapUrl);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("projectId", projectId);
    const res = await uploadProjectMap(fd);
    setBusy(false);
    if (res.ok) {
      setMapUrl(res.dataUrl);
      router.refresh();
    } else {
      setError(res.error ?? "Upload failed");
    }
  }

  return (
    <Panel>
      <PanelHeader title="Project map" description="Upload the construction map — redline markup is coming next." icon={<MapIcon className="size-3.5" />}>
        <div className="flex items-center gap-2">
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
          mapUrl.startsWith("data:application/pdf") ? (
            <object data={mapUrl} type="application/pdf" className="h-[70vh] w-full rounded-lg border border-border/60">
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
  );
}
