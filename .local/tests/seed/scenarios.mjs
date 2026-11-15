// A scenario is how far each group has got after the base seed. Each is a *plan*
// per group (step, resumes voted, interviews rated, offer submitted): `apply`
// writes the rows a plan implies and `verify` derives the API's expected answers
// from the same plan, so a scenario that drifts from the app fails `seed:check`.
//
// Group 1 holds the student who never logs in. Past `fresh` everyone else in it
// has finished the resume review, and because the gates count only students who
// showed up, its barrier reads 3 of 3 and is open.
//
// A student's step is spelled three ways (Progress.step, Users.current_page, the
// route) and the client guard trusts Progress.step, so a scenario writes Progress
// and current_page together or the student is bounced to the dashboard.

import { SeedError, say } from '../lib/util.mjs';
import { placeholders, transaction } from '../lib/db.mjs';
import { callApi } from '../lib/login.mjs';
import {
  GHOST_NUMBER,
  GHOST_OLD_GROUP,
  GROUP_IDS,
  SIM,
  SIM_EMAILS,
  STUDENTS,
  activeMembersOf,
} from '../lib/roster.mjs';

const RESUME_COUNT = 10;
const SHORTLIST_OFFSETS = [0, 2, 4, 6]; // four resumes, spread through the ten

// Users.current_page for each Progress.step (see frontend useProgress.tsx and the
// pages that write current_page).
const STEP_PAGE = {
  res_1: 'resumepage',
  res_2: 'resumepage2',
  interview: 'interviewpage',
  offer: 'makeofferpage',
};

export const STEP_ORDER = [
  'none',
  'job_description',
  'res_1',
  'res_2',
  'interview',
  'offer',
  'employer',
];
const reached = (step, target) => STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(target);

const all = (count, n) => Array(n).fill(count);
const cycle = (pattern, n) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);

// Where group `group` stands in scenario `name`. votes[i] and ratings[i] belong to
// activeMembersOf(group)[i].
function plan(name, group) {
  const n = activeMembersOf(group).length;
  if (name === 'fresh') return { step: null, votes: all(0, n), ratings: all(0, n), offer: false };

  // Group 1, identical in every scenario after `fresh`: everyone who can act has
  // finished and nobody has moved on yet. The dormant student is not waited for.
  const reviewed = { step: 'res_1', votes: all(RESUME_COUNT, n), ratings: all(0, n), offer: false };
  if (group === 1 && name !== 'mid-resume-review') return reviewed;

  if (name === 'mid-resume-review') {
    // Progress varies within each group and nobody finishes, so no barrier opens.
    const votes = n === 1 ? [5] : cycle([RESUME_COUNT, 6, 3, 0], n);
    return { step: 'res_1', votes, ratings: all(0, n), offer: false };
  }

  if (name === 'waiting-on-group') {
    if (group === 2) return { ...reviewed, votes: cycle([10, 10, 10, 6], n) }; // one slow member
    if (group === 8) return { ...reviewed, votes: cycle([10, 10, 4, 4], n) }; // two still voting
    // Through the barrier and reviewing the shortlist together.
    return { step: 'res_2', votes: all(RESUME_COUNT, n), ratings: all(0, n), offer: false };
  }

  const interviewing = (ratings, offer) => ({
    step: offer === undefined ? 'interview' : 'offer',
    votes: all(RESUME_COUNT, n),
    ratings,
    offer: offer ?? false,
  });
  if (name === 'interview-stage') {
    return interviewing(n === 1 ? [2] : cycle([4, 3, 1, 0], n));
  }
  // offers-pending: groups 2-6 have submitted an offer; groups 7 and 8 are still deciding.
  return interviewing(all(4, n), group >= 2 && group <= 6);
}

const finishedReview = (p) => p.votes.filter((v) => v === RESUME_COUNT).length;
const finishedInterviews = (p) => p.ratings.filter((r) => r === 4).length;
const shortlist = (resumeIds, group) =>
  SHORTLIST_OFFSETS.map((offset) => resumeIds[(group + offset) % resumeIds.length]);

async function apply(name, { conn }) {
  const [resumes] = await conn.query('SELECT id FROM Resume_pdfs WHERE class_id = ? ORDER BY id', [
    SIM.crn,
  ]);
  const resumeIds = resumes.map((row) => row.id);
  if (resumeIds.length < RESUME_COUNT) {
    throw new SeedError(
      `Class ${SIM.crn} has ${resumeIds.length} resumes, expected ${RESUME_COUNT}.`
    );
  }
  const [users] = await conn.query(
    `SELECT id, email FROM Users WHERE email IN (${placeholders(SIM_EMAILS)})`,
    SIM_EMAILS
  );
  const idOf = new Map(users.map((row) => [row.email, row.id]));

  await transaction(conn, async () => {
    for (const group of GROUP_IDS) {
      const p = plan(name, group);
      if (p.step === null) continue;

      await conn.query('UPDATE GroupsInfo SET started = 1 WHERE class_id = ? AND group_id = ?', [
        SIM.crn,
        group,
      ]);
      const picked = shortlist(resumeIds, group);
      const members = activeMembersOf(group);

      // Stamp the whole group in one statement, as the socket would before anyone
      // finishes. The barrier compares second-resolution stamps, so stamping each
      // student in turn lets the clock tick mid-group and later members read as
      // late arrivals, releasing the barrier early.
      const memberIds = members.map((student) => idOf.get(student.email));
      await conn.query(
        `UPDATE Users SET current_page = ?, seen = 1, present_at = CURRENT_TIMESTAMP
          WHERE id IN (${placeholders(memberIds)})`,
        [STEP_PAGE[p.step], ...memberIds]
      );

      for (const [i, student] of members.entries()) {
        const id = idOf.get(student.email);
        // The ghost's Progress row is the one still naming their old group.
        const progressGroup = student.n === GHOST_NUMBER ? GHOST_OLD_GROUP : group;
        await conn.query(
          `INSERT INTO Progress (crn, group_id, step, email) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE crn = VALUES(crn), group_id = VALUES(group_id), step = VALUES(step)`,
          [SIM.crn, progressGroup, p.step, student.email]
        );

        const votes = resumeIds.slice(0, p.votes[i]).map((resumeId, k) => [
          id,
          group,
          SIM.crn,
          20 + (k % 5) * 7,
          resumeId, // resume_number is the Resume_pdfs.id, not 1..10
          (student.n + k) % 4 === 0 ? 'no' : 'yes',
        ]);
        if (votes.length > 0) {
          await conn.query(
            'INSERT INTO Resume (student_id, group_id, class, timespent, resume_number, vote) VALUES ?',
            [votes]
          );
        }
        if (p.votes[i] === RESUME_COUNT) {
          await conn.query(
            "INSERT IGNORE INTO Step_Completion (student_id, class, group_id, step) VALUES (?, ?, ?, 'res_1')",
            [id, SIM.crn, group]
          );
        }

        if (reached(p.step, 'interview')) {
          await conn.query(
            'INSERT IGNORE INTO GroupConfirmations (group_id, class, student_id) VALUES (?, ?, ?)',
            [group, SIM.crn, id]
          );
        }
        const rated = picked.slice(0, p.ratings[i]).map((candidateId, k) => [
          id,
          group,
          SIM.crn,
          ...[0, 1, 2, 3].map((q) => (student.n + k + q) % 2),
          candidateId, // candidate_id is the Resume_pdfs.id as well
        ]);
        if (rated.length > 0) {
          await conn.query(
            `INSERT INTO InterviewPage
               (student_id, group_id, class, question1, question2, question3, question4, candidate_id)
             VALUES ?`,
            [rated]
          );
        }
        if (p.ratings[i] === 4) {
          // Interview_Status.group_id is a varchar, unlike the other tables.
          await conn.query(
            'INSERT INTO Interview_Status (student_id, finished, group_id, class) VALUES (?, 1, ?, ?)',
            [id, String(group), SIM.crn]
          );
        }
      }

      if (reached(p.step, 'interview')) {
        // The group shortlisted four resumes. `checked` is group-level, so it is
        // set on every member's rows for those resumes.
        await conn.query(
          `UPDATE Resume SET checked = 1 WHERE group_id = ? AND class = ? AND resume_number IN (${placeholders(picked)})`,
          [group, SIM.crn, ...picked]
        );
        // The popup scores are the group's summed answers per candidate.
        await conn.query(
          `INSERT INTO InterviewPopup (candidate_id, group_id, class, question1, question2, question3, question4)
           SELECT candidate_id, group_id, class, SUM(question1), SUM(question2), SUM(question3), SUM(question4)
           FROM InterviewPage WHERE group_id = ? AND class = ? GROUP BY candidate_id, group_id, class
           ON DUPLICATE KEY UPDATE question1 = VALUES(question1), question2 = VALUES(question2),
             question3 = VALUES(question3), question4 = VALUES(question4)`,
          [group, SIM.crn]
        );
      }
      if (p.offer) {
        await conn.query(
          "INSERT INTO Offers (group_id, class_id, candidate_id, status) VALUES (?, ?, ?, 'pending')",
          [group, SIM.crn, picked[0]]
        );
      }
    }

    // The stale-Progress student exists in every scenario. `fresh` writes no
    // progress, so give them the one row job assignment leaves, naming the old
    // group; INSERT IGNORE leaves the row the loop wrote in the other scenarios.
    const ghost = STUDENTS.find((s) => s.n === GHOST_NUMBER);
    await conn.query(
      "INSERT IGNORE INTO Progress (crn, group_id, step, email) VALUES (?, ?, 'job_description', ?)",
      [SIM.crn, GHOST_OLD_GROUP, ghost.email]
    );
  });
}

// Asks the real API, as the advisor, and the database for what the plan says
// should be true. Returns a list of problems; empty means the scenario is intact.
async function verify(name, { conn, config, sessions, startedByGroup }) {
  const problems = [];
  const advisor = sessions.find((entry) => entry.account.role === 'advisor')?.session;
  if (!advisor) return ['The advisor could not log in, so the scenario was not checked.'];
  const get = async (path) => (await callApi(config, advisor, 'GET', path)).json();

  for (const group of GROUP_IDS) {
    const p = plan(name, group);
    const label = `group ${group}`;
    const wantStarted = p.step !== null;
    if ((startedByGroup.get(group) ?? false) !== wantStarted) {
      problems.push(`${label}: started is ${!wantStarted}, expected ${wantStarted}`);
    }

    // The resume-review barrier, answered by the same code the students hit. It
    // counts only students who showed up, which in a started group is everyone
    // but the dormant student.
    const total = wantStarted ? activeMembersOf(group).length : 0;
    const completed = finishedReview(p);
    const barrier = await get(`/groups/barrier-status/${SIM.crn}/${group}?step=res_1`);
    const wantReleased = total > 0 && completed === total;
    if (
      barrier.completedCount !== completed ||
      barrier.totalCount !== total ||
      barrier.released !== wantReleased
    ) {
      problems.push(
        `${label}: barrier is ${barrier.completedCount}/${barrier.totalCount} released=${barrier.released}, ` +
          `expected ${completed}/${total} released=${wantReleased}`
      );
    }

    if (reached(p.step ?? 'none', 'interview')) {
      const { finishedCount } = await get(
        `/interview/status/finished-count?group_id=${group}&class_id=${SIM.crn}`
      );
      if (finishedCount !== finishedInterviews(p)) {
        problems.push(
          `${label}: ${finishedCount} finished interviews, expected ${finishedInterviews(p)}`
        );
      }
    }
    if (name === 'offers-pending') {
      const offers = await get(`/offers/group/${group}/class/${SIM.crn}`);
      if (offers.length !== (p.offer ? 1 : 0)) {
        problems.push(`${label}: ${offers.length} offers, expected ${p.offer ? 1 : 0}`);
      }
    }
  }

  // The three vocabularies must agree for everyone who is meant to have moved.
  const [rows] = await conn.query(
    `SELECT u.email, u.group_id, u.current_page, p.step, p.group_id AS progress_group
       FROM Users u LEFT JOIN Progress p ON p.email = u.email
      WHERE u.class = ? AND u.affiliation = 'student'`,
    [SIM.crn]
  );
  const byEmail = new Map(rows.map((row) => [row.email, row]));
  for (const student of STUDENTS) {
    const row = byEmail.get(student.email);
    if (!row) continue; // reported by the base checks
    if (student.dormant && row.step !== null) {
      problems.push(`${student.email} never logs in but has a Progress row`);
    }
    if (student.group === null || student.dormant || name === 'fresh') continue;
    const p = plan(name, student.group);
    if (row.step !== p.step || row.current_page !== STEP_PAGE[p.step]) {
      problems.push(
        `${student.email}: step ${row.step} / page ${row.current_page}, expected ${p.step} / ${STEP_PAGE[p.step]}`
      );
    }
  }
  const ghost = STUDENTS.find((s) => s.n === GHOST_NUMBER);
  const ghostRow = byEmail.get(ghost.email);
  if (
    ghostRow &&
    (ghostRow.progress_group !== GHOST_OLD_GROUP || ghostRow.group_id === GHOST_OLD_GROUP)
  ) {
    problems.push(
      `${ghost.email}: Progress names group ${ghostRow.progress_group} but they are in ${ghostRow.group_id}; ` +
        `the stale row should name group ${GHOST_OLD_GROUP}`
    );
  }

  say(`  checked ${GROUP_IDS.length} groups against the API`);
  return problems;
}

// What each one holds is described once, in .local/tests/README.md.
export const SCENARIO_NAMES = [
  'fresh',
  'mid-resume-review',
  'waiting-on-group',
  'interview-stage',
  'offers-pending',
];

const SCENARIOS = Object.fromEntries(
  SCENARIO_NAMES.map((name) => [
    name,
    { apply: (context) => apply(name, context), verify: (context) => verify(name, context) },
  ])
);

export function getScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    throw new SeedError(`Unknown scenario "${name}". Choose one of: ${SCENARIO_NAMES.join(', ')}.`);
  }
  return scenario;
}
