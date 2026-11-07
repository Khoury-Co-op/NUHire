# Simulated class

The app has been run with one teacher and three students. The pilot is 30. This
folder builds a 30-student class in the local stack so you can see group
behaviour at the real size, and holds the tooling for load tests on top of it
(INFRA-3 in [TICKETS.md](../../TICKETS.md) is the seed; INFRA-14 is the load
test).

Local-only, like the rest of `.local/`. Every script refuses to run unless the
database, the API and Keycloak are all on `localhost`, and there is no flag to
override that.

```
.local/tests/
  lib/          shared code: env, roster, db, keycloak admin, login, cleanup
  seed/         seed.mjs, wipe.mjs, check.mjs, scenarios.mjs
  load-tests/   run.mjs, student.mjs, advisor.mjs, journey.mjs, metrics.mjs
  races/        run.mjs, harness.mjs, cases/ (one file per area)
```

## Commands

Run from the repo root with the stack up (`npm run all`, or just the database,
Keycloak and API: `docker compose -f compose.dev.yaml up -d --wait db keycloak api`).

| Command                                   | What it does                                                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run seed`                            | Builds the class in Keycloak and MySQL. Safe to run again.                                                                                                                                                        |
| `npm run seed -- --scenario=NAME`         | The same, left in a later state. See [Scenarios](#scenarios).                                                                                                                                                     |
| `npm run seed:check [-- --scenario=NAME]` | Logs in every account except the dormant student through Keycloak, checks the database, and asks the real API about the scenario (`fresh` unless you name the one you seeded). Exits non-zero if anything is off. |
| `npm run seed:wipe`                       | Deletes the class and its accounts. Lists what it will remove and asks you to type the class number.                                                                                                              |
| `npm run seed:reset [-- --scenario=NAME]` | Wipe the database side, keep the Keycloak accounts, seed again. A reset takes a couple of seconds.                                                                                                                |

The scripts read `api/.env.example`, the same file the dev stack uses, so there is
nothing to configure. Three optional overrides (commented out there):
`KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD` (default `admin`/`admin`) and
`SEED_API_URL` (default `http://localhost:5001`).

`seed:wipe -- --yes` skips the prompt, `seed:wipe -- --keep-keycloak` leaves the
Keycloak accounts in place, and `seed:check -- --include-dormant` also logs in the
student who is meant never to.

## The class

One advisor, 30 students, 8 groups, class number **9001**. Everyone's password is
`nuhire`. All addresses are on `example.test`, a reserved domain, so nothing here
can be mistaken for a real person.

| Email                                   | Group  | Why it is there                                                           |
| --------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `advisor01@example.test`                | -      | The teacher.                                                              |
| `student01` to `student24@example.test` | 1 to 6 | Four to a group.                                                          |
| `student04@example.test`                | 1      | **Never logs in.** On the roster but not present, so group 1 waits for 3. |
| `student12@example.test`                | 3      | **Stale `Progress` row**: it still names group 2. See below.              |
| `student25@example.test`                | 7      | A group of one.                                                           |
| `student26` to `student29@example.test` | 8      | Four to a group.                                                          |
| `student30@example.test`                | none   | On the roster with no group.                                              |

Class 9001 shares group numbers 1 and 2 with the class `.local/seed.sql` makes.
That is useful: anything scoped by group alone and not by `(group_id, class)`
will show up as two classes' students mixed together.

The roster lives in one file, `lib/roster.mjs`. The seed, the wipe and the check
all read it.

**The stale `Progress` row.** `student12` is in group 3, but their `Progress` row
still says group 2, as if they had been moved between groups. Group 2's progress
list (`GET /progress/group/9001/2`) includes them, group 3's does not, and the
step the teacher dashboard shows for group 2 is worked out with their row
counted. The student's own page still works, because the app looks `Progress` up
by email.

## Scenarios

`--scenario=` leaves the class at a point in the activity. Every scenario after
`fresh` starts all the groups and gives each student who can act a `Progress` row,
a matching `current_page`, and the work they would really have produced. This table
is the only description of the scenarios; the code builds each from a per-group
plan in `seed/scenarios.mjs`.

| Scenario            | State                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `fresh` (default)   | Job assigned, no group started. Students sit on `/waitingGroup`.                                                                  |
| `mid-resume-review` | Everyone is partway through the 10 resumes. No group has finished.                                                                |
| `waiting-on-group`  | Group 2 waits at the resume barrier at 3 of 4, group 8 at 2 of 4, and groups 1 and 3 to 7 are through it.                         |
| `interview-stage`   | Groups 2 to 8 shortlisted four resumes and are partway through rating interviews. Group 1 has not moved.                          |
| `offers-pending`    | Groups 2 to 8 finished their interviews. Groups 2 to 6 have a pending offer, groups 7 and 8 are still deciding. Group 1 as above. |

Group 1 is the absent student the seed exists to reproduce. The seed marks
everyone else who acts as present (`Users.present_at`, as their socket would),
so in every scenario after `fresh` group 1's barrier reads 3 of 3 and is open.
Its students are still on the resume review; the release reaches them when they
next join the group room.

`seed:check` does not just compare database rows. It asks the real API (the
barrier status for each group, the finished-interview count, the offers) and
compares the answers with what the scenario's plan says they should be. When the
app changes in a way that breaks a scenario, the check fails instead of the
scenario quietly going stale.

Offers are one per group: the `Offers` table has a unique key on class and group
(migration 002), so a duplicate pending offer cannot be seeded. A second submit
updates the existing one.

## Load test

`npm run load` reseeds `fresh`, then walks 29 students (all but the dormant one)
and the advisor through the whole activity at once. It prints latency per route
and socket event, then PASS or FAIL against INFRA-14: API p95 under 500ms, no
request unanswered after 10s, no stuck student, class-start burst under 2s.
`npm run load -- --restart` also crashes the API for 5s halfway through resume
review.

`SOCKET_AUTH_REQUIRED` is on by default; an `api/.env` copied from an older
example may still set it to `false`. The report says which mode it saw.

Each method in `load-tests/student.mjs` copies one page's requests and socket
events, bugs included. When a page changes, change its method. `journey.mjs`
says where each student should end. Method and results:
[docs/LOAD_TEST.md](../../docs/LOAD_TEST.md).

## Race check

`npm run races` builds `api/` and fires 30 concurrent first writes at each
write that has to be atomic, five rounds each, then prints PASS or FAIL per
case. It needs only MySQL up, not the API or Keycloak, and finishes in a few
seconds.

MySQL made these writes atomic with `ON DUPLICATE KEY UPDATE` and
`INSERT IGNORE`. Prisma has neither, and its `upsert` reads before it writes,
so the helpers in `api/src/repository/writes.ts` replace them (AGENTS.md, "How
code should look here"). The script runs the compiled helpers and repositories
against real tables, because the race only exists with a real database.

- `cases/writes.mjs` checks each helper. Its two `INFO` lines are controls: a
  bare `upsert`, and an upsert retried inside a transaction. Both lose writes,
  which is the reason for each rule. They never fail the run, and say so if
  the race did not show up.
- `cases/<area>.mjs` checks an area's own repository writes. A ticket that
  moves a write adds its case there and lists the file in `AREAS` in
  `run.mjs`.

Every case writes under class ids 990000 to 990999, which no real or seeded
class uses, and the script deletes those rows before and after it runs. A case
on a table with a foreign key creates the rows it needs in `setup`, in that
range, and deletes them in its file's `cleanup`.

## How the fake students log in

**They log in through the real Keycloak login page, scripted.** The alternative
was a test-only login route in the API that skips Keycloak when an env flag is
set. We did not do that, for these reasons:

- **A bypass is a hole in auth.** It would be a few lines in `auth.controller.ts`
  guarded by one environment variable, and that variable is the only thing
  between it and production. This repo has already had session bugs (SEC-19), and
  `SELF-WORK.md` says changes to auth go through Aarav first.
- **The real path is the one that breaks.** The login flow sets a state cookie,
  regenerates the session, reads the profile name, and decides where to send you.
  A bypass skips all of it, so a load test built on one would pass while real
  logins failed.
- **Thirty students logging in at once is part of the load.** At the start of a
  class they all do it within a minute.

The cost is real: `lib/login.mjs` has to follow the redirects by hand, keep
cookies, and read the form out of Keycloak's login page, so a Keycloak theme or
version change can break it. The compose file pins Keycloak, and `seed:check`
exercises the helper, so a break shows up right away (CI runs it on every pull
request). The helper is the only place that knows about the form.

Each login gets its own cookie jar. A shared one would log everyone in as
whoever went first, because Keycloak's SSO cookie wins.

## Things that will surprise you

- **Keycloak only accepts `northeastern.edu` addresses unless told otherwise.**
  The local realm has an email validator for that, so it rejected the
  `example.test` accounts. `.local/realm-export.json` now allows `example.test`
  as well. Keycloak imports a realm once, so a container created before that
  change keeps the old rule: `seed` stops and tells you to run
  `docker compose -f compose.dev.yaml up -d --force-recreate keycloak api`. The
  API is recreated too because it shares Keycloak's network.
- **Recreating the containers deletes the Keycloak accounts but not the
  database.** Keycloak has no volume and re-imports its realm on every boot, so
  `npm run down` then `npm run all` leaves the 31 users in MySQL with no login.
  `npm run seed` puts the Keycloak side back. (`npm run reset` drops the database
  volume as well, and clears both.)
- **The advisor's row has to exist as an admin before their first login.**
  Otherwise the API creates it with affiliation `none` and sends them to the
  signup form. The seed does this in the right order; if you add accounts by
  hand, keep it in mind.
- **Names must be exactly two words.** The login callback splits Keycloak's
  `name` on a space. That is why the students are "Student 01", not "Student".
- **The student with no group lands on `/waitingGroup` and stays there.** The
  login callback looks up the group with `group_id = NULL`, which matches
  nothing. That is how it behaves today, not something this folder fixes.
- **A step is spelled three ways.** `Progress.step`, `Users.current_page` and the
  route all say where a student is, and the client's route guard trusts
  `Progress.step`. A scenario that wrote one without the others would have the
  student bounced to the dashboard, so they are always written together.
- **`resume_number` is a resume's id, not 1 to 10.** And `candidate_id` is a
  `Resume_pdfs.id`, not a `Candidates.id`.
- **One browser holds one login.** Use a private window for each person.
- **The seed rewrites the class's work.** It deletes votes, offers and progress
  for the simulated students before writing its own. It checks first that class
  9001 belongs to the simulated advisor and holds no one else, and stops if not.
