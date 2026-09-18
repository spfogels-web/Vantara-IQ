/**
 * Where an organisation's uploads go, and what the door accepts.
 *
 * One blob store serves every organisation and every object in it is
 * public-read. Nothing leaks by listing — a URL is needed — but record ids are
 * only unique *within* a database, so two contractors can hold a project with
 * the same id and `project-photos/<id>/…` would be the same folder for both.
 * The organisation has to be in the path, and the path has to be checked
 * against the organisation on the request.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { orgBlobPrefix, splitOrgBlobPath } from "@/lib/blob-paths";

describe("the organisation is in the path", () => {
  it("puts every file under its own organisation", () => {
    expect(orgBlobPrefix("apex") + "project-photos/p1/a.jpg").toBe(
      "org/apex/project-photos/p1/a.jpg",
    );
  });

  it("reads the organisation back out", () => {
    expect(splitOrgBlobPath("org/apex/project-photos/p1/a.jpg")).toEqual({
      orgId: "apex",
      rest: "project-photos/p1/a.jpg",
    });
  });

  it("gives two organisations different folders for the same record id", () => {
    // The collision this exists to prevent: ids are unique per database, not
    // across them.
    const a = orgBlobPrefix("fortitude") + "project-photos/shared-id/a.jpg";
    const b = orgBlobPrefix("apex") + "project-photos/shared-id/a.jpg";
    expect(a).not.toBe(b);
  });

  it("refuses a path with no organisation on it", () => {
    // Every file uploaded before this existed. They keep working — they are
    // read by absolute URL from a row in one database — but nothing new may
    // be written without an organisation.
    expect(splitOrgBlobPath("project-photos/p1/a.jpg")).toBeNull();
    expect(splitOrgBlobPath("org/")).toBeNull();
    expect(splitOrgBlobPath("org/apex")).toBeNull();
  });
});

describe("the upload door", () => {
  const route = () => readFileSync("src/app/api/blob/upload/route.ts", "utf8");

  it("accepts the video types a phone actually produces", () => {
    // The bug: the uploader offered `image/*,video/*`, branched on the file
    // type and stored a VIDEO kind, while the token permitted images and PDF
    // only. A foreman filming a bore hitting rock was told it was allowed and
    // then refused.
    const src = route();
    for (const type of ["video/mp4", "video/quicktime", "video/webm"]) {
      expect(src.includes(`"${type}"`), `${type} is still refused by the upload token`).toBe(true);
    }
  });

  it("still refuses a type nobody asked for", () => {
    // The fix widened the allowlist; it must not have removed it.
    const src = route();
    expect(src.includes('"application/x-msdownload"')).toBe(false);
    expect(src.includes("allowedContentTypes"), "the allowlist is gone entirely").toBe(true);
  });

  it("takes the organisation from the request, not from the path", () => {
    const src = route();
    expect(
      src.includes("await resolveOrg()"),
      "the upload route trusts the path's own organisation, which is not a check",
    ).toBe(true);
    expect(src.includes("belongs to a different organisation")).toBe(true);
  });
});
