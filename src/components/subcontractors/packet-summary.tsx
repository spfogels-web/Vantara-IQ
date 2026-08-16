"use client";

import * as React from "react";
import { AlertTriangle, Check, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { packetStatus } from "@/lib/vendor-packet";
import type { VendorPacketView } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { getVendorPacketFor } from "@/app/actions";

/**
 * The vendor packet as Fortitude reads it.
 *
 * Loaded on demand rather than with the roster: a packet is a couple of dozen
 * fields per crew, and pulling every one to render a list nobody has opened yet
 * is wasted work. It also keeps EIN and banking off the wire until someone
 * actually asks to look at a specific sub.
 */
export function PacketSummary({ subcontractorId }: { subcontractorId: string }) {
  const [packet, setPacket] = React.useState<VendorPacketView | null>(null);
  const [state, setState] = React.useState<"idle" | "loading" | "error">("idle");

  React.useEffect(() => {
    let live = true;
    setState("loading");
    setPacket(null);
    getVendorPacketFor(subcontractorId)
      .then((res) => {
        if (!live) return;
        if (res.ok) {
          setPacket(res.packet);
          setState("idle");
        } else {
          setState("error");
        }
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [subcontractorId]);

  const status = React.useMemo(
    () => (packet ? packetStatus({ ...packet, emr: packet.emr ? Number(packet.emr) : null }) : null),
    [packet],
  );

  return (
    <Panel>
      <PanelHeader
        title="Vendor packet"
        description="Supplied by the subcontractor from their own portal"
        icon={<FileText className="size-3.5" />}
      />
      <PanelBody className="flex flex-col gap-3">
        {state === "loading" ? (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        ) : state === "error" || !packet || !status ? (
          <p className="text-[12px] text-muted-foreground">Couldn&apos;t load this packet.</p>
        ) : (
          <>
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]",
                status.complete
                  ? "border-success/25 bg-success/[0.06] text-foreground"
                  : "border-warning/25 bg-warning/[0.06] text-foreground",
              )}
            >
              {status.complete ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              )}
              {/* Say where it gets filled in. This list is read by the office,
                  who then have to tell the crew where to go — and "Phone" on
                  its own does not say whether that is the office line, the
                  mobile, or a reference's number. */}
              <span>
                {status.complete ? (
                  "Everything required is on file."
                ) : (
                  <>
                    Waiting on: {status.blocking.join(", ")}. The crew fills these
                    in themselves under <strong>Company</strong> in their own portal —
                    entity type is a dropdown there, and the phone asked for is the
                    business office line.
                  </>
                )}
              </span>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <Row label="Legal name" value={packet.legalName} />
              {/* Both halves, or it lies. Dropping the empty one and joining
                  what is left put Gulf Drilling's state of incorporation on a
                  row labelled "Entity", so the page read "Entity: FL" while
                  the banner above it said the entity type was still missing. */}
              <Row
                label="Entity"
                value={
                  packet.entityType
                    ? [packet.entityType, packet.stateOfIncorporation].filter(Boolean).join(" · ")
                    : packet.stateOfIncorporation
                      ? `Type not given · ${packet.stateOfIncorporation}`
                      : ""
                }
              />
              <Row label="EIN" value={packet.ein} />
              <Row
                label="Address"
                value={[packet.addressLine1, packet.city, packet.stateRegion, packet.postalCode]
                  .filter(Boolean)
                  .join(", ")}
              />
              <Row label="Signatory" value={[packet.signatoryName, packet.signatoryTitle].filter(Boolean).join(" · ")} />
              <Row label="Billing contact" value={packet.billingContactName} />
              <Row label="Billing email" value={packet.billingEmail} />
              <Row label="Remittance" value={packet.remittanceEmail} />
              <Row label="Terms" value={[packet.paymentMethod, packet.paymentTerms].filter(Boolean).join(" · ")} />
              <Row label="Licence" value={packet.contractorLicense} />
              <Row label="DOT" value={packet.dotNumber} />
              <Row label="EMR" value={packet.emr} />
            </dl>

            {packet.references.filter((r) => r.company).length > 0 ? (
              <div>
                <p className="eyebrow mb-1.5">References</p>
                <ul className="flex flex-col gap-1">
                  {packet.references
                    .filter((r) => r.company)
                    .map((r, i) => (
                      <li key={i} className="text-[12px] text-muted-foreground">
                        <span className="text-foreground">{r.company}</span>
                        {r.contact ? ` — ${r.contact}` : ""}
                        {r.phone ? ` · ${r.phone}` : ""}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5 text-[12.5px] last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right", value ? "text-foreground" : "text-muted-foreground/50")}>
        {value || "—"}
      </dd>
    </div>
  );
}
