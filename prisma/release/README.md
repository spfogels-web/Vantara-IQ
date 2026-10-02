# Applying a migration

Three things have to be true before a reviewed migration touches production, and
each of them is enforced by code rather than by remembering:

1. the file is in the reviewed set and its bytes match what was reviewed,
2. the target is positively identified as Fortitude's **direct** endpoint,
3. production differs from the committed schema only in ways this migration
   explains, and reconciling it needs nothing destructive.

```
npx tsx prisma/release/apply-production.ts 012
```

It refuses on any of the three. It cannot `db push` and cannot pass
`--accept-data-loss`; neither string appears in the file.

---

## `VQ_PROVISION_URL` is not a variable you set

**If it is unset, that is correct. Leave it alone.** It has cost two
investigations already.

It is a variable name the provisioning scripts *invent and inject into their own
child process*. It never appears in `.env`, in Vercel, or in a shell profile,
and it is not a credential.

The reason is a near-miss. A provisioning command once aimed at the
demonstration tenant and wrote to production instead: the shell's
`DATABASE_URL` was overridden, Prisma loaded `.env` afterwards, Fortitude's
value won, and the command printed the host it had chosen and pushed anyway.

So `prisma/provision/provision.ts` and `rehearse-migration.ts` generate a
temporary schema file whose datasource reads `env("VQ_PROVISION_URL")`, and
supply that variable only in the environment of the child process they spawn:

```ts
env: { ...process.env, [PROVISION_VAR]: withSchema(base, scratch) }
```

`DATABASE_URL` cannot satisfy that datasource however it is loaded, and there is
no `directUrl` for Fortitude's unpooled string to fill. The target has to be
chosen deliberately, and the host it resolves to is checked against a deny list
and against the endpoint the organisation is expected to live on *before* Prisma
is invoked at all.

**Symptom to recognise:** if a provisioning script fails, the cause is the
tenant credential it resolves (`APEX_DATABASE_URL_UNPOOLED` and friends), never
`VQ_PROVISION_URL`. Check the username and host of the tenant variable. A
single-character typo in the username — `neondb_osner` for `neondb_owner` —
presented as `Authentication failed ... for (not available)`, which names no
variable and reads like an expired credential.

---

## Endpoints

| Variable | Endpoint | Used for |
|---|---|---|
| `DATABASE_URL` | pooled | the running application |
| `DATABASE_URL_UNPOOLED` | **direct** | migrations, verification, the production diff |
| `APEX_DATABASE_URL_UNPOOLED` | **direct** | provisioning and rehearsing the demo tenant |
| `TEST_DATABASE_URL` | pooled | the isolation suite (strip `-pooler` for DDL) |

Migrations and introspection run on the **direct** endpoint, never the pooled
one. A pooler can hand back a server connection carrying an earlier session's
`search_path`; measured on this database that left `current_schema()` as NULL,
and `?schema=` is applied as a session setting so it is not reliable through a
pooler either.

---

## Why the production diff is part of the gate

The test suite builds its database **from `prisma/schema.prisma`**, so it agrees
with that file by construction and cannot see a disagreement between it and
production.

That is not theoretical. A stray `sed` added `subcontractorName` to the `User`
model as well as the one it was aimed at. No migration created the column. Every
test passed. The first symptom would have been sign-in failing in production,
because the generated client selects every declared field.

`tests/isolation/migration-gate.test.ts` now diffs the committed datamodel
against the real production database and fails on anything the pending migration
does not account for. It fails rather than skips when the credential is missing:
a gate that turns itself off when a variable is absent provides exactly the
confidence that let that defect through.
