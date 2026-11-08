import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import { GroupController } from '../src/controller/group.controller';
import type { AuthRequest } from '../src/models/AuthRequest';

function setup(existingClass: number) {
  const calls: string[] = [];
  const db = {
    query: (sql: string, _values: unknown[], cb: (err: null, result: unknown) => void) => {
      calls.push(sql);
      cb(null, sql.startsWith('SELECT') ? [{ class: existingClass }] : { affectedRows: 1 });
    },
    promise: () => ({ query: async () => [[]] }),
  } as unknown as Pool;

  const emitted: string[] = [];
  const io = { to: () => ({ emit: (event: string) => emitted.push(event) }) };

  const sent: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };
  const res = {
    status: (code: number) => {
      sent.status = code;
      return res;
    },
    json: (body: Record<string, unknown>) => {
      sent.body = body;
      return res;
    },
  } as unknown as Response;

  return { db, io, res, calls, emitted, sent };
}

describe('adding a student who already exists', () => {
  it.each([
    ['as a string, the way ManageGroupsTab sends it', '42'],
    ['as a number', 42],
  ])('refuses one already in the class, class_id %s', (_label, class_id) => {
    const { db, io, res, calls, emitted, sent } = setup(42);
    const body = { email: 's@x.edu', class_id, group_id: 2 };
    new GroupController(db, io).addStudent({ body } as AuthRequest, res);
    expect(sent.status).toBe(409);
    expect(calls).toHaveLength(1);
    expect(emitted).toEqual([]);
  });

  it('still moves one from another class', () => {
    const { db, io, res, calls, sent } = setup(7);
    const body = { email: 's@x.edu', class_id: '42', group_id: 2 };
    new GroupController(db, io).addStudent({ body } as AuthRequest, res);
    expect(calls[1]).toMatch(/^UPDATE Users SET class = \?/);
    expect(sent.body.action).toBe('updated');
  });
});
