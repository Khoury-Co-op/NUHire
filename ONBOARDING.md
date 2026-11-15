# NUHire onboarding

Everything you need on day one. Verified against the tree at `main` / `8117f8a1`.

Anything I could not verify is marked **[UNVERIFIED]**. If a step here is wrong,
that is a bug in this file. Fix it in the same PR as whatever you were doing.

---

## 1. What this is

NUHire is a web app that runs a live, in-class hiring simulation for Khoury
CS1210 (Intro to Co-op). **Students play the employer, not the applicant.**

It replaces a paper activity called "employer for a day": students got a printed
job description and a stack of resumes and had to pick who to interview. It
worked, because spending an hour rejecting resumes teaches you why yours gets
rejected. It just didn't scale and the instructor couldn't see anything.

### The activity

Students work in groups of 3 to 5. Six steps, and the group moves through them
together:

1. **Job description** — the group is assigned a real co-op posting
2. **Resume review** — each student reviews 10 resumes alone, on a timer
3. **Group resume review** — the group argues down to 4 candidates
4. **Interview stage** — watch recorded interviews, rate the answers
5. **Make an offer** — pick one, send it to the professor
6. **Employer panel** — the debrief. **Not built.** It is a heading and a button

The professor runs it live: imports a roster, assigns groups, assigns each group
a job, starts them, throws curveballs during the interview stage, and accepts or
rejects each offer. Accepting is roleplay — the professor is playing the
_candidate_ deciding whether to take the job.

### Where it stands

Built by Khoury co-ops through 2025. **Everyone who wrote it has left.** It was
deployed to Khoury infrastructure in spring 2026 and has sat since.

The core simulation genuinely works. Login, group management, all five real
steps, live sync between group members, the professor's control panel. That is
not a prototype.

What is missing is everything around it: **it has never been run with more than
two people at once.** The pilot is one real class of about 30 students.

**Not currently hosted.** The Khoury deployment resolves to a private `10.x`
address, so it is NEU-network-only. **[UNVERIFIED]** whether the service is
actually up behind that. Local is the only environment you can rely on.

### What we are actually solving

Not "build a hiring simulation." That exists.

**Make it survive a real classroom.** Thirty students, one professor, fifty
minutes, no second chances. A bug here doesn't page an on-call engineer, it
derails a class and the professor falls back to paper.

That reframes what matters. The scariest thing in this codebase was never slow
queries. It was that a group could get permanently stuck waiting on a teammate,
with no way out.

---

## 2. Stack and repo structure

| Piece       | What                                                             |
| ----------- | ---------------------------------------------------------------- |
| `frontend/` | Next.js 15 App Router, React 19, Tailwind, Socket.IO client      |
| `api/`      | Express + TypeScript, Socket.IO server, Passport + Keycloak OIDC |
| MySQL       | schema in `database-files/Pandployer.sql`                        |
| Keycloak    | login. Moving to Khoury IT SSO eventually                        |

Four processes. Locally, MySQL and Keycloak run in Docker; the API and frontend
run on your machine.

```
            Browser (student or professor)
                 │                    │
         HTTP (ask/answer)     WebSocket (push)
                 │                    │
                 ▼                    ▼
      Next.js :3000            Express API :5001
              │                        │
              └───────── HTTP ─────────┤
                                       ▼
                                  MySQL :3307 (host)
      Keycloak :8080 ── login, redirects back to the API
```

**Why two servers.** The frontend draws screens. The API owns the data and the
rules. Only the API touches the database, so a student can't edit their own
votes from devtools.

**Why both HTTP and WebSocket.** HTTP is ask-and-answer; the server can never
start the conversation. When the professor sends a curveball, HTTP has no way to
push it. So: HTTP for "give me this," WebSocket for "tell me when something
happens."

```
api/src/
  server.ts          boot: connect db, configure passport, start
  app.ts             middleware, session, route mounting
  config/
    database.ts      mysql pool, boot-time seeding
    passport.ts      keycloak strategy
    socket.ts        ALL realtime behaviour, and the group barrier
    steps.ts         step order, step -> route, and writing a step
  routes/            path -> controller, plus the auth middleware per route
  controller/        request handling and raw SQL
  middleware/        requireAuth, requireAdmin, requireModerator, requireStudent
  models/            shared types: User, AuthRequest, SocketEvents (socket payloads), Barrier

frontend/src/app/
  page.tsx                    landing
  about/ instructions/        first-time intro
  dashboard/                  student hub, defines the step list
  jobdes/ res-review/ res-review-group/ interview-stage/ makeOffer/
  employerPanel/              stub
  waitingGroup/               "waiting for your teacher"
  advisor-dashboard/          professor hub
  grouping/                   renders ManageGroupsTab + StudentCSVTab
  new-pdf/ adminFacts/
  components/                 shared UI and React contexts

database-files/
  Pandployer.sql              base schema
  migrations/                 001..005, applied in order
.local/                       the local dev stack (compose, realm, seed)
```

**Request flow is `routes/ → controller/ → raw SQL`.** No service layer, no ORM.
SQL lives inside controllers. To read an endpoint, start in `routes/`: it tells
you the path, the middleware, and the controller method.

### The one idea that explains the schema: `(group_id, class)`

`class` is the CRN, the course section number. `group_id` is the team within it.
Together they identify one group of students. Nearly every table and query is
keyed on that pair, and Socket.IO rooms are named `group_<group_id>_class_<class>`.

**If you scope by `group_id` alone you hit group 3 in every section at once.**
This is the most common mistake in this codebase. Always carry both.

### Mounted API prefixes

From `api/src/app.ts:199-218`: `/auth` `/users` `/resume` `/resume_pdf`
`/interview` `/jobs` `/groups` `/moderator` `/notes` `/offers` `/progress`
`/candidates` `/upload` `/uploads` `/csv` `/facts` `/delete`

---

## 3. How a request flows: one worked example

**A student votes yes on resume 3.**

**1. The click.** `frontend/src/app/res-review/page.tsx` posts to
`${NEXT_PUBLIC_API_BASE_URL}/resume/vote` with `credentials: 'include'` so the
session cookie rides along.

**2. The route.** `api/src/routes/resume.routes.ts:12`

```ts
router.post('/vote', requireAuth, resumeController.submitVote);
```

`requireAuth` (`api/src/middleware/auth.middleware.ts:6`) checks
`req.isAuthenticated()` and 401s otherwise. It proves you are logged in. It does
**not** check your role or that the group you named is yours.

**3. The controller.** `api/src/controller/resume.controller.ts`, `submitVote`:

- Validates that `student_id`, `group_id`, `class`, `resume_number`, `timespent` and `vote` are present
- `SELECT`s the existing vote so it can report the old value
- Upserts:

```sql
INSERT INTO Resume (student_id, group_id, class, timespent, resume_number, vote)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE timespent = VALUES(timespent), vote = VALUES(vote);
```

That `ON DUPLICATE KEY` only works because migration
`database-files/migrations/001-resume-unique-vote.sql` added the unique key.
Before it, the clause could never fire and every vote change appended a row.

**4. The broadcast.** Still in `submitVote`:

```ts
const roomId = `group_${group_id}_class_${classId}`;
this.io.to(roomId).emit('voteUpdated', { resume_number, oldVote, newVote: vote, student_id });
```

Scoped to the room, so only that group's browsers hear it. Their tallies update
with no refresh.

**5. The response.** `200 { message: 'Resume review updated successfully' }`.

**Notice the gap.** `student_id` and `group_id` come from the **request body**,
not the session. Nothing checks they belong to the caller. That is a real open
issue, not a pattern to copy — see the scoping ticket in `TICKETS.md`. In new
code, derive identity from `req.user`.

---

## 4. Auth: how teacher vs student is decided

### The login flow

1. Student clicks the landing button → `GET /auth/keycloak` on the **API**
2. API redirects to Keycloak; they log in there
3. Keycloak redirects back to `/auth/keycloak/callback`
4. `api/src/controller/auth.controller.ts` looks them up in `Users` and decides
   where to send them

### The decision, in order (`auth.controller.ts:113-160`)

```
look up Users by email
├─ affiliation === 'admin'            → /advisor-dashboard        (TEACHER)
├─ missing f_name/l_name, or
│  affiliation === 'none'             → /signupform
└─ otherwise (student):
   └─ is GroupsInfo.started = 1 for (class, group_id)?
      ├─ no                           → /waitingGroup
      └─ yes:
         ├─ Users.seen = 1            → /dashboard
         └─ Users.seen = 0            → /about  (one-time intro)
```

**`Users.affiliation` is the switch.** One column, values `student | admin | none`.

**`Moderator` is the root of trust.** It maps an advisor email to a CRN. Being
in that table is the _only_ thing that qualifies you to become a teacher. When a
user picks "Faculty" on the signup form, `createUser`
(`api/src/controller/user.controller.ts`) checks server-side:

```sql
SELECT crn FROM Moderator WHERE admin_email = ? LIMIT 1
```

No row, no admin. 403. The browser-side check on the signup form is cosmetic;
this is the one that counts.

### The middleware (`api/src/middleware/auth.middleware.ts`)

| Guard              | Checks                                             |
| ------------------ | -------------------------------------------------- |
| `requireAuth`      | logged in. Nothing else                            |
| `requireAdmin`     | logged in **and** `affiliation === 'admin'`        |
| `requireStudent`   | logged in **and** `affiliation === 'student'`      |
| `requireModerator` | the legacy moderator session **or** `requireAdmin` |

### The second login

There is a **separate** auth system: the "Admin" button on the landing page goes
to `/mod-signin`, which posts a plaintext username and password compared against
`MODERATOR_USERNAME` / `MODERATOR_PASSWORD` env vars. It gates `/mod-dashboard`,
the only UI that writes the `Moderator` table.

It is load-bearing (that is how teachers get created) and scheduled for removal.
`requireModerator` exists purely to bridge the two until it goes.

**Important for navigation:** the API redirects to frontend routes
(`/waitingGroup`, `/about`, `/signupform`). Those pages have **no inbound links
from the frontend**, so they look dead to a grep and are not. Check both sides
before deleting a page:

```bash
grep -rn "routeName" frontend/src   # frontend links
grep -rn "FRONT_URL" api/src        # server-side redirects
```

---

## 5. Realtime and the group barrier

`api/src/config/socket.ts`. The most interesting file in the repo.

Clients join room `group_<group_id>_class_<class>`. Through it flow shared
checkboxes, professor popups, step transitions, and offer approvals.

### Socket auth

`io.use(...)` at `socket.ts:182` reads the login session off the handshake and
populates the authenticated user. It refuses to join a student to another
group's room.

A socket with no login is refused (`SOCKET_AUTH_REQUIRED`, on unless set to
`false`). Every event a browser can send is checked against the login: teacher
events go through `onTeacher`, and student events through `onStudent`, which
acts on the sender's own group as `Users` has it and ignores any group, class or
student id in the payload. Teacher events also need the sender to teach the
event's class. `SOCKET_AUTH_REQUIRED=false` (that exact string) lets sockets with
no login connect, but student events still need one, so it does not bring live
group features back. If the login cookie stops reaching the handshake, redeploy
the previous version; see `api/.env.example`.

### The barrier

This is the core group mechanic and the thing most likely to break a live class.

**Every member of a group must finish their own resume review before
`res-review-group` opens.** The step constant is
`RES_REVIEW_BARRIER_STEP = 'res_1'` (`socket.ts:44`).

It used to live in a plain JavaScript object in process memory. An API restart
wiped it: students who had already finished never re-announced, so the group
restarted at 0 and could never reach its total again. **It is now DB-backed.**

`evaluateGroupBarrier(db, classId, groupId, step)` (`socket.ts:70`) answers the
question **by query, every time**:

```sql
SELECT id, present_at FROM Users
 WHERE group_id = ? AND class = ? AND affiliation = 'student' AND present_at IS NOT NULL;

SELECT student_id, completed_at FROM Step_Completion
 WHERE group_id = ? AND class = ? AND step = ?;
```

Then:

- Only students who **showed up** count. `Users.present_at` is stamped when a
  student's socket connects or a student page calls
  `POST /users/update-currentpage`, and reset for a group's members when the
  professor starts that group, keeping whoever is connected at that moment. A
  student on the roster who never logs in is not waited for. The first query is
  `presentMembers` (`socket.ts`), and every gate counts through it, including
  `GET /interview/group-size`, which the res-review-group, interview and offer
  pages compare against. That endpoint falls back to the whole roster while
  nobody in the group is stamped, so it never reports 0 for a real group.
- Only completions belonging to a **current** member count. A student moved to
  another group mid-class leaves a row behind, and counting it would release a
  group that still has someone unfinished.
- The barrier opens at the first completion by which everyone present had
  finished. Someone who arrives after that is not counted, so a late login
  cannot close a barrier the group already went through.
- That late student is offered their group's step on the dashboard
  (`GET`/`POST /groups/catch-up`, `catchUpStep` in `config/steps.ts`) and skips
  the solo review. The later gates count them from then on.
- An empty group is **unknown, not finished** — releasing on 0 of 0 would walk a
  student through a barrier before anyone in their group had shown up.

`broadcastGroupBarrier(...)` re-evaluates and, if open, emits
`groupCompletedResReview` **to the room**, not to cached socket ids. Nothing is
deleted afterwards, so it is safe to ask again. It re-runs on completion, on
room join, and on roster change.

Two escape hatches now exist:

- **`GET /groups/barrier-status`** — the same answer over HTTP, for a client
  whose socket never came back
- **`POST /groups/force-advance`** (`api/src/routes/group.routes.ts:28`,
  `requireAdmin`) — the professor can push a deadlocked group forward without a
  DBA

> `docs/ARCHITECTURE.md` covers the same ground in more depth and is current
> as of this file.

### Single replica only

`onlineStudents` is still process memory. With two replicas a group splits
across them and never reaches its completion count. `INSTANCE_COUNT` must stay
`1`; the API logs a loud error at boot above that but **cannot enforce it**, so
the Coolify service has to stay at 1 too.

---

## 6. Local setup

### Prerequisites

- **Docker Desktop**, running
- **git**
- **Node 22** (`.nvmrc` pins it — `nvm use`). npm starts the stack
  (`npm run all`) and runs `typecheck` and `format` on your machine. The app
  itself runs in Docker. Your editor also needs `npm run install:all` for types.

### Steps

```bash
git clone git@github.com:Oasis-NEU/NUHire.git
cd NUHire
npm run all
```

That builds and starts MySQL, Keycloak, the API and the frontend in one
terminal. The first run downloads images and builds the two app images, about
two minutes, but later starts take seconds. Open http://localhost:3000 once the API
logs `Server running`. Ctrl+C stops everything.

Saving a file under `api/src` or `frontend/src` reloads that app within a
couple of seconds. Changing a `package-lock.json` rebuilds its image.

**On Windows, use WSL2** and clone into the Linux side (`~/...`, not
`/mnt/c/...`), with Docker Desktop's WSL integration turned on for your distro.

To run the API and frontend on the host instead, for a debugger, see
`.local/README.md`.

```bash
docker compose -f compose.dev.yaml ps   # all four up; db and keycloak (healthy)
curl http://localhost:5001/health
```

### Every env var

**`api/.env`** — copy from `api/.env.example`, the defaults work as-is. Under
`npm run all` this file is optional: Docker reads the example, then `api/.env`
on top if it exists, so use it for your own overrides instead of editing the
example. `DATABASE_URL` is always set by compose there.

| Var                      | Local value                                    | What it does                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | `mysql://root:nuhire@127.0.0.1:3307/nuhire`    | **Port 3307 on the host**, 3306 inside Docker                                                                                                                                             |
| `BACKEND_PORT`           | `5001`                                         | API port                                                                                                                                                                                  |
| `SESSION_SECRET`         | any 32+ char string                            | **API refuses to boot if unset or under 32 chars.** Unset signed every cookie with `undefined`, making them forgeable                                                                     |
| `REACT_APP_FRONT_URL`    | `http://localhost:3000`                        | CORS origin and post-login redirect target                                                                                                                                                |
| `KEYCLOAK_URL`           | `http://localhost:8080`                        | Must resolve to the same URL from **both** the browser and the API process                                                                                                                |
| `KEYCLOAK_REALM`         | `NUHire-Realm`                                 |                                                                                                                                                                                           |
| `KEYCLOAK_CLIENT_ID`     | `NUHire-Client`                                |                                                                                                                                                                                           |
| `KEYCLOAK_CLIENT_SECRET` | in the example file                            | Local dev value                                                                                                                                                                           |
| `KEYCLOAK_CALLBACK_URL`  | `http://localhost:5001/auth/keycloak/callback` | Must be in the realm's redirect URIs                                                                                                                                                      |
| `MODERATOR_USERNAME`     | `admin`                                        | Legacy second login                                                                                                                                                                       |
| `MODERATOR_PASSWORD`     | `admin`                                        | Legacy second login                                                                                                                                                                       |
| `COOKIE_SECURE`          | `false`                                        | **Must be false locally.** Browsers drop `Secure` cookies over plain http, so the session never persists. Leave UNSET in deploys                                                          |
| `DB_POOL_SIZE`           | `25`                                           | Per process, so also the ceiling on concurrent queries                                                                                                                                    |
| `DB_POOL_QUEUE_LIMIT`    | `30`                                           | **Must stay finite.** At 0, mysql2 queues forever: a saturated pool produced requests that never resolved and never errored, so 30 laptops span while logs looked healthy. Past this, 503 |
| `DB_CONNECT_TIMEOUT_MS`  | `10000`                                        |                                                                                                                                                                                           |
| `DB_QUERY_TIMEOUT_MS`    | `15000`                                        | MySQL `max_execution_time`; caps read-only SELECTs only                                                                                                                                   |
| `INSTANCE_COUNT`         | `1`                                            | Leave at 1. See the barrier section                                                                                                                                                       |
| `SOCKET_AUTH_REQUIRED`   | `true`                                         | Refuse sockets with no login. Only `false` turns it off, and that is not a rollback; see `api/.env.example`                                                                               |

**`frontend/.env.local`** — likewise an optional override under `npm run all`.

| Var                        | Local value             | What it does                                                                                                                                                              |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:5001` | Every frontend fetch uses this                                                                                                                                            |
| `NEXT_PUBLIC_FRONT_URL`    | `http://localhost:3000` | **Stale.** `grep -rn NEXT_PUBLIC_FRONT_URL frontend/src` returns nothing — those pages use `router.push` now. Harmless; the comment in the example file should be deleted |

### Useful commands

```bash
npm run build        # both packages
npm run typecheck    # tsc --noEmit in both
npm run format       # prettier

npm run reset   # nuke DB + reseed on next npm run all

npm run seed         # a 30-student class (class 9001), with messy cases
npm run seed:check   # log in all of them through Keycloak
npm run seed:reset   # back to a clean simulated class, in seconds
npm run seed:wipe    # remove it
npm run load         # load test: all 30 through the activity at once
```

The seed needs the stack up. See `.local/tests/README.md` for the roster and how
the fake students log in.

---

## 7. Gotchas

**Do not use `npm run dev` inside `api/`.** The `ts-node` script throws TS2769
on `auth.routes.ts` — the lockfile pins `@types/express@5` against `express@4`.
`tsc` itself passes, so `npm run dev:api` (build then start) works. Consequence:
**no API hot reload when you run it on the host**, you rebuild. In Docker it
hot-reloads through `tsc --watch` instead.

**One browser can only hold one login.** Keycloak SSO is shared across tabs, so
a second tab silently keeps your first identity. Use a **private/incognito
window** for the second role.

**Students see nothing until an advisor starts their group AND assigns a job.**
If you log in as a student first, you land on `/waitingGroup` and conclude the
app is broken. It isn't. Do the teacher steps first.

**Port 3307, not 3306.** The host mapping avoids clashing with a local MySQL.

**MySQL only seeds on a fresh volume.** `Pandployer.sql` and `seed.sql` run from
`docker-entrypoint-initdb.d`, which only fires when the data directory is empty.
Changed the schema? `down -v` and back up.

**Recreating the stack drops the Keycloak users but not the database.** Keycloak
has no volume and re-imports its realm on every boot, while MySQL keeps its
volume. After `npm run down` and `npm run all`, the simulated class (if you
seeded it) is still in MySQL but nobody can log in. Run `npm run seed` to put the
Keycloak accounts back. The four built-in accounts are in the realm file, so they
always come back.

**Migrations run when the API starts.** `npm run all` and `npm run dev:api` both
run dbmate first, which applies any file in `database-files/migrations/` the
database has not recorded in `schema_migrations`. If one fails, the API does not
start and its log says which. See `database-files/migrations/README.md`.

**`candidate_id` is not `Candidates.id`.** Throughout the app it holds a
`Resume_pdfs.id`. Looking up `Candidates` by `id` silently returns the **wrong
person**. Join on `resume_id`.

**Three names for the same thing.** `Users.current_page`, `Progress.step`, and
the route paths are three vocabularies for the same six steps and they do not
map to each other. `frontend/src/app/components/useProgress.tsx` has the one
`STEP_TO_ROUTE` table that translates. The API has its own copy in
`config/steps.ts` because force-advance sends a route over the wire —
**change both together.** Do not add a fourth.

**Group and socket changes need two browser sessions.** Barriers, shared
checkboxes, and offers cannot be tested alone. One normal window, one incognito,
both in the same group.

**`.next` sync artifacts break typecheck.** Files like `cache-life.d 2.ts` (a
cloud-sync duplicate) produce duplicate-identifier errors that are not your
code. `rm -rf frontend/.next` and re-run.

**Don't add `console.log`.** There are hundreds already and they bury real
errors during a live class.

---

## 8. Giving yourself teacher access locally

**The seed already did it.** `.local/seed.sql` inserts
`advisor@northeastern.edu` into `Moderator` with `crn = 1` and into `Users` with
`affiliation = 'admin'`. Just log in as the advisor account below.

**To make a different account a teacher**, two things must both be true:

1. A row in `Moderator` mapping the email to a CRN
2. `Users.affiliation = 'admin'` for that email

Fastest path, straight to the database:

```bash
docker exec -it nuhire-mysql mysql -uroot -pnuhire nuhire -e "
  INSERT INTO Moderator (admin_email, crn) VALUES ('you@northeastern.edu', 2);
  UPDATE Users SET affiliation='admin' WHERE email='you@northeastern.edu';
"
```

Through the UI instead: landing page → **Admin** (top right) → `/mod-signin` →
`admin` / `admin` (from `MODERATOR_USERNAME` / `MODERATOR_PASSWORD`) → add the
email and CRN on `/mod-dashboard`. Then that person logs in through Keycloak,
picks Faculty on the signup form, and `createUser` verifies the `Moderator` row
server-side before granting admin.

The account must also exist in Keycloak. Seeded users live in
`.local/realm-export.json`; the realm **re-imports on every container boot**, so
users you add through the Keycloak admin console (`localhost:8080`,
`admin`/`admin`) vanish on restart. Add them to the file to make them stick.

### Test accounts

Password is **`nuhire`** for all four (plaintext in `.local/realm-export.json`,
non-temporary, email verification off).

| Email                       | Role    | Group   |
| --------------------------- | ------- | ------- |
| `advisor@northeastern.edu`  | admin   | —       |
| `student1@northeastern.edu` | student | group 1 |
| `student2@northeastern.edu` | student | group 1 |
| `student3@northeastern.edu` | student | group 2 |

Need more people than that? `npm run seed` builds a full class: `advisor01` and
`student01` to `student30` at `@example.test`, password `nuhire`, in 8 groups,
including a student who never logs in, one with no group and a group of one. See
`.local/tests/README.md`.

---

## 9. Full click-through

Do this once, end to end. It is the fastest way to understand the product.

> **[UNVERIFIED]** in this pass: I could not drive a browser in the session that
> produced this doc. The flow below is reconstructed from the code and from an
> earlier session where it was run end to end. Treat any mismatch as a doc bug
> and fix it — that is literally ticket `ONB-1`.

### Part A — teacher

1. Open http://localhost:3000 in your **normal window**
2. Click **"Click Here to Get Started"**
3. Log in as `advisor@northeastern.edu` / `nuhire`
4. You land on **`/advisor-dashboard`** — three cards: Manage Groups, Upload Job
   and Resumes, Waiting Facts
5. Click **Manage Groups** (`/grouping`). Two tabs: Manage Groups, CSV Group
   Assignment
6. Select class **CRN 1** in the dropdown. Groups 1 and 2 appear with their
   students
7. **Assign a job.** Use the per-group "Assign Job" button, or the toolbar
   "Assign Job to All Groups". Pick e.g. **Carbonite**
   > ⚠️ This button **deletes every resume vote, interview rating and note for
   > the affected groups**, with no confirmation and no mention of it in the
   > modal. Harmless on a fresh seed. Ticket `TCH-1` adds the dialog
8. **Start the group.** Per-group "Start Group", or "Start All Groups"
   > ⚠️ Irreversible through the UI — nothing sets `started` back to 0
9. Leave this window open

### Part B — student

10. Open a **private/incognito window** (not a new tab — SSO is shared)
11. Go to http://localhost:3000, log in as `student1@northeastern.edu` / `nuhire`
12. First login goes to **`/about`** (intro video) because `Users.seen = 0`.
    Continue → **`/instructions`** → **`/dashboard`**
13. The dashboard shows six step cards. **Job Description** is unlocked
14. Walk the steps: **Job Description** → **Resume Review** (10 resumes on a
    timer) → **Group Resume Review** → **Interview Stage** → **Make an Offer**
15. At **Make an Offer**, pick a candidate and submit. The button then reads
    _"awaiting advisor approval"_
16. Back in the teacher window: **Manage Groups** → CRN 1 → group 1 shows the
    pending offer with accept/reject. Click **accept**
17. Watch the student window unlock live — that is `makeOfferResponse` arriving
    over the socket

### To actually feel the group mechanic

Steps 2 and 3 wait for **all** group members. With one student in a group of
two, you will sit at the barrier — which is the point. Open a third window as
`student2@northeastern.edu` (also group 1) and finish resume review on both to
see it release.

If you get stuck there, that is `POST /groups/force-advance` existing for a
reason.

Want to see that at the size of a real class? `npm run seed -- --scenario=waiting-on-group`
leaves group 1 stuck at 3 of 4 because one student on the roster never logs in,
as happens in a real class. Log in as `advisor01@example.test` and force it
through. The other scenarios (`mid-resume-review`, `interview-stage`,
`offers-pending`) are described in `.local/tests/README.md`.

---

## 10. Ten starter tickets

Full backlog with estimates and dependencies is in
[TICKETS.md](TICKETS.md). These ten are independent and touch different files,
so ten people can start at once.

**1. `ONB-1` — Run the app and log every place this doc lied** · 3h · GFI
Do it on a **fresh clone in a temp directory**, not your existing checkout —
clone-only failures are the ones that survive every review. PR the fixes.

**2. `TCH-1` — Confirmation dialog on "Assign Job"** · 5h · GFI
`frontend/src/app/components/ManageGroupsTab.tsx`. The most destructive button
in the app has weaker friction than "remove one student." Modal must name what
will be erased, show the affected group count, warn if any group has a pending
offer, and require typing `ERASE` or the CRN. Cancel is default-focused.

**3. `TCH-8` — Confirm dialog on per-group "Start Group"** · 2h · GFI
`frontend/src/app/components/ManageGroupsTab.tsx`. Fires immediately and is
irreversible, while "Start All" gets a confirm. Also: a group created _after_
"Start All" cannot be started from the toolbar.

**4. `STU-8` — Stop `/jobdes` resetting progress backwards** · 4h · MED
`frontend/src/app/jobdes/page.tsx` + `api/src/controller/progress.controller.ts`.
It calls `updateProgress("job_description")` unconditionally on mount and the API
overwrites unconditionally. A student at the interview stage who re-reads the job
description is reset to step 1, every later step re-locks, and they are ejected
while their group waits at a barrier. Make progress monotonic server-side.

**5. `STU-15` — Emit before navigating** · 2h · GFI
`frontend/src/app/res-review/page.tsx`, `frontend/src/app/interview-stage/page.tsx`.
Both set `window.location.href` and _then_ emit `moveGroup`. Navigation can tear
down the socket first, so one student advances and their teammates stay behind.

**6. `UI-12` — Build `<Spinner>` / `<PageLoader>`** · 5h · GFI
The same loading block is copy-pasted **16 times** across `frontend/src/app/`;
one copy has already drifted to a different colour. Cheapest possible start on
the design system.

**7. `UI-6` — Unify step-name vocabulary in the UI** · 5h · GFI
"Interview Stage" vs "Interview Page" vs "Interview Review" for the same step,
hardcoded in three places. `instructions/page.tsx` lists 5 steps while
`dashboard/page.tsx` shows 6 cards. Extract one canonical list.

**8. `UI-7` — Fix the progress bar, which always lies** · 4h · GFI · deps: UI-6
`frontend/src/app/components/instructions.tsx`. Each page passes a hardcoded
`progress={n}` over a 5-item array, so a student on the **final** step sees 80%
and one on the first sees 0%.

**9. `UI-9` — Rewrite the Tailwind theme tokens** · 6h · MED
`frontend/tailwind.config.js` defines `background: '#fff'` **and**
`foreground: '#fff'`. `sand: '#fff'` is not sand, `navy: '#000'` is not navy.
Every page writes `bg-sand/80` believing it is tinting warm when it is applying
flat white. **Agree a palette as a team first** — this is a design decision, not
a bug fix. Three of the config's four `content` globs also point at directories
that do not exist.

**10. `ONB-2` — Write a walkthrough of one student step** · 4h · GFI
Pick `jobdes`, `res-review`, `interview-stage` or `makeOffer`. Document
component → API call → controller → SQL → response, plus every socket event it
emits or listens for. Add to `docs/walkthroughs/`. Forces real reading and the
next cohort uses it.

**Two harder ones** if you want depth, both needing a short spec from the lead
first: `SEC-8` (authorize socket events by role — what stops a student faking an
advisor's accept) and `TCH-11`+`TCH-12` (candidate stats endpoint and modal —
the screen that makes the activity teachable).

---

## Before you open a PR

- [ ] `npm run typecheck` and `npm run build` both pass
- [ ] You walked the affected flow locally
- [ ] Group or socket changes tested with **two sessions in one group**
- [ ] No new `console.log`, no new `any`, no new env var missing from `.env.example`
- [ ] `npm run format` run
- [ ] You did not move code and change behaviour in the same commit

That last one matters. Pure-motion refactors should show no net line change
beyond imports. Mixing a move with a behaviour change makes review impossible.

## What to read next

1. **[AGENTS.md](AGENTS.md)** — the rules file. Applies to humans and AI agents
2. **[docs/WHAT_IS_NUHIRE.md](docs/WHAT_IS_NUHIRE.md)** — the product, no code
3. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — deeper on the code.
   deeper on the code
4. **[TICKETS.md](TICKETS.md)** — the backlog
5. **[CLEANUP.md](CLEANUP.md)** — small jobs if you have a spare hour
