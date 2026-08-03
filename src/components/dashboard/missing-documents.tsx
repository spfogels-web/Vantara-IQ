"use client";

import * as React from "react";
import Link from "next/link";
import { FileWarning, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MissingDocument } from "@/lib/types";
import { Panel, PanelFooter, PanelHeader } from "@/components/common/panel";

export function MissingDocuments({ documents }: { documents: MissingDocument[] }) {
  const total = documents.reduce((sum, doc) => sum + doc.documents.length, 0);
  const blocking = documents.filter((doc) => doc.blocking).length;

  return (
    <Panel>
      <PanelHeader
        title="Missing documents"
        description={`${blocking} blocking billing`}
        count={total}
        icon={<FileWarning className="size-3.5 text-critical" />}
        action="Documents"
        actionHref="/documents"
      />

      <ul className="flex-1 p-2">
        {documents.map((doc) => (
          <li key={doc.id}>
            <Link
              href={`/documents?project=${doc.id}`}
              className="focus-ring group block rounded-lg px-2.5 py-2.5 transition-colors hover:bg-foreground/[0.035]"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                  {doc.project}
                </span>
                {doc.blocking ? (
                  <span className="shrink-0 rounded bg-critical/12 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
                    Blocking
                  </span>
                ) : null}
                <span
                  className={cn(
                    "num shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    doc.blocking
                      ? "bg-critical/15 text-critical"
                      : "bg-foreground/[0.07] text-muted-foreground",
                  )}
                >
                  {doc.documents.length}
                </span>
              </div>

              {/* Naming the documents is what makes this actionable — a count alone
                  sends the user hunting. */}
              <ul className="mt-1.5 space-y-0.5">
                {doc.documents.map((name) => (
                  <li
                    key={name}
                    className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground"
                  >
                    <span className="size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {name}
                  </li>
                ))}
              </ul>

              <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-muted-foreground/70">
                Overdue {doc.daysOverdue} {doc.daysOverdue === 1 ? "day" : "days"}
                <Upload className="ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <PanelFooter>
        <span>
          <span className="num font-medium text-foreground">{total}</span> documents outstanding
          across <span className="num font-medium text-foreground">{documents.length}</span>{" "}
          projects
        </span>
      </PanelFooter>
    </Panel>
  );
}
