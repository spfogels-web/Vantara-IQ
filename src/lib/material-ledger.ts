import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * What the ledger says about a project's material.
 *
 * ProjectMaterial holds `issued` and `installed` as plain numbers anybody can
 * overwrite, with no record of who did it or why. These are derived instead —
 * summed from movements that actually happened, so a figure can always be
 * traced back to the transactions behind it.
 *
 * Where a code has no transactions yet, the stored number stands. That is every
 * project today: this reads a ledger that is being filled in, and a code nobody
 * has posted against should read as untouched rather than as zero.
 */

export type MaterialPosition = {
  code: string;
  /** From the engineer's list. What the job is supposed to need. */
  planned: number;
  received: number;
  issued: number;
  installed: number;
  returned: number;
  /** Written off. Gone, and not coming back as either stock or installed work. */
  damaged: number;
  /** Received less issued and write-offs, plus what came back. In the yard. */
  onHand: number;
  /** Issued less installed and returned. What a crew is still holding. */
  variance: number;
  /** How many movements this is built from. Zero means the stored figure. */
  movements: number;
};

/** Positive kinds add to the yard, negative take away. */
const SIGN: Record<string, number> = {
  RECEIVE: 1,
  RETURN: 1,
  ADJUST: 1,
  ISSUE: -1,
  TRANSFER: -1,
  DAMAGE: -1,
  // INSTALL moves material from a crew's truck into the ground. It never
  // touches the yard, so it has no sign here.
  INSTALL: 0,
  COUNT: 0,
};

export function signOf(kind: string): number {
  return SIGN[kind.trim().toUpperCase()] ?? 0;
}

const key = (c: string) => c.trim().toUpperCase();

function blank(code: string, planned = 0): MaterialPosition {
  return {
    code,
    planned,
    received: 0,
    issued: 0,
    installed: 0,
    returned: 0,
    damaged: 0,
    onHand: 0,
    variance: 0,
    movements: 0,
  };
}

/**
 * Every material on a project, as the ledger has it.
 *
 * One query for the plan and one for the movements, joined in memory on the
 * code — the same code the rate card and the daily sheet use, so the three
 * reconcile without a mapping table between them.
 */
export async function materialPositions(projectId: string): Promise<MaterialPosition[]> {
  const [plan, moves] = await Promise.all([
    prisma.projectMaterial.findMany({
      where: { projectId },
      select: { code: true, planned: true, issued: true, installed: true },
    }),
    prisma.materialTransaction.findMany({
      where: { projectId },
      select: { kind: true, code: true, quantity: true },
    }),
  ]);

  const out = new Map<string, MaterialPosition>();

  for (const p of plan) {
    const row = blank(p.code, p.planned);
    // Stood up from the stored figures, then taken over below by anything the
    // ledger actually knows about.
    row.issued = p.issued;
    row.installed = p.installed;
    out.set(key(p.code), row);
  }

  for (const m of moves) {
    const k = key(m.code);
    // A movement for something not on the engineer's list is still real — it is
    // material that turned up, and dropping it would be the whole problem this
    // ledger exists to solve.
    const row = out.get(k) ?? blank(m.code);

    // The first movement for a code retires the stored numbers for it.
    if (row.movements === 0) {
      row.issued = 0;
      row.installed = 0;
    }
    row.movements += 1;

    // Quantity is signed on the row, but a reader should not have to know which
    // kinds are negative — take the size and let the kind decide the direction.
    const n = Math.abs(m.quantity);
    switch (m.kind.trim().toUpperCase()) {
      case "RECEIVE":
        row.received += n;
        break;
      case "ISSUE":
      case "TRANSFER":
        row.issued += n;
        break;
      case "RETURN":
        row.returned += n;
        break;
      case "INSTALL":
        row.installed += n;
        break;
      case "DAMAGE":
        // Its own line rather than folded into issued. A write-off and a
        // delivery to a crew both take stock off the shelf, but only one of
        // them is somebody's to account for, and that difference is the whole
        // reason anybody reads this.
        row.damaged += n;
        break;
      case "ADJUST":
        // A count correction. Signed, because it can go either way.
        row.received += m.quantity;
        break;
      default:
        break;
    }

    out.set(k, row);
  }

  const round = (n: number) => Number(n.toFixed(2));
  for (const row of out.values()) {
    row.received = round(row.received);
    row.issued = round(row.issued);
    row.installed = round(row.installed);
    row.returned = round(row.returned);
    row.damaged = round(row.damaged);
    row.onHand = round(row.received - row.issued - row.damaged + row.returned);
    // What went out and has not been accounted for — still on a truck, or
    // missing. This is the number a closeout argument turns on.
    row.variance = round(row.issued - row.installed - row.returned);
  }

  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Whether a request would take more than the job still needs.
 *
 * Checked before material leaves the yard rather than found at closeout. It
 * refuses nothing — an authorised person can still issue it — but the warning
 * and the reason are on the record either way.
 */
export async function overageCheck(
  projectId: string,
  code: string,
  requested: number,
): Promise<{
  over: boolean;
  requested: number;
  planned: number;
  alreadyIssued: number;
  stillNeeded: number;
  exceedsBy: number;
}> {
  const positions = await materialPositions(projectId);
  const row = positions.find((p) => key(p.code) === key(code));

  const planned = row?.planned ?? 0;
  const alreadyIssued = row?.issued ?? 0;
  const stillNeeded = Math.max(0, planned - alreadyIssued);
  const exceedsBy = Number(Math.max(0, requested - stillNeeded).toFixed(2));

  return {
    // No plan means nothing to exceed. A code the engineer never listed is a
    // question for a person, not an overage.
    over: planned > 0 && exceedsBy > 0,
    requested,
    planned,
    alreadyIssued,
    stillNeeded,
    exceedsBy,
  };
}
