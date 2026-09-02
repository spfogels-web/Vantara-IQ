import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
const url = fs.readFileSync(".env","utf8").split(/\r?\n/).find(l=>l.startsWith("DATABASE_URL=")).slice(13).replace(/^["']|["']$/g,"");
const db = new PrismaClient({datasources:{db:{url}}});
const rows = await db.rateImport.findMany({ orderBy:{createdAt:"desc"}, take:5,
  select:{ id:true, fileName:true, mediaType:true, status:true, docType:true, customer:true, market:true, error:true, summary:true, _count:{select:{rows:true}} }});
for (const r of rows)
  console.log(`${r.status.padEnd(10)} ${r.docType.padEnd(15)} ${r._count.rows} rows  ${r.fileName.slice(0,48)}\n   media=${r.mediaType} customer=${r.customer} market=${r.market}\n   error=${r.error || "—"}\n`);
await db.$disconnect();
