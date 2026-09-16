import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * What the enterprise package costs, and what this customer owes this month.
 *
 * The figures live here rather than in a database because they are the price
 * list, not a per-customer setting: every enterprise customer is on the same
 * package, and a number somebody can edit per tenant is a number that quietly
 * drifts from what was signed. A deal on different terms is a contract
 * amendment and a change here, which is the friction you want around pricing.
 */

/** One-off, on signing. It buys a dedicated system, configured and loaded. */
export const IMPLEMENTATION_FEE = 1000;

/** The package itself, per month, whatever the size of the company. */
export const BASE_MONTHLY = 250;

/** Per person, per month — the customer's own staff only. */
export const PER_USER_MONTHLY = 35;

export interface PlanBilling {
  implementationFee: number;
  baseMonthly: number;
  perUserMonthly: number;

  /** The customer's own people with a login. These are what is charged. */
  billableUsers: number;
  /** Their subcontractors' logins. Counted to be shown, never charged. */
  freeSubUsers: number;
  /** Crews on the system, for context beside the free logins. */
  crews: number;

  usersMonthly: number;
  monthlyTotal: number;
  /** What the first invoice comes to, implementation included. */
  firstInvoice: number;
  annualRunRate: number;
}

/**
 * Who counts.
 *
 * A user belongs to the customer when they are not attached to a
 * subcontractor. That is the same test the rest of the system uses to decide
 * whether somebody is staff, so the bill cannot disagree with who can see the
 * customer's numbers — if a login can read rate cards and margins, it is a
 * login the customer is paying for.
 *
 * Subcontractor logins are free on purpose and shown anyway. A prime weighing
 * this up wants to see that onboarding forty crews does not raise the bill,
 * and a number that is present and zero says that better than a silence.
 */
export async function planBilling(): Promise<PlanBilling> {
  const [billableUsers, freeSubUsers, crews] = await Promise.all([
    prisma.user.count({ where: { subcontractorId: null } }),
    prisma.user.count({ where: { subcontractorId: { not: null } } }),
    prisma.subcontractor.count(),
  ]);

  const usersMonthly = billableUsers * PER_USER_MONTHLY;
  const monthlyTotal = BASE_MONTHLY + usersMonthly;

  return {
    implementationFee: IMPLEMENTATION_FEE,
    baseMonthly: BASE_MONTHLY,
    perUserMonthly: PER_USER_MONTHLY,
    billableUsers,
    freeSubUsers,
    crews,
    usersMonthly,
    monthlyTotal,
    firstInvoice: monthlyTotal + IMPLEMENTATION_FEE,
    annualRunRate: monthlyTotal * 12,
  };
}
