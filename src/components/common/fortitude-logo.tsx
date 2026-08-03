"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Fortitude brand mark. Drop a transparent-background PNG at
 * `public/fortitude-logo.png` and it renders automatically; until the file
 * exists it falls back to a gradient monogram so nothing looks broken.
 */
const SRC = "/fortitude-logo.png";

export function FortitudeLogo({
  size = 40,
  className,
  rounded = "rounded-xl",
}: {
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const [ok, setOk] = React.useState(true);

  return (
    <span
      className={cn("relative grid shrink-0 place-items-center overflow-hidden", rounded, className)}
      style={{ width: size, height: size }}
    >
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={SRC}
          alt="Fortitude"
          className="size-full object-contain"
          onError={() => setOk(false)}
        />
      ) : (
        <span className={cn("brand-gradient grid size-full place-items-center text-white", rounded)}>
          <span className="text-[0.42em] font-bold tracking-tight">FU</span>
        </span>
      )}
    </span>
  );
}
