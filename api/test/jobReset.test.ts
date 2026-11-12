import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import { JobController, GROUP_WORK_TABLES } from '../src/controller/job.controller';
import type { AuthRequest } from '../src/models/AuthRequest';

// Assigning a job used to delete every vote, rating and note for the group, so
// fixing a typo in a job title wiped the class. Now only `reset: true` erases
// anything. These cases pin that contract.

type Call = { sql: string; params: unknown[] };

function fakeDb() {
  const calls: Call[] = [];
  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM `GroupsInfo`')) return [[{ group_id: 1 }, { group_id: 2 }]];
      if (sql.includes('SELECT email FROM Users')) return [[{ email: 's1@x.edu' }]];
      return [{ affectedRows: 1 }];
    },
  };
  const db = { promise: () => ({ getConnection: async () => conn }) } as unknown as Pool;
  return { db, calls };
}

function fakeIo() {
  const emits: { room: string; event: string; payload: unknown }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emits.push({ room, event, payload }),
    }),
  };
  return { io, emits };
}

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, out };
}

const deletes = (calls: Call[]) => calls.filter((c) => /^\s*DELETE/i.test(c.sql));

describe('updateJob (one group)', () => {
  const body = { job_group_id: '3', class_id: '42', job: 'Data Analyst' };

  it('erases nothing when reset is omitted', async () => {
    const { db, calls } = fakeDb();
    const { io, emits } = fakeIo();
    const { res, out } = fakeRes();
    await new JobController(db, io, {}).updateJob({ body } as AuthRequest, res);

    expect(out.status).toBe(200);
    expect(deletes(calls)).toHaveLength(0);
    expect(calls.some((c) => c.sql.includes('UPDATE Progress'))).toBe(false);
    expect(emits).toEqual([
      {
        room: 'group_3_class_42',
        event: 'jobUpdated',
        payload: { job: 'Data Analyst', reset: false },
      },
    ]);
  });

  it('treats a truthy non-boolean reset as false', async () => {
    const { db, calls } = fakeDb();
    const { res } = fakeRes();
    await new JobController(db, fakeIo().io, {}).updateJob(
      { body: { ...body, reset: 'true' } } as AuthRequest,
      res
    );
    expect(deletes(calls)).toHaveLength(0);
  });

  it('with reset: true, clears every work table and the offer, scoped by class and group', async () => {
    const { db, calls } = fakeDb();
    const { res, out } = fakeRes();
    await new JobController(db, fakeIo().io, {}).updateJob(
      { body: { ...body, reset: true } } as AuthRequest,
      res
    );

    expect(out.status).toBe(200);
    const tableDeletes = deletes(calls).filter((c) => !c.sql.includes('Notes'));
    expect(tableDeletes).toHaveLength(GROUP_WORK_TABLES.length);
    for (const { table } of GROUP_WORK_TABLES) {
      const call = tableDeletes.find((c) => c.sql.includes(`\`${table}\``));
      expect(call, `no DELETE for ${table}`).toBeDefined();
      expect(call!.params).toEqual([42, 3]);
    }
    expect(tableDeletes.some((c) => c.sql.includes('`Offers`'))).toBe(true);
    expect(deletes(calls).some((c) => c.sql.includes('FROM Notes'))).toBe(true);
  });
});

describe('assignJobToAllGroups', () => {
  const body = { class_id: '42', job_title: 'Data Analyst' };

  it('erases nothing when reset is omitted', async () => {
    const { db, calls } = fakeDb();
    const { io, emits } = fakeIo();
    const { res, out } = fakeRes();
    await new JobController(db, io, {}).assignJobToAllGroups({ body } as AuthRequest, res);

    expect(out.status).toBe(200);
    expect(deletes(calls)).toHaveLength(0);
    expect(emits.map((e) => e.room)).toEqual(['group_1_class_42', 'group_2_class_42']);
  });

  it('with reset: true, resets every group in the class', async () => {
    const { db, calls } = fakeDb();
    const { res } = fakeRes();
    await new JobController(db, fakeIo().io, {}).assignJobToAllGroups(
      { body: { ...body, reset: true } } as AuthRequest,
      res
    );

    const offerDeletes = deletes(calls).filter((c) => c.sql.includes('`Offers`'));
    expect(offerDeletes.map((c) => c.params)).toEqual([
      [42, 1],
      [42, 2],
    ]);
  });
});
