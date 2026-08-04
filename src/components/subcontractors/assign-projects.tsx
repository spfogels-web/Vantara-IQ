"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, FolderKanban, Loader2, Lock, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssignedProject, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { setSubcontractorProjects } from "@/app/actions";

/**
 * Which jobs a crew is assigned to.
 *
 * This is the control that decides what a subcontractor can see — the map,
 * the material list, the redlines and their own dailies all follow from it —
 * so it works in project ids, never names. Two jobs sharing a number stay
 * distinct, and renaming a job can't quietly revoke a crew's access.
 *
 * Changes are staged and saved together rather than firing a write per click,
 * so a manager reshuffling three jobs doesn't send three separate updates.
 */
export function AssignProjects({
  subcontractorId,
  assigned,
  projects,
  disabled,
  disabledReason,
}: {
  subcontractorId: string;
  assigned: AssignedProject[];
  projects: Project[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(
    () => new Set(assigned.map((a) => a.id)),
  );

  // Re-sync when the server sends a fresh list, or when switching crews.
  React.useEffect(() => {
    setPicked(new Set(assigned.map((a) => a.id)));
  }, [assigned, subcontractorId]);

  const assignedIds = React.useMemo(
    () => new Set(assigned.map((a) => a.id)),
    [assigned],
  );
  const dirty =
    picked.size !== assignedIds.size || [...picked].some((id) => !assignedIds.has(id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await setSubcontractorProjects(subcontractorId, [...picked]);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError("Could not save those assignments.");
      }
    } catch {
      setError("Could not save those assignments.");
    }
    setBusy(false);
  }

  return (
    <>
      {assigned.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-[12px] text-muted-foreground">
          No active assignments. Assign a project to grant this sub portal access to it.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {assigned.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-lg bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground"
            >
              <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.number ? (
                <span className="num shrink-0 text-[11px] text-muted-foreground">{p.number}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="mt-3 rounded-lg border border-border/70 bg-foreground/[0.02] p-2">
          {projects.length === 0 ? (
            <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
              No projects to assign yet.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {projects.map((p) => {
                const on = picked.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "focus-ring flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                        on ? "bg-brand/10" : "hover:bg-foreground/[0.04]",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded border transition-colors",
                          on
                            ? "border-brand bg-brand text-white"
                            : "border-foreground/25 bg-transparent",
                        )}
                      >
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-foreground">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          <span className="num">{p.number}</span> · {p.client}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error ? <p className="px-2 pt-1 text-[11px] text-critical">{error}</p> : null}

          <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
            <Button
              size="sm"
              onClick={save}
              disabled={busy || !dirty}
              className="h-8 flex-1 gap-1.5 rounded-lg bg-brand text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {busy ? "Saving…" : dirty ? `Save ${picked.size} assigned` : "No changes"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPicked(new Set(assigned.map((a) => a.id)));
                setOpen(false);
                setError(null);
              }}
              className="h-8 gap-1.5 rounded-lg border-foreground/[0.08] bg-transparent px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className="mt-3 h-8 w-full gap-1.5 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disabled ? <Lock className="size-3.5" /> : <Plus className="size-3.5" />}
          {assigned.length === 0 ? "Assign to project" : "Change assignments"}
        </Button>
      )}
    </>
  );
}
