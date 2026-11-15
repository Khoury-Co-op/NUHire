# Load test: 30 students at once (INFRA-14)

The ticket asked whether saturation shows up as errors (recoverable) or hangs
(class over). At 30 students it shows up as neither; the API is nowhere near
saturated. What breaks is recovery from an API restart, depending on where each
student is when it dies.

How to run it: [.local/tests/README.md](../.local/tests/README.md#load-test).

## What it does

`npm run load` walks 29 students (all but the one who never logs in) and the
advisor through the activity at once, on the seeded class 9001:

1. Logins spread over 20s through the real Keycloak page, then `/waitingGroup`.
2. The advisor starts every group in one request, and all 28 grouped students
   react at once (the burst).
3. Job description, 10 resume votes, the barrier, shortlist and confirmations,
   four interview ratings, the offer, the advisor's answer.
4. The advisor polls the live view every 10s like `/live-class`, accepts every
   offer, and force-advances group 1 (the dormant student's) at each gate.

The seed's messy cases are all in play. `--restart` crashes the API for 5s once
half the class has finished resume review.

| Criterion (from the ticket)     | Measured as                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| API p95 under 500ms             | every HTTP request except the Keycloak login                                         |
| No request unanswered after 10s | counted as a hang, never as a slow sample                                            |
| No stuck student                | everyone reaches the step `journey.mjs` expects, with no teacher help beyond group 1 |
| Class-start burst under 2s      | the advisor's start request to the last student on the dashboard                     |

## Choices

- **A Node script with `socket.io-client`.** The [Socket.IO docs](https://socket.io/docs/v4/load-testing/)
  suggest that or Artillery. [k6](https://grafana.com/docs/k6/latest/using-k6/protocols/)
  doesn't speak Socket.IO, and Artillery and Locust are awkward with events the
  server pushes unprompted. None could reuse `lib/login.mjs`. 30 users need no
  distributed generator.
- **Each fake student copies one browser**: the same requests and emits, a new
  socket per hard navigation, and a re-join on reconnect only where the page
  does one. It reproduces the client's bugs rather than fixing them.
- **Real Keycloak logins**, for the reasons in
  [.local/tests/README.md](../.local/tests/README.md#how-the-fake-students-log-in).
- **`SOCKET_AUTH_REQUIRED` on.** It's what we intend to ship. With it off, a
  socket that lost its cookie still connects and its completion is dropped, so
  an auth bug would look like a stuck group. Sessions live in MySQL, so the
  restart also tests re-authentication against a new process.
- **The restart is a SIGKILL of the server process, 5s down, then one start.**
  This is the usual chaos-test shape ([Principles of Chaos](https://principlesofchaos.org/)):
  steady state, one small fault, the same checks after. Pumba, Toxiproxy and
  Gremlin add things one local service doesn't need. SIGKILL because a crash is
  what happens in class, and the API has no SIGTERM handler anyway. Not
  `docker compose kill api`: the dev container then restarts the server twice
  (`tsc --watch` rebuilds at boot and `node --watch` restarts again), which
  stranded students in early runs and never happens in production.
- **Fan-out is timed from its cause** (the completion, the click, the advisor's
  answer), not from when each client started waiting, to avoid
  [coordinated omission](https://highscalability.com/your-load-generator-is-probably-lying-to-you-take-the-red-pi/).

## Environment

|             |                                                                 |
| ----------- | --------------------------------------------------------------- |
| Machine     | Apple M1, 16 GB, macOS 15                                       |
| Docker      | 27.4.0, 8 CPUs, 7.7 GB                                          |
| Stack       | `compose.dev.yaml`: MySQL 8.4, Keycloak 26.3, API dev container |
| Generator   | Node 22, same machine                                           |
| Commit      | `1ffc8737` (main); no app code changed                          |
| Socket auth | on, confirmed by the probe in every run                         |
| Date        | 2026-10-09                                                      |

## Results

| Run                | Runs | API p95 | Hung | Stuck | Burst      |
| ------------------ | ---- | ------- | ---- | ----- | ---------- |
| Plain              | 6    | 35–84ms | 0    | 0     | 0.43–1.04s |
| Restart (5s crash) | 6    | 53–93ms | 0    | 12–21 | 0.41–0.77s |

**Plain runs pass every criterion.** Over about 3,200 requests per run, nothing
errored or hung. The slowest routes are the ones hit in the burst:
`GET /groups/status` (p95 up to 288ms), `GET /groups/seen` (up to 286ms) and
`POST /users/update-seen` (up to 151ms). The Keycloak login peaks at about
700ms, at the start of class, outside the criterion. Barrier release,
`moveGroup` and the offer decision all reach every member within about 50ms.

**Restart runs fail every time.** The API itself recovers: 6s down, then
latency is back to normal, nothing hangs, and with `SOCKET_AUTH_REQUIRED` on no
reconnecting socket was refused. The students don't. 12 to 21 of 29 were stuck
in each run, mostly at the resume barrier or the shortlist.

## Findings

1. **A completion sent around the crash is lost.** Stuck groups had members
   with all 10 votes saved and no `Step_Completion` row. HTTP is back the moment
   the API is, but the socket's reconnect backoff (`socketContext.tsx:28`, up to
   10s) keeps it down longer: sockets came back a median 7.5s after the kill,
   and up to 16s. `userCompletedResReview` (`res-review/page.tsx:611`) is sent
   once and never again on reconnect, so one emitted in that gap is most likely
   what goes missing.
2. **Next unlocks without the barrier.** The page also enables Next once every
   member has 10 saved votes (`res-review/page.tsx:475`). A student whose
   completion was lost can leave, and the navigation (`:657`) throws away both
   the buffered completion and the `moveGroup` emitted after it. The group
   splits: the members behind wait for a barrier that cannot release now, and
   the members ahead wait on `/res-review-group` for a driver stuck behind them.
   Nothing recovers it on its own. Force-advance should; the test doesn't try.
3. **`/interview-stage` doesn't re-join its room on reconnect**
   (`interview-stage/page.tsx:392`), so a reconnected student misses
   `interviewStatusUpdated` and `moveGroup`. Seen in the container-kill runs,
   when groups were already interviewing at the crash. This breaks rule 4 in
   AGENTS.md.
4. **`/res-review-group` takes any `moveGroup` for its group**
   (`res-review-group/page.tsx:334`), including a teammate's late one meant for
   `/res-review-group` itself, and reloads. That happened 3 to 8 times per
   restart run.
5. **A group with a member who never logs in can't make an offer.** The offer
   tally is kept per browser (`makeOffer/page.tsx:568`) and needs the whole
   roster, and there is no override past makeOffer. Group 1 ends every run at
   `offer`. This breaks rule 3.

Findings 1 and 2 together are the likely class-ender: a crash at the wrong
moment strands groups until the teacher notices. Re-sending the completion on
every `connect` (the server ignores a duplicate) would likely close both.

## Not tested

- **Staging or production hardware (INFRA-4).** These are laptop numbers with
  no network hop and the generator on the same machine.
- **Real browsers (INFRA-9).** No React, no `localStorage`; the offer tally
  lives there, so restart behaviour at that step is a model.
- **Time is compressed** to about 75s. Slow-building problems (memory, pool
  leaks, 24h session expiry) are not covered.
- **30 is the target, not the limit.** No headroom figure.
- **One restart moment** (mid-resume-review). A crash during offers is likely
  worse.
- **Curveball popups.**
- **Drift.** The journey is hand-copied from the pages and the test is not in
  CI, so nothing catches a page changing under it.
