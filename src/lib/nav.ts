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
      { label: "Billing", href: "/billing", icon: "billing", badge: 4 },
      { label: "Pay applications", href: "/pay-applications", icon: "payapps" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "AI assistant", href: "/assistant", icon: "sparkles", shortcut: "A" },
      { label: "Reports", href: "/reports", icon: "reports" },
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

/** Flattened list used by the ⌘K palette. */
export const allNavItems = [...navSections.flatMap((s) => s.items), ...footerNav.items];
