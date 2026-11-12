# NUHire Backlog

**Team:** ~10 hrs/wk each, one 12-week semester.
**Goal:** pilot-ready by end of term, run in one CS1210 section (~30 students).

New here? Read [docs/WHAT_IS_NUHIRE.md](docs/WHAT_IS_NUHIRE.md), then
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), then [AGENTS.md](AGENTS.md).

---

## How this is organised

Four sections, each split by horizon. Ticket IDs are unchanged from the previous
version of this file so older references and the Linear import still resolve;
only the grouping moved.

| Section      | What                                                             |
| ------------ | ---------------------------------------------------------------- |
| **INFRA**    | CI, staging, tests, migrations, seed data, deploy, observability |
| **BACKEND**  | schema, sockets, the barrier, scoping, API correctness           |
| **FRONTEND** | design system, accessibility, the student step pages             |
| **PRODUCT**  | teacher features and the parts of the simulation not built yet   |

| Horizon    | When        | What belongs here                                              |
| ---------- | ----------- | -------------------------------------------------------------- |
| **Short**  | weeks 1–4   | No spec needed, small blast radius, mostly one file            |
| **Medium** | weeks 5–9   | Needs the migration runner, seed data, or tests to exist first |
| **Long**   | weeks 10–14 | Large refactors, and features that depend on everything else   |

`[GFI]` good first issue · `[MED]` medium · `[HARD]` hard
`[SPEC]` needs a written spec before handing to a beginner
`[LEAD]` lead does this; a dev can't bootstrap it
`[SEC]` security

**Capacity.** Multiply headcount by ~10 hrs/wk by 12 weeks, then take a bit
over half: the first two weeks go to setup and onboarding, and nobody gets
their full hours every week. What is open below is roughly 850 hours, which is
more than we have on purpose. This is a priority queue, not a to-do list. Do
not try to finish it. Work top-down within each section.

---

## Recently closed — do not re-open

A bug-fix pass landed before this file was rewritten. These are done and
verified; the detail is in git history.

| ID                     | What was fixed                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-1`                | Moderator login accepted an empty body when env vars were unset                                                                                                               |
| `SEC-2`                | Notes IDOR — any student could read any other student's notes                                                                                                                 |
| `SEC-3`                | `POST /users` had no middleware; anyone could self-promote to admin. Instructor status is now checked server-side against `Moderator`                                         |
| `SEC-4` _(partial)_    | The three unauthenticated `/moderator/crns` routes now require a moderator session. Super-admin is still undefined — see `SEC-4b`                                             |
| `SEC-6`                | `requireAdmin` applied across group/job/csv/facts/delete/upload/offer mutations                                                                                               |
| `SEC-10`               | Path traversal in the resume download. `..%2f..%2f.env` resolved to the real `api/.env`; now contained by `basename` + `root`                                                 |
| `SEC-11`               | `GET /users` is admin-only; `check/:email` answers only for the caller                                                                                                        |
| `SEC-12` _(partial)_   | `saveUninitialized: false` — anonymous requests no longer write a MySQL session row. `SESSION_SECRET` length check still open                                                 |
| `SEC-13`               | `/stats` requires admin; the route-timestamp arrays are bounded                                                                                                               |
| `API-2`                | No `process.exit` on unhandled rejection, Express error middleware, `restart: unless-stopped`, `/health` healthcheck                                                          |
| `API-8`                | Real transactions on a checked-out connection at all three sites. `withTransaction` helper and CI grep still open — see `API-8b`                                              |
| `STU-21`               | A late student is offered their group's step on the dashboard and skips the solo resume review                                                                                |
| `API-10`               | Zero bare `io.emit` remain; advisor events go to the class's moderators                                                                                                       |
| `API-12`               | `getCheckedResumes` returned the inverted set (`checked = "True"` coerced to 0)                                                                                               |
| `STU-1,2,4,5`          | `/employerPannel` 404, `NEXT_PUBLIC_FRONT_URL`, dashboard progress field, `/about` wiping localStorage                                                                        |
| `STU-17`               | Duplicate sockets in `note.tsx` and `mod-dashboard` (the latter opened a connection per render for two events with no listeners)                                              |
| `STU-22`               | `checkExistingOffer` read an array as an object, so the guard never fired and two clicks made two offers                                                                      |
| `UI-1`, `UI-2`, `UI-5` | Undefined Tailwind classes, invalid z-index utilities, debug output rendered into the student UI                                                                              |
| `STU-6`                | res-review now persists each decision as it is cast, with a retry queue; completion is announced only once the server holds the rows                                          |
| `STU-7`                | teamConfirmations persisted in GroupConfirmations, re-read on mount and reconnect; unconfirm wired up                                                                         |
| `STU-3`                | useProgress maps step to route instead of redirecting to /res_1 and 404ing                                                                                                    |
| `API-4`                | the group barrier moved from process memory into Step_Completion, re-evaluated by query on completion and room join, with GET /groups/barrier-status as a non-socket fallback |
| `API-5`                | POST /groups/force-advance, admin only, so a deadlocked group no longer needs a DBA mid-class                                                                                 |
| `API-7`                | finite queueLimit, connect and query timeouts, /health/db reporting free/used/queued                                                                                          |
| `API-15`               | sixteen handlers stopped returning raw MySQL errors to the browser                                                                                                            |
| `API-1`                | single-replica constraint documented and a boot warning when INSTANCE_COUNT exceeds 1                                                                                         |
| `SEC-9`                | uploads behind auth with uuid filenames, size limit and PDF magic-byte check; /uploads no longer express.static                                                               |
| `SEC-19`               | OAuth state turned on; a forged or missing state is rejected before any token exchange                                                                                        |
| `SEC-12b`              | API refuses to boot when SESSION_SECRET is unset or under 32 chars                                                                                                            |
| `API-8b`               | acquire failures answer 503 instead of hanging the request                                                                                                                    |
| `API-12b`              | Resume.checked settled as group-level, documented at the column, drifted rows realigned by migration 003                                                                      |
| `TCH-4`                | CSV email validation restored, invalid rows listed with row number and excluded from submit                                                                                   |
| `TCH-5`                | RFC-4180 parser replacing split(','), handling quoted commas, escapes, CRLF and BOM                                                                                           |
| `TCH-6`                | students-per-group input with auto-assign, replacing the hardcoded group_id 1                                                                                                 |
| `UI-3`                 | stray literal 't' removed from the notes textarea                                                                                                                             |
| `UI-8`                 | pending-offers and sendpopups deleted, 1,106 unreachable lines                                                                                                                |
| `TCH-10`               | pending-offers deleted; ManageGroupsTab is the one implementation                                                                                                             |
| `STU-12`               | the interview stage saves each rating as it is submitted, resumes at the first candidate the server has no rating for, and per-user keys stop a lab browser leaking position  |

Also landed, previously untracked:

- **A clean clone can now start the app.** `.gitignore`'s `.env*` was swallowing both `.env.example` files, and `.local/` was hidden in `.git/info/exclude`. Every setup path in `ONBOARDING.md` ran through files that existed only on the lead's machine.
- **Socket handlers can no longer kill the API.** Every handler destructured its payload and socket.io does not catch a throw, so one `socket.emit('adminOnline')` from a browser console reached `uncaughtException` and exited the process. All 22 handlers now register through a wrapper that defaults the payload and catches.
- **Sockets have identity.** The Express session runs over the handshake, so `socket.data.user` is populated, and a student can no longer `socket.join()` another group's room. See `SEC-7` for the remaining step.
- **One vote row per student per resume.** `Resume` had no unique key, so `ON DUPLICATE KEY UPDATE` never fired and every vote change appended a row. Migration `001` dedupes and adds the key.
- **The landing page was 83 MB of raw camera JPEGs** (one was 8256×5504). Now 4.5 MB. A 30-student class was pulling ~2.5 GB before anyone clicked anything.
- **`socket@0.14.103`** — the Socket.dev CLI, zero imports, and the only path to the critical advisory. Removed. `npm audit` went 34 → 15, critical 1 → 0.
- **`CLAUDE.md` became `AGENTS.md`** so every tool reads one file. `CLAUDE.md` is now a pointer that imports it.

---

# START HERE: week 1

Three lead tickets must land **before** devs pick anything up: `INFRA-1`,
`INFRA-2`, `INFRA-3`. Without them the team shows up with nothing they can do.

Then these six. All independent, all different files, so six people can start
at once without colliding. Two are deliberately hard: the team is experienced
and nobody stays interested on a diet of two-hour fixes.

| #   | Ticket                                                | Est | Level |
| --- | ----------------------------------------------------- | --- | ----- |
| 1   | `ONB-1` Run the app and log every place the docs lied | 3h  | GFI   |
| 2   | `UI-9` Rewrite the Tailwind theme tokens              | 6h  | MED   |
| 3   | `TCH-1` Confirmation dialog on "Assign Job"           | 5h  | GFI   |
| 4   | `STU-8` Stop `/jobdes` resetting progress backwards   | 4h  | MED   |
| 5   | `SEC-8` Authorize socket events by role               | 18h | HARD  |
| 6   | `TCH-11`+`TCH-12` Candidate stats endpoint and modal  | 26h | HARD  |

`SEC-8` and `TCH-11`/`TCH-12` each want a short spec from the lead first.
`SEC-8` is what stops a student faking an advisor's accept. `TCH-12` is the
screen that makes the activity teachable, and it is the most satisfying thing
on this board to build.

Anyone with a spare hour and no appetite for a spec: [CLEANUP.md](CLEANUP.md).

**ONB-1 [GFI] 3h — Run the app locally and log every place the docs lied**
First ticket for every new dev. Proves setup works and improves it in the same
pass. Do it on a **fresh clone in a temp directory**, not your existing checkout:
the clone-only failures are the ones that survive every review.

- [ ] Follow `ONBOARDING.md` start to finish
- [ ] Note every step that was wrong, ambiguous, or missing
- [ ] Open a PR fixing the doc, or an issue if the fix is code
- [ ] Log in as both a student and the advisor; screenshot both dashboards

**ONB-2 [GFI] 4h — Write a walkthrough of one student step**
Pick `jobdes`, `res-review`, `interview-stage` or `makeOffer`. Document
component → API call → controller → SQL → response, plus every socket event it
emits or listens for. Add to `docs/walkthroughs/`.

---

# INFRA

## Short term

**INFRA-1 [LEAD] [HARD] 10h — One-command local stack**
Highest-leverage ticket. If everyone burns six hours on Docker, that is
48 hours gone before any code. `.local/compose.yaml` works and is now tracked;
promote it properly.

- [ ] One entrypoint brings up MySQL + Keycloak, waits on health, installs, migrates, seeds, starts both apps
- [ ] Delete the stale root `compose.yaml` and the root `Dockerfile` (it `COPY`s before `WORKDIR`, building from an empty dir)
- [ ] Verified on macOS (both chips) and WSL2 by two people who did not write it
- [ ] Clone → logged-in dashboard under 15 minutes, measured, from a temp directory

**INFRA-2 [LEAD] [MED] 8h — CI on pull requests**
The only automation today is a six-line webhook on push to main. Nothing checks
a PR.

- [ ] Typecheck + build for api and frontend, plus `docker build`, on every PR
- [ ] `npm ci` not `npm install`, so lockfile drift fails loudly
- [ ] GitHub-hosted runners, so it does not depend on the Khoury self-hosted one
- [ ] Under 5 minutes; job names readable enough that a red X says what broke

**INFRA-3 [LEAD] [HARD] 16h — Seed a realistic 30-student class** — deps: INFRA-1
Current fixture is 1 advisor + 3 students. You cannot see an N+1, an index miss,
or a barrier deadlock at n=3. Blocks most backend work.

- [x] `npm run seed` builds a CRN with 1 advisor, 30 students, 8 groups, jobs assigned, in MySQL **and** the Keycloak realm
- [x] `--scenario=`: `fresh`, `mid-resume-review`, `waiting-on-group`, `interview-stage`, `offers-pending`
- [x] Include the messy cases: a student who never signs in, one with NULL group, a group of one, one whose `Progress` points at an old group. (A duplicate pending offer can no longer exist: migration 002 made offers unique per group, so `offers-pending` seeds one pending offer per group.)
- [x] Fake emails only (`student01@example.test`), never real Northeastern addresses (the local realm's email validator was widened to allow `example.test`)
- [x] `npm run seed:reset` under 60s
- [x] Runs in CI so it cannot rot (the `seed` job is in `ci.yml` and the gate)

Lives in `.local/tests/` (see its README); `seed:check` logs in through the real Keycloak page and asks the real API about each scenario.

**INFRA-5 [MED] 10h — ESLint, and enforce it**
Prettier, `.editorconfig` and `.nvmrc` already landed. ESLint has not, and
`npm run lint` currently drops into an interactive setup prompt, which hangs CI.

- [ ] Flat config covering both packages; start permissive
- [ ] `no-console` as a warning now, error after `INFRA-12`
- [ ] Wired into CI, replacing the fake `lint` script

**INFRA-12 [GFI] 10h — Finish the leveled logger** — partially done
`api/src/config/logger.ts` and `frontend/src/lib/logger.ts` exist with `pino`
behind them, and **nothing imports either**. 413 `console.log` calls remain and
they bury real errors during a live class. Split into two PRs (api, frontend) so
it is not an 8-way conflict.

- [ ] Every `console.*` in `api/src` and `frontend/src` routed through the logger
- [ ] Level from `LOG_LEVEL`; api logs carry request id, user, group, class
- [ ] Delete the modules if the team would rather not adopt pino — dead scaffolding is worse than none
- [ ] `no-console` upgraded to error afterwards

**INFRA-13 [MED] 6h — Prune dead dependencies** — partially done
`socket` is gone. Still declared and unimported: `python`, `popup`, `fs`,
`crypto`, `googleapis` (114 MB on its own), `react-router-dom`, `express`,
`express-session`, `mysql2`, `cors` and `vite` in the **frontend**, plus two
Google OAuth strategies. A dev reading `package.json` will think this app uses
Google OAuth and React Router. It uses neither.

- [ ] `depcheck` all packages; remove unused after grepping each
- [ ] Resolve the `react-pdf` version conflict between root and frontend
- [ ] `npm ci` clean in both; CI proves it

## Medium term

**INFRA-4 [LEAD] [HARD] 14h — Staging, and gate prod behind it** — deps: INFRA-2
**Cannot slip.** A merge to `main` fires the Coolify webhook and redeploys the
live app. No build, no test, no approval, no rollback. One bad merge during class
takes down a room of 30.

- [ ] Second Coolify app deploys `dev` to a staging domain with its own DB and realm
- [ ] Prod deploy requires CI green plus a GitHub Environment with the lead as reviewer
- [ ] Tested rollback documented click-by-click in `docs/runbook.md`
- [ ] Default flow `feature → dev → staging`; `main` only on deliberate release

**INFRA-10 [HARD] [SPEC] 16h — Database migration runner** — blocks API-3
`database-files/migrations/` now exists with a README and migration `001`, but
migrations are applied by hand. The schema is still a 424-line dump loaded once
on a fresh volume, and **it already disagrees with the code**:
`GroupsInfo.max_students` and `Moderator.nom_groups` are queried and exist in
zero schema files, so student group-join 500s on a fresh DB.

- [ ] Runner plus a `schema_migrations` table; `001` becomes the first tracked entry
- [ ] **Dump prod schema and diff it against the repo**; every difference becomes a migration
- [ ] Decide explicitly: add the missing columns, or delete the code paths
- [ ] Migrations run on boot before listening; boot fails loudly on failure

**INFRA-7 [MED] 10h — Test harness** — deps: INFRA-2
The `api` test script is literally `exit 1`.

- [ ] Vitest in `api/`; three real passing tests (the room-name regex, the progress enum mapping, `mayJoin`)
- [ ] Required CI check; coverage on, no threshold yet
- [ ] `docs/testing.md` with a copyable example
- [ ] Frontend harness scaffolded with one component test

**INFRA-6 [MED] 6h — Pre-commit hooks** — deps: INFRA-5
CI catching a lint error four minutes after push teaches worse than a hook
catching it in two seconds.

- [ ] Husky + lint-staged on staged files only, under 5s
- [ ] Block committing `.env` (not `.env.example`), `*.log`, `*.pem`, `*.key`
- [ ] `commitlint` with conventional commits

**INFRA-11 [MED] 8h — Persist uploads outside the container image**
No volume is mounted for uploads and deploy fires on every push to main. A
routine commit destroys every resume the professor uploaded, while the DB rows
survive pointing at missing files. Fifteen PDFs are currently committed to git as
a workaround.

- [ ] Named volume for the uploads path in compose and Coolify
- [ ] Repo `uploads/` becomes seed-only, copied in if the volume is empty
- [ ] Startup warning for any DB row whose `file_path` is missing on disk

**INFRA-18 [MED] 5h — Fix the Docker build** — deps: INFRA-2
`api/dockerfile` uses `npm install` on `node:18-alpine`, which is EOL, while
`engines` says `>=22`. Lockfiles are bypassed, so `npm audit` does not describe
what actually ships. `.dockerignore` is one line, so the root build context is
~1.3 GB including `.git` and `api/.env`; `frontend/.dockerignore` does not exist,
so `.env.local` and darwin-arm64 `node_modules` bake into every frontend image.

- [ ] `npm ci` on a supported Node; base image matches `engines`
- [ ] Real `.dockerignore` in both packages; context under 50 MB, asserted in CI
- [ ] Confirm no `.env` is present in the built image

## Long term

**INFRA-8 [HARD] 24h — API integration tests against a real DB** — deps: INFRA-3, INFRA-7
Every refactor below is unsafe without these. Split across three people by domain.

- [ ] Supertest plus a MySQL container per run
- [ ] Cover login/session, role routing, group lifecycle, progress, offers
- [ ] A fixture builder ("a class with 2 groups of 3, mid-interview")
- [ ] CI check, under 3 minutes

**INFRA-9 [HARD] 20h — Playwright smoke test of the full journey** — deps: INFRA-3, INFRA-8
The single highest-value guardrail. Catches the only failure that matters: a
student cannot finish the simulation. **It is also the missing verification for
everything socket-shaped** — the barrier has never been exercised by two real
browsers at once.

- [ ] Advisor starts a group; student completes every step
- [ ] A second spec covers the group barrier with 3 parallel browser contexts
- [ ] A third asserts a student cannot join another group's room
- [ ] Trace, video and screenshot artifacts uploaded on failure

**INFRA-14 [HARD] 20h — Load test 30 concurrent students** — deps: INFRA-4, API-4, INFRA-9
Every capacity number is a projection until measured. The critical unknown is
whether saturation shows up as **errors** (recoverable) or **hangs** (class over).

- [x] 30 socket clients plus an advisor through the full journey (`npm run load`)
- [x] A synchronized-advance burst where all 30 transition within 2 seconds
- [x] A chaos case: restart the API mid-run, assert every student recovers (`--restart`)
- [ ] Pass criteria: p95 under 500ms, zero hung requests, zero stuck students.
      Plain runs pass; restart runs strand 12–21 students. See `docs/LOAD_TEST.md`

**INFRA-15 [HARD] 14h — Error tracking and observability** — deps: INFRA-4
During the pilot the lead needs to know a student is stuck before a hand goes up.

- [ ] Sentry or equivalent on both, with source maps
- [ ] Errors tagged with class, group, step
- [ ] A live dashboard: students online, groups by step, error rate

**INFRA-16 [MED] 14h — Pilot-day runbook and a rehearsed incident** — deps: INFRA-4, INFRA-15

- [ ] Pre-class checklist, health check, restart, rollback, unstick a group, reset a student
- [ ] Backup verified by performing an actual restore, not by confirming backups exist
- [ ] A game day where the team breaks staging and recovers using only the runbook

**INFRA-17 [MED] 10h — Rename `pandployer` to `nuhire` everywhere** — deps: INFRA-4, INFRA-10, INFRA-9
Product is NUHire, the MySQL database is `pandployer`. Scheduled late because it
touches the database name and deploy config.

---

# BACKEND

## Short term

## Medium term

**API-3 [HARD] [SPEC] 20h — Migration: the remaining barrier-critical schema defects** — deps: INFRA-10, INFRA-3
One of the five is fixed (`Resume` now has a unique key, migration `001`). Four
remain, each of which independently corrupts a live class:

- `GroupsInfo`'s "unique" key is `(class_id, id)` where `id` is the PK, so it constrains nothing
- `Interview_Status`, `Offer_Status`, `Res2_Status` use `PRIMARY KEY (student_id)`, one row per student **globally**, so a student in two classes overwrites themselves
- `Offers` has no unique key on `(class_id, group_id)`, so two members clicking submit still create two pending rows
- `Progress` is keyed on `email` but queried by `(crn, group_id)`, and never updates those on conflict, so a reassigned student keeps a stale group forever
- [ ] Real `UNIQUE (class_id, group_id)` on `GroupsInfo` and `Offers`
- [ ] Composite PKs on the three `*_Status` tables
- [ ] `getFinishedCount` uses `COUNT(DISTINCT resume_number)`, not `COUNT(*)`
- [ ] Each change ships with a test proving the specific bug is fixed

**API-6 [MED] 10h — Teacher "live group status" endpoint** — deps: API-4, INFRA-3
When a group stalls the professor needs to know _which student_ is blocking, in
under ten seconds, from the podium. Today the only signal is `console.log`.

- [ ] `GET /groups/live-status/:classId` → per group: roster, per-student step, last seen, socket live, barrier state ("3/4, waiting on jess@…")
- [ ] One query per class, no N+1; under 200ms against the seeded fixture

**SEC-7 [HARD] [SPEC] 8h — Finish Socket.IO authentication** — partially done
The session now runs over the handshake, `socket.data.user` is populated, and
`joinGroup` / `joinClass` / `adminOnline` refuse rooms that do not belong to the
caller. Two things remain.

- [x] Flip `SOCKET_AUTH_REQUIRED=true`. On unless set to `false`; tested with real sessions, an API restart and `npm run load` (OAS-157)
- [ ] `socket.data` re-reads group and class from the DB on connect rather than trusting the serialized session, so a reassigned student is not stuck in their old room for the rest of the class

**SEC-8 [HARD] [SPEC] 18h — Authorize socket events by role** — deps: SEC-7
Done in OAS-157. Teacher events are refused unless the sender teaches the
event's class, and student events act only on the sender's own group.

- [x] Admin-only: `sendPopupToGroups`, `makeOfferResponse`, `updateRatingsWithPresetBackend`. `allowGroupAssignment` and `groupAssignmentClosed` had no sender or listener and were deleted with five other dead relays. `moveGroup` stays student-sent, because finishing a step moves the student's own group; it can no longer move any other (OAS-156, OAS-157)
- [x] Teacher events also require a `Moderator` row for the event's class, read when the event arrives, so a professor cannot act on a section they do not teach (OAS-157)
- [x] Student events derive group and class from `Users` for the logged-in sender, never the payload
- [x] Test: a student socket emitting an admin event is rejected and logged

**SEC-11b [MED] [SEC] 5h — Scope admin reads to the classes the caller owns** — deps: SEC-6
`GET /users` is admin-only now, but an admin for CRN 1 still reads every student
in every section. The roster is real Canvas data, so this is the FERPA axis.

- [ ] Admin reads filter to CRNs the caller has a `Moderator` row for
- [ ] Named columns, never `SELECT *`

**API-13 [MED] 12h — Make group-join capacity race-free** — deps: API-8b, INFRA-10
Classic check-then-act. All 30 students click join within seconds, every one
reads `current_students = 0`, and 30 land in a 4-person group. Then every barrier
waits for 30 people.

**API-14 [MED] 12h — Idempotent popup vote aggregation** — deps: API-3, SEC-7
A pure accumulator with no per-student row, so a double-click or reconnect
double-counts with no way to detect or undo it. The professor's curveball results
are quietly wrong.

**API-9 [MED] 10h — Index the hot `(group_id, class)` lookups** — deps: INFRA-10, INFRA-3
Zero hot paths are indexed. `Interview_Status.group_id` is `varchar(45)` while
everywhere else it is `int`, forcing a conversion that defeats indexing anyway.

- [ ] Indexes on `Users(class, group_id)`, `Resume(group_id, class)`, `InterviewPage`, `Interview_Status`, `Offers`, `Progress(crn, group_id)`
- [ ] `Interview_Status.group_id` and `Offer_Status.group_id` to `int`
- [ ] `EXPLAIN` before and after in the PR, against the 30-student fixture

**API-11 [MED] 8h — Make boot-time seeding idempotent and opt-in** — deps: INFRA-10
`initializeDatabase()` runs on **every** boot: 26 sequential round trips before
the server accepts a request. It also seeds `Candidates` with literal
`resume_id: 1..10` while the moderator controller uses _looked-up_ IDs. The two
disagree the moment IDs are not 1–10, silently attaching candidates to the wrong
resumes.

- [ ] Seeding moves to `npm run seed` plus a `SEED_ON_BOOT` flag, default off in prod
- [ ] Both paths share one implementation (the lookup-based one is correct)
- [ ] Server starts under 2s with seeding off

**API-16 [MED] 18h — Collapse the advisor dashboard N+1** — deps: API-9, API-10, INFRA-3
`ManageGroupsTab` makes ~40 requests per refresh, and refresh fires on every
`userAdded`. Thirty students signing in produces roughly **1,200 advisor requests
in two minutes** — almost certainly why the ">50 calls/min" warning exists.

**API-18 [MED] 12h — Audit log for teacher actions** — deps: SEC-6
Nothing records who clicked what. After a bad class there is no way to reconstruct
whether the professor hit assign-job, a student hit an unprotected endpoint, or
the API restarted.

## Long term

**SEC-4b [MED] [SEC] [SPEC] 10h — Define super-admin, and retire the second login** — deps: SEC-3
`/moderator/crns` is now behind `requireModerator`, which accepts either a
Keycloak admin **or** the legacy `session.isModerator` set by a shared plaintext
password. That is still two auth systems, one of them a shared password, and
these routes grant teacher access.

- [ ] Define super-admin (owner allowlist or an `is_owner` column) and document it
- [ ] `DELETE /crns/:crn` needs a confirmation field naming what it cascades
- [ ] `/mod-dashboard` moves behind the Keycloak session; then delete `/mod-signin`, `moderatorLogin`, `verifyModerator`, `requireModerator` and the `MODERATOR_*` env vars
- [ ] Note the bootstrap problem in the spec: this is the page that creates the first admin

**SEC-14 [LEAD] [HARD] [SEC] 8h — Rotate committed secrets and purge history**
**The only item with an external clock.** `keycloak/realm-export.json` contains
the OIDC client secret, a realm RSA signing key, an HMAC key and a Gmail app
password; `keycloak/render.yaml` has the Keycloak master admin credentials. Both
are in git history. `.local/realm-export.json` is a copy of the same file, so it
leaks nothing new, but it does mean the same secret is now in two places.

Genuinely clean: no `.env` file is or ever was in git.

- [ ] Rotate everything: client secret, admin password, shared Gmail, moderator creds, session secret, DB password
- [ ] Rewrite history with `git filter-repo`; all collaborators re-clone
- [ ] Enable secret scanning and push protection
- [ ] New values only in Coolify env plus a password manager the lead controls

**SEC-18 [HARD] [SPEC] 20h — Scope every data endpoint to the caller's group** — deps: SEC-6, STU-16
Role checks are in place; ownership checks largely are not. `POST /resume/vote`
still takes `student_id` from the **body**, so a student can vote as a classmate.
Note `updateUserClass` and `updateUserSeen` _do_ check ownership, so the pattern
exists and just was not applied.

**SEC-15 [MED] 12h — FERPA and data-handling policy** — deps: SEC-11b
Real Canvas names and emails, and nobody has written down what is collected, who
sees it, how long it is kept, or who to call if it leaks.

- [ ] Document every table holding PII and every endpoint exposing it
- [ ] Retention policy plus an end-of-semester purge script, tested on a copy
- [ ] Incident contact and escalation path

**SEC-16 [MED] 7h — Rate limiting** · **SEC-17 [MED] 8h — Helmet and CSP**
CSP must not break the YouTube embeds or `react-pdf`.

**API-19 [HARD] [SPEC] 18h — Allow more than one teacher per class** — deps: INFRA-10, API-3
`Moderator.crn` is UNIQUE, so exactly one email can own a CRN. A professor plus a
TA cannot both run the console. The socket handler and `emitToClassModerators`
already loop over multiple moderators; the schema forbids it.

**API-20 [HARD] 14h — Split `group.controller.ts` (737 lines)** — deps: INFRA-8
Also where to establish one controller shape, so we stop inventing a new one per PR.

---

# FRONTEND

## Short term

**UI-9 [MED] 6h — Rewrite the Tailwind theme tokens**
**The unlock for the whole visual overhaul, and it is a design decision the team
should make together, not a bug to fix quietly.** `tailwind.config.js` defines
`background: '#fff'` and `foreground: '#fff'`. `sand: '#fff'` is not sand.
`navy: '#000'` is not navy. Every page writes `bg-sand/80` believing it is
tinting warm when it is applying flat white.

- [ ] Agree a real palette first; put it in the PR description as swatches
- [ ] Three of the config's four `content` globs point at directories that do not exist — fix those too

**STU-8 [MED] 4h — Stop `/jobdes` resetting progress backwards**
It calls `updateProgress("job_description")` unconditionally on mount, and the
API overwrites unconditionally. A student at the interview stage who re-reads the
job description is reset to step 1, every later step re-locks, and they are
ejected mid-activity while their group waits at a barrier.

- [ ] Progress is monotonic; the API ignores a step earlier than the stored one

**STU-15 [GFI] 2h — Emit before navigating**
`res-review` and `interview-stage` set `window.location.href` and _then_ emit
`moveGroup`. Navigation can tear down the socket first, so one student advances
and their teammates stay behind.

**UI-6 [GFI] 5h — Unify step-name vocabulary in the UI**
"Interview Stage" vs "Interview Page" vs "Interview Review" for the same step,
hardcoded in three places. `instructions` lists 5 steps; `dashboard` shows 6 cards.

**UI-7 [GFI] 4h — Fix the progress bar, which always lies** — deps: UI-6
Each page passes a hardcoded `progress={n}` over a 5-item array, so a student on
the **final** step sees 80% and one on the first sees 0%.

**UI-12 [GFI] 5h — `<Spinner>` / `<PageLoader>`**
The same block is copy-pasted **16 times**; one copy has already drifted to a
different color. The cheapest possible start on `UI-10`.

## Medium term

**UI-10 [HARD] EPIC — Design system foundation** (children UI-11 … UI-17)
There is **no shared component layer at all**. Until primitives exist, every
visual fix must be applied 15 times and everyone will invent a different
button. Two incompatible visual languages coexist: student pages use `bg-sand` +
`font-rubik`; the advisor's main screen uses `bg-gray-50` + `font-sans`. **It
does not look like the same product.**

- **UI-11 [MED] 8h — `<Button>`** — deps: UI-9. ~40 distinct inline class strings, several broken: a red button whose hover is `hover:bg-blue-400`; a navbar button that is white-on-white on hover
- **UI-13 [HARD] 10h — Accessible `<Modal>`, consolidating 5 overlay patterns** — none has `role="dialog"`, focus trap, Escape, or focus restoration. Two can stack
- **UI-14 [MED] 8h — `<FormField>` with real labels** — **`htmlFor` appears zero times** across 22 labels. The signup form is black text fields on a black card, with one input that has no label _and_ no placeholder
- **UI-15 [GFI] 5h — `<Card>` / `<Panel>`** — deps: UI-9. Border widths range 1px to 4px with no rule
- **UI-16 [HARD] 12h — `<AppShell>`** — deps: UI-9. Six footer implementations; two pages render **two `<footer>` landmarks**; three navbars
- **UI-17 [GFI] 6h — Component gallery route** — the cheapest visual-regression check for a team with no test infra, and how you stop person #7 writing another bespoke button in week 11

**UI-18 [MED] 10h — Accessibility audit**
A required course at a public university. Measured baseline: **2 `aria-*`
attributes, 0 `role=`, 0 `htmlFor`**, exactly **one** `onKeyDown` in the whole app.

- [ ] axe and Lighthouse on all routes; keyboard-only and screen-reader passes
- [ ] Contrast check of every pair; publish the baseline so improvement is measurable

**UI-19 [MED] 6h — Make dashboard step cards keyboard-operable** — deps: UI-18
The **primary navigation of the entire student experience** is a `<div>` with
`onClick`, no `tabIndex`, no role, no key handler. Locked cards set
`pointerEvents: none`, which also suppresses the tooltip explaining _why_.

**UI-20 [GFI] 4h — Restore focus indicators** — deps: UI-18
`focus:outline-none` with no replacement on the **first interactive element on
the page**.

**UI-21 [MED] 5h — Fix contrast failures** — deps: UI-18
Disabled buttons at ~1.9:1; white-on-white on hover; `text-white` on a white card.

**UI-22 [MED] 6h — Semantic HTML** — deps: UI-18
`res-review-group` has **no `<h1>`** and starts at `<h3>`. The profile avatar link
has **no accessible name**.

**STU-11 [MED] 6h — Fix the res-review timer expiring into a hard lock**
On timeout it calls a handler that bails while `resumeLoading` is true and never
restarts, so the student sits at `0 sec` forever. All three buttons are disabled
while loading, so a failed PDF locks the student out entirely.

- [ ] Timeout always advances; PDF failure shows a message with working Skip and Retry
- [ ] Test: block the PDF URL in devtools, confirm the student can finish

**STU-13 [MED] 5h — Handle a YouTube video that does not load**
Submit is disabled on `!videoLoaded`, set only by the iframe's `onLoad`. Region
block, dead channel or campus wifi means "Loading Interview Video…" forever,
**cannot submit, cannot advance, blocks the group's barrier**.

- [ ] Timeout ~15s and enable Submit with a visible notice
- [ ] Audit the seeded video URLs and record who owns that YouTube channel

**STU-14 [MED] 6h — Make transitions idempotent against double-clicks**
`sendVoteToBackend` reads `votes` from a stale closure, so two fast clicks lose
one vote and push the length off 10 **forever**. `handleMakeOffer` has no
in-flight guard; the client half of the duplicate-offer bug is fixed but the
server has no unique key yet (`API-3`).

**STU-9 [MED] 6h — Persist the make-offer selection**
The `checkint` socket handler broadcasts the checkbox but **writes nothing**,
while `makeOffer` reads `InterviewPage.checked`, which nothing ever sets. Also
uses `socket.to()`, excluding the sender.

**STU-10 [GFI] 3h — Handle group members disagreeing** — deps: STU-9
`makeOffer` renders its controls only when `selectedCount === 1`. Two students
checking different candidates makes **every button vanish** with no message.

**STU-19 [MED] 4h — Fix the scrambled rating field mapping** — blocks STU-18
Three code paths map the same four ratings to `question1..4` **three different
ways**, and `makeOffer` sums two of those mappings together. Students are shown,
and hire on, mislabeled numbers.

**STU-20 [MED] 8h — Popups survive refresh and reach late joiners**
Sent only to cached socket ids, persisted nowhere, dismissed forever on first
click. Also does not scope by class unless `classId` is truthy, so a falsy value
sends to that group number in **every** CRN.

**STU-23 [GFI] 3h — Fix or remove the dead Back buttons**
Three are hardcoded `disabled={true}`; one is labeled "Back: Interview Stage" and
points at `/jobdes`. A fourth works and triggers STU-8. Four different answers to
"can I go back."

**STU-24 [GFI] 4h — Make notes usable without leaving the step**
The job-description instructions tell students to take notes, but the Notes menu
item _navigates away_, which on `/res-review` destroys the timer and the
in-memory votes array. No edit, no delete.

**STU-25 [MED] 6h — Stop hardcoding 10 resumes and 4 candidates**
Hardcoded in at least six places. If the professor uploads 9 or 12 resumes, the
completion check never fires and **every student in that class is permanently
stuck**, with no warning.

**UI-4 [GFI] 4h — Remove dead state and no-op render branches**
`waitingGroup`'s entire "Authorization Received" UI is unreachable; `makeOffer`
has a ternary whose branches are identical; `sendpopups` maps into styled divs
with **no children**.

**UI-26 [MED] 8h — Standardize loading, error and empty states** — deps: UI-10
`interview-stage` alone has five bespoke state screens. `jobdes` has none, so a
student whose PDF fails just sees nothing.

**UI-27 [MED] 8h — Real form validation feedback** — deps: UI-14
`signupform` renders success and failure as identical unstyled text in the same
position, with no `role="alert"`.

## Long term

**UI-23 [MED] 6h — Responsive audit** — needs a decision
Nine breakpoints in ~11,700 lines is the entire responsive design. Four of five
student step pages are `h-screen overflow-hidden`, so content that does not fit
is **unreachable, not scrollable**.

**UI-24 [HARD] 14h — Make the five student step pages usable at 1280×800** — deps: UI-23
Where students spend the entire class. If the pilot's 30 students cannot read the
resumes, the pilot fails regardless of anything else here.

**UI-25 [HARD] 10h — Consolidate three PDF rendering approaches** — deps: UI-10
`react-pdf`, a raw iframe and a download link. Resumes are the core content and
students get a different experience in three of the steps.

**UI-28 [HARD] 16h — Decompose the three oversized student pages** — deps: UI-10, INFRA-8
`interview-stage` (1,302), `makeOffer` (1,164), `res-review` (~900). The
"Waiting for Teammates" overlay is copy-pasted verbatim between two of them.

**UI-29 [MED] 7h — Student-facing copy and tone pass** — deps: UI-6
Copy was written by co-ops who are gone and reads that way. The timer shows a raw
`{n} sec` with no mm:ss and no warning state.

**UI-30 [HARD] 8h — axe-core in CI as a regression gate** — deps: INFRA-2, UI-18
Without a gate, new UI erodes the baseline by week 14 and the
next lead inherits this exact problem.

**STU-16 [HARD] [SPEC] 18h — Collapse the three progress vocabularies** — deps: INFRA-10, API-3
`Users.current_page`, `Progress.step` and route paths are three names for the
same six things with no mapping. Root cause of STU-1, STU-3, STU-4 and STU-8.
Also `job.controller.ts` does a bare `UPDATE Progress` that silently affects
**zero rows** when no row exists yet, the common case for a fresh class.

- [ ] One canonical enum shared by api and frontend, with `toRoute()` and `toLabel()`
- [ ] Upserts everywhere, never bare UPDATE
- [ ] `POST /progress` validates and 400s instead of a MySQL truncation 500
- [ ] Migration backfills; one doc page mapping all three including historical values

---

# PRODUCT

The feature work. Most of this is what makes NUHire a teaching tool rather than a
form; none of it exists yet.

## Short term

**TCH-1 [GFI] 5h — Confirmation dialog on "Assign Job"** — do this week 1
The most dangerous button in the app has weaker friction than "remove one
student." It deletes every resume vote, interview rating and note for the whole
class, with no confirmation. The modal never mentions deleting anything.

- [ ] Both toolbar and per-card buttons route through a confirm step
- [ ] Modal lists what will be erased in plain English, with the affected group count
- [ ] Distinct warning if any affected group has a pending or accepted offer
- [ ] Requires typing `ERASE` or the CRN; Cancel is default-focused

**TCH-8 [GFI] 2h — Confirm dialog on per-group "Start Group"**
Fires immediately and is irreversible, while "Start All" gets a confirm. Also fix:
a group created _after_ "Start All" cannot be started from the toolbar.

## Medium term

**TCH-2 [MED] 8h — Split "assign a job" from "reset a group's work"** — deps: TCH-1
Root cause of TCH-1. A professor who just wants to fix a job title has no way to
do it without nuking the class.

- [ ] Endpoints take `reset: boolean`, default `false`; with false, zero DELETEs
- [ ] Two visually separate buttons, only one destructive
- [ ] Test: assign a job mid-interview with `reset:false`, all votes survive

**TCH-3 [GFI] 4h — Clear or void `Offers` when a group is reset** — deps: TCH-2
`Offers` is the one table the reset does not clear, so a group that already
submitted gets wiped **and then permanently blocked** from making a new one.
Dead-ended, mid-class.

**TCH-7 [GFI] 4h — Prefer an exact email-column match** — deps: TCH-5
Takes the first header _containing_ "email", so `Secondary Email` silently wins.

**TCH-9 [MED] 6h — Let a professor un-start a group** — deps: SEC-4b
**No code anywhere sets `started` back to 0.** A mis-click needs database access
to fix; during a pilot that means the class stops.

**TCH-13 [MED] 12h — CSV import preview and diff** — deps: TCH-4, TCH-5
Submit is a blind write. Duplicate emails silently last-write-wins, students
already in a group are silently moved, students missing from the CSV are silently
left behind.

- [ ] Dry run showing: N new, N moved (named, from→to), N unchanged, N duplicates, N absent from the file
- [ ] Duplicates are a hard error; explicit confirm step

**TCH-14 [MED] 6h — Let CSV import add groups to an existing class** — deps: API-3, TCH-13
`createGroups` returns 400 if any group exists and the frontend **swallows it**,
so re-importing with more groups silently fails and those students vanish from
Manage Groups.

**TCH-15 [MED] 6h — Make the Zoom CSV actually importable**

- [ ] **First: verify against a real Zoom account.** Nobody has. Everything else depends on the answer
- [ ] Header row, human-readable room names, exclude `null`-group students
- [ ] Deduplicate the two copies into one helper

**TCH-11 [MED] [SPEC] 12h — Candidate-stats endpoint** — deps: API-3, SEC-11b
The teacher sees only a name and accept/reject. All the data exists and nothing
joins it.
⚠️ **Join on `Candidates.resume_id`, not `Candidates.id`** — `candidate_id` holds
a resume id everywhere in this app, so the obvious lookup returns the wrong person.

- [ ] `GET /candidates/stats/:classId/:groupId/:candidateId`, admin only
- [ ] Returns name, resume file, interview URL, per-student votes joined to names, shortlist flag, interview ratings, popup deltas, the offer row
- [ ] Scoped so a caller only reads classes they moderate

**TCH-12 [MED] 14h — Candidate-stats modal on the offer card** — deps: TCH-11, TCH-10
Gives the professor the evidence to make and discuss the decision, which is the
pedagogical point of the whole activity.

- [ ] Candidate name on a pending-offer card becomes clickable
- [ ] Three sections: résumé PDF, interview video, how the group voted
- [ ] Never blocks accept/reject if stats fail to load

**STU-18 [MED] 10h — Wire up the "candidate didn't show up" curveball** — deps: STU-19
The professor's headline feature. `noShow` is never set true by anything; the
handler re-emits votes and never touches the sliders. It renders a generic
dismissible popup and **changes nothing**.

- [ ] Confirm intended behavior with the instructor
- [ ] Replace the `-10000` magic numbers with an explicit flag

## Long term

**STU-27 [MED] 14–24h — Build or cut the Employer Panel** — deps: STU-1, STU-16, needs a decision
Twenty-five lines: a heading, one sentence, a button. It is the pedagogical
payoff and it is empty. **A group currently cannot finish the simulation.**

**STU-28 [MED] 14h — Results and export view for grading** — deps: STU-27, STU-19
No screen anywhere shows what a group decided. The professor runs the activity
with 30 students and afterwards has no artifact to grade or discuss.

**TCH-16 [HARD] 14h — Recompute the barrier when membership changes** — deps: API-4
A CSV-imported student who never logs in inflates the group total and the group
waits forever. Removing someone mid-class does not recount.

- [x] Barrier counts only students who have actually signed in (`Users.present_at`, migration 006)
- [ ] Add, remove, reassign triggers a recount and notifies **both** old and new rooms

**TCH-17 [MED] 8h — Tell the professor when a popup was not delivered** — deps: API-4
Popups only reach students in the in-memory map. Anyone who reconnected silently
gets nothing, and the professor sees success either way.

- [ ] Ack with `{delivered, missed}`; UI shows "Sent to 3 of 4 — Jane did not receive it"

**TCH-18 [HARD] 20h — Break up `ManageGroupsTab.tsx` (2,051 lines)** — deps: UI-10, INFRA-8
~40 `useState` in one component, six modals. The top merge-conflict file. Two
people on advisor features means daily conflicts.

- [ ] Split into `GroupCard`, `GroupList`, the six modals, `useGroupData`
- [ ] No file over 300 lines; restyled to the design system
- [ ] **A series of small PRs with a declared file freeze**

**TCH-19 [HARD] 24h — One "Class Control" screen for live teaching** — deps: TCH-12, TCH-16, TCH-18
Running a class means bouncing between four places with no at-a-glance view of
who is stuck. This is the screen the professor actually stands in front of.

- [ ] One row per group: members, who is online, current step, job, started, offer state
- [ ] Stuck groups visually flagged
- [ ] Per-group inline actions: start, popup, force-advance, accept/reject

**STU-26 [MED] 6h — Handle a group that wants to hire nobody** — deps: STU-10, needs a decision
"None of these is a good fit" is a legitimate hiring outcome with no way to
express it. Also `allRejected` promises a restart from the job description stage,
and **no restart mechanism exists**.

---

# Sequencing

## Weeks 0–1, lead only, before devs start

`INFRA-1` setup · `INFRA-2` CI · `INFRA-3` seed data · `SEC-14` secrets (external
clock) · a groomed board

Without `INFRA-1` and a groomed board, the team shows up with nothing to do.

## Weeks 1–4

Everything under **Short term** in each section. `UI-9` + `UI-12` + `UI-3` +
`UI-6` + `UI-7` are ~22 hours total and fix a large share of why the app looks
broken — land them week 1 so the team _sees_ the UI change.

## Weeks 5–9

`INFRA-4` staging · `INFRA-10` migrations · `INFRA-7`/`INFRA-8` tests ·
`API-3` schema · `API-4` barrier · `API-5` force-advance · `SEC-7`/`SEC-8` sockets ·
`STU-6`/`STU-7` persistence · `UI-10` design system · `TCH-11`/`TCH-12` candidate stats

## Weeks 10–14

`INFRA-9` Playwright · `INFRA-14` load test · `INFRA-16` runbook ·
`TCH-18`/`TCH-19` · `STU-27` employer panel · `UI-24` responsive · `SEC-18` scoping

## Minimum viable pilot, ~180 hours

If you have to cut to the bone:

`API-3` · `API-4` · `API-5` · `API-7` · `API-11` · `INFRA-3` · `INFRA-4` ·
`INFRA-10` · `SEC-7` · `STU-6` · `STU-7` · `STU-27` · `TCH-1`

Buys you: cannot silently freeze, cannot silently crash, the barrier survives a
restart, **the professor can unstick any group**, student votes actually save, the
schema stops corrupting completion counts, and a group can reach the end.

## Two things that cannot slip

- **`INFRA-4` staging.** A merge to `main` redeploys the live app with no gate and no rollback.
- **`API-4` the in-memory barrier, by week 9.** The failure most likely to strand a group during the pilot, and it needs real testing time after the fix.

## Needs a written spec before a beginner starts

`SEC-4b` · `SEC-7` · `SEC-8` · `SEC-18` · `API-3` · `API-4` · `API-5` · `API-19` ·
`STU-16` · `INFRA-10` · `TCH-11`

About eleven specs of lead time, roughly a day each. Do **not** hand socket
authorization to someone in their first month.

## Open decisions blocking tickets

1. Employer Panel: finish or cut? (`STU-27`)
2. Supported screen size floor? (`UI-23`)
3. `sendpopups` and `pending-offers`: wire up or delete? (`UI-8`, `TCH-10`)
4. Is the 30-second timer a rule or a nudge? (`STU-11`)
5. Is "hire nobody" a valid outcome? (`STU-26`)
6. What palette? (`UI-9`)
7. Keep pino, or rip the unused logger modules out? (`INFRA-12`)

1, 4 and 5 need the CS1210 instructor. 6 and 7 are the team's to make.

## Untested ground

Honest note for whoever picks up the socket work. OAS-157 ran room scoping, the
socket event checks and the Make Offer confirmation flow with real Keycloak
sessions, two students in one group. The barrier has still only been exercised by
headless clients (`npm run load`), never by **two real browsers at once**, and
none of the real-session runs is repeatable. `INFRA-9` is what closes that gap,
and until it lands treat anything socket-shaped as unverified no matter how
confident the commit message sounds.
