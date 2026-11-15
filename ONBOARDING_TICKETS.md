# Onboarding tickets

18 tickets, week one. **No feature work.** The point is that everyone gets the
app running, understands what we are building, and tells me enough about
themselves that I can hand out real work that suits them.

Paste these into Linear. Suggested labels: `onboarding`, plus the phase.

| Phase           | Tickets   | What it is                                       |
| --------------- | --------- | ------------------------------------------------ |
| **A. Setup**    | ONB-01…05 | Tools installed, app running on your machine     |
| **B. Learn**    | ONB-06…11 | Product, architecture, stack, both user journeys |
| **C. First PR** | ONB-12…14 | Something tiny merged, so the pipeline is proven |
| **D. Signal**   | ONB-15…18 | Who you are, what you want, what you'd change    |

**Order matters between phases, not inside them.** Finish A before B. Inside a
phase, do them in any order.

**If you are blocked more than 30 minutes, post in the channel.** Being stuck
quietly is the only way to fail week one. A blocker you hit is a bug in our
docs, and reporting it is worth more than pushing through it.

---

# Phase A — Setup

## ONB-01 — Install the toolchain

**Est:** 1h · **Everyone**

Get the tools on your machine before touching the repo.

- [ ] **Node 22.** Install `nvm` if you don't have it, then `nvm install 22`
- [ ] **Docker Desktop**, installed and actually running (whale icon in the menu bar / tray)
- [ ] **git**, with SSH set up against GitHub
- [ ] An editor you like. VS Code is what most of the team uses
- [ ] Post your `node -v`, `docker -v`, and `git --version` in the channel

**Done when:** all three commands print a version, and Docker Desktop is open.

**Note for Windows:** use WSL2. Everything here assumes a Unix shell. If you are
on Windows and hit anything the docs don't cover, flag it — we have nobody on
Windows yet and that is a gap.

---

## ONB-02 — Clone the repo and install dependencies

**Est:** 30m · **Everyone** · deps: ONB-01

```bash
git clone git@github.com:Oasis-NEU/NUHire.git
cd NUHire
nvm use
npm run install:all
```

- [ ] Clone succeeds over SSH (if it asks for a password, your SSH key isn't set up)
- [ ] `npm run install:all` finishes without errors
- [ ] `ls` and confirm you see `api/`, `frontend/`, `docs/`, `.local/`

**Done when:** the repo is on your machine and dependencies are installed.

**Heads up:** this installs three separate `package.json` files (root, `api/`,
`frontend/`). That is normal. It takes a few minutes.

---

## ONB-03 — Get the app running

**Est:** 1h · **Everyone** · deps: ONB-02

Follow [ONBOARDING.md](ONBOARDING.md) §6. Short version:

```bash
npm run all      # MySQL, Keycloak, API and frontend in Docker
```

- [ ] `docker compose -f compose.dev.yaml ps` shows all four containers up
- [ ] `curl http://localhost:5001/health` returns `{"status":"ok",...}`
- [ ] http://localhost:3000 loads the NUHire landing page
- [ ] Screenshot the landing page and post it in the channel

**Done when:** you can see the landing page in your browser.

**Do NOT use `npm run dev` inside `api/`.** It is broken (a TypeScript version
mismatch). Use `npm run dev:api`, which builds then runs. This means **no hot
reload on the API** — you rebuild after backend changes. The frontend reloads
normally.

**First run is slow.** It pulls Docker images and imports the Keycloak realm.
Give it a couple of minutes before deciding it's broken.

---

## ONB-04 — Log in as a student and as a teacher

**Est:** 30m · **Everyone** · deps: ONB-03

Password is `nuhire` for every test account.

- [ ] Log in as `advisor@northeastern.edu` → you should land on `/advisor-dashboard`
- [ ] In a **private/incognito window**, log in as `student1@northeastern.edu`
- [ ] Post a screenshot of both dashboards

**Done when:** you have seen both sides.

**The two things that trip everyone up:**

1. **One browser holds one login.** Keycloak SSO is shared across tabs, so a new
   tab silently keeps your first identity. You need a private window for the
   second role.
2. **A student sees a waiting screen until a teacher starts their group.** That
   is not a bug. ONB-05 fixes it.

---

## ONB-05 — Run the full simulation end to end

**Est:** 2h · **Everyone** · deps: ONB-04

The single most useful thing you will do this week. Follow
[ONBOARDING.md](ONBOARDING.md) §9.

As the **teacher** (normal window):

- [ ] Manage Groups → select CRN 1 → assign a job to group 1 → start group 1

As a **student** (incognito):

- [ ] Log in as `student1@northeastern.edu`, click through the intro
- [ ] Walk every step: Job Description → Resume Review → Group Resume Review → Interview Stage → Make an Offer
- [ ] Submit an offer

Back as the **teacher**:

- [ ] Accept the offer, and watch the student window update live

**Done when:** you have personally sent an offer and accepted it.

**Write down every single thing that felt broken, confusing, or ugly.** You will
never see this app with fresh eyes again. That list is the deliverable, more
than the click-through. Save it for ONB-17.

**Expect to get stuck at a group barrier.** Some steps wait for _all_ group
members. `student1` and `student2` are both in group 1 — open a third window and
finish resume review on both to release it. If you are truly stuck, that is what
the teacher's force-advance is for.

---

# Phase B — Learn

## ONB-06 — Read the product docs and write three questions

**Est:** 1h · **Everyone** · deps: ONB-05

- [ ] Read [docs/WHAT_IS_NUHIRE.md](docs/WHAT_IS_NUHIRE.md) — what we're building and why
- [ ] Read [README.md](README.md)
- [ ] Post **three questions** in the channel that the docs did not answer

**Done when:** your three questions are posted.

Questions are the deliverable. If you have none, you skimmed. Anything counts:
product, technical, process, "why is it like this."

---

## ONB-07 — Read the architecture doc and draw the system

**Est:** 2h · **Everyone** · deps: ONB-06

- [ ] Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [ ] Draw the four processes and how a request gets from a click to the database and back. Whiteboard, Excalidraw, napkin, anything
- [ ] Post the drawing

**Done when:** your drawing is posted.

Do it **from memory first**, then check. The gaps are the point.

⚠️ **That doc is stale in one place** — it describes the group barrier as living
in process memory with no teacher override. That was fixed; the barrier is now
in a database table. [ONBOARDING.md](ONBOARDING.md) §5 is correct. Noticing this
yourself is a bonus.

---

## ONB-08 — Learn the stack: pick the piece you know least

**Est:** 2h · **Everyone** · deps: ONB-06

Our stack: **Next.js 15 (App Router)** · **React 19** · **Tailwind** ·
**Express + TypeScript** · **Socket.IO** · **MySQL** · **Keycloak (OIDC)**

- [ ] Pick the one you are least comfortable with
- [ ] Spend two hours on it: official docs, a tutorial, whatever works
- [ ] Post a short "here's what I learned and here's where it shows up in our code" — link at least one real file

**Done when:** your writeup is posted.

Honesty helps you here. I am building a picture of who knows what so I can pair
people sensibly. "I have never touched WebSockets" is useful information, not a
weakness.

---

## ONB-09 — Trace one request end to end in the code

**Est:** 2h · **Everyone** · deps: ONB-07

Read [ONBOARDING.md](ONBOARDING.md) §3, which traces a resume vote. Then do a
**different** one yourself.

Pick one and follow it from the browser to the database:

- loading the job description
- submitting an interview rating
- the teacher accepting an offer
- checking a resume checkbox (this one is a socket, not HTTP)

- [ ] Write the trace: component → API call → route → controller → SQL → response
- [ ] Note every socket event involved
- [ ] Post it, with file paths

**Done when:** posted with real file paths.

**Start in `api/src/routes/`.** Those files are small and map a URL to a
controller method and its auth. Everything else follows from there.

---

## ONB-10 — Understand the group barrier

**Est:** 1h · **Everyone** · deps: ONB-05

The barrier is the heart of the group mechanic and the thing most likely to
break a live class with 30 students.

- [ ] Read [ONBOARDING.md](ONBOARDING.md) §5
- [ ] Read `evaluateGroupBarrier` in `api/src/config/socket.ts`
- [ ] Answer in the channel, in your own words:
  - What has to be true for a group to advance?
  - What happens if a student on the roster never logs in?
  - Why is the barrier stored in the database instead of in memory?

**Done when:** your three answers are posted.

---

## ONB-11 — Understand how teacher vs student is decided

**Est:** 1h · **Everyone** · deps: ONB-09

- [ ] Read [ONBOARDING.md](ONBOARDING.md) §4
- [ ] Read the redirect logic in `api/src/controller/auth.controller.ts`
- [ ] Answer in the channel:
  - Which single database column decides if you are a teacher?
  - Which table is the "root of trust" for teacher access?
  - Why are there two different login systems?

**Done when:** your three answers are posted.

---

# Phase C — First PR

## ONB-12 — Read the rules and set up your editor

**Est:** 1h · **Everyone** · deps: ONB-03

- [ ] Read [AGENTS.md](AGENTS.md). It is our rules file and applies to humans and AI assistants
- [ ] Run `npm run format` and confirm it changes nothing (if it does, say so — that's a bug)
- [ ] Turn on format-on-save in your editor
- [ ] Confirm `npm run typecheck` passes

**Done when:** you have read the rules and your editor formats on save.

If you use Copilot, Cursor, or Claude, **point it at `AGENTS.md`.** Several
rules there exist because the obvious approach is wrong in this codebase, and an
assistant that hasn't read them will confidently do the wrong thing.

---

## ONB-13 — Ship one tiny PR

**Est:** 2h · **Everyone** · deps: ONB-12

Prove the whole pipeline: branch, commit, PR, review, merge. The change should
be **trivially small**. The point is the process.

Pick anything from [CLEANUP.md](CLEANUP.md), or:

- fix a typo you noticed during ONB-05
- fix a step in `ONBOARDING.md` that was wrong on your machine
- delete a stale comment you found while reading

- [ ] Branch: `<yourinitials>/<short-description>`
- [ ] `npm run typecheck` and `npm run format` pass
- [ ] Open the PR, describe what and why
- [ ] Get one review, address comments, merge

**Done when:** your PR is merged.

**Do not pick something big.** A one-line PR that merges on day three is worth
more than a good PR that merges in week three.

---

## ONB-14 — Report every place the docs lied

**Est:** 2h · **Everyone** · deps: ONB-13

Our docs were rewritten recently and are **not** fully trustworthy. You just
followed them with fresh eyes, which makes you the only person who can catch
this.

- [ ] Redo setup on a **fresh clone in a temp directory** (`git clone ... /tmp/nuhire-test`), not your existing checkout. Clone-only failures are the ones that survive every review
- [ ] Time it. How long from clone to logged in?
- [ ] List every step that was wrong, ambiguous, or missing
- [ ] PR the fixes, or open issues for anything needing a code change

**Done when:** your fixes are merged and you have posted your clone-to-login time.

This is the highest-value ticket in this list. Everything downstream depends on
setup being real.

---

# Phase D — Signal

The ones that tell me who you are. Please actually do these, they decide what
work you get.

## ONB-15 — Fill out the onboarding form

**Est:** 20m · **Everyone**

👉 **https://docs.google.com/forms/d/e/1FAIpQLSdnLErVA6NQb1afS7za_9tnaNA-VzkgieC9lMOqqnsUkNWCVQ/viewform**

- [ ] Submitted

**Done when:** submitted. Please do this first, before the rest of Phase D.

I use it to assign work. Be honest about experience level — there is no wrong
answer and nobody is getting judged. Saying "I've never used Docker" gets you
paired with someone who has. Saying you're comfortable when you aren't gets you
a ticket that eats your whole semester.

---

## ONB-16 — Tell us what you want to work on

**Est:** 30m · **Everyone** · deps: ONB-08

Now that you have seen the codebase, post in the channel:

- [ ] Which area interests you most: **frontend / UI**, **backend / API**, **realtime / sockets**, **database**, **infra / CI**, **product / design**
- [ ] One thing you want to **get better at** this semester
- [ ] One thing you are **already good at** that the team should use you for
- [ ] Roughly when you work — evenings, weekends, between classes

**Done when:** posted.

Your first pick is not binding. But I would rather give you something you're
curious about than assign at random.

---

## ONB-17 — Write up your fresh-eyes list

**Est:** 1h · **Everyone** · deps: ONB-05

You kept a list during the click-through. Turn it in.

- [ ] Everything that felt broken, confusing, slow, or ugly
- [ ] Anything you expected to exist and didn't
- [ ] Anything you had to ask someone about
- [ ] Post it as one message. Do not filter or polish it

**Done when:** posted.

**Do not self-censor.** "The landing page took forever to load" and "I couldn't
tell which step I was on" are exactly what I need. You lose fresh eyes after
week one and never get them back.

---

## ONB-18 — Pitch one idea

**Est:** 1h · **Everyone** · deps: ONB-06, ONB-17

You have now seen the product and the code. Pitch something.

- [ ] One thing you would build, fix, or change, and **why it matters for a real class of 30 students**
- [ ] Roughly how hard you think it is
- [ ] Post it. One paragraph is plenty

**Done when:** posted.

Anything is fair game: a feature, a fix, a refactor, a tool, a process change.
It does not have to be on the roadmap, and it does not have to be small. Good
ideas from here go straight into [TICKETS.md](TICKETS.md) with your name on
them.

The single most useful frame: **the professor is standing in front of 30
students and something just went wrong.** What would you want to exist?

---

# For me (lead), not the team

- Phase A and B are ~15h, Phase C and D ~7h. One week at 10 hrs/wk for most people, two for anyone newer.
- **ONB-14 and ONB-17 are the ones I actually read.** Everything else is scaffolding.
- Phase D is the whole point. Do not let anyone skip it to start "real work" early.
- Watch who finishes Phase A unassisted vs who needs help. That is my first real signal on experience level, and it's more honest than the form.
- After ONB-16 comes in, assign from [TICKETS.md](TICKETS.md) week-1 list by stated interest.
- Nobody should touch feature work until their ONB-13 PR is merged. If the pipeline doesn't work for them, a big ticket will just stall.
