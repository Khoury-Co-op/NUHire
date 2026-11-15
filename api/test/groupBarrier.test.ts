import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import { evaluateGroupBarrier, RES_REVIEW_BARRIER_STEP } from '../src/config/socket';

// evaluateGroupBarrier decides whether a group may leave a "wait for everyone"
// step. Every bug in it has stranded a real group mid-class, so each case below
// is one of those ways.

type Row = Record<string, unknown>;

// Minutes past the hour, so the order of arrivals and completions reads at a glance.
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 10, minute));
const member = (id: number, arrived = 0): Row => ({ id, present_at: at(arrived) });
const done = (studentId: number, minute: number): Row => ({
  student_id: studentId,
  completed_at: at(minute),
});

function fakeDb(members: Row[], completions: Row[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    promise: () => ({
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return [sql.includes('FROM Users') ? members : completions];
      },
    }),
  } as unknown as Pool;
  return { db, calls };
}

describe('evaluateGroupBarrier', () => {
  it('releases once every current member has finished', async () => {
    const { db } = fakeDb([member(8), member(9)], [done(8, 5), done(9, 6)]);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status).toEqual({ step: 'res_1', completedCount: 2, totalCount: 2, released: true });
  });

  it('holds the group while anyone is still working', async () => {
    const { db } = fakeDb([member(8), member(9)], [done(8, 5)]);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status.released).toBe(false);
    expect(status.completedCount).toBe(1);
  });

  it('ignores completions left behind by a student moved to another group', async () => {
    // Student 7 finished, then was moved out. Counting their row would release
    // a group in which student 9 has not finished.
    const { db } = fakeDb([member(8), member(9)], [done(8, 5), done(7, 6)]);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status.completedCount).toBe(1);
    expect(status.released).toBe(false);
  });

  it('does not release a group with nobody in it', async () => {
    const { db } = fakeDb([], []);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status.totalCount).toBe(0);
    expect(status.released).toBe(false);
  });

  it('counts only students who have shown up', async () => {
    // A rostered student who never logs in has no present_at, and waiting for
    // them held the rest of the group for the whole class.
    const { db, calls } = fakeDb([member(8)], [done(8, 5)]);
    await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(calls[0].sql).toMatch(/present_at IS NOT NULL/);
  });

  it('stays open for a student who arrives after the group finished', async () => {
    // Student 10 logs in at :20, after everyone present had finished by :07.
    // Closing the barrier again would strand anyone who missed the release.
    const { db } = fakeDb([member(8), member(9), member(10, 20)], [done(8, 5), done(9, 7)]);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status).toEqual({ step: 'res_1', completedCount: 2, totalCount: 2, released: true });
  });

  it('waits for a student who arrives before the group finished', async () => {
    // Student 10 logs in at :06, while student 9 is still working.
    const { db } = fakeDb([member(8), member(9), member(10, 6)], [done(8, 5), done(9, 7)]);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status).toEqual({ step: 'res_1', completedCount: 2, totalCount: 3, released: false });
  });

  it('scopes both queries by class as well as group', async () => {
    // group_id alone collides across course sections.
    const { db, calls } = fakeDb([member(8)], [done(8, 5)]);
    await evaluateGroupBarrier(db, 42, 3, RES_REVIEW_BARRIER_STEP);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.sql).toMatch(/group_id = \?/);
      expect(call.sql).toMatch(/class = \?/);
      expect(call.params).toEqual(expect.arrayContaining([3, 42]));
    }
  });
});
