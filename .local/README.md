# Local dev

Everything here is local-only: throwaway credentials, a throwaway Keycloak realm
and seed rows for a handful of test accounts. It is tracked on purpose so a
clean clone can start the stack. Nothing in here is a production secret and
nothing in here should ever become one.

## Start

From the repo root, with Docker Desktop running:

    npm run all

The root `compose.dev.yaml` extends MySQL and Keycloak from
[`compose.yaml`](compose.yaml) in this folder and adds the API and frontend.
Keycloak has to be reachable at the _same_ URL from the browser and from the
API (OAuth redirect, then a server-side token exchange), so the API container
shares Keycloak's network and `http://localhost:8080` means Keycloak inside it
too. `--watch` syncs `api/src` and `frontend/src` into the containers on save
and rebuilds an image when its lockfile changes. Ctrl+C stops everything.

In Docker the apps read the `.env.example` files directly, with
`DATABASE_URL` pointed at `db:3306`, so there is nothing to copy first.

To change a value for yourself, put it in `api/.env` or `frontend/.env.local`
(the same files the host setup below uses). If they exist, Docker loads them
after the examples, so they win, and git ignores them. `DATABASE_URL` is the
exception: compose always sets it, so a host-style value in `api/.env` cannot
break the containers. Don't edit the `.env.example` files for local tweaks.

### Running the apps on the host instead

Useful for attaching a debugger. Copy the env files once, then:

    cp api/.env.example api/.env
    cp frontend/.env.example frontend/.env.local
    npm run install:all

    npm run dev:services     # just MySQL + Keycloak, waits until healthy
    npm run dev:api
    npm run dev:frontend

Both ways share the same containers and database, so stop one before
starting the other.

- app http://localhost:3000
- api http://localhost:5001
- keycloak http://localhost:8080 (admin console: admin / admin)
- mysql 127.0.0.1:3307 (root / nuhire, db `nuhire`)

On the host, run the API from its compiled build (`npm run dev:api`), the same
path prod uses. Do NOT use `npm run dev` in `api/`: the `ts-node` dev script
throws TS2769 overload errors on `auth.routes.ts` (an `@types/express@5` vs
`express@4` mismatch in the lockfile). `tsc` itself passes with `skipLibCheck`,
so `npm run build` and the Docker images are fine; only ts-node trips. On the
host that means no API hot reload: rebuild and restart. In Docker the API
hot-reloads via `tsc --watch` (see `api/dockerfile.dev`).

## Accounts

Seeded into the Keycloak realm and the DB. Password for all: `nuhire`.

| email                     | role    | group | lands on           |
| ------------------------- | ------- | ----- | ------------------ |
| advisor@northeastern.edu  | admin   | —     | /advisor-dashboard |
| student1@northeastern.edu | student | 1     | /waitingGroup      |
| student2@northeastern.edu | student | 2     | /waitingGroup      |
| student3@northeastern.edu | student | 2     | /waitingGroup      |

Group membership is whatever `seed.sql` last set, and it drifts once anyone
moves students around in Manage Groups. Check the database rather than trusting
this table:

```bash
docker exec nuhire-mysql mysql -uroot -pnuhire nuhire \
  -e "SELECT email, group_id, class FROM Users WHERE affiliation='student';"
```

Students sit on /waitingGroup until the advisor starts their group from Manage
Groups. The separate "Admin" button on the landing page is the moderator login,
a plain env-var check: `admin` / `admin`.

`seed.sql` claims `crn = 1` for the test advisor. The API seeds its own advisor
row with `INSERT IGNORE` and `crn` is UNIQUE, so ours wins and class 1 lines up
with the job descriptions and resumes the API seeds for `class_id = 1`.

## A full class (30 students)

The four accounts above are enough for one or two people. To see the app at the
size of the pilot, with the messy cases a real roster has, build the simulated
class:

    npm run seed          # needs the stack up (npm run all)
    npm run seed:check    # logs in all 30 students and the teacher
    npm run load          # all 30 through the activity at once (load test)

That creates `advisor01@example.test` and `student01@example.test` to
`student30@example.test` (password `nuhire`) in class 9001, in 8 groups, with a
student who never logs in, one with no group and a group of one. To start from
later in the activity, add a scenario, for example
`npm run seed -- --scenario=waiting-on-group`. Its own README,
[tests/README.md](tests/README.md), has the roster, the scenarios, how the fake
students log in and why, the load test, and the other commands (`seed:wipe`,
`seed:reset`).

The local Keycloak realm now also accepts `@example.test` addresses (it only
took `@northeastern.edu` before). A Keycloak container created before that needs
`docker compose -f compose.dev.yaml up -d --force-recreate keycloak api` to pick
it up; `npm run seed` tells you if it does.

`npm run down` then `npm run all` recreates Keycloak without its users but
keeps the database, so run `npm run seed` again afterwards.

## Reset the database

    npm run reset && npm run all

## Stop

    npm run down

## Source changes this needed

Two tracked files were patched, both env-gated so deployed behaviour is
unchanged (`COOKIE_SECURE` unset => the old `secure: true` / `sameSite: 'none'`):

- `api/src/app.ts` — session cookie
- `api/src/controller/auth.controller.ts` — the explicit `res.cookie` after login

Browsers drop `Secure` cookies over plain http, so without this every request
came back unauthenticated with a fresh session id.
