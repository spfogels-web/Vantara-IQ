"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FilePlus2,
  FolderPlus,
  ReceiptText,
  Upload,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { getIcon } from "@/lib/icons";
import { navItemsFor } from "@/lib/nav";
import { projects } from "@/data/mock";
import { healthTone } from "@/lib/tone";
import { toneStyles } from "@/lib/tone";
import { cn } from "@/lib/utils";

type CommandMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CommandMenuContext = React.createContext<CommandMenuContextValue | null>(null);

export function useCommandMenu() {
  const context = React.useContext(CommandMenuContext);
  if (!context) {
    throw new Error("useCommandMenu must be used within a CommandMenuProvider");
  }
  return context;
}

const quickActions = [
  { label: "New daily report", icon: FilePlus2, href: "/dailies/new", shortcut: "⌘N" },
  { label: "New project", icon: FolderPlus, href: "/projects/new" },
  { label: "Upload document", icon: Upload, href: "/documents/upload" },
  { label: "Create invoice", icon: ReceiptText, href: "/billing/new" },
];

export function CommandMenuProvider({
  children,
  role,
}: {
  children: React.ReactNode;
  /** The palette must not offer a crew a page they cannot open. */
  role?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Autofill and IME composition fire keydown with no `key` — guard it.
      if (event.key?.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const value = React.useMemo(() => ({ open, setOpen }), [open]);

  return (
    <CommandMenuContext.Provider value={value}>
      {children}

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search Vantara IQ"
        description="Jump to a page, project or action"
        className="max-w-xl border-foreground/[0.08] shadow-elev-3"
      >
        <CommandInput placeholder="Search projects, dailies, crews, documents…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>
            <span className="text-muted-foreground">No results found.</span>
          </CommandEmpty>

          <CommandGroup heading="Quick actions">
            {quickActions.map((action) => (
              <CommandItem
                key={action.label}
                value={`action ${action.label}`}
                onSelect={() => run(action.href)}
                className="gap-3"
              >
                <span className="grid size-6 place-items-center rounded-md bg-brand/12 text-brand-bright ring-1 ring-inset ring-brand/20">
                  <action.icon className="size-3.5" />
                </span>
                {action.label}
                {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Navigation">
            {navItemsFor(role).map((item) => {
              const Icon = getIcon(item.icon);
              return (
                <CommandItem
                  key={item.href}
                  value={`nav ${item.label}`}
                  onSelect={() => run(item.href)}
                  className="gap-3"
                >
                  <span className="grid size-6 place-items-center rounded-md bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                    <Icon className="size-3.5" />
                  </span>
                  {item.label}
                  {item.shortcut ? <CommandShortcut>G then {item.shortcut}</CommandShortcut> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Projects">
            {projects.map((project) => {
              const tone = toneStyles[healthTone(project.health)];
              return (
                <CommandItem
                  key={project.id}
                  value={`project ${project.name} ${project.client} ${project.location}`}
                  onSelect={() => run(`/projects/${project.id}`)}
                  className="gap-3"
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {project.location}
                  </span>
                  <ArrowRight className="size-3 shrink-0 text-muted-foreground/60" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </CommandMenuContext.Provider>
  );
}
