// npm run seed [-- --scenario=fresh]
//
// Builds the simulated class (see ../lib/roster.mjs) in Keycloak and MySQL.
// Safe to re-run, and nothing outside the class is touched. Needs the local
// stack up: the class and job assignment go through the real API as the advisor.

import { assertClassIsOurs, clearStudentWork } from '../lib/cleanup.mjs';
import { connect, transaction } from '../lib/db.mjs';
import { loadConfig } from '../lib/env.mjs';
import { createKeycloakAdmin } from '../lib/keycloak-admin.mjs';
import { callApi, login } from '../lib/login.mjs';
import { ACCOUNTS, ADVISOR, GROUP_IDS, SIM, STUDENTS } from '../lib/roster.mjs';
import { SeedError, http, mapLimit, parseArgs, run, say } from '../lib/util.mjs';
import { getScenario } from './scenarios.mjs';

// Keycloak imports the realm after the container is healthy, so it can lag behind.
async function assertRealmReady(config) {
  const realm = await http(`${config.keycloakUrl}/realms/${config.realm}`);
  if (!realm.ok) {
    throw new SeedError(
      `Keycloak answered ${realm.status} for realm ${config.realm}. It may still be importing it; wait a moment and retry.`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { values: ['scenario'] });
  const scenarioName = args.scenario ?? 'fresh';
  const scenario = getScenario(scenarioName);

  const config = loadConfig();
  await assertRealmReady(config);
  const conn = await connect(config);

  try {
    // Refuses, before anything is written, if class SIM.crn is not entirely ours.
    const classExists = await assertClassIsOurs(conn);

    say('Keycloak accounts');
    const keycloak = createKeycloakAdmin(config);
    const outcomes = await mapLimit(ACCOUNTS, 6, (account) => keycloak.ensureUser(account));
    const created = outcomes.filter((outcome) => outcome === 'created').length;
    say(`  ${created} created, ${outcomes.length - created} already there`);

    // The advisor's admin row must exist before their first login, or the
    // callback creates it as 'none' and sends them to the signup form.
    say('Advisor');
    await conn.query(
      `INSERT INTO Users (f_name, l_name, email, affiliation, group_id, class, seen)
       VALUES (?, ?, ?, 'admin', NULL, ?, 1)
       ON DUPLICATE KEY UPDATE f_name = VALUES(f_name), l_name = VALUES(l_name),
         affiliation = 'admin', group_id = NULL, class = VALUES(class), seen = 1`,
      [ADVISOR.firstName, ADVISOR.lastName, ADVISOR.email, SIM.crn]
    );

    let advisorSession = null;
    const advisor = async () =>
      (advisorSession ??= await login(config, { email: ADVISOR.email, password: SIM.password }));

    // Created through the API so it gets the usual job descriptions, resumes and
    // candidates. The endpoint errors on a duplicate CRN, hence the check above.
    say('Class');
    if (classExists) {
      say(`  ${SIM.crn} already exists`);
    } else {
      await callApi(config, await advisor(), 'POST', '/moderator/crns', {
        admin_email: ADVISOR.email,
        crn: SIM.crn,
      });
      say(`  ${SIM.crn} created`);
    }

    // GroupsInfo has no unique key on (class_id, group_id), so inserting twice
    // would duplicate every group: clear this class's rows and write them again.
    say('Groups and students');
    await transaction(conn, async () => {
      await clearStudentWork(conn);
      await conn.query('DELETE FROM GroupsInfo WHERE class_id = ?', [SIM.crn]);
      for (const group of GROUP_IDS) {
        await conn.query('INSERT INTO GroupsInfo (class_id, group_id, started) VALUES (?, ?, 0)', [
          SIM.crn,
          group,
        ]);
      }
      for (const student of STUDENTS) {
        await conn.query(
          `INSERT INTO Users (f_name, l_name, email, affiliation, group_id, class, seen, current_page)
           VALUES (?, ?, ?, 'student', ?, ?, 0, NULL)
           ON DUPLICATE KEY UPDATE f_name = VALUES(f_name), l_name = VALUES(l_name),
             affiliation = 'student', group_id = VALUES(group_id), class = VALUES(class),
             seen = 0, current_page = NULL`,
          [student.firstName, student.lastName, student.email, student.group, SIM.crn]
        );
      }
    });

    // Runs after the roster exists and before the scenario writes anything: it
    // deletes each group's work, and it sets current_page for every student.
    say('Job assignment');
    await callApi(config, await advisor(), 'POST', '/jobs/assign-job-to-all', {
      class_id: SIM.crn,
      job_title: SIM.jobTitle,
    });
    say(`  ${SIM.jobTitle} assigned to all ${GROUP_IDS.length} groups`);

    say(`Scenario: ${scenarioName}`);
    say('  (what it holds: .local/tests/README.md#scenarios)');
    await scenario.apply({ conn, config, advisor });

    const [sizes] = await conn.query(
      `SELECT group_id, COUNT(*) AS n FROM Users
       WHERE class = ? AND affiliation = 'student' GROUP BY group_id ORDER BY group_id`,
      [SIM.crn]
    );
    say(`\nClass ${SIM.crn}`);
    for (const { group_id: group, n } of sizes) {
      const label = group === null ? 'no group' : `group ${group}`;
      say(`  ${label.padEnd(8)}  ${n} student${n === 1 ? '' : 's'}`);
    }
    say(
      `\nLog in at ${config.frontUrl} as ${ADVISOR.email} or student01@${SIM.domain} .. student30@${SIM.domain}`
    );
    say(`Password for all: ${SIM.password}`);
    say(`Check it:  npm run seed:check`);
  } finally {
    await conn.end();
  }
}

run(main);
