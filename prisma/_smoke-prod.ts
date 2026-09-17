/**
 * Smoke test the live site after the ProjectCrew migration.
 *
 * Read-only. It signs in as a real staff user and a real crew — minting the
 * session the same way the application does — and asks for the pages and files
 * that resolve through the assignment relation, which is the thing that just
 * changed underneath them.
 *
 * The crew case is the one that matters: `visibleProjectIds` walks the new
 * join, so if the migration or the refactor were wrong, a foreman would open
 * their jobs list and find it empty. An empty list still returns 200, so every
 * check below looks for the crew's actual project by name rather than trusting
 * a status code.
 *
 *   npx tsx prisma/_smoke-prod.ts
 */
import { SignJWT } from "jose";

import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_URL || "https://www.vantaraiq.com";
const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! } },
});

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function cookieFor(userId: string, role: string) {
  const jwt = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  return `vq_session=${jwt}`;
}

/** Reassemble the flight stream so a name split across chunks is still found. */
function pageText(body: string) {
  const chunks: string[] = [];
  const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    try {
      chunks.push(JSON.parse(m[1]) as string);
    } catch {
      /* ignore a torn chunk */
    }
  }
  return body + "\n" + chunks.join("");
}

async function get(path: string, cookie?: string) {
  const res = await fetch(BASE + path, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
    cache: "no-store",
  });
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* binary */
  }
  return { status: res.status, location: res.headers.get("location"), body };
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  // A crew with a job that is still running.
  //
  // The projects page defaults to current work and hides finished jobs, so a
  // crew whose only assignment is complete correctly shows an empty list —
  // which reads exactly like a broken relation if you pick one by accident.
  const crewUser = await db.user.findFirst({
    where: {
      role: "SUBCONTRACTOR",
      subcontractor: { projects: { some: { project: { completedAt: null } } } },
    },
    select: {
      id: true,
      name: true,
      subcontractor: {
        select: {
          company: true,
          projects: {
            where: { project: { completedAt: null } },
            select: { project: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  const staffUser = await db.user.findFirst({
    where: { role: { in: ["ADMIN", "PM", "OFFICE", "SUPERVISOR"] } },
    select: { id: true, name: true, role: true },
  });
  if (!crewUser?.subcontractor || !staffUser) throw new Error("No crew or staff user to test with.");

  const theirJobs = crewUser.subcontractor.projects.map((p) => p.project);
  console.log(
    `  crew:  ${crewUser.subcontractor.company} — ${theirJobs.length} assigned job(s)\n  staff: ${staffUser.role}\n`,
  );

  /* ---------- public ---------- */
  const home = await get("/");
  check("marketing page loads signed out", home.status === 200 && home.body.includes("Vantara IQ"));
  const login = await get("/login");
  check("sign-in page loads", login.status === 200);

  /* ---------- staff ---------- */
  const staff = await cookieFor(staffUser.id, staffUser.role);
  const staffAuthed = await get("/projects", staff);
  if (staffAuthed.status === 307 || staffAuthed.status === 302) {
    check("staff session accepted", false, `redirected to ${staffAuthed.location} — AUTH_SECRET may differ from production`);
  } else {
    check("staff session accepted", staffAuthed.status === 200, `status ${staffAuthed.status}`);
  }

  const allProjects = await db.project.findMany({ select: { name: true }, take: 3 });
  const staffText = pageText(staffAuthed.body);
  check(
    "staff sees the projects list with real jobs on it",
    allProjects.some((p) => staffText.includes(p.name)),
    allProjects.map((p) => p.name).join(" / "),
  );

  const roster = await get("/subcontractors", staff);
  check(
    "staff sees the crew roster",
    roster.status === 200 && pageText(roster.body).includes(crewUser.subcontractor.company),
    `status ${roster.status}`,
  );

  // The assignment relation, read from the staff side.
  const projectPage = await get(`/projects/${theirJobs[0].id}`, staff);
  check(
    "staff opens a job and its assigned crew is shown",
    projectPage.status === 200 && pageText(projectPage.body).includes(crewUser.subcontractor.company),
    `${theirJobs[0].name} — status ${projectPage.status}`,
  );

  /* ---------- crew ---------- */
  const crew = await cookieFor(crewUser.id, "SUBCONTRACTOR");
  const crewProjects = await get("/projects", crew);
  const crewText = pageText(crewProjects.body);
  check("crew reaches their projects page", crewProjects.status === 200, `status ${crewProjects.status}`);
  check(
    "crew's own assigned job appears — the relation resolved",
    theirJobs.some((j) => crewText.includes(j.name)),
    theirJobs.map((j) => j.name).join(" / "),
  );

  const dailies = await get("/dailies", crew);
  check("crew reaches their dailies", dailies.status === 200, `status ${dailies.status}`);

  // A file gated on the assignment.
  const map = await get(`/api/project-map/${theirJobs[0].id}`, crew);
  check(
    "crew may open the print for a job they are on",
    map.status === 200 || map.status === 404,
    `status ${map.status}${map.status === 404 ? " (no map uploaded — the guard still passed)" : ""}`,
  );

  // And still refused for one they are not on.
  const notTheirs = await db.project.findFirst({
    where: { id: { notIn: theirJobs.map((j) => j.id) }, crews: { none: { subcontractorId: crewUser.subcontractor ? undefined : "" } } },
    select: { id: true, name: true },
  });
  if (notTheirs) {
    const denied = await get(`/api/project-map/${notTheirs.id}`, crew);
    check(
      "crew is still refused a job they are not on",
      denied.status === 403 || denied.status === 307 || denied.status === 302,
      `${notTheirs.name} — status ${denied.status}`,
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("SMOKE FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
