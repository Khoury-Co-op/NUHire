# Architecture

For teaching the codebase. Read [WHAT_IS_NUHIRE.md](WHAT_IS_NUHIRE.md) first so
the product makes sense, then this.

Line numbers were accurate as of the tooling commit. File and symbol names are
what to trust.

This was written with AI, against the actual source rather than from memory, so
feel free to throw it at an AI yourself to summarise, to ask follow-up
questions, or to explain a section in different terms. Two caveats. It can be
wrong, so check anything surprising against the file it cites. And the code is
the source of truth, not this page: if they disagree, the code wins and this
page is the bug.

---

## The shape of it

```
            Browser (student or professor laptop)
                 │                        │
        HTTP (ask/answer)          WebSocket (push)
                 │                        │
                 ▼                        ▼
      Next.js frontend :3000      Express API :5001
              │                           │
              └──────── HTTP ─────────────┤
                                          ▼
                                     MySQL :3306
                                   (21 tables)

      Keycloak :8080  ── login, redirects back to the API
```

Four processes. Locally, MySQL and Keycloak run in Docker while the API and
frontend run on your machine.

### Why two servers

The frontend draws screens. The API owns the data and the rules. **Only the API
touches the database.** If the browser could write directly, a student could edit
their own votes from devtools.

### Why both HTTP and WebSocket

HTTP is ask-and-answer. The browser asks, the server replies, done. The server
can never start the conversation.

That breaks down for a live classroom. When the professor sends a curveball, HTTP
has no way to push it. WebSocket keeps one connection open so either side can
send at any time.

So: **HTTP for "give me this," WebSocket for "tell me when something happens."**

---

## The one idea that explains everything: `(group_id, class)`

`class` is the CRN, the course section number. `group_id` is the team within it.
Together they identify one group of students.

Nearly every table and query is keyed on that pair. Socket.IO rooms are named
`group_<group_id>_class_<class>`.

**If you scope by `group_id` alone, you hit group 3 in every section at once.**
This is the single most common mistake in this codebase. Always carry both.

---

## The database

21 tables. Three kinds.

**Who people are**

- `Users` — email, `affiliation` (student / admin / none), `group_id`, `class`
- `Moderator` — maps an advisor email to a CRN. **This table is what makes
  someone a teacher.** Being in it is the only qualification.
- `GroupsInfo` — has this group been started

**The content students look at**

- `job_descriptions`, `Resume_pdfs`, `Candidates`, `Interview_vids`
- `Candidates.resume_id` links a person to their resume

**What students did**

- `Resume` — individual resume votes and the group's shortlist flag
- `InterviewPage` — interview ratings, four scores per candidate
- `InterviewPopup` — how the professor's curveballs shifted the scores
- `Offers` — the final offer and whether it was accepted
- `Notes`, `Progress`

### Two traps in the schema

**`candidate_id` is not `Candidates.id`.** Throughout the app it actually holds a
`Resume_pdfs.id`. Looking up `Candidates` by `id` silently returns the wrong
person. Join on `resume_id`.

**Schema fixes live in `database-files/migrations/`, not the dump.**
`Pandployer.sql` only ever runs against an empty database, so editing it fixes
new environments and does nothing to one with real data. `Resume` originally
had no unique key, so the `ON DUPLICATE KEY UPDATE` in `submitVote` never fired
and every vote change appended a row — a student who changed their mind ten
times counted as ten reviewed resumes. Migration `001` added the key. Read that
directory's README before changing any table.

---

## The API

```
api/src/
  server.ts          boot: connect db, configure passport, start
  app.ts             middleware, session, route mounting
  config/
    database.ts      mysql pool, Prisma client, boot-time seeding
    passport.ts      keycloak strategy
    socket.ts        ALL real-time behaviour
    steps.ts         step order, step -> route, and writing a step
  routes/            path -> controller, plus auth middleware per route
  controller/        request handling, plus raw SQL in areas not yet moved
  repository/        data access through Prisma, one file per area
  middleware/        requireAuth, requireAdmin, requireStudent
  models/            shared types: User, AuthRequest, SocketEvents (socket payloads), Barrier
```

**Request flow:** `routes/ -> controller/ -> repository/`. No service layer.
Notes and waiting-room facts already query through repositories on Prisma.
Every other area still has its SQL strings inside the controller, on mysql2,
until its own ticket moves it.

Reading an endpoint: start in `routes/`, which tells you the path, the middleware,
and the controller method. Then read that method.

### Auth middleware

Four guards in `middleware/auth.middleware.ts`:

| Guard              | Checks                                             |
| ------------------ | -------------------------------------------------- |
| `requireAuth`      | logged in. Nothing else                            |
| `requireAdmin`     | logged in **and** `affiliation === 'admin'`        |
| `requireStudent`   | logged in **and** `affiliation === 'student'`      |
| `requireModerator` | the legacy moderator session **or** `requireAdmin` |

`requireAdmin` now covers the group, job, csv, facts, delete, upload and offer
mutations. It used to be applied to nothing, which meant any logged-in student
could start groups or accept their own offer.

**Still open:** `requireAuth` proves you are logged in, never that the group in
the URL is _yours_. Several endpoints still take `group_id` and `student_id`
from the request body without checking them against the session. Do not copy
that pattern — see rule 1 in `AGENTS.md`.

---

## Login

1. Student clicks the landing page button → `GET /auth/keycloak` on the API
2. API redirects to Keycloak; they log in there
3. Keycloak redirects back to `/auth/keycloak/callback`
4. `auth.controller.ts` looks them up in `Users` and redirects based on their
   `affiliation`, whether their group has started, and whether they've seen the intro

**Step 4 matters for navigation.** The API redirects to frontend routes like
`/waitingGroup`, `/about`, `/signupform`. Those pages have no inbound links from
the frontend, so they look dead to a grep and are not.

There is also a **second, unrelated login**: the "Admin" button, a plaintext
password compared against env vars. It gates the page that writes `Moderator`.
Scheduled for removal.

---

## The real-time layer

`api/src/config/socket.ts`. The most interesting and weakest file in the repo.

Students join room `group_<g>_class_<c>`. Through it flow shared checkboxes,
professor popups, step transitions, and offer approvals.

### Three things to understand

**1. The group barrier.** Several steps wait for every group member to finish
before anyone advances. This is the core of the group mechanic.

**2. The barrier lives in the database.** `Step_Completion`, one row per
student per step. `evaluateGroupBarrier` in `socket.ts` answers "has every
current member finished?" **by query, every time** — on completion, on room
join, on a roster change, and from `GET /groups/barrier-status`.

It used to be a plain object in process memory. An API restart wiped it: the
students who had already finished never re-announced, so the group restarted at
0 and could never reach its total again. Rows in MySQL survive a restart, so the
same question can be asked as often as anyone needs.

A few details worth knowing. Only students who showed up count:
`Users.present_at` is stamped when a student's socket connects or a student page
calls `POST /users/update-currentpage`, and reset when the professor starts
their group, and `presentMembers` in `socket.ts` is the one query every gate
counts with, so a student who never logs in is not waited for. Before anyone in
a group is stamped, `GET /interview/group-size` reports the whole roster rather
than 0, so the client gates cannot open on 0 of 0.
A student who arrives after everyone present had finished is not counted either,
so a late login cannot close a barrier the group already went through; instead
the dashboard offers them their group's step (`/groups/catch-up`) and they skip
the solo review. A student moved into a group is re-stamped, so they count as
arriving then, and get the same offer. Only
completions belonging to a **current** member count, because a student moved
between groups leaves their row behind. And an empty group is treated as
unknown, not finished, so 0 of 0 cannot walk a student through a barrier before
anyone in their group has shown up.

**3. The teacher has an override.** `POST /groups/force-advance`, admin only.
A deadlocked group no longer needs someone editing the database mid-class.

### Also true of sockets here

- `io.use` reads the login session off the handshake and refuses a socket with
  none (`SOCKET_AUTH_REQUIRED`, on unless set to `false`). A student cannot join
  another group's room, teacher events are refused from anyone but a teacher of
  that class (`onTeacher`), and student events act on the sender's own group
  from `Users`, never one named in the payload (`onStudent`).
- Zero bare `io.emit` calls remain. Everything is room-scoped. The advisor
  dashboard is not in the group room, so use `emitToClassModerators` to reach a
  class's teachers.
- `onlineStudents` is still process memory, which is why `INSTANCE_COUNT` must
  stay at 1.

---

## The frontend

```
frontend/src/app/
  page.tsx            landing
  about/ instructions/   first-time intro
  dashboard/          student hub, defines the step list
  jobdes/ res-review/ res-review-group/ interview-stage/ makeOffer/
  employerPanel/      stub
  waitingGroup/       "waiting for your teacher"
  advisor-dashboard/  professor hub
  grouping/           renders ManageGroupsTab + StudentCSVTab
  new-pdf/ adminFacts/
  components/         shared UI and React contexts
```

Next.js App Router: a folder under `app/` becomes a URL.

### Contexts worth knowing

- `AuthContext` — current user, used everywhere
- `socketContext` — the shared Socket.IO connection
- `useProgress` — the step gate

### How gating works, and why it's still weak

`components/useProgress.tsx` decides whether you are allowed on a step page. It
waits for auth to resolve, fetches your step from the server, and takes
whichever of the server value and the cached value is **further along** — so one
failed request cannot throw a student back to the dashboard mid-activity.

`STEP_TO_ROUTE` in that file is the one table translating a `Progress.step`
value to a route. It used to redirect to `/${progress}`, producing `/res_1`,
which is not a route, so the guard itself 404'd.

**Still client-side**, so devtools defeats it. Server-side step enforcement is
still an open ticket. Treat this as UX, not security.

### The professor's cockpit

`components/ManageGroupsTab.tsx`, over 2,000 lines with ~40 `useState` hooks and
six modals in one component. Roster import, group assignment, job assignment,
starting groups, popups, offer approval. Everything the professor does in class.

This is the file everyone will need to touch, which is why splitting it matters.

---

## Three names for the same thing

There are three vocabularies for "what step is a student on," and they do not map
to each other:

| System               | Values                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `Users.current_page` | `dashboard, resumepage, resumepage2, jobdes, interviewpage, makeofferpage` |
| `Progress.step`      | `none, job_description, res_1, res_2, interview, offer, employer`          |
| Route paths          | `/jobdes, /res-review, /res-review-group, /interview-stage, /makeOffer`    |

This is the root cause of most "why is this student on the wrong page" bugs.
Collapsing them into one is a planned ticket, and until it lands, expect
translation bugs at every boundary.

---

## Tracing a real feature

**"A student checks a resume box and their teammates see it."**

1. `res-review-group/page.tsx` renders the checkbox
2. On click it emits `check` with the room id, resume number, and new state
3. `socket.ts` `check` handler parses `group_<g>_class_<c>` out of the room name
4. It runs `UPDATE Resume SET checked = ?` scoped to group, class, resume
5. It emits `checkboxUpdated` back to the room
6. Every client in the room, including the sender, updates

That's the pattern for most live behaviour: **emit → persist → broadcast to the
room**. Worth reading in full, it's the clearest example in the file.

---

## Where to start reading

In order:

1. `frontend/src/app/dashboard/page.tsx` — the step list, the shape of the journey
2. `api/src/routes/` — the whole API surface in a few small files
3. `api/src/config/socket.ts` — how live behaviour works
4. `database-files/Pandployer.sql` — the data model
5. `frontend/src/app/res-review/page.tsx` — a full student step end to end

Then read [AGENTS.md](../AGENTS.md) for the rules, and pick a good first issue
from [TICKETS.md](../TICKETS.md).
