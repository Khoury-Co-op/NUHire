import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import { GroupController } from '../src/controller/group.controller';
import { summarizeBarrier, RES_REVIEW_BARRIER_STEP } from '../src/config/socket';
import type { AuthRequest } from '../src/models/AuthRequest';

// dbNow()'s shape: a TIMESTAMP literal in UTC with whole seconds.
const DB_NOW = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// A student moved into a group kept the present_at from their old one. It
// predated the new group's release, so the barrier counted them as there all
// along: it read closed for a group already through it, and the moved student
// was never offered the catch-up.

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 10, minute));

function fakeDb() {
  const calls: string[] = [];
  const params: unknown[][] = [];
  const db = {
    query: (sql: string, values: unknown[], cb: (err: null, result: unknown) => void) => {
      calls.push(sql);
      params.push(values);
      cb(null, { affectedRows: 1 });
    },
    promise: () => ({ query: async () => [[]] }),
  } as unknown as Pool;
  return { db, calls, params };
}

const io = { to: () => ({ emit: () => {} }) };
const res = { status: () => res, json: () => res } as unknown as Response;

describe('moving a student re-stamps present_at', () => {
  it('on reassign', () => {
    const { db, calls, params } = fakeDb();
    const body = { email: 's@x.edu', new_group_id: 2, class_id: 42 };
    new GroupController(db, io).reassignStudent({ body } as AuthRequest, res);
    // calls[0] looks up the group the student is leaving.
    expect(calls[1]).toMatch(/UPDATE Users SET group_id = \?/);
    // Restamped only if already present: a student who never showed up is still absent.
    expect(calls[1]).toMatch(/present_at = IF\(present_at IS NULL, NULL, \?\)/);
    // The new stamp is the API's time, in the placeholder after group_id.
    expect(params[1]).toEqual([2, expect.stringMatching(DB_NOW), 's@x.edu', 42]);
  });

  it('on adding an existing student to a new class', () => {
    const { db, calls, params } = fakeDb();
    // The existence check returns a row from another class.
    db.query = ((sql: string, values: unknown[], cb: (e: null, r: unknown) => void) => {
      calls.push(sql);
      params.push(values);
      cb(null, sql.startsWith('SELECT') ? [{ class: 7 }] : { affectedRows: 1 });
    }) as unknown as Pool['query'];
    const body = { email: 's@x.edu', class_id: 42, group_id: 2 };
    new GroupController(db, io).addStudent({ body } as AuthRequest, res);
    expect(calls[1]).toMatch(/SET class = \?, group_id = \?, present_at = IF/);
    expect(params[1]).toEqual([42, 2, expect.stringMatching(DB_NOW), 's@x.edu']);
  });

  it('is what keeps the new group released', () => {
    // The group finished by :07. Student 10 moves in at :20.
    const completions = [
      { student_id: 8, completed_at: at(5) },
      { student_id: 9, completed_at: at(7) },
    ];
    const group = (movedStamp: number) => [
      { id: 8, email: 'a', present_at: at(0) },
      { id: 9, email: 'b', present_at: at(0) },
      { id: 10, email: 'c', present_at: at(movedStamp) },
    ];
    // Old stamp from :01: read as present all along, so the group looks unfinished.
    expect(summarizeBarrier(RES_REVIEW_BARRIER_STEP, group(1), completions).released).toBe(false);
    // Re-stamped on the move: a late arrival, and the group stays through.
    expect(summarizeBarrier(RES_REVIEW_BARRIER_STEP, group(20), completions).released).toBe(true);
  });
});
