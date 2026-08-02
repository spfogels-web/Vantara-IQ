import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";

import { allNavItems } from "@/lib/nav";
import { getIcon } from "@/lib/icons";
import { Panel } from "@/components/common/panel";

/**
 * Placeholder for every module beyond the Operations Center. Keeps navigation
 * feeling alive during the mock-data phase instead of dead-ending in a 404,
 * and gives each future route a real home to grow into.
 */
export default async function ModulePlaceholder({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const href = `/${slug.join("/")}`;
  const match = allNavItems.find((item) => href.startsWith(item.href) && item.href !== "/");
  const Icon = match ? getIcon(match.icon) : Construction;
  const title = match?.label ?? "Module";

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <Panel className="items-center px-6 py-16 text-center sm:py-24">
        <span className="grid size-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-brand-bright">
          <Icon className="size-5" strokeWidth={1.8} />
        </span>

        <h1 className="mt-5 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          This module is scaffolded and ready for its data layer. The Operations
          Center is the reference implementation — every pattern here reuses the
          same panels, tokens and query seam.
        </p>

        <Link
          href="/"
          className="focus-ring mt-6 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_-6px_var(--vq-blue)] transition-colors hover:bg-brand-bright"
        >
          <ArrowLeft className="size-3.5" />
          Back to Operations Center
        </Link>
      </Panel>
    </div>
  );
}
