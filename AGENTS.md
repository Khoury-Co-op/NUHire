# AGENTS.md

Guidance for AI coding agents working in this repo. Humans should read it too.

This is the single source of truth for every tool. `CLAUDE.md` imports it, so
add project rules here and never copy them into a per-tool file. Cursor,
Copilot and the rest should point at this file rather than hold their own
version, because rules that drift between tools are worse than no rules.

Read this before writing code. Most of it is stuff you cannot infer from the
source, and several rules exist because the obvious approach is wrong here.

---

## What this is

NUHire is a hiring simulation used as a live, instructor-led activity in Khoury
CS1210. Students work in small groups as the employer: read a job description,
review 10 resumes, shortlist 4, watch recorded interviews, extend one offer. A
professor runs the class in real time and can send curveball events mid-activity
and accept or reject each group's final offer.

It is used **live, in a classroom, with a professor standing in front of 30
students**. That is the constraint behind most of the rules below. A bug here
does not page an on-call engineer, it derails a class.

## Stack

| Piece       | What                                                             |
| ----------- | ---------------------------------------------------------------- |
| `frontend/` | Next.js 15 App Router, React 19, Tailwind, Socket.IO client      |
| `api/`      | Express + TypeScript, Socket.IO server, Passport + Keycloak OIDC |
| MySQL       | 21 tables, schema in `database-files/Pandployer.sql`             |
| Keycloak    | Login. Moving to Khoury IT SSO                                   |

Deployed via Coolify on a Khoury self-hosted runner. `.github/workflows/deploy.yml`
fires on push to `main`. Not Render, not Railway, whatever old docs say.

## Running it

See `.local/README.md`. Short version:

```
npm run all
```

That runs MySQL, Keycloak, the API and the frontend in Docker, with hot reload for both apps. MySQL and Keycloak are defined in `.local/compose.yaml`,
and `compose.dev.yaml` extends them; change them there, not in both. The root
`compose.yaml` is production (Khoury Coolify), not local dev.

Do **not** use `npm run dev` in `api/`. The `ts-node` script throws TS2769 on
`auth.routes.ts` because the lockfile pins `@types/express@5` against
`express@4`. `tsc` itself passes, so `npm run build && npm start` works. There is
a ticket to fix the dev script.

---

## The central concept: `(group_id, class)`

Almost every table and query is keyed on the pair `(group_id, class)`, where
`class` is the CRN (the course section number). That pair identifies one team of
students. Socket.IO rooms are named `group_<group_id>_class_<class>`.

If you write a query or a socket emit that is scoped to a group and you do not
include `class`, **it will leak across course sections**. This has already
happened in the codebase. Always scope by both.

---

## Rules

### 1. Never trust `group_id`, `class`, `student_id`, or `email` from the client

Most endpoints currently take these from the URL or request body and do not check
them against the session. That is a known bug, not a pattern to copy. In new code,
derive identity from `req.user` (HTTP) or the authenticated socket (WebSocket).

```ts
// wrong, and unfortunately common in this repo
const { student_id, group_id } = req.body;

// right
const studentId = req.user!.id;
const groupId = req.user!.group_id;
```

### 2. Never put group or session state in process memory

The "has every group member finished" barrier used to live in a plain object in
`api/src/config/socket.ts`. When the API restarted mid-class that state
vanished and **entire groups got stuck forever with no way out**. It now lives
in the `Step_Completion` table and is answered by a query, re-evaluated on
completion, on room join, and from `GET /groups/barrier-status/...`. Keep it
that way. `onlineStudents` is still in memory, which is why the API still
cannot run more than one replica (`INSTANCE_COUNT` in `.env.example`).

Anything that must survive a restart goes in MySQL. If you find yourself writing
`global.something` or a module-level `Map`, stop.

### 3. Every gate needs a teacher override and a non-socket fallback

Several steps block a student until all their group members finish. Every one of
these has stranded a group at some point. When you add or touch a gate:

- the professor must have a way to force the group past it. For the
  res-review barrier that is `POST /groups/force-advance`, admin only; reuse
  it rather than adding a second override
- the client must be able to recover by polling an endpoint, not only by
  receiving one socket event at one instant. `GET /groups/barrier-status` is
  the existing poll
- it must not wait for a student who is on the roster but never shows up.
  Count the group with `presentMembers` in `config/socket.ts`, which every
  existing gate uses, rather than counting `Users` rows yourself

### 4. Emit to rooms, never `io.emit`

`io.emit` broadcasts to every connected client in every class. Use
`io.to(roomId).emit(...)`. There are zero bare `io.emit` calls left, and it
should stay that way.

The advisor dashboard is **not** in the group room. It joins a room named after
its own email, so use `emitToClassModerators(io, db, classId, event, payload)`
from `config/socket.ts` to reach a class's teachers.

A socket that reconnects gets a new id and is in no rooms. Anything that joins a
room must re-join on `connect`, not just once on mount, or that client silently
stops receiving events for the rest of the class.

```ts
const roomId = `group_${groupId}_class_${classId}`;
io.to(roomId).emit('event', payload);
```

### 5. Guard destructive actions, and mean it

Assigning a job to a group **deletes all of that group's work**: resume votes,
interview ratings, notes. There is a ticket to split those into separate actions.
Until then, if you touch any code path that deletes student work:

- require an explicit confirmation in the UI that names what will be lost
- say what it actually affects, not a hardcoded list
- check whether the group already submitted an offer, because `Offers` is not
  cleared and a wiped group gets permanently locked out

### 6. Transactions need a connection, not the pool

All three sites that got this wrong are fixed. The rule stands because the wrong
version is the one that looks natural, and nothing yet stops you writing it:

```ts
// WRONG. Each query may land on a different pooled connection.
// The deletes are not atomic and the ROLLBACK is a no-op.
await this.db.promise().query('START TRANSACTION');
```

Check out a single connection and always release it:

```ts
const conn = await pool.promise().getConnection();
try {
  await conn.beginTransaction();
  // ... all queries on conn
  await conn.commit();
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
}
```

In a repository, a Prisma transaction lives inside one repository method as
`db.$transaction(async (tx) => { ... })`, and that method may touch several
tables. Run every query in it on `tx`: one on `db` runs outside the transaction.
A transaction client cannot open another transaction, so a repository with such
a method takes `PrismaDb` rather than `DbClient`. A transaction that writes
goes inside `withUniqueRetry` whole, as the write patterns under "How code
should look here" say. The mysql2 example above stays until the last mysql2
query is gone.

### 7. Parameterize every query

`mysql2` with `?` placeholders, always. Never template-interpolate user input
into SQL. Where a dynamic `IN (...)` list is needed, build the placeholders and
pass the values separately:

```ts
const placeholders = emails.map(() => '?').join(',');
await conn.query(`DELETE FROM Notes WHERE user_email IN (${placeholders})`, emails);
```

### 8. Do not add a third way to do something

This codebase already has, for the same concepts:

- three vocabularies for "what step is a student on": `Users.current_page`,
  `Progress.step`, and the route paths. They do not map to each other.
- two auth systems: Keycloak, plus a plaintext password check for the admin page.
- multiple hand-rolled versions of the same UI: loading spinners, modals, footers.

When you need one of these, find the existing one and use it. If the existing one
is wrong, fix it in place rather than adding a parallel version.

### 9. Check both sides before deleting anything

A page with no inbound links from the frontend may still be reachable, because
the **API redirects to frontend routes** after login. `waitingGroup`, `about`, and
`signupform` all look dead to a frontend-only grep and are not.

```
grep -rn "routeName" frontend/src      # frontend links
grep -rn "FRONT_URL" api/src           # server-side redirects
```

### 10. Check SELF-WORK.md before you touch a file

[SELF-WORK.md](SELF-WORK.md) is where people declare work that is not on the
board yet, including which files they expect to touch. We share this repo with
each other and with our assistants, and the usual failure is two of them
quietly editing the same file for days.

Before starting, read the **In progress** section. If your change overlaps
someone's declared files, say so rather than editing around them silently. If
you are starting something that is not already a ticket, add your own entry
first.

### 11. Write to a `.env`, never a hardcoded value

Read `api/.env.example` and `frontend/.env.example` for the full list. If you add
a new variable, add it to the example file in the same commit. A missing env var
should fail loudly at boot, not produce a page that navigates to
`undefined/instructions`, which is a bug that actually shipped.

### 12. Schema changes need a migration, not just an edit to the dump

`database-files/Pandployer.sql` is a full dump that only ever runs against an
empty database. Editing it fixes new environments and does nothing for the one
with the real data in it. Anything that changes the shape of a live database
needs a numbered file in `database-files/migrations/` in the same commit. Read
that directory's README first; it also explains why a migration that adds a
constraint has to clean up the rows violating it.

dbmate owns the schema, and Prisma only reads it. After adding a migration, run
`npm run db:migrate` to apply it to your local database, then run
`npm run db:pull` and commit `api/prisma/schema.prisma` in the same commit.
Never run `prisma migrate` or `prisma db push`, and never hand-edit
`schema.prisma`, because the next `db pull` rewrites it.

---

## Layout

```
api/src/
  server.ts          entrypoint
  app.ts             express setup, middleware, route mounting
  config/
    database.ts      mysql pool, Prisma client, boot-time seeding
    passport.ts      keycloak oidc strategy
    socket.ts        ALL real-time behaviour
    steps.ts         step order, step -> route, and writing a step
  routes/            path -> controller, and the auth middleware per route
  controller/        request handling, plus raw SQL in areas not yet moved
  repository/        data access through Prisma, one file per area
  middleware/        requireAuth, requireAdmin, requireStudent
  models/            shared types: User, AuthRequest, SocketEvents (socket payloads), Barrier

frontend/src/app/
  page.tsx           landing
  dashboard/         student hub, defines the step list
  jobdes/ res-review/ res-review-group/ interview-stage/ makeOffer/
  advisor-dashboard/ grouping/ new-pdf/ adminFacts/
  components/        shared UI + React contexts
```

Request flow is `routes/ -> controller/ -> repository/`. The route file builds
each repository and passes it to the controller. The controller does the HTTP
work: parsing ids, validating, status codes and socket emits. It asks a
repository for data and never imports the Prisma client; lint fails it if it
does. Notes and facts are the example to copy. Most areas still keep raw SQL in
their controller and move one area at a time, each in its own ticket.

There is no service layer. Moving business logic out of controllers is a
separate decision from moving the SQL out.

## Conventions

- TypeScript, `strict: true`. Do not add `any` to silence an error. There are
  about 90 existing `: any` annotations; do not add another.
- Prettier is configured at the root. Run `npm run format` before committing.
- Filenames follow whatever the surrounding folder does. Controllers are
  `<thing>.controller.ts`, routes are `<thing>.routes.ts`.
- Do not add `console.log`. Tracing logs bury real errors during a live class.
  Log real failures with `console.error` or `console.warn`; if you need
  diagnostics, make them conditional.
- Do not commit `.env`, `*.log`, or build output.

## How code should look here

The target for new code and for the tidying in [CLEANUP.md](CLEANUP.md). Most
of the existing code does not look like this yet; do not copy it.

- **New data access goes in a repository**, through Prisma's query API: not in a
  controller, and not as raw SQL. A repository is an interface plus a
  `create<Area>Repository(db: DbClient)` factory in
  `api/src/repository/<area>.repository.ts`. It returns the shapes in
  `api/src/models/` and keeps Prisma's generated types to itself. A
  group-scoped method takes `{ groupId, classId }` together.
- **A write two requests can race uses `api/src/repository/writes.ts`.**
  Prisma's `upsert` on MySQL is a SELECT and then an INSERT or UPDATE, so two
  first writes at once can both choose INSERT, and one fails. Never a bare
  `upsert`. Translating today's SQL:
  - `ON DUPLICATE KEY UPDATE col = VALUES(col)` becomes
    `withUniqueRetry(() => upsert(...))`. For `col = col + VALUES(col)`, put
    `{ increment: n }` in `update`
  - `INSERT IGNORE`, and `ON DUPLICATE KEY UPDATE col = col`, become
    `insertIfAbsent(model, row)`
  - `ON DUPLICATE KEY UPDATE x = IF(...)` becomes
    `compareAndSet(model, { where, when, create, update })`, with the `IF`
    condition in `when`
  - in a transaction, wrap the whole `$transaction` call in `withUniqueRetry`,
    never an upsert inside it. A retry inside reads the transaction's snapshot,
    which still has no row, and fails again
  - check a new or changed write with `npm run races`, and add a case for it
    under `.local/tests/races/cases/`
- **`async`/`await`, never callbacks.** In code still on mysql2, use
  `db.promise().query<RowDataPacket[]>(...)`, or a checked-out connection for a
  transaction (rule 6). No new `db.query(sql, params, (err, rows) => ...)`, and
  no `async` function without an `await` in it.
- **One handler shape.** Validate input and answer 400, run the queries in one
  `try`, respond once. In the `catch`, `console.error` the real error with
  context and answer with a fixed message.
- **Errors are `{ error: string }`.** Never send `err.message` or any MySQL text
  to the browser. Use `dbErrorStatus` for the status when the pool may be busy.
- **Scope by `group_id` and `class`.** Every query, every room. Room names are
  `group_<group_id>_class_<class>`; build them the same way every time.
- **One type per concept.** Shapes live in `frontend/src/types/index.ts` and
  `api/src/models/`, one file per domain. Type `tinyint(1)` columns as `DbBool`, never
  `boolean`. No interfaces inside a component body.
- **Comments say why, in a sentence or two.** What the code used to do goes in
  the commit message. No comments that restate the next line, label imports, or
  carry emoji markers.
- **The frontend talks to the API with `fetch`** and `credentials: 'include'`.
  No axios. Read the base URL from one module, not a new `const` per file.
- **The second copy becomes a hook.** If you are about to paste an effect from
  another page, move it to `frontend/src/app/components/` and use it from both.
- **Saved progress is per user.** Lab browsers are shared, so a `localStorage`
  key a student page saves progress under is built with `userScope` from
  `lib/userStorage.ts`, and the page calls `dropOtherUsersKeys` on load.
- **A failure the user depends on shows up on screen.** A `catch` that only
  logs leaves a student staring at an empty page. Use the existing `Popup`.
- **Keep files small.** Aim for under 300 lines. Do not grow a file that is
  already over 800; extract first.
- **Use the existing names.** Steps come from `STEP_ORDER` and `STEP_TO_ROUTE`
  (`useProgress.tsx`, `api/src/config/steps.ts`), the barrier step from
  `RES_REVIEW_BARRIER_STEP`. Export them where you need them; do not retype the
  strings.
- **Delete dead code.** Do not comment it out or leave it "in case". Check both
  sides first (rule 9).

## Verifying a change

Both packages have vitest suites, `api/test/` and the `*.test.ts` files beside
the code in `frontend/src/`. CI runs them along with the typecheck, build,
Prettier, and ESLint and cspell on changed files, so run the same before you
push:

```
cd api && npx tsc --noEmit
cd frontend && npx tsc --noEmit
npm run build
npm test --prefix api
npm test --prefix frontend
npm run format:check
```

The tests cover pure logic and controllers against a fake pool, not the browser,
so verification is still partly manual and you are expected to actually do it,
not assume. Walk the affected flow against the local stack. Test accounts are in
`.local/README.md`; password is `nuhire` for all of them. Anything touching
groups, barriers, or sockets needs **two browser sessions in the same group**,
or you have not tested it. The built-in accounts only go as far as three
students; `npm run seed` builds a 30-student class when you need the real size,
and `npm run load` walks that whole class through the activity at once, which is
the check for barrier and socket changes (see `.local/tests/README.md`).
`npm run races` is the check for a write that must be atomic: it fires 30
concurrent first writes at each one and fails if any is lost.

## Before you open a PR

- [ ] Both packages typecheck, build and pass `npm test`
- [ ] You walked the affected flow locally
- [ ] Group or socket changes tested with two sessions in one group
- [ ] No new `console.log`, no new `any`, no new env var missing from `.env.example`
- [ ] `npm run format` run
- [ ] You did not move code and change behaviour in the same commit

That last one matters. Pure-motion refactors should show no net line change
beyond imports. Mixing a move with a behaviour change makes review impossible.

## Known-bad areas

Do not treat these as examples to follow:

| File                                   | Problem                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ManageGroupsTab.tsx`       | 2,051 lines, ~40 `useState` in one component                                                                                                  |
| `api/src/config/socket.ts`             | `onlineStudents` is still in memory; the barrier moved to `Step_Completion`. Use `onTeacher` / `onStudent` for any new event, never bare `on` |
| `api/src/controller/job.controller.ts` | destructive deletes (see rule 5); transactions are fixed                                                                                      |
| `components/useProgress.tsx`           | client-side-only gating, redirects to a 404                                                                                                   |
| `frontend/src/app/employerPanel/`      | stub; the final step does not work                                                                                                            |

`TICKETS.md` has the full backlog with file references if you want the detail.
