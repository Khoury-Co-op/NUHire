#!/usr/bin/env node
// Enforces database-files/migrations/README.md on a PR's diff (AGENTS.md rule 12):
//
//   - a change to Pandployer.sql comes with a new migration in the same PR
//   - a migration already on the base branch is never edited, renamed or deleted,
//     except to wrap a file from before dbmate in its two marker lines, once
//   - new migrations are named NNN-short-name.sql and continue the numbering
//   - every migration has the `-- migrate:up` and `-- migrate:down` lines
//     dbmate needs to run it (npm run db:migrate, and on every API start)
//
// Whether the migrations actually run, twice, is checked separately in CI
// against a real MySQL.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = 'database-files/migrations';
const SCHEMA = 'database-files/Pandployer.sql';
const NAME = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;
// The whole line, so `-- migrate:upper` does not pass for `-- migrate:up`.
// Anything after a space is a dbmate option, such as `transaction:false`.
const MARKER = { up: /^-- migrate:up(\s.*)?$/, down: /^-- migrate:down(\s.*)?$/ };

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
const mergeBase = git('merge-base', base, 'HEAD');

// name-status: "M\tpath", "A\tpath", "D\tpath", "R100\told\tnew"
const changes = git('diff', '--name-status', '-M', mergeBase, 'HEAD')
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split('\t'));

// True when the edit is exactly the one-time wrap: a file with no dbmate markers
// gains `-- migrate:up` as its first line and `-- migrate:down` as its last, and
// nothing else changes. A marker anywhere else, or with an option, changes what
// dbmate runs, so it is an edit like any other. Once a file has its markers this
// no longer matches, so it cannot be edited again.
function isDbmateWrap(path) {
  const show = (rev) => execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8' });
  const before = show(mergeBase);
  return (
    !/^--\s*migrate:/m.test(before) &&
    show('HEAD') === `-- migrate:up\n${before}\n-- migrate:down\n`
  );
}

const errors = [];
const added = [];
for (const [status, path, renamedTo] of changes) {
  if (!path.startsWith(`${DIR}/`) || !path.endsWith('.sql')) continue;
  if (status === 'A') {
    added.push(path.slice(DIR.length + 1));
  } else if (status === 'M' && isDbmateWrap(path)) {
    continue;
  } else {
    const what = { M: 'edited', D: 'deleted' }[status[0]] ?? `renamed to ${renamedTo}`;
    errors.push(
      `${path} was ${what}. A migration that has been applied cannot change; add a new numbered migration instead.`
    );
  }
}

const schemaChanged = changes.some(([, path]) => path === SCHEMA);
if (schemaChanged && added.length === 0) {
  errors.push(
    `${SCHEMA} changed but no migration was added. Editing the dump fixes new databases only; add ${DIR}/NNN-what-it-does.sql for the live one.`
  );
}

// A base branch from before dbmate (Khoury-Co-op dev, say) has no migrations
// folder at all, so every migration in the PR is new and numbering starts at 001.
const baseHasDir = git('ls-tree', '--name-only', mergeBase, `${DIR}/`) !== '';
const existing = (baseHasDir ? git('ls-tree', '--name-only', `${mergeBase}:${DIR}`) : '')
  .split('\n')
  .filter((f) => f.endsWith('.sql'));
let next = Math.max(0, ...existing.map((f) => Number(NAME.exec(f)?.[1] ?? 0))) + 1;
for (const file of added.sort()) {
  const match = NAME.exec(file);
  if (!match) {
    errors.push(
      `${DIR}/${file}: name must look like ${String(next).padStart(3, '0')}-what-it-does.sql`
    );
    continue;
  }
  if (Number(match[1]) !== next) {
    errors.push(
      `${DIR}/${file}: expected number ${String(next).padStart(3, '0')}, the next one after what is on the base branch.`
    );
  }
  next = Number(match[1]) + 1;
}

// dbmate refuses a migration without both blocks, and the API runs dbmate
// before it starts, so a migration missing one would stop the API booting.
for (const file of readdirSync(DIR).filter((f) => NAME.test(f))) {
  const lines = readFileSync(`${DIR}/${file}`, 'utf8').split('\n');
  for (const block of ['up', 'down']) {
    if (!lines.some((line) => MARKER[block].test(line))) {
      errors.push(
        `${DIR}/${file} has no \`-- migrate:${block}\` line. dbmate needs one to run it.`
      );
    }
  }
}

// The directory on disk and the numbering must agree too, so two PRs that both
// took the same number are caught once the second is rebased.
const numbers = readdirSync(DIR)
  .map((f) => NAME.exec(f)?.[1])
  .filter(Boolean);
for (const n of new Set(numbers)) {
  if (numbers.filter((m) => m === n).length > 1)
    errors.push(`Two migrations share the number ${n}.`);
}

if (errors.length) {
  for (const e of errors) console.log(`::error title=Database change::${e}`);
  process.exit(1);
}
console.log(
  `Migration rules OK (${added.length} new migration${added.length === 1 ? '' : 's'}, schema ${schemaChanged ? 'changed' : 'unchanged'}).`
);
