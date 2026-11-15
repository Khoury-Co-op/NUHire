import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import { ResumeController } from '../src/controller/resume.controller';
import type { AuthRequest } from '../src/models/AuthRequest';

// `checked` is the group's shortlist flag, stored on every vote row. A vote row
// created after the group shortlisted a resume used to start at 0, and the
// group page then un-ticked the resume for everyone. New rows must carry the
// group's current flag.

type Call = { sql: string; params: unknown };

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  let resolve: () => void = () => {};
  const done = new Promise<void>((r) => (resolve = r));
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      resolve();
      return res;
    },
  };
  return { res: res as unknown as Response, out, done };
}

const io = { to: () => ({ emit: () => {} }) };

describe('submitVote', () => {
  it('copies the group current shortlist flag into a new vote row', async () => {
    const calls: Call[] = [];
    const db = {
      query: (sql: string, params: unknown, cb: (err: Error | null, rows?: unknown) => void) => {
        calls.push({ sql, params });
        cb(null, sql.startsWith('SELECT vote') ? [] : { affectedRows: 1 });
      },
    } as unknown as Pool;
    const { res, out, done } = fakeRes();

    new ResumeController(db, io).submitVote(
      {
        body: {
          student_id: 9,
          group_id: 1,
          class: 42,
          timespent: 30,
          resume_number: 3,
          vote: 'yes',
        },
      } as AuthRequest,
      res
    );
    await done;

    expect(out.status).toBe(200);
    const insert = calls.find((c) => c.sql.includes('INSERT INTO Resume'))!;
    expect(insert.sql).toMatch(/checked\)\s+SELECT/);
    expect(insert.sql).toMatch(/COALESCE\(MAX\(checked\), 0\)/);
    // The flag is read for this group, this class and this resume only.
    expect(insert.sql).toMatch(/WHERE group_id = \? AND class = \? AND resume_number = \?/);
    expect(insert.params).toEqual([9, 1, 42, 30, 3, 'yes', 1, 42, 3]);
    // A re-vote must not overwrite the row's flag.
    expect(insert.sql).not.toMatch(/UPDATE[^;]*checked\s*=/);
  });
});
