# Setting up on a new computer

The database is **Neon Postgres in the cloud**, shared by every machine — there
is nothing to install or seed locally. What each computer needs is the
connection string, and that lives in `.env`, which is deliberately gitignored.
So a fresh clone has no credentials and every page renders empty until you
create it. That is the usual cause of "I cloned it and there's no data".

## Fastest path — pull the values from Vercel

The Vercel project already holds these variables, so don't retype them:

```sh
git clone https://github.com/spfogels-web/Vantara-IQ.git
cd Vantara-IQ
npm install

npx vercel login
npx vercel link            # choose the existing vantara-iq project
npx vercel env pull .env   # writes the real values into .env

npm run dev
```

Open http://localhost:3000 — you should see the same projects, customers and
dailies as on any other machine, because it's the same database.

### Pull into `.env`, not `.env.local`

`vercel env pull` defaults to `.env.local`. Next.js reads that file, but the
**Prisma CLI only reads `.env`** — so `prisma generate`, `npm run db:push` and
any migration will fail to find `DATABASE_URL` if the values land in
`.env.local`. Always pass the filename explicitly, as above.

## Manual path

If you'd rather not use the CLI, copy `.env.example` to `.env` and fill in the
values from the Neon dashboard and the Anthropic console. The file documents
what each variable is and where it comes from.

## Verify it worked

```sh
npx tsc --noEmit     # types clean
npm run lint         # lint clean
npm run dev          # app boots on :3000
```

If pages load but are empty, `DATABASE_URL` is missing or wrong — check that
`.env` contains a real `postgresql://...neon.tech/...` URL.

## After changing prisma/schema.prisma

```sh
npm run db:push      # applies the schema to Neon and regenerates the client
```

On Windows this fails with `EPERM ... query_engine-windows.dll.node` if the dev
server is running — it holds the Prisma engine open. Stop the dev server, run
the push, then start it again.

## Notes

- **Don't commit `.env`.** It holds live database credentials and an API key.
  `.gitignore` already blocks it; `.env.example` is the only env file tracked.
- **`BLOB_READ_WRITE_TOKEN` is optional but needed for uploads over ~4MB**
  (project maps, jobsite photos, large material lists). Without it those fall
  back to posting through the server and fail on big files.
- **GitHub → Settings → Environments is unrelated.** That screen feeds GitHub
  Actions, and this repo has no workflows. App secrets go in `.env` locally and
  in Vercel's Environment Variables for the deployed site.
