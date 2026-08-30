import type { LucideIcon } from "lucide-react";
import { FilePlus2, FolderPlus, Upload } from "lucide-react";

/**
 * What the Create button offers.
 *
 * Defined once because it is offered from two places — the Create button and
 * the ⌘K palette — and two lists drift. They already had: the palette pointed
 * at /documents/upload and /invoicing/new, neither of which is a route, so both
 * landed on the "this module is scaffolded" placeholder.
 *
 * Every href here is a page that exists. An entry with nowhere real to go does
 * not belong on this list.
 */

export type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** What pressing it actually does, for the palette's second line. */
  hint: string;
  /**
   * Whether a crew login can reach it. Middleware bounces a subcontractor off
   * /projects and /documents to /dailies, so offering them here would look like
   * the button is broken rather than like a page they cannot open.
   */
  staffOnly?: boolean;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Daily billing sheet",
    href: "/dailies/sheet",
    icon: FilePlus2,
    hint: "Start a blank sheet for a crew's day",
  },
  {
    label: "New project",
    href: "/projects/new",
    icon: FolderPlus,
    hint: "Set up a job, its customer and its rate card",
    staffOnly: true,
  },
  {
    // Upload lives on the documents page rather than a route of its own, so
    // this lands on the page and scrolls to the drop zone.
    label: "Upload document",
    href: "/documents#upload",
    icon: Upload,
    hint: "Contracts, insurance, W-9s — anything held on paper",
    staffOnly: true,
  },
];

export function quickActionsFor(role?: string | null): QuickAction[] {
  return role === "SUBCONTRACTOR" ? QUICK_ACTIONS.filter((a) => !a.staffOnly) : QUICK_ACTIONS;
}
