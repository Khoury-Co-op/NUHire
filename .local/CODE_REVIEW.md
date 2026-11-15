# NUHire: repo review for the new lead

Written after cloning `Khoury-Co-op/NUHire`, running the whole stack locally, and
reading the source + the 12 handover docs. Cites file paths. Flags uncertainty
where it exists. This lives in `.local/` so it stays out of the repo's own diff.

---

## 0. The one thing to know first

**Every doc you were handed is stale.** All 12 describe a Render + Railway
deployment with a self-hosted Keycloak and a shared Gmail for SMTP. The repo
moved past that ~4 months later. The last real code work is Dec 2025 (Zaclabit);
the last commits are Apr–May 2026 by "Jon" (`j.denman@northeastern.edu`) that
rip Keycloak out of compose and wire up **Coolify on a self-hosted Khoury runner**
at `nuhire.khoury.northeastern.edu`. So:

- `BUILD.md` / `README.md` say Google OAuth. The code has only Keycloak
  (`api/src/config/passport.ts`). No Google strategy exists.
- `NUHire Setup Documentation.pdf` says Render + Railway + `reformat` branch.
  Reality: Coolify, `main` branch, `.github/workflows/deploy.yml` fires a webhook.
- The committed `compose.yaml` is itself half-migrated and won't run as-is.

Treat the docs as history, not instructions. The accurate local runbook is now
`.local/README.md` (I wrote it while getting this booted).

---

## 1. What's actually here and how it hangs together

Monorepo, three deployable pieces plus auth:

- **`frontend/`** — Next.js 15 (App Router), React 19, Tailwind, Socket.IO client.
  ~11.7k lines. One route folder per simulation step under `src/app/`.
- **`api/`** — Express + TypeScript, Socket.IO server, Passport + Keycloak OIDC,
  MySQL via `mysql2`. ~5k lines. Classic controller/route/middleware split under
  `src/`.
- **`database-files/Pandployer.sql`** — one MySQL dump, 21 tables. Loaded via
  MySQL's `docker-entrypoint-initdb.d` on first boot. Seed data (jobs, resumes,
  candidates) is inserted by the API at startup, not by the SQL file — see
  `api/src/config/database.ts` `initializeDatabase()`.
- **`keycloak/`** — realm export + a Dockerfile/render.yaml for the old
  self-hosted Keycloak. Being replaced by Khoury IT SSO per commit #57.

**Data model** (`Pandployer.sql`, `api/src/models/User.ts`): `Users` carry
`affiliation` (student/admin/none), `group_id`, `class` (= CRN). `Moderator` maps
an advisor email to a CRN. `GroupsInfo` tracks whether a group is `started`.
Everything is keyed by the `(group_id, class)` pair. Per-step tables:
`Resume`/`Resumepage` (individual + group resume votes), `InterviewPage`/
`InterviewPopup` (interview voting), `Offers`/`Offer_Status`, `Notes`,
`WaitingFacts`, `Progress`.

**The student journey** (`frontend/src/app/dashboard/page.tsx` `steps[]`):
job description → resume review (individual) → resume review (group) →
interview stage → make offer → employer panel. A live Socket.IO layer
(`api/src/config/socket.ts`) drives group rooms `group_<g>_class_<c>`: shared
checkboxes, "whole group must finish" barriers, teacher popups, offer
request/accept.

**The teacher journey** (`_NUHire teacher documentation` + `ManageGroupsTab.tsx`,
1717 lines): upload Canvas roster CSV → assign groups in the UI → **download CSV
and import into Zoom breakout rooms** → assign a job per group → "start" groups →
watch progress → send curveball popups while groups are on the interview step →
accept/reject each group's final offer.

---

## 2. Finished vs half-built vs stubbed

**Finished and genuinely substantial:**

- Keycloak login + role routing (`auth.controller.ts`), session in MySQL.
- Manage Groups (`ManageGroupsTab.tsx`, 1717 lines) — the advisor's cockpit.
- Resume review individual + group (`res-review`, `res-review-group`).
- Interview stage (`interview-stage/page.tsx`, 1211 lines) — YouTube embeds,
  live per-candidate voting, teacher popups mid-stage.
- Make offer (`makeOffer/page.tsx`, 1099 lines) + advisor accept/reject
  (`pending-offers`).
- CSV roster import, Waiting Facts, per-route auth on most endpoints.

**Half-built / broken:**

- **Employer Panel — the final step of the simulation is not real.**
  `employerPanel/page.tsx` is a placeholder: a heading "Here is a video about
  what an employer would do..." and a button. Worse, the dashboard links to
  **`/employerPannel`** (typo, double-n) while the folder is `employerPanel` →
  that link 404s. And the page writes progress value `"employerPannel"`
  (`employerPanel/page.tsx:15`), which is **not** a valid `Progress.step` enum
  (`none|job_description|res_1|res_2|interview|offer|employer`), so the final
  DB write is invalid. Dashboard even labels it "Coming Soon…" with 🚧. Net: a
  group can't cleanly _finish_.
- **Two competing progress systems.** `Users.current_page`
  (`dashboard|resumepage|resumepage2|jobdes|interviewpage|makeofferpage`) +
  `Users.seen`, AND a separate `Progress` table with a _different_ enum
  (`res_1|res_2|…`), AND the route paths (`/res-review`, …) are a _third_
  vocabulary. Nothing maps cleanly across the three. This is the main source of
  "why did a student land on the wrong page" confusion.

**Stubbed / absent:**

- **No tests, anywhere.** `api` test script is literally `exit 1`; frontend has
  none. No CI check beyond the deploy webhook.

---

## 3. Where this breaks with 30 students in a live class

Ordered by how likely it is to bite during a pilot.

1. **In-memory group state on the API.** `onlineStudents`, the
   `global.completedResReview` barrier, and the "all group members done" gate all
   live in one Node process's memory (`socket.ts`). Single instance: fine. But if
   the API restarts mid-class, or you ever run 2+ replicas behind Coolify, the
   barrier evaporates and **students sit forever on "waiting for your group."**
   This "whole group must finish together" mechanic is the highest-risk live path
   and it has zero persistence.
2. **Gating is client-side only and its guard is buggy.**
   `components/useProgress.tsx` reads `localStorage.progress` to decide access.
   A student can skip any step from devtools. And when it _does_ block you it runs
   `window.location.replace('/' + progress)` → e.g. `/res_1`, which isn't a route
   → 404. The API is `requireAuth` but **not scoped to the caller's own group**,
   so IDs in the URL let one student read/write another group's data.
   Proctored classroom makes this low-severity, but it's fragile.
3. **Unbounded memory growth.** The logging middleware in `api/src/app.ts` pushes
   `Date.now()` into `routeCallTimestamps[route]` on _every_ request and never
   trims. A multi-hour class session leaks steadily.
4. **Session table bloat.** `express-session` is configured
   `saveUninitialized: true` (`app.ts`), so every anonymous hit writes a MySQL
   session row. No visible cleanup job.
5. **DB pool ceiling.** `connectionLimit: 15` (`database.ts`). 30 students each
   polling several endpoints + sockets may queue. Probably OK, but untested at
   that load and there's no test to tell you.
6. **The auth cookie is the fragile bit.** Prod cookie is `secure` +
   `sameSite:'none'` (`app.ts`, `auth.controller.ts`), so it only works if HTTPS
   is perfect end-to-end at the new domain and the API and frontend are same-site
   enough for the browser. This is exactly what broke locally (see §4).

---

## 4. What surprised me / what you won't get from the docs

- **The docs↔reality gap in §0** is the biggest one. Nobody wrote down the
  Coolify move; you'd only find it in `git log` (commit `0c1c1e68`, #57) and
  `.github/workflows/deploy.yml`.
- **Committed secrets, in git history, on GitHub:**
  - `keycloak/render.yaml` — Keycloak admin password `NUHire0207!` in plaintext.
  - `keycloak/realm-export.json:541` — the OIDC client secret.
  - The setup PDF additionally lists a shared Gmail password and prod moderator
    creds `a`/`a`. Rotate all of these; removing them from HEAD is not enough.
- **The group mechanic is glued to Zoom by hand.** Roster comes from Canvas as a
  CSV, groups are assigned in the app, then re-exported and imported into Zoom
  breakout rooms manually. Grouping lives in three places at once (app, CSV,
  Zoom). Nothing syncs.
- **Admin login isn't Keycloak.** The "Admin" button is a separate plaintext
  username/password check against env vars (`auth.controller.ts` `moderatorLogin`,
  prod `a`/`a`). Two different auth systems in one app.
- **Identity crisis in the naming.** Product is NUHire; npm package is
  `pandployer`/`panployer`; MySQL db is `pandployer`; `package.json` still points
  at the old repo `sagashrimproll/Panployer`. Cloned from `Khoury-Co-op/NUHire`,
  but docs link `KhourySpecialProjects/NUHire`. Confirm which GitHub org is live.
- **`git log` reads as a solo project.** ~1080 of ~1409 commits are one author
  (Zaclabit). Bus factor was 1, and that person is gone.
- **What I first got wrong, then checked:** I assumed the type error meant prod
  couldn't build. It builds fine — `npm run build` (tsc, `skipLibCheck`) passes
  and emits `dist/`. Only the `ts-node` _dev_ script throws. So deployment is
  unaffected; local API dev just has no hot-reload until the dev script is fixed.

---

## 5. If I were leading this, what I'd fix first

Ranked by "blocks a real pilot with 30 students."

1. **Rotate and purge the committed secrets** (§4). They're public. Do this
   before anything else; it's the only item with an external clock on it.
2. **Persist the group-completion barrier** out of process memory into MySQL (or
   Redis), and pin the API to a single instance until that's done. This is the
   mechanic most likely to strand a whole group live (§3.1). At minimum, test the
   "4 students, all must finish" path with real concurrent sessions — there is no
   test for it today.
3. **Finish or formally cut the Employer Panel** (§2). Fix the `/employerPannel`
   typo, make it write a valid `Progress.step`, and give it real content — or
   remove it from `steps[]` so a group can actually reach "done."
4. **Enforce gating server-side** and scope group/class endpoints to the caller
   (§3.2). Keep the client redirect too, but fix its 404 target.
5. **Reconcile the three progress vocabularies** into one (§2). This quietly
   causes most "student on the wrong page" reports and will eat support time
   during the pilot.
6. **Add a smoke test for the full student journey** and a CI build check, then
   **rewrite `README.md`/`BUILD.md`** to the Coolify + Keycloak reality. The
   `.local/` setup here is the accurate local runbook to start from.

Smaller cleanups worth a ticket each: trim the logging arrays (§3.3), flip
`saveUninitialized` to false (§3.4), fix the `ts-node` dev script so API edits
hot-reload, and unify the `pandployer`/`NUHire` naming.

---

## Appendix: local setup issues I already fixed to get this running

- Rewrote the stale `compose.yaml` into a working `.local/compose.yaml` (MySQL +
  Keycloak in Docker; API + frontend on the host so Keycloak resolves to one URL
  for both browser and server).
- Patched the auth cookie to be env-gated (`COOKIE_SECURE`) in `api/src/app.ts`
  and `api/src/controller/auth.controller.ts`. It was hardcoded `secure:true` +
  `sameSite:'none'`, which browsers drop over local http, so every request came
  back unauthenticated. Prod behavior is unchanged (var unset → old values).
- Seeded a test realm + DB (advisor + 3 students) — see `.local/README.md`.
