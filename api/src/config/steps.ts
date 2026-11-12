// src/config/steps.ts

import { PoolConnection } from 'mysql2/promise';
import { User } from '../models/User';
import { RES_REVIEW_BARRIER_STEP } from './socket';
import { dbNow } from './database';

// The `Progress`.`step` values, in the order a group walks them. Shared by
// getProgress (which wants the group's leftmost member) and forceAdvance (which
// needs to know what comes before the step it is pushing the group to).
export const STEP_ORDER = [
  'none',
  'job_description',
  'res_1',
  'res_2',
  'interview',
  'offer',
  'employer',
] as const;

// STEP_ORDER is `as const`; lookups by an arbitrary string need a widened view.
const ORDER: readonly string[] = STEP_ORDER;

// checks that request is valid
export const isStep = (step: unknown): step is string =>
  typeof step === 'string' && ORDER.includes(step);

export type StepDecision = 'allow' | 'noop' | 'reject';

// stored: what the DB has (null/undefined counts as "none")
// moved:  the stored row belongs to a different class or group than the
//         student is in now, e.g. a professor moved them mid-activity
// allow  = exactly one step ahead, or any step after a move
// noop   = same step or earlier, nothing to write
// reject = skipping ahead
export function decideStep(
  stored: string | null | undefined,
  incoming: string,
  moved = false
): StepDecision {
  const from = ORDER.indexOf(stored ?? 'none');
  const to = ORDER.indexOf(incoming);
  if (to === -1) {
    return 'reject';
  }
  // A moved student starts over wherever their new group's page puts them,
  // so the old group's step says nothing about what they may do now.
  if (moved) {
    return 'allow';
  }
  if (from === -1) {
    return 'reject';
  }
  if (to <= from) {
    return 'noop';
  }
  if (to === from + 1) {
    return 'allow';
  }

  return 'reject';
}

// Where each step is rendered. This duplicates STEP_TO_ROUTE in
// frontend/src/app/components/useProgress.tsx because the two live in different
// processes; they have to be changed together. It exists here only because
// moveGroup carries a route path, which is what every page's handler compares
// against — sending a step name instead would be silently ignored by all of
// them and the group would stay put.
export const STEP_TO_ROUTE: Record<string, string> = {
  none: '/dashboard',
  job_description: '/jobdes',
  res_1: '/res-review',
  res_2: '/res-review-group',
  interview: '/interview-stage',
  offer: '/makeOffer',
  employer: '/employerPanel',
};

// A group is wherever its slowest member is. Rows at 'none' are members who
// have not started and do not hold the group back; an unknown value sorts
// first, so a bad row surfaces as the group's step rather than vanishing.
//
// One function for both readers on purpose. getProgress is what the advisor
// dashboard shows the professor, and forceAdvance decides what it will accept
// from that same number; if the two computed it differently the professor
// would be refused a move the screen in front of them said was next.
export function leftmostStep(steps: string[]): string {
  const order: readonly string[] = STEP_ORDER;
  const started = steps.filter((step) => step !== 'none');
  if (started.length === 0) return 'none';
  return started.reduce((earliest, current) =>
    order.indexOf(current) < order.indexOf(earliest) ? current : earliest
  );
}

// The step a late student should join their group at, or null when there is
// nothing to catch up on. Only once the group is through the solo resume review:
// until then the student is still waited for and does it like everyone else,
// and after it they skip it rather than doing ten timed reviews alone.
// `groupSteps` are the other present members' steps, so the student's own
// stale row cannot drag the group's position back to theirs.
export function catchUpStep(
  groupSteps: string[],
  ownStep: string,
  reviewReleased: boolean
): string | null {
  if (!reviewReleased) return null;
  const order: readonly string[] = STEP_ORDER;
  const afterReview = order.indexOf(RES_REVIEW_BARRIER_STEP) + 1;
  const target = order[Math.max(order.indexOf(leftmostStep(groupSteps)), afterReview)];
  return order.indexOf(target) > order.indexOf(ownStep) ? target : null;
}

// Put `members` of (group_id, class) on `targetStep`.
//
// Runs on the caller's connection so it joins the caller's transaction.
export async function recordStep(
  conn: PoolConnection,
  classId: number | string,
  groupId: number | string,
  members: Pick<User, 'id' | 'email'>[],
  targetStep: string
): Promise<void> {
  // One multi-row upsert rather than a query per member: this runs while a
  // class waits, and Progress is keyed on email so the whole group lands in
  // the same statement.
  const progressPlaceholders = members.map(() => '(?, ?, ?, ?)').join(', ');
  const progressValues = members.flatMap((member) => [classId, groupId, targetStep, member.email]);
  await conn.query(
    `INSERT INTO Progress (crn, group_id, step, email)
     VALUES ${progressPlaceholders}
     ON DUPLICATE KEY UPDATE crn = VALUES(crn), group_id = VALUES(group_id), step = VALUES(step)`,
    progressValues
  );

  // Mark every barrier behind the target satisfied, for every member.
  //
  // Deleting the completions instead would make those barriers MORE closed:
  // a client that re-polls barrier-status, or rejoins the room, would read
  // 0/4 and disable the button the professor just pressed. Recording them
  // as done is what "past this gate" means, and it holds across a restart.
  const priorSteps = STEP_ORDER.slice(1, (STEP_ORDER as readonly string[]).indexOf(targetStep));
  if (priorSteps.length > 0) {
    const now = dbNow();
    const completionRows = members.flatMap((member) =>
      priorSteps.map((step) => [member.id, classId, groupId, step, now])
    );
    const completionPlaceholders = completionRows.map(() => '(?, ?, ?, ?, ?)').join(', ');
    await conn.query(
      `INSERT IGNORE INTO Step_Completion (student_id, class, group_id, step, completed_at)
       VALUES ${completionPlaceholders}`,
      completionRows.flat()
    );
  }
}
