/**
 * The two daily sheets carrying Globe's crew number without a Globe project.
 *
 * 65 sheets carry 24208171927-A27-311; 63 join to a project belonging to Globe.
 * Before that number is written onto the Customer record as *the* Globe crew
 * number, the two that do not fit should be explained rather than rounded off
 * — a crew number that also appears on another customer's work would mean the
 * field does not mean what the backfill is about to assume it means.
 *
 * Read-only. Prints no credential.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;
const CREW = "24208171927-A27-311";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url || !url.includes("damp-mouse")) throw new Error("Not Fortitude production. Refusing.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const q = (sql: string, ...a: unknown[]) => db.$queryRawUnsafe<Row[]>(sql, ...a);

  const rows = await q(
    `select s.id,
            s."workDate",
            s.status,
            s."projectName",
            s."projectId",
            p.name    as project_name,
            p.number  as project_number,
            p.market  as project_market,
            c.name    as customer_name
       from "public"."DailySheet" s
       left join "public"."Project"  p on p.id = s."projectId"
       left join "public"."Customer" c on c.id = p."customerId"
      where s."crewNumber" = $1
        and (p.id is null or c.name is distinct from 'GLOBE COMMUNICATIONS')
      order by s."workDate"`,
    CREW,
  );

  console.log(`sheets with crew ${CREW} not joined to a Globe project: ${rows.length}`);
  console.log("");
  for (const r of rows) {
    console.log(`sheet id        : ${String(r.id)}`);
    console.log(`  workDate      : ${String(r.workDate)}`);
    console.log(`  status        : ${String(r.status)}`);
    console.log(`  projectId     : ${r.projectId === null ? "NULL — not linked to any project" : String(r.projectId)}`);
    console.log(`  projectName   : "${String(r.projectName ?? "")}"  (free text on the sheet)`);
    console.log(`  joined project: ${r.project_name === null ? "(none)" : `${String(r.project_number)} ${String(r.project_name)} [market ${String(r.project_market)}]`}`);
    console.log(`  customer      : ${r.customer_name === null ? "(none)" : String(r.customer_name)}`);
    console.log("");
  }

  // Does this crew number ever appear on work for the other customer?
  const other = await q(
    `select c.name as customer, count(*)::int as sheets
       from "public"."DailySheet" s
       join "public"."Project"  p on p.id = s."projectId"
       join "public"."Customer" c on c.id = p."customerId"
      where s."crewNumber" = $1
      group by 1 order by 2 desc`,
    CREW,
  );
  console.log("that crew number, by the customer it was worked for:");
  for (const r of other) console.log(`  ${String(r.customer).padEnd(26)} ${r.sheets} sheets`);
  console.log("");

  // And the reverse: does Trawick work ever carry a crew number?
  const trawick = await q(
    `select coalesce(nullif(s."crewNumber",''),'(blank)') as crew, count(*)::int as sheets
       from "public"."DailySheet" s
       join "public"."Project"  p on p.id = s."projectId"
       join "public"."Customer" c on c.id = p."customerId"
      where c.name <> 'GLOBE COMMUNICATIONS'
      group by 1 order by 2 desc`,
  );
  console.log("crew numbers on non-Globe customers' sheets:");
  if (!trawick.length) console.log("  (no sheets join to a non-Globe customer)");
  for (const r of trawick) console.log(`  ${String(r.crew).padEnd(26)} ${r.sheets} sheets`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message.split("\n").slice(0, 4).join(" | ") : String(e)}`);
  process.exit(1);
});
