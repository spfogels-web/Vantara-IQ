import {
  AiBriefSkeleton,
  KpiRowSkeleton,
  ListPanelSkeleton,
  ProductionChartSkeleton,
  ProjectHealthSkeleton,
  ProjectsTableSkeleton,
  RevenueCardsSkeleton,
} from "@/components/common/skeletons";

/** Route-level fallback. Mirrors the dashboard grid exactly so a navigation
 *  into the Operations Center never shifts layout when content lands. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="skeleton h-6 w-64 rounded-lg" />
          <div className="skeleton h-3 w-72 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-28 rounded-lg" />
          <div className="skeleton h-9 w-20 rounded-lg" />
          <div className="skeleton h-9 w-9 rounded-lg" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <KpiRowSkeleton />
        </div>
        <div className="xl:col-span-8">
          <ProjectsTableSkeleton />
        </div>
        <div className="xl:col-span-4">
          <AiBriefSkeleton />
        </div>
        <div className="xl:col-span-8">
          <ProductionChartSkeleton />
        </div>
        <div className="xl:col-span-4">
          <ProjectHealthSkeleton />
        </div>
        <div className="xl:col-span-8">
          <RevenueCardsSkeleton />
        </div>
        <div className="xl:col-span-4">
          <ListPanelSkeleton rows={7} />
        </div>
        <div className="xl:col-span-4">
          <ListPanelSkeleton rows={5} />
        </div>
        <div className="xl:col-span-4">
          <ListPanelSkeleton rows={4} />
        </div>
        <div className="xl:col-span-4">
          <ListPanelSkeleton rows={6} />
        </div>
      </div>
    </div>
  );
}
