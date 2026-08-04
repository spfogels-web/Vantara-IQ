import type { NavSection } from "@/lib/types";

export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Operations Center", href: "/", icon: "dashboard", shortcut: "O" },
      { label: "Projects", href: "/projects", icon: "projects", badge: 2, shortcut: "P" },
      { label: "Dailies", href: "/dailies", icon: "clipboard", badge: 12, shortcut: "D" },
    ],
  },
  {
    title: "Network",
    items: [
      { label: "Subcontractors", href: "/subcontractors", icon: "users" },
      { label: "Customers", href: "/customers", icon: "customers" },
      { label: "Materials", href: "/materials", icon: "materials" },
      { label: "Crews", href: "/crews", icon: "crew" },
    ],
  },
  {
    title: "Financials",
    items: [
      { label: "Invoicing", href: "/invoicing", icon: "billing", badge: 4 },
      { label: "Pay applications", href: "/pay-applications", icon: "payapps" },
      { label: "Rate import", href: "/rate-import", icon: "scan" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "AI assistant", href: "/assistant", icon: "sparkles", shortcut: "A" },
      { label: "Reports", href: "/reports", icon: "reports" },
      { label: "Integrations", href: "/integrations", icon: "plug" },
    ],
  },
];

export const footerNav: NavSection = {
  title: "Workspace",
  items: [
    { label: "Settings", href: "/settings", icon: "settings" },
    { label: "Support", href: "/support", icon: "support" },
  ],
};

/**
 * What a subcontractor sees.
 *
 * The staff nav lists Customers, Billing, Pay applications and Rate import,
 * and middleware bounces a crew off every one of them. Showing links that only
 * lead to a redirect reads as a broken app and advertises rooms they can't
 * enter, so their rail is built from the two things they actually do here:
 * file the day's work, and look at the jobs they're on.
 *
 * The labels are possessive on purpose — "My projects" is a truthful promise
 * that the list is theirs, not a filtered view of everyone's.
 */
export const subNavSections: NavSection[] = [
  {
    title: "My work",
    items: [
      { label: "Dailies", href: "/dailies", icon: "clipboard", shortcut: "D" },
      { label: "My projects", href: "/projects", icon: "projects", shortcut: "P" },
    ],
  },
];

/** Subcontractors have no Operations Center to go home to. */
export const homeHrefFor = (role?: string | null) =>
  role === "SUBCONTRACTOR" ? "/dailies" : "/";

export const navSectionsFor = (role?: string | null): NavSection[] =>
  role === "SUBCONTRACTOR" ? subNavSections : navSections;

/** Flattened list used by the ⌘K palette. */
export const allNavItems = [...navSections.flatMap((s) => s.items), ...footerNav.items];

export const navItemsFor = (role?: string | null) => [
  ...navSectionsFor(role).flatMap((s) => s.items),
  ...footerNav.items,
];
