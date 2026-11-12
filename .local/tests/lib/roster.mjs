// The simulated class. The seed, wipe and check all read this file, so they
// cannot disagree about who exists.
//
// Fake addresses on a reserved TLD only: the wipe deletes by this exact list, so
// a real address can never be caught by it.

export const SIM = {
  // Not 1: the class from .local/seed.sql also uses groups 1 and 2, so having both
  // exercises the (group_id, class) scoping every query should have.
  crn: 9001,
  domain: 'example.test',
  password: 'nuhire',
  groupCount: 8,
  jobTitle: 'Carbonite', // one of the job descriptions the API seeds for every class
};

const pad2 = (n) => String(n).padStart(2, '0');

export const ADVISOR = {
  role: 'advisor',
  email: `advisor01@${SIM.domain}`,
  firstName: 'Advisor',
  lastName: '01',
};

// Groups 1-6 hold four students each, group 7 holds one, group 8 holds four,
// and the last student has no group at all.
function groupOf(n) {
  if (n <= 24) return Math.ceil(n / 4);
  if (n === 25) return 7;
  if (n <= 29) return 8;
  return null;
}

const DORMANT_NUMBER = 4; // in group 1: on the roster, never logs in

// A student whose Progress row still names their old group: student 12 is in
// group 3 but Progress.group_id says 2. Group 2's progress list (and its
// "current step") includes them; group 3's does not.
export const GHOST_NUMBER = 12;
export const GHOST_OLD_GROUP = 2;

export const STUDENTS = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  return {
    role: 'student',
    n,
    email: `student${pad2(n)}@${SIM.domain}`,
    firstName: 'Student',
    lastName: pad2(n),
    group: groupOf(n),
    dormant: n === DORMANT_NUMBER,
  };
});

export const ACCOUNTS = [ADVISOR, ...STUDENTS];
export const SIM_EMAILS = ACCOUNTS.map((a) => a.email);

export const membersOf = (group) => STUDENTS.filter((s) => s.group === group);
// Students who can act: the dormant one never does, and the one with no group
// belongs to none.
export const activeMembersOf = (group) => membersOf(group).filter((s) => !s.dormant);
export const GROUP_IDS = Array.from({ length: SIM.groupCount }, (_, i) => i + 1);
