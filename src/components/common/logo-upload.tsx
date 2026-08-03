"use client";

import * as React from "react";
import { Camera } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Company logo picker. Reads the chosen image to a data URL and previews it in
 * place; falls back to initials until one is set. It holds the image in local
 * state today (no persistence layer yet) — when storage is wired, pass a real
 * `src` and forward `onChange` to an upload call.
 */
export function LogoUpload({
  initialSrc,
  fallback,
  size = 48,
  editable = true,
  onChange,
  className,
}: {
  initialSrc?: string;
  /** Initials shown before a logo is chosen. */
  fallback: string;
  size?: number;
  editable?: boolean;
  onChange?: (dataUrl: string) => void;
  className?: string;
}) {
  const [src, setSrc] = React.useState<string | undefined>(initialSrc);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setSrc(url);
      onChange?.(url);
    };
    reader.readAsDataURL(file);
  }

  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="size-full rounded-[inherit] object-cover" />
  ) : (
    <span className="text-[13px] font-semibold text-foreground">{fallback}</span>
  );

  const base = cn(
    "relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-foreground/[0.06] ring-1 ring-inset ring-foreground/[0.08]",
    className,
  );

  if (!editable) {
    return (
      <span className={base} style={{ width: size, height: size }}>
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      aria-label="Upload logo"
      className={cn(base, "group focus-ring cursor-pointer")}
      style={{ width: size, height: size }}
    >
      {inner}
      <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
        <Camera className="size-4 text-white" />
      </span>
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} className="hidden" />
    </button>
  );
}
