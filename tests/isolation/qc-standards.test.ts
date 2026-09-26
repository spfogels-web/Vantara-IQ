/**
 * Whose standard applies to a job, and what is quoted from whose document.
 *
 * Two things are being protected here and both are about telling the truth to
 * a crew standing over a hole.
 *
 * The first is attribution. A requirement tagged QCC is quoted from
 * Windstream's manual and carries its page; a requirement tagged FORTITUDE is
 * ours. A crew arguing a callback needs to know which, because they have
 * different consequences and different people to appeal to.
 *
 * The second is that Kinetic is never a fallback. A job built for somebody
 * else must not be shown Windstream's specification because the resolver
 * could not work out whose job it was — that is worse than showing only our
 * own documentation rules, and it is the failure mode a default would create.
 */
import { describe, expect, it } from "vitest";

import { qcProfileFor, qcProfileById, sourceLabel, QC_EXAMPLES } from "@/lib/qc-standards";

describe("which standard a job is built to", () => {
  it("gives a Windstream job the Kinetic standard", () => {
    const p = qcProfileFor({ customerShortCode: "WIN" });
    expect(p.id).toBe("kinetic-osp");
    expect(p.manual, "a Kinetic job has no manual to open").not.toBeNull();
    expect(p.manual?.href).toBe("/qc/quality-assurance-guide.pdf");
  });

  it("does not give Trawick the Kinetic standard", () => {
    const p = qcProfileFor({ customerShortCode: "TRA" });
    expect(p.id, "Trawick was handed another carrier's specification").toBe("fortitude-general");
    expect(p.manual, "a non-Kinetic job was offered the Kinetic manual").toBeNull();
  });

  it("never falls back to Kinetic for an unknown or unlinked customer", () => {
    // The failure this exists to prevent: a job nobody has linked to a
    // customer quietly inheriting Windstream's requirements.
    for (const code of [null, undefined, "", "   ", "ACME", "unknown", "win-ish"]) {
      const p = qcProfileFor({ customerShortCode: code as string | null | undefined });
      expect(p.id, `"${String(code)}" resolved to Kinetic`).toBe("fortitude-general");
      expect(p.manual, `"${String(code)}" was offered the Kinetic manual`).toBeNull();
    }
  });

  it("is not fooled by case or whitespace on the code", () => {
    expect(qcProfileFor({ customerShortCode: " win " }).id).toBe("kinetic-osp");
    expect(qcProfileFor({ customerShortCode: "Win" }).id).toBe("kinetic-osp");
  });

  it("resolves an unknown profile id to Fortitude rather than Kinetic", () => {
    expect(qcProfileById("no-such-profile").id).toBe("fortitude-general");
  });
});

describe("a non-Kinetic job carries no Kinetic content at all", () => {
  const p = qcProfileFor({ customerShortCode: "TRA" });
  const everything = JSON.stringify(p);

  it("names no carrier in its requirements", () => {
    for (const word of ["Kinetic", "Windstream", "QCC", "GBB"]) {
      expect(everything, `"${word}" leaked into the Fortitude-only profile`).not.toContain(word);
    }
  });

  it("carries no page references", () => {
    const pages = p.groups.flatMap((g) => g.items).filter((i) => i.source.kind === "QCC");
    expect(pages, "a Fortitude-only profile quoted the manual").toEqual([]);
  });

  it("still carries our own rules, which apply on every job", () => {
    const text = p.groups.flatMap((g) => g.items).map((i) => i.text).join(" ");
    expect(text).toMatch(/tick marks/i);
    expect(text).toMatch(/pre-construction/i);
    expect(text).toMatch(/redline/i);
  });
});

describe("every requirement says where it came from", () => {
  const kinetic = qcProfileFor({ customerShortCode: "WIN" });

  it("labels each one QCC with a page, or FORTITUDE", () => {
    for (const g of kinetic.groups) {
      for (const i of g.items) {
        if (i.source.kind === "QCC") {
          expect(i.source.page, `"${i.text}" is QCC with no page`).toBeGreaterThan(0);
          expect(sourceLabel(i.source)).toMatch(/^QCC p\d+$/);
        } else {
          expect(sourceLabel(i.source)).toBe("Fortitude");
        }
      }
    }
  });

  it("does not attribute our own rules to the manual", () => {
    // These are Fortitude's documentation and commercial rules. Presenting
    // them as Windstream's would be inventing a requirement in somebody
    // else's name.
    const qccText = kinetic.groups
      .flatMap((g) => g.items)
      .filter((i) => i.source.kind === "QCC")
      .map((i) => i.text)
      .join(" ")
      .toLowerCase();
    for (const ours of ["tick mark", "timestamp", "redline", "ped to ped", "pre-construction"]) {
      expect(qccText, `"${ours}" is attributed to the QCC manual`).not.toContain(ours);
    }
  });

  it("cites only pages the buried section actually occupies", () => {
    const pages = new Set(
      kinetic.groups
        .flatMap((g) => g.items)
        .filter((i) => i.source.kind === "QCC")
        .map((i) => (i.source as { page: number }).page),
    );
    // Pedestals 25, flowerpots 26, FDH 28, handholes 29.
    expect([...pages].sort((a, b) => a - b)).toEqual([25, 26, 28, 29]);
  });
});

describe("the structure measurements stay distinct", () => {
  const kinetic = qcProfileFor({ customerShortCode: "WIN" });
  const group = (id: string) => kinetic.groups.find((g) => g.id === id)!;
  const textOf = (id: string) => group(id).items.map((i) => i.text).join(" | ");

  it("gives a pedestal no invented trim measurement", () => {
    // The defect this pins: the flowerpot's 2-3" was being stated as a
    // pedestal requirement. The manual's pedestal page says only "sealed and
    // secured" and gives no figure at all.
    const ped = textOf("pedestal");
    expect(ped).toMatch(/sealed and secured/i);
    expect(ped, "a trim measurement was invented for pedestals").not.toMatch(
      /trimmed|above the gravel/i,
    );
  });

  it("keeps the flowerpot at 2–3 inches above the gravel", () => {
    expect(textOf("flowerpot")).toMatch(/2–3 inches above the gravel/);
  });

  it("keeps the handhole at 4–6 inches above the gravel", () => {
    expect(textOf("handhole")).toMatch(/4–6 inches above the gravel/);
  });

  it("does not give the two structures the same figure", () => {
    const flower = textOf("flowerpot");
    const hand = textOf("handhole");
    expect(flower, "the handhole figure appeared on the flowerpot").not.toMatch(/4–6 inches/);
    expect(hand, "the flowerpot figure appeared on the handhole").not.toMatch(/2–3 inches above/);
  });

  it("keeps the gravel depths as the manual gives them", () => {
    // Pedestal 2-4", handhole approx 2-3". Different pages, different numbers.
    expect(textOf("pedestal")).toMatch(/2–4 inches of pea gravel/);
    expect(textOf("handhole")).toMatch(/2–3 inches of pea gravel/);
  });
});

describe("the approved photographs", () => {
  it("are the two replacements and nothing else", () => {
    expect(QC_EXAMPLES).toHaveLength(2);
    expect(QC_EXAMPLES.map((e) => e.src)).toEqual([
      "/qc/pedestal-BD4MPF.jpg",
      "/qc/pedestal-BD4MPFrear.jpg",
    ]);
  });

  it("no longer offers the superseded diagrams as examples", () => {
    const srcs = QC_EXAMPLES.map((e) => e.src).join(" ");
    expect(srcs, "an old example image is still being shown").not.toMatch(
      /flowerpot\.png|fdh-pedestal\.png/,
    );
  });

  it("is backed by files that are really there", async () => {
    const { existsSync } = await import("node:fs");
    for (const e of QC_EXAMPLES) {
      expect(existsSync(`public${e.src}`), `${e.src} is referenced but absent`).toBe(true);
    }
  });
});

describe("what the application claims it can check", () => {
  it("never claims to verify something only a person can answer", () => {
    const kinetic = qcProfileFor({ customerShortCode: "WIN" });
    // Gravel depth, ground rod height and cable labelling are not visible to
    // this application and never will be. Marking one "enforced" would be a
    // claim the submit path cannot honour.
    const enforced = kinetic.groups
      .flatMap((g) => g.items)
      .filter((i) => i.verify === "enforced")
      .map((i) => i.text.toLowerCase());
    for (const t of enforced) {
      expect(t, `"${t}" is marked enforced but nothing checks it`).toMatch(
        /photograph|redline|road|pre-construction/,
      );
    }
  });
});
