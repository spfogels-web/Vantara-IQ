import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Whether the environment can send at all.
 *
 * Read here rather than imported from src/lib/sms.ts on purpose: that module
 * asks this one whether alerts are live on every send, and importing back the
 * other way makes a cycle. These are three environment variables and the
 * duplication is three lines — a cycle between the send path and its own kill
 * switch is worth more than three lines to avoid.
 */
function credentialsPresent(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER),
  );
}

function enabledFlag(): boolean {
  return (process.env.SMS_ENABLED ?? "").toLowerCase() === "true";
}

function provisionedNow(): boolean {
  return enabledFlag() && credentialsPresent();
}

/**
 * The kill switch for outbound texts.
 *
 * Two gates, and both have to hold before a single message leaves:
 *
 *   1. The environment is provisioned — credentials present and SMS_ENABLED
 *      true. That is a deploy-time fact and stays where it is.
 *   2. This switch is on. That is a person's decision, and it belongs in the
 *      product rather than in an environment variable, because the moment it
 *      matters is the moment somebody notices texts going out that should not
 *      be. Waiting on a deploy to stop them is not an option.
 *
 * The asymmetry is deliberate. Turning it OFF is always allowed and takes
 * effect on the next send. Turning it ON does nothing at all unless the
 * environment is provisioned, so a switch flipped in a workspace with no
 * carrier account cannot start anything.
 *
 * Defaults to on. A brand-new database has no row, and the honest reading of
 * that is "nobody has turned this off" rather than "everything is disabled" —
 * the environment gate above already keeps an unprovisioned workspace silent.
 */

const KEY = "alerts.live";

export interface AlertsState {
  /** Is the environment able to send at all? */
  provisioned: boolean;
  /**
   * The two halves of that, separately.
   *
   * Kept apart because the panel has to say which gate is shut. It read "this
   * environment has no carrier account" to somebody who had just finished
   * adding one — the credentials were in and SMS_ENABLED was not, and being
   * told the wrong thing at that moment sends a person back to Twilio to look
   * for a problem that is not there.
   */
  credentials: boolean;
  enabled: boolean;
  /** Has a person switched alerts off? */
  switchedOn: boolean;
  /** Both together — the only thing a send path should ask. */
  live: boolean;
  /** Who last changed it, and when. */
  updatedBy: string;
  updatedAt: string | null;
}

export async function alertsState(): Promise<AlertsState> {
  const provisioned = provisionedNow();
  const row = await prisma.appSetting
    .findUnique({ where: { key: KEY } })
    .catch(() => null);

  const switchedOn = row ? row.value === "true" : true;
  return {
    provisioned,
    credentials: credentialsPresent(),
    enabled: enabledFlag(),
    switchedOn,
    live: provisioned && switchedOn,
    updatedBy: row?.updatedBy ?? "",
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Whether a text may be sent right now.
 *
 * Called on every send. A failure to read the switch returns false: if we
 * cannot tell whether somebody turned texting off, the safe answer is that
 * they did.
 */
export async function alertsLive(): Promise<boolean> {
  if (!provisionedNow()) return false;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    return row ? row.value === "true" : true;
  } catch {
    return false;
  }
}

export async function setAlertsLive(on: boolean, actor: string) {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: on ? "true" : "false", updatedBy: actor },
    update: { value: on ? "true" : "false", updatedBy: actor },
  });
}
