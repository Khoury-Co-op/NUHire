// Race check for writes that must be atomic (REPO-4). `npm run races`; see
// .local/tests/README.md.
//
// Each case fires WRITERS concurrent first writes at one key, ROUNDS times, and
// checks that none was lost. It runs the API's compiled code, so `npm run races`
// builds api/ first. A ticket that moves a write into a repository adds a case
// file for it under cases/ and lists it in AREAS.

import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT, loadConfig } from '../lib/env.mjs';
import { SeedError, run, say } from '../lib/util.mjs';
import { RACE_CLASS_MIN, ROUNDS, WRITERS, outcome } from './harness.mjs';
import facts from './cases/facts.mjs';
import writes from './cases/writes.mjs';

const AREAS = [writes, facts];

const fromApi = createRequire(path.join(ROOT, 'api/package.json'));

function load(modulePath) {
  try {
    return fromApi(modulePath);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    throw new SeedError(
      `Could not load ${modulePath} from api/. Run \`npm run races\`, which builds it, after \`npm run install:all\`.`
    );
  }
}

// One connection per writer, so every write in a round really runs at once.
function connect(databaseUrl) {
  const { PrismaClient } = load('./dist/generated/prisma/client.js');
  const { PrismaMariaDb } = load('@prisma/adapter-mariadb');
  const url = new URL(databaseUrl);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      connectionLimit: WRITERS,
      minimumIdle: 0,
      ssl: { rejectUnauthorized: false },
    }),
  });
}

function summary(labels) {
  const counts = {};
  for (const label of labels) counts[label] = (counts[label] ?? 0) + 1;
  return Object.entries(counts)
    .map(([label, n]) => `${n} ${label}`)
    .join(', ');
}

async function runCase(ctx, theCase, firstClassId) {
  const labels = [];
  const problems = [];
  for (let round = 0; round < ROUNDS; round++) {
    const classId = firstClassId + round;
    await theCase.setup?.(ctx, classId);
    const settled = await Promise.allSettled(
      Array.from({ length: WRITERS }, (_, i) => theCase.write(ctx, classId, i))
    );
    const roundLabels = settled.map(outcome);
    labels.push(...roundLabels);
    if (theCase.check) {
      for (const problem of await theCase.check(ctx, classId, roundLabels)) {
        problems.push(`round ${round + 1}: ${problem}`);
      }
    }
  }
  return { labels, problems };
}

run(async () => {
  const config = loadConfig();
  const db = connect(config.databaseUrl);
  const ctx = {
    db,
    writes: load('./dist/repository/writes.js'),
    // repository('facts') is the compiled api/src/repository/facts.repository.ts.
    repository: (area) => load(`./dist/repository/${area}.repository.js`),
  };

  let failed = 0;
  try {
    await db.$connect().catch((error) => {
      throw new SeedError(`Could not connect to MySQL (${error.message}). Is the local stack up?`);
    });
    for (const area of AREAS) await area.cleanup(db);

    say(`${WRITERS} concurrent first writes per round, ${ROUNDS} rounds per case.\n`);
    let classId = RACE_CLASS_MIN;
    for (const area of AREAS) {
      for (const theCase of area.cases) {
        const { labels, problems } = await runCase(ctx, theCase, classId);
        classId += ROUNDS;
        if (theCase.control) {
          const lost = labels.filter((l) => l.startsWith('error')).length;
          const note = lost ? theCase.control : 'did not reproduce this run';
          say(`INFO  ${theCase.name}: ${summary(labels)} (${note})`);
        } else if (problems.length) {
          failed++;
          say(`FAIL  ${theCase.name}: ${summary(labels)}`);
          for (const problem of problems) say(`        ${problem}`);
        } else {
          say(`PASS  ${theCase.name}: ${summary(labels)}`);
        }
      }
    }
  } finally {
    for (const area of AREAS) await area.cleanup(db).catch(() => {});
    await db.$disconnect();
  }
  if (failed) throw new SeedError(`${failed} race case(s) failed.`);
});
