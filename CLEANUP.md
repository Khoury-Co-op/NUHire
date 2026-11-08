# CLEANUP.md

Small work you can finish in a sitting. Bugs too small to plan a sprint around,
and tidying that makes the next bug easier to find. Nothing here blocks anyone,
so take one whenever you have a spare hour.

Anything needing a spec, a design decision, or more than about a day lives in
[TICKETS.md](TICKETS.md) instead.

---

## How to read an entry

Every entry has the same parts, because a person and a coding agent need
different things:

| Part             | Who it's for | What it gives you                                         |
| ---------------- | ------------ | --------------------------------------------------------- |
| **What & why**   | human        | What breaks, and why it matters in a room of 30 students  |
| **Evidence**     | both         | The exact file, line, and the command that proves it      |
| **For an agent** | LLM          | Files it may touch, traps in this codebase, how to verify |
| **Done when**    | both         | The checks that close it                                  |

If you hand one of these to Claude or Cursor, paste the whole entry. The
**For an agent** block is there because these bugs have all been "fixed" before
by someone who changed the obvious line and broke something else.

**Before any of them:** read [AGENTS.md](AGENTS.md). The rules exist because the
obvious approach is wrong here more often than not. Tidying aims at
[How code should look here](AGENTS.md#how-code-should-look-here).

**Check for a collision first.** Pair tickets are open on these files, so
coordinate before you edit them:

| File or area                                                                     | Pair ticket                        |
| -------------------------------------------------------------------------------- | ---------------------------------- |
| student pages (`jobdes`, `res-review*`, `interview-stage`, `makeOffer`, landing) | Figma redesign of the student flow |
| `api/src/config/socket.ts`                                                       | socket lockdown                    |
| `components/ManageGroupsTab.tsx`                                                 | splitting ManageGroupsTab          |
| `api/src/controller/job.controller.ts`                                           | making "Assign Job" safe           |
| `api/src/controller/group.controller.ts`                                         | live class dashboard               |
| `api/src/controller/progress.controller.ts`                                      | server-side step enforcement       |
| `api/src/routes/candidate.routes.ts`                                             | teacher candidate-inspect endpoint |

Logic-only changes to those files are fine once you have told the pair. Line
numbers below were checked against `main` when this file was written; trust the
symbol names over the numbers.

---

## Index

**Bugs.** Real defects, each verified against the current tree.

| ID      | What                                                         | Level | Est |
| ------- | ------------------------------------------------------------ | ----- | --- |
| `CU-1`  | Dead endpoints let any student read or wipe classmates' data | GFI   | 1h  |
| `CU-2`  | A Keycloak account with no name crashes login                | GFI   | 2h  |
| `CU-3`  | Shortlist drift comes back after the next vote               | MED   | 4h  |
| `CU-4`  | CSV import picks the wrong email column                      | GFI   | 2h  |
| `CU-5`  | Moving or deleting a student leaves their old group waiting  | MED   | 3h  |
| `CU-6`  | Adding a student already in the class silently moves them    | GFI   | 1h  |
| `CU-7`  | The shortlist checkbox is typed boolean but carries 0 or 1   | GFI   | 2h  |
| `CU-8`  | A student who misses the release event stays stuck           | MED   | 4h  |
| `CU-9`  | 33 error paths still send raw MySQL text to the browser      | GFI   | 3h  |
| `CU-10` | The next student on a lab machine inherits Make Offer state  | MED   | 2h  |
| `CU-11` | Login failures show nothing                                  | GFI   | 2h  |
| `CU-12` | A duplicate job title says "uploaded successfully"           | GFI   | 1h  |

**Tidying.** No behaviour change.

| ID      | What                                              | Level | Est |
| ------- | ------------------------------------------------- | ----- | --- |
| `CU-13` | Remove the last `console.log` calls and log emoji | GFI   | 1h  |
| `CU-14` | Finish the shared types migration                 | GFI   | 3h  |
| `CU-15` | Remove 14 endpoints nothing calls                 | GFI   | 3h  |
| `CU-16` | Drop five tables nothing reads                    | MED   | 3h  |
| `CU-17` | Pull one copy-pasted block out of a student page  | MED   | 4h  |
| `CU-18` | Move `group.controller.ts` off nested callbacks   | MED   | 6h  |
| `CU-19` | Move one more controller off callbacks            | MED   | 4h  |
| `CU-20` | Merge the two identical "group started" endpoints | GFI   | 1h  |
| `CU-21` | Decide the post-login page in one place           | MED   | 4h  |
| `CU-22` | One key for error messages                        | GFI   | 1h  |
| `CU-23` | Delete dead API code                              | GFI   | 2h  |
| `CU-24` | Delete dead frontend files                        | GFI   | 1h  |
| `CU-25` | Stop emitting socket events nothing handles       | GFI   | 1h  |
| `CU-26` | Read the API URL in one place                     | GFI   | 2h  |
| `CU-27` | Drop axios                                        | GFI   | 2h  |
| `CU-28` | One hook for student page tracking                | MED   | 5h  |
| `CU-29` | One hook for the job description fetch            | MED   | 3h  |
| `CU-30` | Fix comments that are wrong                       | GFI   | 1h  |
| `CU-31` | Cut history and restating comments                | GFI   | 3h  |
| `CU-32` | Replace the easy `any`s                           | GFI   | 2h  |

---

# Bugs

## CU-1 — Dead endpoints let any student read or wipe classmates' data

**GFI · 1h · `api/src/routes/{resume,interview,user}.routes.ts` and their controllers**

### What & why

Five mounted endpoints have no caller in either package, need nothing more than
a login, and never check whose data is being asked for. Any student with
devtools open can call them during class:

- `DELETE /resume/:student_id` deletes every resume vote for any student id.
  A classmate's ten decisions vanish from their group's vote counts.
- `GET /resume` returns every vote row, in every class.
- `GET /interview` returns every interview rating, in every class.
- `GET /users/:id` returns any user's row: name, email, group, class.
- `GET /resume/checked/:group_id` filters on `group_id` alone, so it mixes
  course sections. The interview stage builds its shortlist from
  `GET /resume/group/:group_id?class=` instead, so nothing reads this one.

Deleting them is the whole fix. Nobody loses a feature.

### Evidence

```
api/src/routes/resume.routes.ts:12     router.get('/', requireAuth, resumeController.getAllResumes);
api/src/routes/resume.routes.ts:15     router.delete('/:student_id', requireAuth, resumeController.deleteResumeByStudent);
api/src/routes/resume.routes.ts:17     router.get('/checked/:group_id', requireAuth, resumeController.getCheckedResumes);
api/src/routes/interview.routes.ts:13  router.get('/', requireAuth, interviewController.getAllInterviews);
api/src/routes/user.routes.ts:17       router.get('/:id', requireAuth, userController.getUserById);
```

Every resume, interview and users path the frontend calls; none of the five is
in the list (`/users` is the signup form's POST):

```bash
grep -rhoE 'API_BASE_URL\}/(resume|interview|users)[^`?]*' frontend/src | sort -u
```

### For an agent

- Remove the route line, then the controller method. Handlers:
  `resume.controller.ts` `getAllResumes` (:17), `deleteResumeByStudent` (:124),
  `getCheckedResumes` (:166); `interview.controller.ts` `getAllInterviews`
  (:76); `user.controller.ts` `getUserById` (:28).
- `GET /resume/student/:student_id` and `GET /resume/group/:group_id` look
  similar and **are** called. Leave them.
- Grep `api/src` too, not just the frontend (`AGENTS.md` rule 9).
- Do `CU-15` next; it is the same job for the rest of the dead endpoints.

### Done when

- [ ] The five routes and their handlers are gone
- [ ] The PR description has the grep above showing no caller
- [ ] API typechecks and boots; a student session still reaches the interview stage

---

## CU-2 — A Keycloak account with no name crashes login

**GFI · 2h · `api/src/config/passport.ts`, `api/src/controller/auth.controller.ts`**

### What & why

Both files do `profile.name.split(' ')` on the Keycloak profile. `name` is not a
guaranteed OIDC claim. If Khoury IT's SSO returns a profile without it, or a
student's account has no display name set, this throws inside the auth callback
and the student sees a generic login failure with nothing in the UI explaining
it. You will be debugging this at the podium.

It also assumes exactly two words. "Maria del Carmen Rodriguez" loses two of
them; a single-word name makes `lastName` undefined, which then writes `NULL`
into `Users.l_name`.

### Evidence

```
api/src/config/passport.ts:56               const parts = profile.name.split(' ');
api/src/controller/auth.controller.ts:109   const parts = prof.name.split(' ');
```

`KeycloakProfile` in `passport.ts:7` has an `[key: string]: any` index
signature, which is why `profile.name` compiles at all. The redirect at
`auth.controller.ts:133` and `:164` also puts `firstName` and `lastName` into
the URL without `encodeURIComponent`.

### For an agent

- Two call sites, same bug, fix both in one PR with one shared helper.
- Prefer the `given_name` / `family_name` claims when present; they exist for
  exactly this reason. Fall back to splitting `name`, fall back to the email
  local part, and never throw.
- Add `name?: string` to `KeycloakProfile` so the compiler sees the field. Do
  not add `any` to get around the null check.
- This is the login path. It cannot be tested from a curl; use the local stack
  and sign in as `student1@northeastern.edu` (password `nuhire`). Tag Aarav on
  the PR.

### Done when

- [ ] A profile with no `name` logs in successfully
- [ ] A one-word name does not write `NULL` to `l_name`
- [ ] A three-word name keeps everything after the first word as the surname
- [ ] Both call sites share one helper, and the signupform redirect encodes the names

---

## CU-3 — Shortlist drift comes back after the next vote

**MED · 4h · `api/src/controller/resume.controller.ts`, `frontend/src/app/res-review-group/page.tsx`**

### What & why

Migration `003` realigned `Resume.checked` rows that had drifted, but only once.
The mechanism that caused the drift is untouched, so it starts again immediately.

What happens: a group shortlists resume 3, which sets `checked = 1` on the rows
that exist right then. A teammate who votes on resume 3 _after_ that gets a new
row at the column default of `0`. The group page then builds its checkbox map
with last-row-wins, so that late voter silently un-ticks a resume for the whole
team, mid-activity, with no visible cause.

### Evidence

The `check` handler in `api/src/config/socket.ts:339` writes `checked` for the
whole group. The vote INSERT at `resume.controller.ts:83` (`submitVote`) never
carries it forward. The reader overwrites per row:

```
frontend/src/app/res-review-group/page.tsx:200   checkboxData[resume_number] = checked;
```

### For an agent

- Two halves, and you need both or it recurs: the **writer** must carry the
  group's current `checked` forward on insert, and the **reader** must use
  `MAX(checked)` per `resume_number` rather than whichever row came last.
- `checked` is group-level. This is settled, documented at the column in
  `database-files/Pandployer.sql`. Do not re-litigate it into a per-student flag.
- Do not write a migration. `003` already fixed the existing rows; this is about
  stopping new drift.
- `interview-stage/page.tsx:286` already treats any row with `checked === 1`
  as shortlisted, so it is safe as it is.

### Done when

- [ ] A vote cast after a shortlist does not clear the tick
- [ ] The reader uses the max per resume, not last-row-wins
- [ ] Two browsers in one group: shortlist a resume, have the second student
      vote on it, confirm the tick survives for both

---

## CU-4 — CSV import picks the wrong email column

**GFI · 2h · `frontend/src/app/components/StudentCSVTab.tsx`**

### What & why

The importer takes the first header _containing_ the word "email". A real Canvas
export has a `Secondary Email` column, and depending on column order it can win.
Every student then gets imported under a personal address that will never match
the one Keycloak authenticates them with, so the whole class lands on the signup
form and nobody can start.

The professor does this once per term under time pressure and gets no warning
that anything went wrong. This is also `TCH-7` in `TICKETS.md`; close both.

### Evidence

```
frontend/src/app/components/StudentCSVTab.tsx:184
  const emailIndex = headers.findIndex((h) => h.includes('email'));
```

### For an agent

- Prefer an exact match on `email` (case-insensitive, trimmed) before falling
  back to a substring match.
- If more than one column could match, do not guess. Show the professor which
  columns were found and make them pick. A wrong silent guess is the bug.
- The parser above this line is a correct RFC-4180 implementation. Do not
  replace it, and do not add a CSV dependency.
- A file with no email column already gets a clear error at `:186`. Keep it.
- Test against a real Canvas gradebook export if anyone on the team has one.

### Done when

- [ ] An exact `Email` header wins over `Secondary Email`
- [ ] Ambiguous headers prompt instead of guessing

---

## CU-5 — Moving or deleting a student leaves their old group waiting

**MED · 3h · `api/src/controller/group.controller.ts`**

### What & why

The group barrier counts how many current members have finished a step.
Removing a student from a group now recounts that group. Two other roster
changes still do not:

- `reassignStudent` recounts only the **new** group. The old group is still
  waiting on somebody who has left, and nothing will recount it. They sit at
  "waiting for your team" until the professor notices.
- `deleteStudent` never recounts. The `ON DELETE CASCADE` removes the student's
  rows, but the remaining members are never told the count changed.

### Evidence

```
api/src/controller/group.controller.ts:231   this.recountBarrier(class_id, new_group_id);
```

The comment just above it (`:226`) says the old group is not recounted because
the handler never learns which group the student came from. `deleteStudent`
(`:593`) has no `recountBarrier` call. Compare `removeFromGroup` (`:243`), which
reads the group first and recounts it at `:307`.

### For an agent

- **Read the student's current `group_id` before the UPDATE or DELETE.** That
  is the whole fix; `removeFromGroup` already shows the shape.
- `recountBarrier` is fire-and-forget by design. A failed recount must not turn
  a successful move into a 500. Keep that.
- Scope every query by `group_id` **and** `class`.
- This is the remaining half of `TCH-16`. The other half (only counting
  students who have signed in) is done: `presentMembers` in `socket.ts`. A
  recount here goes through it like every other gate.
- Do this before `CU-18`, which restructures the same handlers. Behaviour change
  and refactor go in separate PRs.

### Done when

- [ ] `reassignStudent` recounts both the old and the new group
- [ ] `deleteStudent` recounts the group the student was in
- [ ] Four-person group, three finished, move the fourth out: the group releases

---

## CU-6 — Adding a student already in the class silently moves them

**GFI · 1h · `api/src/controller/group.controller.ts`**

### What & why

"Add student" is meant to refuse an email that is already in the class. The
check compares the database's number to the request's string, so it is never
true. Instead the handler falls through to the "student from another class"
branch and moves them into the new group. The professor sees "Student added
successfully", the student vanishes from their old group, their old group is not
recounted, and nobody is told.

### Evidence

```
api/src/controller/group.controller.ts:553   if (existingStudent.class === class_id) {
api/src/controller/group.controller.ts:559   const updateQuery = 'UPDATE Users SET class = ?, group_id = ? WHERE email = ?';
```

`Users.class` is `int`. The caller sends `class_id: selectedClass`, and
`selectedClass` is `useState<string>` (`ManageGroupsTab.tsx:13`), so the body
carries a string.

### For an agent

- Compare as numbers: `Number(existingStudent.class) === Number(class_id)`.
  Fix it on the server. Do not edit `ManageGroupsTab.tsx`; it is being split.
- The intended answer is the 409 that is already written. Moving a student is
  what `PATCH /groups/reassign-student` is for.

### Done when

- [ ] Adding an email already in the class returns 409 and moves nobody
- [ ] Adding an email from another class still works

---

## CU-7 — The shortlist checkbox is typed boolean but carries 0 or 1

**GFI · 2h · `api/src/models/SocketEvents.ts`, `frontend/src/app/res-review-group/page.tsx`**

### What & why

The frontend's shared `Resume.checked` is now `DbBool` (`0 | 1`). Two places
still say `boolean`: the server's type for the `check` socket payload, and the
local types inside `res-review-group`. `mysql2` returns `tinyint(1)` as a
number, and `res-review-group` emits `1` / `0`. Nothing breaks today only
because every read uses truthiness. The first `checked === true` someone writes
is dead code and the shortlist stops working.

### Evidence

```
api/src/models/SocketEvents.ts:14             checked: boolean;   // SocketEvents['check']
frontend/src/app/res-review-group/page.tsx:36  checked: boolean;   // ResumeData
frontend/src/app/res-review-group/page.tsx:42  checked: boolean;   // Resume
frontend/src/app/res-review-group/page.tsx:455 checked: newChecked ? 1 : 0,
```

`SocketEvents['checkint'].checked` (`SocketEvents.ts:19`) really is a boolean;
`makeOffer` sends one. Leave it.

### For an agent

- Add `DbBool` to `api/src/models/` and use it for `check.checked`.
- In `res-review-group`, the interfaces are declared inside the component body.
  Move them to module level, use `DbBool`, and import `Resume` from
  `frontend/src/types` where the shape matches.
- Fix the type, then follow the compiler. Anywhere it now errors is a place the
  old type was lying. No `as` casts to make it compile.

### Done when

- [ ] `checked` is typed as what the database and socket actually send
- [ ] Both packages typecheck with no new `any` or `as`

---

## CU-8 — A student who misses the release event stays stuck

**MED · 4h · `frontend/src/app/res-review/page.tsx`**

### What & why

After their tenth resume, a student waits on `res-review` until the whole group
finishes. The only thing that releases them is the `groupCompletedResReview`
socket event. `res-review` re-joins its room on `connect`, and the server
re-sends the barrier on every join, which covers a dropped socket. It does not
cover a socket that stayed up and missed the one event. That student needs to
refresh and hope.

`GET /groups/barrier-status/:classId/:groupId` answers the same question over
HTTP and nothing calls it.

### Evidence

```bash
grep -rn "barrier-status" frontend/src   # empty
```

```
frontend/src/app/res-review/page.tsx:463   const handleGroupCompletedResReview = () => { setDisabled(false); };
api/src/routes/group.routes.ts:39          router.get('/barrier-status/:classId/:groupId', requireAuth, ...);
```

The response is `{ step, completedCount, totalCount, released }`
(`BarrierStatus` in `models/Barrier.ts`).

### For an agent

- Poll only while the student has finished and is still disabled. Stop on
  `released: true` or on unmount. 30 students polling every second on every
  page is 1,800 requests a minute.
- Every 5 seconds is plenty. Treat `released` exactly like the socket event.
- The professor's unstick button is the live class dashboard pair ticket. Do
  not add one here, and do not change the endpoint.

### Done when

- [ ] A student who misses the release event is released within one poll
- [ ] Polling starts only while waiting and stops once released
- [ ] Two browsers in one group, with the `groupCompletedResReview` listener
      commented out locally: both finish, and both are released by the poll

---

## CU-9 — 33 error paths still send raw MySQL text to the browser

**GFI · 3h · `api/src/controller/`**

### What & why

`API-15` fixed sixteen handlers that returned MySQL's own error text. 33 error
paths still do `res.status(500).json({ error: err.message })`. That text names tables
and columns, and on a bad day it is the first thing a curious student sees in
the network tab. It is also useless to the professor, who gets a SQL error
in a popup.

### Evidence

```bash
grep -rnE "json\(\{ ?error: \(?(err|error)( as any)?\)?\.message" api/src/controller | cut -d: -f1 | sort | uniq -c
```

moderator 8, progress 7, resume 7, offer 4, job 3, user 3, group 1.
`job.controller.ts:290` and `:413` also send `details: error.message`.

### For an agent

- Replace each with a fixed message (`'Failed to load offers'`) and keep the
  `console.error` with the real error. Where the failure can be a busy pool,
  use `dbErrorStatus` from `config/database.ts` for the status code, as
  `candidate.controller.ts` does.
- Do `CU-1` and `CU-15` first. They delete about a dozen of these.
- Skip `job.controller.ts:290` and `:413`; they sit inside the Assign Job
  handlers that a pair is reworking. Skip `progress.controller.ts` until the
  step-enforcement work merges.
- `upload.routes.ts:15` and `:27` pass multer's message through on purpose. Leave them.
- One controller per commit.

### Done when

- [ ] The grep above returns only the files you were told to skip
- [ ] API typechecks; one forced DB error (stop MySQL) shows a fixed message

---

## CU-10 — The next student on a lab machine inherits Make Offer state

**MED · 2h · `frontend/src/app/makeOffer/page.tsx`**

### What & why

`res-review` and the interview stage scope every `localStorage` key by user id,
because a second student on the same lab machine used to inherit the first
one's progress. Make Offer still uses shared keys, so on a shared machine the
next student opens it with the previous student's selections and offer state.

### Evidence

```
frontend/src/app/makeOffer/page.tsx:183-192                 localStorage.getItem('makeOffer_existingOffer') ...
frontend/src/app/components/useInterviewProgress.tsx:8-21   the per-user version
frontend/src/lib/userStorage.ts                             the shared helpers, with the reason
```

```bash
grep -rn "localStorage.getItem('makeOffer_" frontend/src
```

### For an agent

- Build the keys with `userScope` from `lib/userStorage.ts`, as
  `useInterviewProgress` does. Read nothing until `user` has loaded.
- Call `dropOtherUsersKeys` on load so keys left by another user are removed.
- `localStorage.setItem('progress', ...)` is a different problem (`STU-16`).
  Leave it.

### Done when

- [x] Every `interviewStage_*` key includes the user id
- [ ] Every `makeOffer_*` key includes the user id
- [ ] Log in as student A, select a candidate in Make Offer, log out, log in as
      B on the same browser: B sees no selection

---

## CU-11 — Login failures show nothing

**GFI · 2h · `frontend/src/app/page.tsx`**

### What & why

When login fails the API redirects to `/?error=<code>`. The landing page never
reads the query string, so the student lands back on the start screen with no
message and clicks "Login" again. With 30 students that is 30 hands up and no
clue for the professor.

### Evidence

```bash
grep -rn "?error=" api/src/controller/auth.controller.ts
grep -rn "useSearchParams\|URLSearchParams" frontend/src/app   # only signupform
```

Codes sent: `invalid_callback`, `auth_failed`, `no_user`, `session_error`,
`login_error`, `db_error`, `not_authenticated`, `user_not_found`.

### For an agent

- Read `error` on the landing page and show a short message through the
  existing `components/popup.tsx`. One line per code, plain words ("Login
  failed. Try again, and tell your professor if it keeps happening.").
- `useSearchParams` needs a `<Suspense>` boundary in the App Router or the build
  fails. Reading `window.location.search` in an effect avoids that.
- Do not touch the API side.

### Done when

- [ ] `/?error=auth_failed` shows a message; `/` shows none
- [ ] `npm run build` passes

---

## CU-12 — A duplicate job title says "uploaded successfully"

**GFI · 1h · `frontend/src/app/new-pdf/page.tsx`, `api/src/controller/job.controller.ts`**

### What & why

`job_descriptions` has `UNIQUE (title, class_id)`. Upload a second job with a
title already used in that class and the insert fails, the API answers 500, and
the page ignores the response and says "Job description uploaded successfully!"
The PDF is now on disk with no row pointing at it, and the professor has no idea
why the job is missing from the assign dropdown.

### Evidence

```
frontend/src/app/new-pdf/page.tsx:272   await fetch(`${API_BASE_URL}/jobs`, { ... });   // response never read
database-files/Pandployer.sql:216       UNIQUE KEY `title_class_unique` (`title`,`class_id`),
```

The resume path a few lines down (`:343-359`) does check `dbResponse.ok`.

### For an agent

- Check the response like the resume path does and show the server's `error`.
- In `createJob`, answer 409 with a clear message on `ER_DUP_ENTRY`, the way
  `createResumePdf` already does in `resume.controller.ts`.
- `createJob` is not part of Assign Job; editing it does not collide with that
  pair.

### Done when

- [ ] Uploading a duplicate title shows an error naming the title
- [ ] A normal upload still shows success

---

# Tidying

No behaviour change in this section. If a change here alters what the app does,
it is a bug fix: stop and open an issue instead.

## CU-13 — Remove the last `console.log` calls and log emoji

**GFI · 1h · `api/src/app.ts`, `api/src/config/database.ts`, `api/src/config/socket.ts`**

### What & why

The tracing cleanup is done: the frontend has zero `console.log` and the API has
seven. What is left is noise inside real messages: 42 log lines start with an
emoji, and several with a tag like `[BACKEND-GET-VOTES]`, which makes grepping
a class's logs harder.

### Evidence

```bash
grep -rn "console\.log" api/src frontend/src
grep -rnE "console\.[a-z]+\(\s*[\`'\"](❌|✅|🔄|🚀|🔥|⚠️|📊|🎉)" api/src frontend/src | wc -l
```

### For an agent

- The seven `console.log` calls are boot and pool messages. Make them
  `console.info` (or `console.warn` for the retry and reconnect lines). Do not
  delete them; they are how you know the API came up.
- Strip the emoji and bracket tags; keep the words.
- Do **not** add a logger. Adopting pino is `INFRA-12` and a separate decision.
- `socket.ts:399` and `:464` are in the socket lockdown pair's file. Tell them,
  or leave those two.

### Done when

- [x] `grep -rn "console\.log" api/src frontend/src` returns only the example
      command in `server.ts:27` and the comment in `config/logger.ts`
- [x] The emoji grep returns 0
- [x] No message text changed beyond the prefix

---

## CU-14 — Finish the shared types migration

**GFI · 3h · `frontend/src/types/index.ts` and callers**

### What & why

`frontend/src/types/index.ts` is the canonical module, and the `User.id` string
versus number split is fixed. A handful of files still declare their own copy of
a shared shape, and two declare interfaces inside the component body. The
canonical `Resume` and `Candidate` are exported and imported nowhere.

### Evidence

```bash
grep -rnE "^\s*(export )?(interface|type) [A-Z]" frontend/src/app
```

### For an agent

Safe swaps, mechanical:

- `components/progress.tsx:5` `User` becomes `Pick<User, 'email' | 'class' | 'group_id'>`
- `notes/page.tsx:12` `Note` (inside the component) becomes the canonical `Note`
- `adminFacts/page.tsx:7` `ModeratorClass` is field-for-field `ClassInfo`
- `interview-stage/page.tsx:38` `Resume` becomes `Pick<Resume, 'resume_number' | 'checked'>`

These need a one-line decision in the PR:

- `new-pdf/page.tsx:16` `Resume` is really a `Resume_pdfs` row. Add it to the
  canonical module as `ResumePdf`. Do not merge it with `Resume`.
- `new-pdf/page.tsx:26` `ClassInfo` adds `admin_email`. Extend the canonical
  type or name the variant.
- `makeOffer/page.tsx:31` `Offer` has no canonical version. Move it there.
- `makeOffer/page.tsx:17` and `res-review-group/page.tsx:27` both declare
  `VoteData` with different shapes. Rename one.
- `mod-dashboard/page.tsx:17` `User` only backs a fake
  `setUser({ email: 'moderator', ... })` used as a "verified" flag. Make it a
  boolean.

`res-review-group`'s `ResumeData` and `Resume` belong to `CU-7`.

### Done when

- [ ] No `interface` inside a component body
- [ ] The swaps above are done; canonical module unchanged or additive
- [ ] Frontend typechecks

---

## CU-15 — Remove 14 endpoints nothing calls

**GFI · 3h · `api/src/routes/`, `api/src/controller/`**

### What & why

Fourteen mounted endpoints have no caller in either package. They are surface
area a reader has to understand and a reviewer has to check, and several take
identity from the URL in ways `AGENTS.md` rule 1 forbids.

### Evidence

| Endpoint                             | Route file:line          | Note                                          |
| ------------------------------------ | ------------------------ | --------------------------------------------- |
| `POST /interview/vote`               | `interview.routes.ts:12` |                                               |
| `GET /interview/vids`                | `interview.routes.ts:18` |                                               |
| `GET /users`                         | `user.routes.ts:15`      | signup POSTs to `/users`; nothing GETs it     |
| `GET /users/students`                | `user.routes.ts:16`      |                                               |
| `POST /users/update-user-class`      | `user.routes.ts:19`      |                                               |
| `GET /offers/class/:class_id`        | `offer.routes.ts:16`     |                                               |
| `GET /progress/group/:crn/:group_id` | `progress.routes.ts:12`  | do last; that file is in flight               |
| `POST /groups/update-group`          | `group.routes.ts:15`     | its UPDATE has no `class` either              |
| `GET /moderator/crns/:crn`           | `moderator.routes.ts:16` | only `DELETE` on that path is called          |
| `POST /moderator/add-student`        | `moderator.routes.ts:19` | duplicate of `/groups/add-student`            |
| `DELETE /moderator/del-student`      | `moderator.routes.ts:20` | duplicate of `/groups/delete-student`         |
| `GET /candidates`                    | `candidate.routes.ts:17` |                                               |
| `GET /candidates/:id`                | `candidate.routes.ts:18` |                                               |
| `POST /upload`                       | `upload.routes.ts:40`    | `/upload/resume` and `/upload/job` are called |

Every API path the frontend calls:

```bash
grep -rhoE 'API_BASE_URL\}/[a-z_]+(/[A-Za-z_-]+)?' frontend/src | sort -u
```

### For an agent

- **Do NOT remove** `GET /auth/keycloak/callback` (Keycloak redirects to it, so
  it has no in-repo caller by design), `GET /groups/barrier-status` (`CU-8`
  will call it), `POST /groups/force-advance` (the live class dashboard pair
  will call it), `GET /health`, `GET /health/db` (compose healthcheck) or
  `GET /stats` (ops).
- **Re-verify before deleting.** The tree moves. Check the method too: a path
  can be called with one verb and dead with another. `AGENTS.md` rule 9: check
  both sides.
- Remove the route, then the controller method, then any type only it used.
- `SEC-18` cites `updateUserClass` as an example of an ownership check;
  `updateUserSeen` has the same check and stays.
- `candidate.routes.ts` is getting a new route from the candidate-inspect pair.
  Coordinate.
- One route file per PR.

### Done when

- [ ] Each deletion has a grep in the PR description proving no caller
- [ ] API typechecks and boots
- [ ] The protected endpoints above are untouched

---

## CU-16 — Drop five tables nothing reads

**MED · 3h · `database-files/`**

### What & why

Five tables in the schema have no reference anywhere in `api/src`.
`Res2_Status` is an older per-student completion flag that overlaps
`Step_Completion`, which is now the real completion record. The other four are
leftovers from an earlier version of the app. Two tables for one concept is how the next
person records completion in the wrong one.

### Evidence

```bash
for t in MakeOfferPage Offer_Status Res2_Status Resumepage Resumepage2; do
  printf "%-14s " $t; grep -rnw "$t" api/src | wc -l
done   # all 0
```

`Interview_Status` looks like a sibling and **is** in use
(`interview.controller.ts`, `job.controller.ts`). Do not touch it.

### For an agent

- Schema change: a numbered migration in `database-files/migrations/` **and**
  removing the tables from `Pandployer.sql`. Read that directory's README first.
  `AGENTS.md` rule 12.
- Dropping is irreversible. Say so in the migration header, use
  `DROP TABLE IF EXISTS` so a second run is a no-op, and count rows on the live
  database before assuming they are empty.
- `MakeOfferPage` and `Resumepage` have foreign keys to `Candidates` and
  `Users`. Dropping the child table is fine; check nothing points **at** them.
- In the same PR, drop `Offer_Status` and `Res2_Status` from `API-3` in
  `TICKETS.md`, and update the table count in `AGENTS.md` and
  `docs/ARCHITECTURE.md`.
- If the migration runner pair has landed, follow its format.
- Schema touches need Aarav's review.

### Done when

- [ ] Migration drops all five, guarded so a second run is a no-op
- [ ] `Pandployer.sql` no longer defines them
- [ ] Row counts from the live database are recorded in the PR

---

## CU-17 — Pull one copy-pasted block out of a student page

**MED · 4h · one of the student pages**

### What & why

The student pages are the biggest files outside `ManageGroupsTab`:
`res-review` 1,169 lines, `makeOffer` 1,148, `interview-stage` 1,115,
`res-review-group` 807. Much of that is the same block pasted into each page.
Taking one block out at a time is how they shrink without a freeze.

### Evidence

| Block                                                      | Copies                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| fetch `/interview/group-size/...`                          | `grep -rn "group-size" frontend/src` (6 call sites, 4 files)                         |
| `showInstructions` window-event listener                   | `grep -rn "'showInstructions'" frontend/src` (5 pages)                               |
| `studentAddedToGroup` / `studentRemovedFromGroup` handlers | `res-review:431`, `interview-stage:464`, `makeOffer:637`, `res-review-group:236,345` |

Page tracking and the job description fetch have their own entries (`CU-28`,
`CU-29`).

### For an agent

- Extract **one** block into a hook in `frontend/src/app/components/`, used by
  every page that had a copy.
- **Pure motion.** No behaviour change, no net line change beyond imports.
  Moving code and changing behaviour in one commit makes review impossible.
- Leave the "Waiting for Teammates" overlay and the team-confirmation bar. They
  are UI, and belong to the shared UI components pair.
- Do not extract from `ManageGroupsTab.tsx`; its split is a pair ticket.
- The full decomposition is `UI-28`. Do not attempt it here.

### Done when

- [ ] One hook extracted and used at every former copy
- [ ] Typecheck clean and every affected page behaves identically

---

## CU-18 — Move `group.controller.ts` off nested callbacks

**MED · 6h · `api/src/controller/group.controller.ts`**

### What & why

The file mixes three styles: `async`/`await` (`getGroups`, `forceAdvance`),
callback `db.query` nested up to four deep (`removeFromGroup`), and promises
built by hand around callbacks (`updateGroup`, `createGroups`). Every roster
handler has its own error path, and the same clean-up runs twice as copy-paste.
It is also where the next roster bug will be fixed, so it should be readable.

### Evidence

```bash
grep -nE "(this\.)?db\.query\(" api/src/controller/group.controller.ts | wc -l   # 22 callback queries
grep -n "DELETE gc FROM\|DELETE sc FROM" api/src/controller/group.controller.ts  # pair at :209 and :293
grep -n "emit('studentAddedToGroup'" api/src/controller/group.controller.ts      # :197, :528, :575
```

`removeFromGroup` nests at `:299`, `:310`, `:335`, `:340`.

### For an agent

- Use `this.db.promise().query<RowDataPacket[]>(...)` with `try`/`catch`, the
  way `forceAdvance` does. Typed rows replace the `results: any[]` callbacks.
- Pull the stale-row clean-up into one private method
  (`clearStaleMemberRows(email, classId)`), and the `studentAddedToGroup` emit
  into another.
- **Pure refactor.** Every response body, status code and emit stays the same.
  Do `CU-5` first, in its own PR.
- Keep `recountBarrier` fire-and-forget.
- Do `CU-15` first; it deletes `updateGroup`, one of the hand-built promises.
- This is not `API-20` (splitting the file). Do not split it.
- The live class dashboard pair is adding a handler to this file. Tell them
  before you start.

### Done when

- [ ] No callback-style `db.query` left in the file
- [ ] The stale-row DELETE pair exists once
- [ ] API typechecks; add, move, remove and delete a student against the local stack and see the same responses as before

---

## CU-19 — Move one more controller off callbacks

**MED · 4h · one file in `api/src/controller/`**

### What & why

103 `db.query` calls in the API still use callbacks. Several handlers are
declared `async`, wrap a callback in `try`/`catch`, and never `await`, so the
catch can never fire. `user.controller.ts` has eight of those.

### Evidence

```bash
grep -rnE '(this\.)?db\.query\(' api/src | grep -v 'promise()' | cut -d: -f1 | sort | uniq -c | sort -rn
grep -c "await" api/src/controller/user.controller.ts   # 0, across 8 async handlers
```

Pick one: `resume` (17), `interview` (11), `user` (9), `moderator` (7),
`candidate` (6), `auth` (5), `offer` (4), `note` (2). `group` is `CU-18`.
Skip `job` and `progress` until their pair tickets merge.

### For an agent

- Same pattern as `CU-18`: `promise().query<RowDataPacket[]>`, one `try`/`catch`
  per handler. Keep every response as it is; replacing raw error text is
  `CU-9`, in its own commit.
- `resume.controller.ts:80` reads `results` without checking `err`. Keep the
  behaviour (fall back to `'unanswered'`) but make it explicit.
- `auth.controller.ts` is the login path. If you pick it, tag Aarav.
- Do the dead-endpoint deletions (`CU-1`, `CU-15`) first so you do not convert
  code that is about to go.
- One controller per PR. Pure refactor.

### Done when

- [ ] The chosen file has no callback-style `db.query`
- [ ] No `async` handler without an `await`
- [ ] API typechecks and every route in that file answers as before

---

## CU-20 — Merge the two identical "group started" endpoints

**GFI · 1h · `api/src/controller/group.controller.ts`, `api/src/routes/group.routes.ts`, `frontend/src/app/waitingGroup/page.tsx`**

### What & why

`getGroupStarted` and `getGroupStatus` run the same query and return the same
body. One is called by the advisor page, the other by the waiting page. Two
names for one fact is how they drift.

### Evidence

```
api/src/controller/group.controller.ts:395   getGroupStarted
api/src/controller/group.controller.ts:416   getGroupStatus      // same SQL, same response
frontend/src/app/components/ManageGroupsTab.tsx:159   /groups/started/...
frontend/src/app/waitingGroup/page.tsx:23             /groups/status/...
```

### For an agent

- Point `waitingGroup` at `/groups/started/...`, then delete the `/status`
  route and `getGroupStatus`. Do not edit `ManageGroupsTab.tsx`.
- `waitingGroup` is reached by a server redirect after login (`AGENTS.md`
  rule 9). Test it by logging in as a student whose group has not started.

### Done when

- [ ] One endpoint, one handler
- [ ] A student whose group has not started still sees the waiting page, and moves on when it starts

---

## CU-21 — Decide the post-login page in one place

**MED · 4h · `api/src/controller/auth.controller.ts`**

### What & why

"Where does this user go after login" is written three times, and the copies
already disagree. The no-code callback path sends a student straight to the
dashboard without checking whether their group started. The post-signup path
never sends an incomplete profile to the signup form. A fix to one copy will
miss the others.

### Evidence

```
api/src/controller/auth.controller.ts:24-46    callback hit without ?code
api/src/controller/auth.controller.ts:112-168  the real callback
api/src/controller/auth.controller.ts:235-281  /auth/post-signup-redirect
```

```bash
grep -n "SELECT started FROM \`GroupsInfo\`" api/src/controller/auth.controller.ts   # twice
```

### For an agent

- Write one function that takes the `Users` row and returns a path. Make the
  real callback's logic the reference; it is the most complete.
- The other two paths will change behaviour slightly. List each difference in
  the PR so the reviewer can agree to it.
- Leave `setCookieAndRedirect` and the session regeneration alone.
- This is the login path. On the local stack, test a student, an admin, a new
  user, and a student whose group has not started. Tag Aarav.

### Done when

- [ ] One function decides the redirect; all three paths call it
- [ ] The four login cases above land on the right page

---

## CU-22 — One key for error messages

**GFI · 1h · `api/src/middleware/auth.middleware.ts`, `api/src/controller/user.controller.ts`, `frontend/src/app/signupform/page.tsx`**

### What & why

Around 160 error responses use `{ error: '...' }`. Twelve use
`{ message: '...' }`, so frontend code has to guess which key to read.
`user.controller.ts` uses both.

### Evidence

```bash
grep -rnE "status\([45][0-9]{2}\)\.json\(\{ ?message" api/src
```

Five in `auth.middleware.ts`, seven in `user.controller.ts`. The only frontend
reader is `signupform/page.tsx:162`, which reads `errorData.message`.

### For an agent

- Change the twelve to `error`, and `signupform` to read `errorData.error` in
  the same commit, or the instructor-email warning disappears.
- Success bodies with `message` are fine. This is error bodies only.

### Done when

- [ ] The grep above returns nothing
- [ ] Signing up as a student with an instructor email still shows the warning

---

## CU-23 — Delete dead API code

**GFI · 2h · `api/src/`**

### What & why

Code with no reader, left behind by earlier fixes. Each one makes a newcomer
wonder what depends on it.

### Evidence

| What                                   | Where                                  | Proof                                                                                                |
| -------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| types for `@exlinc/keycloak-passport`  | `api/src/types/keycloak-passport.d.ts` | package not installed; `grep -rn exlinc api/src api/package.json`                                    |
| `ResumeController.getResumeFile`       | `resume.controller.ts:369`             | no route; `/uploads` replaced it                                                                     |
| `JobController`'s `onlineStudents` arg | `job.controller.ts:15`                 | never read; plumbed through `job.routes.ts`, `delete.routes.ts`, `app.ts:41,204,218`, `server.ts:99` |
| `DatabaseService.getConnection()`      | `database.ts:394`                      | `grep -rn "databaseService\." api/src`                                                               |
| ejs view engine                        | `app.ts:108-110`                       | no ejs dependency, no views directory                                                                |
| `FRONT_URL` in `logout`                | `auth.controller.ts:183`               | declared, never used                                                                                 |

### For an agent

- `getResumeFile` is named in comments at `resume.controller.ts:262` and
  `upload.controller.ts:48`. Point them at `serveUploadedFile`.
- After removing `onlineStudents` from `App`, `server.ts:99` still needs to
  call `initializeSocketHandlers`; only the assignment goes.
- Drop `path` from `app.ts` imports only if nothing else uses it.
- Remove `exlinc` from `cspell.json` with the `.d.ts`.
- `job.controller.ts` is in the Assign Job pair's area; the change there is one
  constructor line. Tell them.

### Done when

- [ ] Everything in the table is gone
- [ ] API typechecks, builds and boots

---

## CU-24 — Delete dead frontend files

**GFI · 1h · `frontend/`**

### What & why

Files nothing imports, plus a Next config in a folder Next never reads it from.

### Evidence

| What                                                | Proof                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/components/adminReactionPopup.tsx`         | `grep -rn "adminReactionPopup'" frontend/src` (no importer)                                  |
| `src/app/components/tabsTitle.tsx`                  | `grep -rn "tabsTitle'" frontend/src` (no importer)                                           |
| `src/app/next.config.ts`                            | Next reads `next.config.*` from `frontend/` only; this one is an empty config                |
| `src/app/empty-modules.ts`                          | `export default {}`, referenced nowhere                                                      |
| `types/react-pdf-highlighter.d.ts`                  | package not installed or imported; the `"paths"` entry in `tsconfig.json` exists only for it |
| `refetchUser` in `components/AuthContext.tsx:11,45` | `grep -rn refetchUser frontend/src`                                                          |
| Geist fonts in `app/layout.tsx:2,7-15`              | `grep -rn "font-geist" frontend/src frontend/tailwind.config.js` finds only the definitions  |

### For an agent

- Delete `src/app/next.config.ts`. Do not move it to `frontend/`: that would
  start applying a config that is not applied today.
- Removing the `"paths"` entry from `tsconfig.json` is fine once the `.d.ts` is
  gone; run `npx tsc --noEmit` and `npm run build` to prove it.
- `lib/logger.ts` is also unimported. It belongs to `INFRA-12`. Leave it.

### Done when

- [ ] Everything in the table is gone
- [ ] Frontend typechecks and builds; the landing page renders the same

---

## CU-25 — Stop emitting socket events nothing handles

**GFI · 1h · student pages, `advisor-dashboard/page.tsx`, `api/src/models/SocketEvents.ts`**

### What & why

The server has no handler for `studentPageChanged`, `adminOffline` or
`interviewStageFinished`. The pages emit them anyway, and `interview-stage`
listens for its own `interviewStageFinished`, which the server never sends
back, so that handler never runs. `res-review` also announces itself twice on
mount.

### Evidence

```bash
grep -rn "studentPageChanged\|adminOffline\|interviewStageFinished" frontend/src api/src
grep -noE "on\('[a-zA-Z]+'|^ +'[a-zA-Z]+',$" api/src/config/socket.ts   # the events the server handles
```

`studentPageChanged` is emitted at `jobdes:109`, `interview-stage:395`,
`dashboard:174`, `res-review:354,395`, `res-review-group:409`, `makeOffer:258`.
`res-review/page.tsx:393-395` repeats the emits that `announce()` already makes
at `:351-357`.

### For an agent

- Delete the emits, the `interviewStageFinished` listener and its handler, and
  `SocketEvents.studentPageChanged` (`SocketEvents.ts:23`).
- In `res-review`, delete only the three emits at `:393-395`. `announce()` also
  runs on reconnect; the second copy does not.
- Do not add server handlers to make them "work". If someone wants page
  tracking over sockets, that is a ticket.

### Done when

- [ ] The grep above returns nothing
- [ ] Both packages typecheck; a student can still walk every step

---

## CU-26 — Read the API URL in one place

**GFI · 2h · `frontend/src/lib/`, every file that declares `API_BASE_URL`**

### What & why

23 files each declare `const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL`.
One reads it as `apiUrl`, one inside a component body, and two carry a comment
pointing at a dead API host. If the variable is unset, every page quietly
fetches `undefined/...`, which is the bug `AGENTS.md` rule 11 describes.

### Evidence

```bash
grep -rn "NEXT_PUBLIC_API_BASE_URL" frontend/src | wc -l   # 24
grep -rn "https://nuhire-api" frontend/src
```

### For an agent

- Add `frontend/src/lib/api.ts` exporting `API_BASE_URL`, and throw a clear
  error when it is missing. Import it everywhere else.
- Make sure `useProgress.test.ts` still passes; set the variable in the test
  config if the import now throws.
- Pure motion otherwise. Do not wrap `fetch` in the same PR.

### Done when

- [x] `grep -rn "process.env.NEXT_PUBLIC_API_BASE_URL" frontend/src` returns one line
- [x] Frontend typechecks, builds, and `npm test` passes

---

## CU-27 — Drop axios

**GFI · 2h · `frontend/src/app/interview-stage/page.tsx`, `frontend/src/app/makeOffer/page.tsx`, `frontend/package.json`**

### What & why

Two pages use axios for five calls; the other twenty files use `fetch`. Both
of those pages use `fetch` too. One HTTP client means one way to send
credentials and one way to read an error.

### Evidence

```bash
grep -rn "axios" frontend/src
```

`interview-stage:145, 226, 249, 355` and `makeOffer:271`. The call at `:249`
is split across two lines.

### For an agent

- `withCredentials: true` becomes `credentials: 'include'`. axios throws on a
  non-2xx and `fetch` does not, so add an `if (!res.ok)` everywhere the old code
  relied on the throw.
- axios `timeout: 8000` has no `fetch` equivalent; use
  `AbortSignal.timeout(8000)`.
- Remove `axios` from `frontend/package.json` and update the lockfile. Any open
  Dependabot axios PR can then be closed.

### Done when

- [ ] `grep -rln axios frontend/src` returns nothing
- [ ] Both pages load, and a stopped API shows the same error state as before

---

## CU-28 — One hook for student page tracking

**MED · 5h · `jobdes`, `dashboard`, `res-review`, `res-review-group`, `interview-stage`, `makeOffer`**

### What & why

Six pages paste the same effect: emit `studentOnline`, join the group room,
POST `/users/update-currentpage` once behind a `hasUpdatedPageRef`. `jobdes`
and `interview-stage` join once on mount and never again, so a wifi blip there
leaves the student out of the room for the rest of the class (`AGENTS.md`
rule 4).

### Evidence

```bash
grep -rn "update-currentpage" frontend/src   # 6 pages
grep -rn "socket.on('connect'" frontend/src  # re-join only in some
```

### For an agent

- Do `CU-25` first so the dead `studentPageChanged` emit is already gone.
- Write `useStudentPresence(page)` in `components/`. It joins on `connect` as
  well as on mount, like `res-review`'s `announce()`.
- Joining on reconnect is a behaviour change for `jobdes` and
  `interview-stage`. Put the pure extraction in one commit and the reconnect
  fix in a second, and say so.
- Keep the `page` values (`'resumepage'` and so on) exactly as they are; they
  are an ENUM column. Collapsing them is `STU-16`.
- These pages are in the Figma redesign. Tell that pair; the change is to
  effects, not markup.

### Done when

- [ ] One hook, used by all six pages
- [ ] Every page re-joins its room after a reconnect
- [ ] Kill a student's network for 10s on `jobdes`, then send a popup from the
      advisor dashboard: the student who reconnected receives it

---

## CU-29 — One hook for the job description fetch

**MED · 3h · `jobdes`, `dashboard`, `res-review`, `res-review-group`, `interview-stage`**

### What & why

Every student page fetches `/jobs/assignment/...` then `/jobs/title?...` to find
the job PDF. Four pages carry the full copy, and `dashboard` fetches the
assignment twice in one file.

### Evidence

```bash
grep -rn "jobs/assignment" frontend/src/app
```

`jobdes:155`, `interview-stage:120`, `res-review:201`, `res-review-group:112`,
`dashboard:83` and `:112`.

### For an agent

- Write `useJobDescription(user)` returning `{ job, loading, error }`, and
  refetch on the `jobUpdated` socket event where pages already do.
- Pure motion. If two copies behave differently, keep each page's behaviour and
  note it in the PR.
- Leave `ManageGroupsTab.tsx`'s two calls alone.

### Done when

- [ ] One hook; the four pages and `dashboard` use it
- [ ] Each page still shows the right PDF after the professor reassigns the job

---

## CU-30 — Fix comments that are wrong

**GFI · 1h · `api/src/`, `api/.env.example`, a few frontend files**

### What & why

A comment that is wrong costs more than no comment: the next reader believes
it. These are wrong today.

### Evidence

- The barrier lives in `Step_Completion` now, yet these say it is in process
  memory: `api/src/config/database.ts:3-13`, `api/src/server.ts:41-46`, the
  boot message at `server.ts:56-58`, `server.ts:112`, `api/.env.example:50-53`.
  The single-replica limit is still real; the reason is `onlineStudents` and
  the lack of a Socket.IO adapter.
- 12 controller headers say `src/controllers/`; the folder is `controller/`.
  `facts.controller.ts:1` names `group.controller.ts`.
  `grep -rn "^// src/controllers" api/src`
- `resume.controller.ts:411` and `interview.controller.ts:235` say "single
  transaction". There is no transaction; it is one multi-row INSERT.
- `jobdes/page.tsx:145`: `// Update your fetchJob useEffect in jobdes/page.tsx`,
  an instruction pasted from a chat.
- `app/page.tsx:10` and `adminFacts/page.tsx:5` point at a dead API host. The
  app deploys on Coolify.

### For an agent

- Fix the words; change no code. The boot message at `server.ts:56-58` is a
  string, so that one is a text change in a log line.
- `AGENTS.md` rule 2 has the correct story for the replica limit. Match it.

### Done when

- [x] Every item above is fixed
- [x] `git diff` shows comment and string changes only

---

## CU-31 — Cut history and restating comments

**GFI · 3h · one file per PR**

### What & why

Much of the code was written with AI, and it shows in the comments: paragraphs
about what the code used to do, labels on every import, `✅` markers. History
belongs in the commit message, where `git blame` finds it. A comment should say
why the code is the way it is, in a sentence or two.

### Evidence

```bash
grep -rniE "^\s*(//|\*).*\b(used to|previously|no longer|was removed|is gone)\b" api/src frontend/src | wc -l   # 38
grep -rn "// ✅\|// OPTIMIZED\|// NEW:\|// CRITICAL" frontend/src                                           # 8
grep -rn "^// =" api/src | wc -l                                                                               # 18 banner lines
```

Worst offenders: `advisor-dashboard/page.tsx:1-9` labels every import;
`app.ts:69`, `:84`, `:93` (`// Now this.sessionStore exists!`);
`res-review/page.tsx:558-576`.

### For an agent

- Keep every constraint a reader needs (why next-step-only, why fire-and-forget,
  why a connection and not the pool). Drop the story of how it got that way.
- Delete comments that restate the next line, banner lines and emoji markers.
- No code changes. `git diff -w` should show only comment lines.
- `socket.ts` and the student pages are pair ticket files. Do those last, or
  ask.

### Done when

- [ ] The chosen file has no history paragraphs, import labels, or markers
- [ ] Every remaining comment explains a reason the code does not show

---

## CU-32 — Replace the easy `any`s

**GFI · 2h · eight controllers, `api/src/app.ts`, `frontend/src/app/makeOffer/page.tsx`**

### What & why

`AGENTS.md` forbids new `any`, and about 90 old ones remain. Some are free to
fix: every route file already passes a typed `SocketIOServer` into a
constructor that throws the type away.

### Evidence

```bash
grep -rn "private io: any" api/src      # 8 controllers
grep -n "sessionStore: any" api/src/app.ts
grep -n "useState<any\[\]>" frontend/src/app/makeOffer/page.tsx   # :53-56
```

### For an agent

- `private io: SocketIOServer` (import from `socket.io`). The compiler will tell
  you if any emit was relying on `any`.
- `makeOffer`'s four arrays: use `Candidate` from `frontend/src/types` where it
  fits; add a type there for the rest.
- `job.controller.ts` and `progress.controller.ts` belong to pair tickets right
  now. A one-line constructor change is fine; tell them.

### Done when

- [ ] `grep -rn "private io: any" api/src` returns nothing
- [ ] No `useState<any[]>` in `makeOffer`
- [ ] Both packages typecheck with no new `as` casts

---

# What does NOT belong here

These need a spec, a decision, or a pair. They live in [TICKETS.md](TICKETS.md)
or on the board:

- Anything touching `SOCKET_AUTH_REQUIRED` or socket authorization.
- The group barrier's design, a migration runner, Assign Job safety, splitting
  `ManageGroupsTab`, the professor's unstick button. All pair tickets.
- `/employerPanel`: a stub, but also the unbuilt final step of the simulation.
  Build-or-cut is a product call (`STU-27`).
- The Tailwind theme tokens (`UI-9`), shared UI components, the student flow
  redesign.
- `console.*` to `pino` (`INFRA-12`). `CU-13` is cleanup only.
- Unused dependencies (`INFRA-13`). Its list is stale: the frontend now
  declares `pdf-lib`, `react-collapsed`, `react-draggable` and `react-youtube`
  without importing them, and the API ships `ts-node` and `typescript` as
  runtime dependencies.
- Two notes implementations (`notes/page.tsx` and `components/note.tsx`, both
  named `NotesPage`). Which one survives is `STU-24`.
- Anything where you find yourself changing what the app does.

---

## Keeping this file honest

The counts above go stale. Re-measure before claiming an entry:

```bash
# biggest files
find frontend/src api/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn | head

# log calls by kind
grep -rho 'console\.[a-z]*' api/src frontend/src | sort | uniq -c | sort -rn

# callback-style queries left (CU-18, CU-19)
grep -rnE '(this\.)?db\.query\(' api/src | grep -v 'promise()' | wc -l

# raw MySQL errors sent to the browser (CU-9)
grep -rnE "json\(\{ ?error: \(?(err|error)( as any)?\)?\.message" api/src/controller | wc -l

# any
grep -rnE ': any\b|as any\b' api/src frontend/src | wc -l

# local type declarations (CU-14)
grep -rnE "^\s*(export )?(interface|type) [A-Z]" frontend/src/app

# every API path the frontend calls (CU-1, CU-15)
grep -rhoE 'API_BASE_URL\}/[a-z_]+(/[A-Za-z_-]+)?' frontend/src | sort -u
```

When you finish an entry, delete it and add whatever you noticed while you were
in there. A found bug with a file and a line is worth more than a tidy list.
