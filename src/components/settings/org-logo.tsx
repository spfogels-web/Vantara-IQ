"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import { Camera, Loader2 } from "lucide-react";

import { initials } from "@/lib/format";
import { saveOrganizationLogo } from "@/app/actions";

/**
 * Company logo, stored for real.
 *
 * The previous picker read the file to a data URL and held it in component
 * state, which looked like it worked right up until you reloaded. This one
 * uploads to Blob and saves the URL on the organization, so the mark shows up
 * in the shell for everyone on the account.
 */
export function OrgLogo({
  name,
  initialUrl,
  size = 52,
}: {
  name: string;
  initialUrl?: string | null;
  size?: number;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [src, setSrc] = React.useState(initialUrl ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await blobUpload(`branding/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      const res = await saveOrganizationLogo(blob.url);
      if (res.ok) {
        setSrc(blob.url);
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Upload failed — Blob storage needs to be configured for this environment.");
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Upload company logo"
        className="focus-ring group relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-foreground/[0.06] ring-1 ring-inset ring-foreground/[0.08]"
        style={{ width: size, height: size }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-contain" />
        ) : (
          <span className="text-[13px] font-semibold text-foreground">{initials(name)}</span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? (
            <Loader2 className="size-4 animate-spin text-white" />
          ) : (
            <Camera className="size-4 text-white" />
          )}
        </span>
      </button>

      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-foreground">{name}</p>
        <p className="text-[11.5px] text-muted-foreground">
          {error ? (
            <span className="text-critical">{error}</span>
          ) : (
            "Click the mark to upload your logo — it appears across the app."
          )}
        </p>
      </div>
    </div>
  );
}
