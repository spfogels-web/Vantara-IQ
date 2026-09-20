/**
 * VERIFICATION / MIGRATION TOOLING — server-side, run from a terminal. Never
 * imported by the application and never bundled.
 */
/**
 * Bring historical daily photographs into the evidence record.
 *
 *   npx tsx prisma/pending/backfill-daily-evidence.ts            # dry run
 *   npx tsx prisma/pending/backfill-daily-evidence.ts --apply    # writes
 *   npx tsx prisma/pending/backfill-daily-evidence.ts --tenant=apex --apply
 *
 * Daily photographs have lived in a JSON array on DailySheet since the sheet
 * was built: a url, a name, a structure, a caption, and the time it was
 * attached. Project evidence lives in ProjectPhoto, with a capture time, a
 * coordinate, and a stated origin for both. This copies the former into the
 * latter so one gallery can show the lot.
 *
 * ## What it will not invent
 *
 * Those JSON entries carry no coordinate and no capture time. Not one of them.
 * So every row this writes has:
 *
 *     capturedAt = null      capturedAtSource = ""
 *     lat = null  lng = null  locationSource = ""
 *
 * and the galleries will say "No location on file", which is true. The
 * temptation here is `addedAt` — every entry has one, it is a timestamp, and
 * it would make the records look complete. It is the moment the crew attached
 * the picture to the sheet, often hours after the shutter fired and sometimes
 * the following morning. Writing it into capturedAt would date every piece of
 * historical evidence wrong while making it look authoritative, which is worse
 * than having none: a blank field invites somebody to go and find the original,
 * and a wrong one does not.
 *
 * ## Idempotency
 *
 * Keyed on (dailySheetId, url). A second run writes nothing and says so. The
 * blob is not copied: the new row points at the same URL the sheet already
 * had, so this adds rows, not files.
 */
import { PrismaClient } from "@prisma/client";

import { identityOf, refuseForbiddenHost, targetFor, urlFor } from "../provision/targets";

type SheetPhotoish = {
  id?: unknown;
  url?: unknown;
  name?: unknown;
  structure?: unknown;
  caption?: unknown;
  addedAt?: unknown;
  /** Present only if a future sheet ever records one. Read, never invented. */
  lat?: unknown;
  lng?: unknown;
  locationSource?: unknown;
  capturedAt?: unknown;
  capturedAtSource?: unknown;
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

async function main() {
  const apply = process.argv.includes("--apply");
  const tenant = process.argv.find((a) => a.startsWith("--tenant="))?.split("=")[1];
  const useTest = process.argv.includes("--test");

  /**
   * Which database. Without --tenant this is the application's own
   * DATABASE_URL, which is how it will eventually be run against Fortitude —
   * under its own gate, by a person, not from here. With --tenant it goes
   * through the guarded path, which refuses a protected endpoint outright.
   */
  let url: string | undefined;
  if (useTest) {
    // The disposable Neon branch, for rehearsing this against a real copy of
    // the data before it is ever pointed at the business. Refused if it turns
    // out to name a live tenant, because a branch URL pasted from the wrong
    // console tab is exactly the mistake this whole path is shaped around.
    url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL is not set.");
    const host = new URL(url).host;
    for (const mark of ["damp-mouse", "aged-dew"]) {
      if (host.includes(mark)) {
        throw new Error(
          `Refusing --test: ${host.split(".")[0]} is a live tenant, not a disposable branch.`,
        );
      }
    }
  } else if (tenant) {
    const t = targetFor(tenant);
    url = urlFor(t, "pooled");
  } else {
    url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set and no --tenant was given");
    // Named explicitly so nobody reaches production by omitting an argument.
    if (!process.argv.includes("--i-mean-the-default-database")) {
      throw new Error(
        "Refusing to use DATABASE_URL implicitly. Pass --tenant=<org> for a demo tenant, " +
          "or --i-mean-the-default-database to say you meant this one.",
      );
    }
  }

  const id = identityOf(url);
  if (tenant) refuseForbiddenHost(id.host, "backfill target");

  console.log(`\nDaily evidence backfill ${apply ? "" : "(dry run)"}`);
  console.log(`  target ${id.host} / ${id.database}\n`);

  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    /**
     * Has 003 run here yet?
     *
     * The dedupe below reads ProjectPhoto.dailySheetId, which does not exist
     * until the migration adds it. A dry run should still be useful before
     * then — knowing how many rows are coming is exactly what somebody wants
     * *before* deciding to migrate — so it runs without the dedupe and says
     * so. Applying without the column is refused outright: there would be
     * nowhere to record which daily each row came from, and a second run
     * would have no way to tell it had already happened.
     */
    const migrated = (
      await db.$queryRawUnsafe<{ n: bigint }[]>(
        `select count(*)::bigint as n from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'ProjectPhoto' and column_name = 'dailySheetId'`,
      )
    )[0].n > 0;

    if (!migrated) {
      if (apply) {
        throw new Error(
          "003-project-evidence.sql has not been applied here. Refusing to write evidence rows " +
            "with nowhere to record which daily they came from.",
        );
      }
      console.log("  NOTE: 003 has not run here yet, so this counts without de-duplicating.\n");
    }

    const sheets = await db.dailySheet.findMany({
      select: { id: true, projectId: true, projectName: true, filedForId: true, photos: true, workDate: true, createdAt: true },
    });

    let entries = 0;
    let skippedNoUrl = 0;
    let skippedNoProject = 0;
    let existing = 0;
    let created = 0;
    let withRecoverableLocation = 0;

    for (const sheet of sheets) {
      const raw = Array.isArray(sheet.photos) ? (sheet.photos as SheetPhotoish[]) : [];
      for (const p of raw) {
        entries++;
        const url2 = str(p.url);
        if (!url2) {
          skippedNoUrl++;
          continue;
        }
        if (!sheet.projectId) {
          // No project, nowhere for it to appear. Left where it is.
          skippedNoProject++;
          continue;
        }

        const already = migrated
          ? await db.projectPhoto.findFirst({
              where: { dailySheetId: sheet.id, url: url2 },
              select: { id: true },
            })
          : null;
        if (already) {
          existing++;
          continue;
        }

        /**
         * Location, only if the entry genuinely carries one. Today none do;
         * this is here so that when sheets start recording a fix, a re-run
         * picks it up rather than needing a second tool.
         */
        const hasFix =
          typeof p.lat === "number" &&
          typeof p.lng === "number" &&
          (p.locationSource === "device" || p.locationSource === "exif");
        if (hasFix) withRecoverableLocation++;

        if (apply) {
          await db.projectPhoto.create({
            data: {
              projectId: sheet.projectId,
              url: url2,
              mediaType: "",
              kind: /\.(mp4|mov|webm)(\?|$)/i.test(url2) ? "VIDEO" : "PHOTO",
              source: "LIBRARY",
              stage: "WORK_RECORD",
              purpose: "RECORD",
              category: "OTHER",
              // The crew's own words about what it shows, kept.
              caption: [str(p.structure), str(p.caption)].filter(Boolean).join(" — "),
              // Not invented. See the note at the top of this file.
              capturedAt: null,
              capturedAtSource: "",
              lat: hasFix ? (p.lat as number) : null,
              lng: hasFix ? (p.lng as number) : null,
              locationSource: hasFix ? (p.locationSource as string) : "",
              dailySheetId: sheet.id,
              subcontractorId: sheet.filedForId,
              uploadedBy: "",
              // When it reached us, which the sheet does know.
              uploadedAt: (() => {
                const t = Date.parse(str(p.addedAt));
                return Number.isNaN(t) ? sheet.createdAt : new Date(t);
              })(),
            },
          });
        }
        created++;
      }
    }

    console.log(`  daily sheets:            ${sheets.length}`);
    console.log(`  photo entries:           ${entries}`);
    console.log(`  already linked:          ${existing}`);
    console.log(`  skipped, no url:         ${skippedNoUrl}`);
    console.log(`  skipped, no project:     ${skippedNoProject}`);
    console.log(`  ${apply ? "created" : "would create"}:  ${created}`);
    console.log(`  of those, carrying a real location: ${withRecoverableLocation}`);
    console.log(
      `\n  Every row ${apply ? "written" : "that would be written"} has capturedAt = null and no coordinate, ` +
        `because\n  the source records hold neither. The galleries will say "No location on file".`,
    );
    if (!apply) console.log("\n  DRY RUN — nothing was written. Re-run with --apply.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nBackfill failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
