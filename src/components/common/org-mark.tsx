"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useOrgName } from "@/components/layout/org-provider";

/**
 * The signed-in organisation's mark.
 *
 * Was a component called FortitudeLogo that loaded `/fortitude-logo.png` and
 * fell back to the monogram "FU" — one company's brand, hardcoded, rendered on
 * the invitation dialog every organisation sends out. A crew invited by anyone
 * else got another contractor's logo at the top of their invitation.
 *
 * Takes the logo the organisation has uploaded, and falls back to its own
 * initials. No file, no name, no mark — a neutral gradient tile, which is
 * honest about knowing nothing rather than confidently wrong.
 */
export function OrgMark({
  logoUrl,
  size = 40,
  className,
  rounded = "rounded-xl",
}: {
  logoUrl?: string | null;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const [ok, setOk] = React.useState(true);
  const name = useOrgName("");

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className={cn("relative grid shrink-0 place-items-center overflow-hidden", rounded, className)}
      style={{ width: size, height: size }}
    >
      {ok && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name || "Organization"}
          className="size-full object-contain"
          onError={() => setOk(false)}
        />
      ) : (
        <span className={cn("brand-gradient grid size-full place-items-center text-white", rounded)}>
          <span className="text-[0.42em] font-bold tracking-tight">{initials}</span>
        </span>
      )}
    </span>
  );
}
