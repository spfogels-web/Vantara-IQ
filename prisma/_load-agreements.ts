/**
 * Registers the real Fortitude agreements as the operative documents.
 *
 * Onboarding was serving a generated placeholder — terms written to fill the
 * page, not the paper Fortitude actually signs. These are the real ones, so
 * they go in through the document centre rather than being hardcoded: the
 * download route already prefers an uploaded document over anything generated,
 * and putting them here means the next revision is an upload rather than a
 * deploy.
 *
 *   npx tsx prisma/_load-agreements.ts
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient, type DocType } from "@prisma/client";
import { put } from "@vercel/blob";

const db = new PrismaClient();

const DOCS: { file: string; type: DocType; title: string; download: string }[] = [
  {
    file: "pdf.net_Subcontractor-Agreement.pdf",
    type: "MASTER_SUBCONTRACTOR_AGREEMENT",
    title: "Subcontractor Agreement",
    download: "fortitude-subcontractor-agreement.pdf",
  },
  {
    file: "Mutual Non-Disclosure Agreement.pdf",
    type: "NDA",
    title: "Mutual Non-Disclosure Agreement",
    download: "fortitude-mutual-nda.pdf",
  },
];

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set.");
    process.exit(1);
  }

  for (const d of DOCS) {
    const bytes = readFileSync(d.file);
    const checksum = createHash("sha256").update(bytes).digest("hex");

    // Already loaded, byte for byte? Then there is nothing to do.
    const existing = await db.document.findFirst({
      where: { type: d.type, subcontractorId: null, deletedAt: null },
      include: { files: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (existing?.files[0]?.checksum === checksum) {
      console.log(`unchanged  ${d.title}`);
      continue;
    }

    const blob = await put(`agreements/${d.download}`, bytes, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: true,
    });

    const doc =
      existing ??
      (await db.document.create({
        data: {
          type: d.type,
          title: d.title,
          status: "APPROVED",
          createdBy: "system",
        },
      }));

    // A superseded template is history, not clutter — the old file stays on the
    // document so an agreement signed against it can still be produced.
    await db.documentFile.create({
      data: {
        documentId: doc.id,
        kind: "original_upload",
        storageKey: blob.url,
        fileName: d.download,
        mime: "application/pdf",
        sizeBytes: bytes.length,
        checksum,
        scanStatus: "clean",
        uploadedBy: "system",
      },
    });
    await db.document.update({
      where: { id: doc.id },
      data: { title: d.title, status: "APPROVED", deletedAt: null },
    });

    console.log(
      `${existing ? "replaced " : "loaded   "} ${d.title.padEnd(34)} ${(bytes.length / 1024).toFixed(0)} KB  ${blob.url}`,
    );
  }

  console.log("\nWhat the download routes will now serve:");
  for (const d of DOCS) {
    const doc = await db.document.findFirst({
      where: { type: d.type, subcontractorId: null, deletedAt: null, files: { some: {} } },
      orderBy: { updatedAt: "desc" },
      include: { files: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    console.log(`  ${d.type.padEnd(32)} ${doc?.files[0]?.fileName ?? "NOTHING"}`);
  }
}

main().finally(() => db.$disconnect());
