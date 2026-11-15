// npm run seed:wipe [-- --yes] [--keep-keycloak]
//
// Removes the simulated class from MySQL and its accounts from Keycloak, by the
// exact emails in ../lib/roster.mjs and the class number, after checking the
// class holds nobody else. `seed:reset` uses --keep-keycloak to stay fast.

import readline from 'node:readline/promises';
import { assertClassIsOurs, clearStudentWork, countClassData } from '../lib/cleanup.mjs';
import { connect, placeholders, transaction } from '../lib/db.mjs';
import { loadConfig } from '../lib/env.mjs';
import { createKeycloakAdmin } from '../lib/keycloak-admin.mjs';
import { ACCOUNTS, ADVISOR, SIM, SIM_EMAILS } from '../lib/roster.mjs';
import { SeedError, mapLimit, parseArgs, run, say } from '../lib/util.mjs';

async function confirm(counts, keepKeycloak) {
  const rows = Object.entries(counts);
  say(`This will delete simulated class ${SIM.crn}:`);
  if (rows.length === 0) say('  (no database rows found)');
  for (const [table, n] of rows) say(`  ${String(n).padStart(5)}  ${table}`);
  if (!keepKeycloak) say(`  and the ${ACCOUNTS.length} simulated Keycloak accounts, if present.`);

  if (!process.stdin.isTTY) {
    throw new SeedError('Not a terminal, so nothing was deleted. Pass --yes to confirm.');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nType ${SIM.crn} to continue: `);
  rl.close();
  if (answer.trim() !== String(SIM.crn)) throw new SeedError('Cancelled. Nothing was deleted.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['yes', 'keep-keycloak'] });
  const config = loadConfig();
  const conn = await connect(config);

  try {
    // Refuses if class SIM.crn belongs to someone else or holds other accounts.
    await assertClassIsOurs(conn);

    if (!args.yes) await confirm(await countClassData(conn), args['keep-keycloak']);

    say('Database');
    await transaction(conn, async () => {
      await clearStudentWork(conn);
      await conn.query('DELETE FROM WaitingFacts WHERE class_id = ?', [SIM.crn]);
      await conn.query(
        `DELETE FROM Users WHERE email IN (${placeholders(SIM_EMAILS)})`,
        SIM_EMAILS
      );
      // Cascades to GroupsInfo, job_descriptions, Job_Assignment, Resume_pdfs,
      // Candidates and the interview videos.
      await conn.query('DELETE FROM Moderator WHERE crn = ? AND admin_email = ?', [
        SIM.crn,
        ADVISOR.email,
      ]);
    });
    say(`  class ${SIM.crn} and its ${ACCOUNTS.length} users removed`);
  } finally {
    await conn.end();
  }

  if (args['keep-keycloak']) {
    say('Keycloak accounts kept');
    return;
  }
  say('Keycloak accounts');
  const keycloak = createKeycloakAdmin(config);
  const outcomes = await mapLimit(ACCOUNTS, 6, (account) => keycloak.deleteUser(account.email));
  say(`  ${outcomes.filter((outcome) => outcome === 'deleted').length} deleted`);
}

run(main);
