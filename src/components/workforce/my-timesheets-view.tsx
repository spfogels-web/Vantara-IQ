"use client";

import Link from "next/link";

import type { TimesheetRow } from "@/data/queries";

/**
 * An employee's own history, on a phone.
 *
 * Deliberately a list rather than the manager's table: eleven columns on a
 * 390px screen is a sideways scroll, and this person wants four facts per
 * day. The coverage figure is shown because it is their record too — if the
 * office is going to read that a shift reported for 62% of its length, the
 * person who worked it should be able to read the same thing.
 */
export function MyTimesheetsView({ name, rows }: { name: string; rows: TimesheetRow[] }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <p className="text-[13px] text-muted-foreground">{name}</p>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-foreground">My timesheets</h1>

      {rows.length === 0 ? (
        <p className="mt-6 text-[13px] text-muted-foreground">
          Nothing filed yet. Finished shifts will appear here.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border/40">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/my-timesheets/${r.id}`}
                className="focus-ring flex items-center justify-between gap-3 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">
                    {r.workDate}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {r.projectName || "No job"} · {r.coveragePercent}% location · {r.points} points
                  </span>
                </span>
                <span className="num shrink-0 text-[14px] font-semibold text-foreground">
                  {r.hours === null ? "—" : `${r.hours.toFixed(2)} h`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
