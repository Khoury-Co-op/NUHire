import { placeholders } from './db.mjs';
import { ADVISOR, SIM, SIM_EMAILS } from './roster.mjs';
import { SeedError } from './util.mjs';

// Table and column names below are constants in this file, never input, so they
// are interpolated; every value still goes through a placeholder (rule 7).

// Rows keyed on a student. The seed keeps the Users rows, so nothing cascades
// and these are cleared by hand.
const BY_STUDENT_ID = ['Step_Completion', 'GroupConfirmations', 'Resume', 'Resumepage'];

// Rows keyed on the class that have no foreign key to Moderator, so deleting
// the class does not remove them either.
const BY_CLASS = [
  ['Progress', 'crn'],
  ['Offers', 'class_id'],
  ['InterviewPage', 'class'],
  ['InterviewPopup', 'class'],
  ['Interview_Status', 'class'],
  ['Offer_Status', 'class'],
  ['MakeOfferPage', 'class'],
  ['Res2_Status', 'class'],
  ['Resumepage2', 'class'],
];

// Throws unless class SIM.crn is entirely ours; returns whether it exists. Run
// before anything destructive, so a real class number in SIM.crn is never deleted.
export async function assertClassIsOurs(conn) {
  const [moderators] = await conn.query('SELECT admin_email FROM Moderator WHERE crn = ?', [
    SIM.crn,
  ]);
  if (moderators.length > 0 && moderators[0].admin_email !== ADVISOR.email) {
    throw new SeedError(
      `Class ${SIM.crn} already belongs to ${moderators[0].admin_email}, not ${ADVISOR.email}. ` +
        `Refusing to touch it. Pick another SIM.crn in .local/tests/lib/roster.mjs.`
    );
  }

  const [strangers] = await conn.query(
    `SELECT email FROM Users WHERE class = ? AND email NOT IN (${placeholders(SIM_EMAILS)})`,
    [SIM.crn, ...SIM_EMAILS]
  );
  if (strangers.length > 0) {
    throw new SeedError(
      `Class ${SIM.crn} contains accounts that are not simulated: ` +
        `${strangers.map((row) => row.email).join(', ')}. Refusing to continue.`
    );
  }

  // The other direction: our accounts must only live in our class.
  // clearStudentWork deletes by student id with no class filter (Resumepage has
  // no class column), so a simulated account someone moved into a real class
  // would take that class's work with it.
  const [misplaced] = await conn.query(
    `SELECT email, class FROM Users WHERE email IN (${placeholders(SIM_EMAILS)})
       AND (class IS NULL OR class <> ?)`,
    [...SIM_EMAILS, SIM.crn]
  );
  if (misplaced.length > 0) {
    throw new SeedError(
      `Simulated accounts outside class ${SIM.crn}: ` +
        `${misplaced.map((row) => `${row.email} (class ${row.class})`).join(', ')}. ` +
        `Move them back or delete them first. Refusing to continue.`
    );
  }
  return moderators.length > 0;
}

export async function simStudentIds(conn) {
  const [rows] = await conn.query(
    `SELECT id FROM Users WHERE email IN (${placeholders(SIM_EMAILS)})`,
    SIM_EMAILS
  );
  return rows.map((row) => row.id);
}

// Deletes everything the simulated class's people have produced, keeping the
// class, its groups and its users. Call inside a transaction.
export async function clearStudentWork(conn) {
  const ids = await simStudentIds(conn);
  if (ids.length > 0) {
    for (const table of BY_STUDENT_ID) {
      await conn.query(`DELETE FROM ${table} WHERE student_id IN (${placeholders(ids)})`, ids);
    }
  }
  for (const [table, column] of BY_CLASS) {
    await conn.query(`DELETE FROM ${table} WHERE ${column} = ?`, [SIM.crn]);
  }
  await conn.query(
    `DELETE FROM Notes WHERE user_email IN (${placeholders(SIM_EMAILS)})`,
    SIM_EMAILS
  );
}

// What a wipe would remove, for the confirmation prompt: row counts per table.
export async function countClassData(conn) {
  const counts = {};
  const count = async (label, sql, params) => {
    const [[row]] = await conn.query(sql, params);
    if (row.n > 0) counts[label] = row.n;
  };

  await count(
    'Users',
    `SELECT COUNT(*) AS n FROM Users WHERE email IN (${placeholders(SIM_EMAILS)})`,
    SIM_EMAILS
  );
  await count('GroupsInfo', 'SELECT COUNT(*) AS n FROM GroupsInfo WHERE class_id = ?', [SIM.crn]);
  await count('Job_Assignment', 'SELECT COUNT(*) AS n FROM Job_Assignment WHERE class = ?', [
    SIM.crn,
  ]);
  await count('job_descriptions', 'SELECT COUNT(*) AS n FROM job_descriptions WHERE class_id = ?', [
    SIM.crn,
  ]);
  await count('Resume_pdfs', 'SELECT COUNT(*) AS n FROM Resume_pdfs WHERE class_id = ?', [SIM.crn]);
  await count('WaitingFacts', 'SELECT COUNT(*) AS n FROM WaitingFacts WHERE class_id = ?', [
    SIM.crn,
  ]);
  for (const [table, column] of BY_CLASS) {
    await count(table, `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, [SIM.crn]);
  }
  const ids = await simStudentIds(conn);
  if (ids.length > 0) {
    for (const table of BY_STUDENT_ID) {
      await count(
        table,
        `SELECT COUNT(*) AS n FROM ${table} WHERE student_id IN (${placeholders(ids)})`,
        ids
      );
    }
  }
  await count(
    'Notes',
    `SELECT COUNT(*) AS n FROM Notes WHERE user_email IN (${placeholders(SIM_EMAILS)})`,
    SIM_EMAILS
  );
  return counts;
}
