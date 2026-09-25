/**
 * A crew's own vendor packet, and who in that crew may see it.
 *
 * The packet is the thing the office waits on before a crew can be assigned
 * work, and the Subcontractors page tells staff — in those words — that "the
 * crew fills these in themselves under Company in their own portal". That was
 * not true: the form was behind a per-crew flag that defaulted to off, so a
 * company who skipped the packet during onboarding had no way back to it.
 *
 * What must hold now:
 *
 *   the OWNER always sees it, flag or no flag, because it is theirs to fill in
 *   an ADMIN does too — SubUserRole says they run the office for the crew
 *   a FOREMAN still does not, unless the office has opened it for that crew
 *
 * Asserted against the rendered page under real sessions, because the whole
 * question is what a given login is served.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { get, pageText, sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

const unique = (s: string) => `${s}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

/** A marker only the packet form renders. */
const PACKET_MARKER = "Business identity";
/** What somebody who may not see it is told instead. */
const HIDDEN_MARKER = "are hidden";

let subId = "";
let ownerSession = "";
let adminSession = "";
let foremanSession = "";
const created: string[] = [];

beforeAll(async () => {
  // A crew with the flag OFF — the default, and the case that was broken.
  const sub = await db.subcontractor.create({
    data: {
      company: `Packet Test ${Date.now()}`,
      showOwnerDetailsToCrew: false,
      // Deliberately missing the packet fields: this is a crew who skipped it.
      legalName: "",
      ein: "",
      signatoryName: "",
    },
  });
  subId = sub.id;

  async function login(role: "OWNER" | "ADMIN" | "FOREMAN") {
    const u = await db.user.create({
      data: {
        email: `${unique(`pkt.${role.toLowerCase()}`)}@example.invalid`,
        name: `${role} Person`,
        role: "SUBCONTRACTOR",
        subcontractorId: sub.id,
        subUserRole: role,
      },
    });
    created.push(u.id);
    return sessionCookie(u.id, "SUBCONTRACTOR");
  }

  ownerSession = await login("OWNER");
  adminSession = await login("ADMIN");
  foremanSession = await login("FOREMAN");
}, 240_000);

describe("who is served the vendor packet", () => {
  it("shows it to the owner even though the crew flag is off", async () => {
    const body = pageText(await get(BASE_URL, "/company", ownerSession));
    expect(body, "the owner cannot reach their own packet").toContain(PACKET_MARKER);
    expect(body, "the owner was told their details are hidden").not.toContain(HIDDEN_MARKER);
  });

  it("shows it to whoever runs their office", async () => {
    const body = pageText(await get(BASE_URL, "/company", adminSession));
    expect(body, "an ADMIN cannot reach the packet they are responsible for")
      .toContain(PACKET_MARKER);
  });

  it("still keeps it from a foreman while the crew flag is off", async () => {
    const body = pageText(await get(BASE_URL, "/company", foremanSession));
    expect(body, "a foreman was shown the EIN and signatory").not.toContain(PACKET_MARKER);
    expect(body, "a foreman was not told why the details are missing").toContain(HIDDEN_MARKER);
  });

  it("shows it to a foreman once the office opens it for that crew", async () => {
    await db.subcontractor.update({
      where: { id: subId },
      data: { showOwnerDetailsToCrew: true },
    });
    try {
      const body = pageText(await get(BASE_URL, "/company", foremanSession));
      expect(body, "the crew flag no longer opens the packet").toContain(PACKET_MARKER);
    } finally {
      await db.subcontractor.update({
        where: { id: subId },
        data: { showOwnerDetailsToCrew: false },
      });
    }
  });
});

describe("telling them what is still outstanding", () => {
  it("names the missing fields to the owner", async () => {
    const body = pageText(await get(BASE_URL, "/company", ownerSession));
    expect(body, "the owner is not told the office is waiting").toMatch(/still waiting on/i);
    // The same fields the Subcontractors page lists, so the two agree.
    for (const field of ["Legal business name", "EIN", "Authorised signatory"]) {
      expect(body, `"${field}" is not named as outstanding`).toContain(field);
    }
  });

  it("says nothing to a foreman, who cannot act on it", async () => {
    const body = pageText(await get(BASE_URL, "/company", foremanSession));
    expect(body, "a foreman was nagged about paperwork they cannot see")
      .not.toMatch(/still waiting on/i);
  });

  it("stops saying it once the packet is filled in", async () => {
    const before = await db.subcontractor.findUnique({
      where: { id: subId },
      select: {
        legalName: true, entityType: true, ein: true, addressLine1: true,
        city: true, stateRegion: true, postalCode: true, signatoryName: true,
        paymentMethod: true, remittanceEmail: true, billingContactName: true,
        billingEmail: true,
      },
    });
    await db.subcontractor.update({
      where: { id: subId },
      data: {
        legalName: "Packet Test LLC", entityType: "LLC", ein: "12-3456789",
        addressLine1: "1 Main St", city: "Anderson", stateRegion: "SC",
        postalCode: "29621", signatoryName: "A Signer", paymentMethod: "ACH",
        remittanceEmail: "ap@example.invalid", billingContactName: "A Biller",
        billingEmail: "billing@example.invalid",
      },
    });
    try {
      const body = pageText(await get(BASE_URL, "/company", ownerSession));
      expect(body, "a complete packet still says the office is waiting")
        .not.toMatch(/still waiting on/i);
      // The form is still there — this is not a one-time gate.
      expect(body, "a completed packet became uneditable").toContain(PACKET_MARKER);
    } finally {
      await db.subcontractor.update({ where: { id: subId }, data: before! });
    }
  });
});
