"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { MARKETS } from "@/lib/markets";
import { setProjectMarket } from "@/app/actions";

/**
 * Which market this job sits in.
 *
 * On the job itself rather than only in the edit form. It decides which rate
 * card the job is priced against — two of these markets run through the same
 * prime at different prices — so it belongs where somebody looking at the
 * job's money can see it and change it.
 *
 * An unset market is shown in warning colour rather than as a quiet dash. A
 * job with no market matches no card, so every line reads "no rate" with
 * nothing on screen explaining why.
 */
export function MarketPicker({
  projectId,
  market,
  canEdit,
}: {
  projectId: string;
  market: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(market);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setValue(market), [market]);

  async function choose(next: string) {
    const prior = value;
    setValue(next);
    setBusy(true);
    setError(null);
    const res = await setProjectMarket(projectId, next);
    setBusy(false);
    if (!res.ok) {
      // Put it back rather than leaving the box showing something that was
      // never saved.
      setValue(prior);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const picked = MARKETS.find((m) => m.id === value);

  return (
    <div className="rounded-xl border border-border/70 bg-foreground/[0.02] px-3 py-2">
      <div className="flex items-center gap-1.5">
        <MapPin className={cn("size-3", picked ? "text-gold" : "text-warning")} />
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Market</p>
        {busy ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
      </div>

      {canEdit ? (
        <select
          value={value}
          disabled={busy}
          onChange={(e) => void choose(e.target.value)}
          className={cn(
            "mt-0.5 w-full min-w-[9rem] rounded border bg-transparent py-0.5 pl-0 pr-5 text-[14px] font-semibold outline-none",
            "border-transparent hover:border-border focus:border-brand/60",
            picked ? "text-foreground" : "text-warning",
          )}
        >
          <option value="">Not set</option>
          {MARKETS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      ) : (
        <p className={cn("mt-0.5 text-[14px] font-semibold", picked ? "text-foreground" : "text-warning")}>
          {picked?.label ?? "Not set"}
        </p>
      )}

      <p className={cn("text-[10.5px]", picked ? "text-muted-foreground" : "text-warning")}>
        {/* The prime, because that is what the rate card follows and what
            separates two of these markets from each other. */}
        {picked ? picked.prime : "no rate card until this is set"}
      </p>
      {error ? <p className="mt-0.5 text-[10.5px] text-critical">{error}</p> : null}
    </div>
  );
}
