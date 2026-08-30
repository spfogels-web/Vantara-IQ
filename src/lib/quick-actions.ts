import type { LucideIcon } from "lucide-react";
import { ClipboardList, FolderPlus } from "lucide-react";

/**
 * What the Create button offers.
 *
 * Defined once because it is offered from two places — the Create button and
 * the ⌘K palette — and two lists drift. They already had: the palette pointed
 * at /documents/upload and /invoicing/new, neither of which is a route, so both
 * landed on the "this module is scaffolded" placeholder.
 *
 * Both land on the index page rather than on a create form. That is the ask,
 * and it is also the safer target: an index always renders, where a form can
 * want a project or a customer that the person pressing Create has not chosen
 * yet. The button that starts the work is on the page when they get there.
 */

export type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** What pressing it actually does, for the second line of the menu. */
  hint: string;
  /**
   * Whether a crew login is offered it. Both destinations are reachable by a
   * subcontractor, but /projects/new is not — so a crew shown "New project"
   * would land on a page whose one button bounces them back to /dailies.
   */
  staffOnly?: boolean;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Daily billing sheet",
    href: "/dailies",
    icon: ClipboardList,
    hint: "Open dailies to start or upload a sheet",
  },
  {
    label: "New project",
    href: "/projects",
    icon: FolderPlus,
    hint: "Open projects to set up a new job",
    staffOnly: true,
  },
];

export function quickActionsFor(role?: string | null): QuickAction[] {
  return role === "SUBCONTRACTOR" ? QUICK_ACTIONS.filter((a) => !a.staffOnly) : QUICK_ACTIONS;
}
