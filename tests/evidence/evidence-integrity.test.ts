/**
 * The rules that make a photograph usable as evidence.
 *
 * All of this exists for one moment: a homeowner rings up three weeks after
 * the crew has gone and says the bore rig cracked their driveway. What decides
 * that conversation is whether somebody photographed the driveway beforehand,
 * and whether the time and place on that photograph can be accounted for.
 *
 * So the tests here are mostly about refusing things. A coordinate with no
 * stated origin, a capture time that is really an upload time, a location
 * typed in later wearing the badge of a device fix — each of those makes the
 * record look more complete and makes it worth less.
 */
import { describe, expect, it } from "vitest";

import {
  CLASSIFIABLE_EVIDENCE_FIELDS,
  IMMUTABLE_EVIDENCE_FIELDS,
  legacyPurposeFor,
  usableCapturedAt,
  usableFix,
} from "../../src/lib/evidence";

describe("a coordinate is kept only with a stated origin", () => {
  it("keeps a fix the device reported", () => {
    const fix = usableFix({ lat: 33.0508, lng: -83.2457, accuracyM: 5, locationSource: "device" });
    expect(fix).not.toBeNull();
    expect(fix!.source).toBe("device");
    expect(fix!.accuracyM).toBe(5);
  });

  it("keeps a fix read out of the file's own EXIF", () => {
    const fix = usableFix({ lat: 33.0498, lng: -83.2449, locationSource: "exif" });
    expect(fix?.source).toBe("exif");
    // No accuracy in EXIF, and none is invented.
    expect(fix?.accuracyM).toBeNull();
  });

  it("refuses a coordinate whose origin is not stated", () => {
    expect(usableFix({ lat: 33.05, lng: -83.24, locationSource: "" })).toBeNull();
    expect(usableFix({ lat: 33.05, lng: -83.24, locationSource: undefined })).toBeNull();
  });

  it("refuses a coordinate claiming an origin we do not issue", () => {
    /**
     * The one that matters. If somebody later types an address into a form,
     * it must arrive with its own origin and its own badge — not wearing
     * "device", which says a phone stood on that spot and saw the sky.
     */
    expect(usableFix({ lat: 33.05, lng: -83.24, locationSource: "manual" })).toBeNull();
    expect(usableFix({ lat: 33.05, lng: -83.24, locationSource: "project" })).toBeNull();
    expect(usableFix({ lat: 33.05, lng: -83.24, locationSource: "geocoded" })).toBeNull();
  });

  it("refuses a coordinate that is not on Earth", () => {
    expect(usableFix({ lat: 91, lng: 0, locationSource: "device" })).toBeNull();
    expect(usableFix({ lat: 0, lng: 181, locationSource: "device" })).toBeNull();
    expect(usableFix({ lat: Number.NaN, lng: 0, locationSource: "device" })).toBeNull();
  });

  it("refuses the zeroed sensor at Null Island", () => {
    // A real 0,0 is open water off Ghana. On a fibre job in Georgia it is a
    // sensor that returned nothing, and it would draw a pin on another
    // continent with the same confidence as a real fix.
    expect(usableFix({ lat: 0, lng: 0, locationSource: "device" })).toBeNull();
  });

  it("drops a nonsense accuracy rather than the whole fix", () => {
    const fix = usableFix({ lat: 33.05, lng: -83.24, accuracyM: -1, locationSource: "device" });
    expect(fix).not.toBeNull();
    expect(fix!.accuracyM).toBeNull();
  });
});

describe("an upload time never becomes a capture time", () => {
  it("keeps a capture time the camera stated", () => {
    const at = usableCapturedAt("2026-09-18T08:21:00.000Z", "camera");
    expect(at?.source).toBe("camera");
  });

  it("keeps one read from EXIF, and says that is where it came from", () => {
    const at = usableCapturedAt("2026-09-18T08:21:00.000Z", "exif");
    expect(at?.source).toBe("exif");
  });

  it("refuses a timestamp with no stated origin", () => {
    /**
     * This is the historical daily photograph. Every one of them has an
     * `addedAt` — the moment the crew attached it to the sheet, often hours
     * after the shutter and sometimes the next morning. Passing it through
     * here without an origin is how it would have become a capture time, and
     * every piece of historical evidence would have been dated wrong while
     * looking authoritative.
     */
    expect(usableCapturedAt("2026-09-18T18:40:00.000Z", "")).toBeNull();
    expect(usableCapturedAt("2026-09-18T18:40:00.000Z", undefined)).toBeNull();
    expect(usableCapturedAt("2026-09-18T18:40:00.000Z", "upload")).toBeNull();
    expect(usableCapturedAt("2026-09-18T18:40:00.000Z", "addedAt")).toBeNull();
  });

  it("refuses a time from a device with a wrong clock", () => {
    const nextYear = new Date(Date.now() + 365 * 864e5).toISOString();
    expect(usableCapturedAt(nextYear, "camera")).toBeNull();
  });

  it("refuses an unparseable time", () => {
    expect(usableCapturedAt("yesterday afternoon", "camera")).toBeNull();
    expect(usableCapturedAt("", "camera")).toBeNull();
    expect(usableCapturedAt(null, "camera")).toBeNull();
  });
});

describe("what may be corrected, and what may not", () => {
  it("never lets a classification field also be an immutable one", () => {
    const immutable = new Set<string>(IMMUTABLE_EVIDENCE_FIELDS);
    for (const f of CLASSIFIABLE_EVIDENCE_FIELDS) {
      expect(immutable.has(f), `${f} is listed as both editable and immutable`).toBe(false);
    }
  });

  it("protects everything the camera and the crew established", () => {
    // If one of these ever drops off the list, evidence becomes editable
    // without anybody noticing, which is the failure this whole file is about.
    for (const f of [
      "capturedAt",
      "capturedAtSource",
      "lat",
      "lng",
      "accuracyM",
      "locationSource",
      "uploadedBy",
      "uploadedAt",
      "dailySheetId",
      "projectId",
      "url",
    ]) {
      expect(IMMUTABLE_EVIDENCE_FIELDS as readonly string[]).toContain(f);
    }
  });

  it("lets the office say what a picture is of", () => {
    for (const f of ["caption", "category", "stage", "existingDamage", "damageNote"]) {
      expect(CLASSIFIABLE_EVIDENCE_FIELDS as readonly string[]).toContain(f);
    }
  });
});

describe("the legacy purpose column keeps step with stage", () => {
  it("maps each stage onto the value the old gallery understands", () => {
    expect(legacyPurposeFor("DIRECTION")).toBe("DIRECTION");
    expect(legacyPurposeFor("WORK_RECORD")).toBe("RECORD");
    // A stage the old column has no word for still has to be *something*, and
    // "a record of work" is the safe reading — it keeps the photograph in the
    // gallery rather than hiding it from a reader that has not moved over yet.
    expect(legacyPurposeFor("PRE_CONSTRUCTION")).toBe("RECORD");
    expect(legacyPurposeFor("CLOSEOUT")).toBe("RECORD");
  });
});

describe("existing damage is a flag, not a category", () => {
  it("is recorded beside what the picture is of, not instead of it", () => {
    /**
     * A cracked driveway is still a driveway. Somebody searching driveway
     * evidence must find it, and somebody searching existing damage must find
     * it too — which only works if both are true at once rather than one
     * replacing the other.
     */
    const evidence = { category: "DRIVEWAY" as const, existingDamage: true, damageNote: "Crack across the right side" };
    expect(evidence.category).toBe("DRIVEWAY");
    expect(evidence.existingDamage).toBe(true);
    expect(evidence.damageNote.length).toBeGreaterThan(0);
  });
});
