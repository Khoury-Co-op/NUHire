// Shared by run.mjs and the case files.

// A whole group submitting at once is about 4 writers; a class is 30.
export const WRITERS = 30;
export const ROUNDS = 5;

// The class ids the cases write under. Nothing real or seeded is this high, and
// run.mjs deletes every case's rows in this range before and after a run.
export const RACE_CLASS_MIN = 990000;
export const RACE_CLASS_MAX = 990999;
export const inRaceRange = { gte: RACE_CLASS_MIN, lte: RACE_CLASS_MAX };

// What one writer's call came to: the label it returned, or the Prisma code it
// failed with.
export function outcome(settled) {
  if (settled.status === 'fulfilled') return String(settled.value);
  return `error ${settled.reason?.code ?? settled.reason?.message ?? settled.reason}`;
}

export const countOf = (labels, label) => labels.filter((l) => l === label).length;

// Problems with one round's labels: any failed writer, or a label whose count
// is not the expected one.
export function expectCounts(labels, expected) {
  const problems = [];
  const errors = labels.filter((l) => l.startsWith('error'));
  if (errors.length) problems.push(`${errors.length} of ${labels.length} failed (${errors[0]})`);
  for (const [label, want] of Object.entries(expected)) {
    const got = countOf(labels, label);
    if (got !== want) problems.push(`expected ${want} "${label}", got ${got}`);
  }
  return problems;
}
