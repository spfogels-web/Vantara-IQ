import type { NavSection } from "@/lib/types";

export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Operations Center", href: "/", icon: "dashboard", shortcut: "O" },
      { label: "Projects", href: "/projects", icon: "projects", badge: 2, shortcut: "P" },
      { label: "Dailies", href: "/dailies", icon: "clipboard", badge: 12, shortcut: "D" },
      // Staff only, and deliberately absent from subNavSections below: a crew
      // has no business seeing when another company mobilises, what a
      // customer owes, or when the office is meeting. The page redirects too
      // — a missing link is not access control.
      { label: "Calendar", href: "/calendar", icon: "calendar", shortcut: "C" },
    ],
  },
  {
    title: "Network",
    items: [
      { label: "Prospects", href: "/prospects", icon: "prospects" },
      { label: "Workforce", href: "/workforce", icon: "crew" },
      { label: "Subcontractors", href: "/subcontractors", icon: "users" },
      { label: "Customers", href: "/customers", icon: "customers" },
      { label: "Materials", href: "/materials", icon: "materials" },
      { label: "Tasks", href: "/tasks", icon: "clipboard" },
      { label: "Messages", href: "/messages", icon: "message" },
      { label: "Documents", href: "/documents", icon: "document" },
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
      { label: "Locates", href: "/locates", icon: "alert" },
      // Vantara IQ's own sales pipeline, not Fortitude's. Kept out of Prospects
      // deliberately: that board is crews and primes to work with.
      { label: "Demo requests", href: "/demo-requests", icon: "sparkles" },
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
      // Their own tickets only. The query scopes it to work filed to their
      // company, so two crews on one job never read each other.
      { label: "My locates", href: "/locates", icon: "alert" },
      { label: "Company profile", href: "/company", icon: "users" },
      { label: "Yard badges", href: "/badges", icon: "idCard" },
      { label: "Tasks", href: "/tasks", icon: "clipboard" },
      { label: "Messages", href: "/messages", icon: "message" },
    ],
  },
];

/**
 * Where each role lands after signing in.
 *
 * Neither of the non-staff roles has an Operations Center to go home to, and
 * an employee in particular must not be shown one on the way past — the
 * middleware would bounce them, but a redirect through a page they may not
 * read is a page they may not read. Employees start where their work starts.
 */
export const homeHrefFor = (role?: string | null) =>
  role === "SUBCONTRACTOR" ? "/dailies" : role === "EMPLOYEE" ? "/time-clock" : "/";

/**
 * The crew's own pay page, shown only where the office has turned it on.
 *
 * Several owners have their own people fill in the billing and would
 * rather a rate card was not in front of them. Off by default, per crew.
 */
const PAY_ITEM = { label: "Pay statements", href: "/pay", icon: "payapps" } as const;

/**
 * A field employee's rail: their clock, their hours, and nothing else.
 *
 * They are not staff. Offering them Invoicing or the customer list and then
 * having middleware bounce them is worse than not offering it — it advertises
 * the inside of a business they work for but do not run.
 */
export const employeeNavSections: NavSection[] = [
  {
    title: "My work",
    items: [
      { label: "Time Clock", href: "/time-clock", icon: "clock", shortcut: "T" },
      { label: "My timesheets", href: "/my-timesheets", icon: "clipboard" },
    ],
  },
];

/**
 * Which rail each role gets.
 *
 * Written as an explicit map rather than `role !== "SUBCONTRACTOR" ? staff :
 * crew`, which is what this was. That shape gave the full management
 * navigation to every role that was not a subcontractor — correct while there
 * were only two kinds of person, and wrong the moment EMPLOYEE existed.
 *
 * Staff is the fallback because the four staff roles genuinely share one rail.
 * Any non-staff role must be named here, and the middleware allowlist must
 * agree with it — a link nobody can follow is a bug, and a page with no link
 * is still reachable by typing it.
 */
export const navSectionsFor = (
  role?: string | null,
  showPay = false,
): NavSection[] => {
  if (role === "SUBCONTRACTOR") {
    return subNavSections.map((section) => ({
      ...section,
      items: showPay ? [...section.items, PAY_ITEM] : section.items,
    }));
  }
  if (role === "EMPLOYEE") return employeeNavSections;
  return navSections;
};

/** Flattened list used by the ⌘K palette. */
export const allNavItems = [...navSections.flatMap((s) => s.items), ...footerNav.items];

export const navItemsFor = (role?: string | null) => [
  ...navSectionsFor(role).flatMap((s) => s.items),
  ...footerNav.items,
];
