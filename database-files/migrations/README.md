# Migrations

`Pandployer.sql` is a full schema dump. It only ever runs against an empty
database, so editing it fixes new environments and does nothing for one that
already has data. Anything that changes the shape of a live database needs a
file here as well, in the same commit.

## How they run

[dbmate](https://github.com/amacneil/dbmate) applies every migration in this
folder that the database has not run yet, in number order, and records each one
in the `schema_migrations` table. It connects with the same `DATABASE_URL` the
API uses: `api/.env` on the host, `compose.dev.yaml` under `npm run all`.

They run automatically every time the API starts: `npm run all`,
`npm run dev:api` and the production image all run `npm run db:migrate` first.
Under `npm run all` this folder is mounted into the API container, so a new
migration runs on `docker compose -f compose.dev.yaml restart api`. To run them
on their own from the host:

```sh
npm run db:migrate
```

If a migration fails, it is not recorded and the API does not start. dbmate
still prints `Applied:` for it; the `Error:` line after that is what counts.
MySQL commits each `ALTER` or `CREATE` as it runs, so a failed migration can be
half applied. Fix it and start the API again, which reruns it from the top.

To see what a database has run:

```sh
cd api && npx dbmate --migrations-dir ../database-files/migrations --no-dump-schema status
```

## Existing databases

A database built from `Pandployer.sql` before dbmate arrived has no
`schema_migrations` table, so the first start runs every migration here against
it. That is safe because every migration must be safe to run twice (see the
rules below). On a database that already had `001` to `005`, they change
nothing. After that first start, each migration runs once.

A database that never had one applied gets it for real on that first start:
`001` and `002` delete duplicate rows and `003` rewrites `Resume.checked`. Back
one up before its first start with dbmate:

```sh
mysqldump -h <host> -u <user> -p <database> > before-dbmate.sql
```

## Adding a migration

Name it with the next number, for example `006-what-it-does.sql`, and use this
shape. dbmate needs both marker lines; the `down` block can stay empty, since we
do not roll migrations back:

```sql
-- migrate:up
-- What this migration is for, and what it deletes, if anything.
CREATE TABLE IF NOT EXISTS ...;

-- migrate:down
```

Also update `Pandployer.sql`, so new databases get the change, and add a row to
the migration list at the bottom of this file.

CI fails a PR that adds a migration without both marker lines, numbers it out
of order, or edits an existing one. It also runs every migration with dbmate,
the way the API does at start, and then all of them twice more.

## Rules

- Number files in order and never edit one that has been applied anywhere. That
  includes the marker lines: they decide what dbmate runs. The one exception
  was wrapping `001` to `005` in them when dbmate arrived.
- Every migration must be safe to run twice. Check before you alter.
- If a migration adds a constraint, clean up the rows that violate it first.
  Production has data that the new schema forbids; that is the whole reason the
  constraint is being added.
- Say in a comment what the migration is for and what it deletes, if anything.

## Migration list

| File                               | What                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `001-resume-unique-vote.sql`       | One vote row per student per resume, and dedupe                             |
| `002-offers-unique-per-group.sql`  | One offer row per group per class, and dedupe                               |
| `003-resume-checked-per-group.sql` | `Resume.checked` is group-level; realign drifted rows                       |
| `004-group-confirmations.sql`      | `GroupConfirmations` table; res-review-group confirm state survives refresh |
| `005-step-completion.sql`          | `Step_Completion` table; the group barrier survives an API restart          |
| `006-users-present-at.sql`         | `Users.present_at`; gates wait only for students who showed up              |
| `007-resume-group-lookup-index.sql` | Index `Resume` by group, class and resume for the shortlist lookups |
| `008-pdf-extracted-text.sql`       | `extracted_text` on `Resume_pdfs` and `job_descriptions`, for the ATS       |
