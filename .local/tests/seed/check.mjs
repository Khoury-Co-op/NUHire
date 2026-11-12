// npm run seed:check [-- --scenario=fresh] [--include-dormant]
//
// Confirms the simulated class is usable: every account exists in Keycloak and
// MySQL as the roster says, and every one that is meant to log in really can,
// through the real login, and lands where the API sends that person.
// Exits non-zero if anything is off.

import { connect, placeholders } from '../lib/db.mjs';
import { loadConfig } from '../lib/env.mjs';
import { createKeycloakAdmin } from '../lib/keycloak-admin.mjs';
import { login } from '../lib/login.mjs';
import { ACCOUNTS, ADVISOR, GROUP_IDS, SIM, SIM_EMAILS, STUDENTS } from '../lib/roster.mjs';
import { SeedError, mapLimit, parseArgs, run, say } from '../lib/util.mjs';
import { SCENARIO_NAMES, getScenario } from './scenarios.mjs';

// Where the login callback sends someone, from auth.controller.ts: advisors to
// their dashboard; students to /waitingGroup until their group has started
// (or when they have no group at all), then /about the first time and
// /dashboard after that.
function expectedLanding(account, row, groupStarted) {
  if (account.role === 'advisor') return '/advisor-dashboard';
  if (!groupStarted) return '/waitingGroup';
  return row.seen === 1 ? '/dashboard' : '/about';
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    flags: ['include-dormant'],
    values: ['scenario'],
  });
  const scenarioName = args.scenario ?? 'fresh';
  const defaulted = args.scenario === undefined;
  const scenario = getScenario(scenarioName);

  const config = loadConfig();
  const conn = await connect(config);
  const problems = [];

  try {
    say('Keycloak');
    const keycloak = createKeycloakAdmin(config);
    const found = await mapLimit(ACCOUNTS, 6, (account) => keycloak.find(account.email));
    ACCOUNTS.forEach((account, i) => {
      if (!found[i]) problems.push(`Keycloak is missing ${account.email} (run: npm run seed)`);
    });
    say(`  ${found.filter(Boolean).length} of ${ACCOUNTS.length} accounts present`);

    say('Database');
    const [users] = await conn.query(
      `SELECT email, affiliation, group_id, class, seen FROM Users WHERE email IN (${placeholders(SIM_EMAILS)})`,
      SIM_EMAILS
    );
    const byEmail = new Map(users.map((row) => [row.email, row]));
    for (const account of ACCOUNTS) {
      const row = byEmail.get(account.email);
      if (!row) {
        problems.push(`Database is missing ${account.email} (run: npm run seed)`);
        continue;
      }
      const wantAffiliation = account.role === 'advisor' ? 'admin' : 'student';
      const wantGroup = account.role === 'advisor' ? null : account.group;
      if (row.affiliation !== wantAffiliation)
        problems.push(`${account.email}: affiliation is ${row.affiliation}`);
      if (row.class !== SIM.crn) problems.push(`${account.email}: class is ${row.class}`);
      if (row.group_id !== wantGroup)
        problems.push(`${account.email}: group is ${row.group_id}, expected ${wantGroup}`);
    }

    const [groups] = await conn.query(
      'SELECT group_id, started FROM GroupsInfo WHERE class_id = ? ORDER BY group_id',
      [SIM.crn]
    );
    const startedByGroup = new Map(groups.map((g) => [g.group_id, g.started === 1]));
    const wantGroups = GROUP_IDS.join(',');
    if (groups.map((g) => g.group_id).join(',') !== wantGroups) {
      problems.push(
        `GroupsInfo has groups [${groups.map((g) => g.group_id)}], expected [${wantGroups}]`
      );
    }
    const [jobs] = await conn.query(
      'SELECT COUNT(*) AS n FROM Job_Assignment WHERE class = ? AND job = ?',
      [SIM.crn, SIM.jobTitle]
    );
    if (jobs[0].n !== GROUP_IDS.length) {
      problems.push(`${jobs[0].n} of ${GROUP_IDS.length} groups have the job assigned`);
    }
    say(`  ${users.length} users, ${groups.length} groups, ${jobs[0].n} job assignments`);

    // The dormant student is only checked for existence unless asked: that
    // account exists to never be used.
    // Accounts already reported missing above would only fail again here.
    const toLogIn = ACCOUNTS.filter(
      (a, i) => found[i] && byEmail.has(a.email) && (!a.dormant || args['include-dormant'])
    );
    say(`Logging in ${toLogIn.length} accounts through Keycloak`);
    const sessions = await mapLimit(toLogIn, 6, async (account) => {
      try {
        const session = await login(config, { email: account.email, password: SIM.password });
        const row = byEmail.get(account.email);
        const want = expectedLanding(account, row, startedByGroup.get(row.group_id) ?? false);
        if (session.landing !== want) {
          problems.push(`${account.email}: landed on ${session.landing}, expected ${want}`);
        }
        return { account, session, landing: session.landing };
      } catch (error) {
        problems.push(error.message);
        return { account, error: error.message };
      }
    });
    for (const { account, landing, error } of sessions) {
      const group = account.role === 'advisor' ? 'advisor' : (account.group ?? 'none');
      say(
        `  ${account.email.padEnd(28)} group ${String(group).padEnd(7)} ${error ? 'FAILED' : landing}`
      );
    }

    say(`Scenario: ${scenarioName}`);
    problems.push(...(await scenario.verify({ conn, config, sessions, startedByGroup })));
  } finally {
    await conn.end();
  }

  if (problems.length > 0) {
    // The default is `fresh`, so checking a class seeded as another scenario fails
    // in confusing ways. Say how to name the one that was seeded.
    const hint = defaulted
      ? `\n\nChecked the default scenario, "fresh". If you seeded another, name it:\n  npm run seed:check -- --scenario=<${SCENARIO_NAMES.join('|')}>`
      : '';
    throw new SeedError(`\n${problems.length} problem(s):\n  - ${problems.join('\n  - ')}${hint}`);
  }
  say(`\nAll good: ${STUDENTS.length} students and ${ADVISOR.email} are ready.`);
}

run(main);
