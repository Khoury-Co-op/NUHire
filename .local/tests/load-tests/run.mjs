// INFRA-14 load test. `npm run load [-- --restart]`; see docs/LOAD_TEST.md.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { io } from 'socket.io-client';
import { ROOT, loadConfig } from '../lib/env.mjs';
import { STUDENTS, activeMembersOf } from '../lib/roster.mjs';
import { SeedError, http, parseArgs, run, say } from '../lib/util.mjs';
import { Advisor } from './advisor.mjs';
import { TEACHER_NOTICE_MS, expectedStep, sleep } from './journey.mjs';
import { BURST_LIMIT_MS, HANG_MS, Metrics, P95_LIMIT_MS, markdownTable } from './metrics.mjs';
import { Student } from './student.mjs';

const exec = promisify(execFile);
const compose = (...args) =>
  exec('docker', ['compose', '-f', 'compose.dev.yaml', ...args], { cwd: ROOT });

// Whether the API refuses a socket with no session, for the report.
function socketAuthMode(config) {
  const socket = io(config.apiUrl, { transports: ['websocket'], reconnection: false });
  return new Promise((resolve) => {
    socket.on('connect', () => resolve('off'));
    socket.on('connect_error', () => resolve('on'));
  }).finally(() => socket.close());
}

// A crash, as in class: SIGKILL the server process, keep it down for
// OUTAGE_MS, then let node --watch start it once. Killing the container
// instead makes the dev image restart the server twice (tsc --watch rebuilds
// at boot), which production never does. Keycloak is never touched.
const OUTAGE_MS = 5_000;

async function crashApi(h) {
  let up;
  h.apiUp = new Promise((resolve) => (up = resolve));
  h.metrics.outage = true;
  h.metrics.killed = true;
  h.killedAt = performance.now();
  say(`Killing the API for ${OUTAGE_MS / 1000}s...`);
  try {
    await compose(
      'exec',
      '-T',
      'api',
      'pkill',
      '-KILL',
      '-f',
      '^/usr/local/bin/node dist/server.js'
    );
    await sleep(OUTAGE_MS);
  } finally {
    // Always bring the API back, even if the run dies mid-outage.
    await compose('exec', '-T', 'api', 'touch', 'dist/server.js');
  }
  const deadline = performance.now() + 120_000;
  while (!(await http(`${h.config.apiUrl}/health`).catch(() => null))?.ok) {
    if (performance.now() > deadline) throw new Error('API did not come back within 120s');
    await sleep(250);
  }
  h.outageMs = performance.now() - h.killedAt;
  h.metrics.outage = false;
  up();
  say(`API back after ${(h.outageMs / 1000).toFixed(1)}s.`);
}

run(async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ['restart'] });
  const config = loadConfig();
  const students = STUDENTS.filter((s) => !s.dormant);
  const resumeReviewers = students.filter((s) => s.group !== null).length;

  let allReady;
  const readyPromise = new Promise((resolve) => (allReady = resolve));
  const ready = new Set();
  const waitingAt = new Map();
  let completions = 0;
  let landed = 0;
  let lastLanded = 0;
  let restart;

  const h = {
    config,
    metrics: new Metrics(),
    sockets: new Set(),
    problems: [],
    barrierCause: new Map(),
    moveEmitted: new Map(),
    offerAnswered: new Map(),
    finished: false,
    ready(student) {
      ready.add(student.account.email);
      if (ready.size === students.length) allReady();
    },
    landed() {
      landed += 1;
      lastLanded = performance.now();
    },
    completedResReview() {
      completions += 1;
      if (args.restart && !restart && completions >= resumeReviewers / 2) restart = crashApi(h);
    },
    // The teacher force-advances a group once all its active members wait at one gate.
    waiting(student, step) {
      const group = student.account.group;
      const key = `${group}:${step}`;
      const waiting = waitingAt.get(key) ?? new Set();
      // A page reload reports the same student twice; only the last arrival counts.
      if (waiting.has(student.account.email)) return;
      waitingAt.set(key, waiting.add(student.account.email));
      if (waiting.size !== activeMembersOf(group).length) return;
      setTimeout(() => {
        advisor
          .forceAdvance(group, step)
          .catch((error) => h.problems.push(`force-advance group ${group}: ${error.message}`));
      }, TEACHER_NOTICE_MS);
    },
  };

  const startedAt = performance.now();
  const advisor = new Advisor(h);
  await advisor.start();
  const authMode = await socketAuthMode(config);
  say(`SOCKET_AUTH_REQUIRED looks ${authMode}. ${students.length} students logging in...`);

  // By email, so a student who failed and then ended on the wrong step counts once.
  const stuck = new Map();
  const sims = students.map((account) => new Student(h, account));
  const journeys = sims.map((sim) =>
    sim.run().catch((error) => {
      stuck.set(sim.account.email, `at ${sim.at}: ${error.message}`);
      h.ready(sim);
    })
  );

  await readyPromise;
  // Let the last room joins land before the class starts.
  await sleep(1000);
  say('Everyone is waiting. Starting the class.');
  const classStartedAt = performance.now();
  await advisor.startClass();
  await Promise.all(journeys);
  if (restart) await restart;

  // Where everyone ended up, read from the API as the advisor.
  for (const student of STUDENTS) {
    const row = await advisor.call(
      'GET',
      '/progress/user/:email',
      `/progress/user/${encodeURIComponent(student.email)}`
    );
    const step = row?.step ?? null;
    if (step !== expectedStep(student) && !stuck.has(student.email)) {
      stuck.set(student.email, `ended at ${step}, expected ${expectedStep(student)}`);
    }
  }
  h.finished = true;
  h.sockets.forEach((socket) => socket.close());

  const { metrics } = h;
  const api = metrics.apiStats();
  const hangs = metrics.total(metrics.hangs);
  const burstMs = lastLanded - classStartedAt;
  const { stdout: commit } = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT });
  const verdict = (ok) => (ok ? 'PASS' : 'FAIL');
  const criteria = [
    [
      `API p95 under ${P95_LIMIT_MS}ms`,
      `${Math.round(api.p95)}ms over ${api.count} requests` +
        (api.slow.length ? `; slow routes: ${api.slow.join(', ')}` : ''),
      api.p95 < P95_LIMIT_MS && api.slow.length === 0,
    ],
    [`No request unanswered after ${HANG_MS / 1000}s`, `${hangs} hung`, hangs === 0],
    ['No stuck students', `${stuck.size} stuck`, stuck.size === 0],
    [
      `Class-start burst under ${BURST_LIMIT_MS / 1000}s`,
      `${landed} students on the dashboard ${Math.round(burstMs)}ms after start`,
      // lastLanded stays 0 if nobody lands, which would make burstMs negative.
      landed >= resumeReviewers && burstMs >= 0 && burstMs < BURST_LIMIT_MS,
    ],
  ];

  say(
    `\n## ${args.restart ? 'Restart run' : 'Plain run'}, ${new Date().toISOString().slice(0, 10)}\n`
  );
  say(
    `Commit ${commit.trim()}, SOCKET_AUTH_REQUIRED ${authMode}, ${students.length} students + advisor.`
  );
  say(`Run took ${((performance.now() - startedAt) / 1000).toFixed(0)}s.`);
  if (h.outageMs) {
    say(
      `API down for ${(h.outageMs / 1000).toFixed(1)}s; ${metrics.total(metrics.outageErrors)} requests failed from the restart (in that window, or on a connection it dropped) and were retried.`
    );
  }
  say(`Errors outside the outage: ${metrics.total(metrics.errors)}.\n`);
  say(metrics.table());
  say(
    `\n${markdownTable(
      ['Criterion', 'Result', ''],
      criteria.map(([name, result, ok]) => [name, result, verdict(ok)])
    )}`
  );
  for (const [email, reason] of stuck) say(`- ${email} ${reason}`);
  for (const problem of h.problems) say(`- ${problem}`);

  if (criteria.some(([, , ok]) => !ok)) throw new SeedError('Load test failed.');
});
