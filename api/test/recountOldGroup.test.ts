import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { GroupController } from '../src/controller/group.controller';
import type { AuthRequest } from '../src/models/AuthRequest';

// Moving or deleting a student only recounted the group they joined, if any.
// The group they left kept waiting at the barrier for someone no longer in it.

type Row = Record<string, unknown>;
type Call = { sql: string; params: unknown[] };

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 10, minute));
const member = (id: number): Row => ({ id, email: `s${id}@x.edu`, present_at: at(0) });
const done = (studentId: number): Row => ({ student_id: studentId, completed_at: at(5) });

// The barrier as it reads after the change: group 2's three remaining members
// have all finished, group 3 has the newcomer who has not.
const GROUPS: Record<number, { members: Row[]; completions: Row[] }> = {
  2: { members: [member(8), member(9), member(10)], completions: [done(8), done(9), done(10)] },
  3: { members: [member(12)], completions: [] },
};

function fakeDb(currentGroup: number | null) {
  const calls: Call[] = [];
  const db = {
    query: (sql: string, params: unknown[], cb: (err: null, result: unknown) => void) => {
      calls.push({ sql, params });
      cb(
        null,
        sql.startsWith('SELECT group_id') ? [{ group_id: currentGroup }] : { affectedRows: 1 }
      );
    },
    promise: () => ({
      query: async (sql: string, params: unknown[]) => {
        const group = GROUPS[Number(params[0])] ?? { members: [], completions: [] };
        return [sql.includes('FROM Users') ? group.members : group.completions];
      },
    }),
  } as unknown as Pool;
  return { db, calls };
}

function fakeIo() {
  const emits: { room: string; event: string }[] = [];
  const to = (room: string) => ({ emit: (event: string) => emits.push({ room, event }) });
  return { io: { to } as unknown as SocketIOServer, emits };
}

const res = { status: () => res, json: () => res } as unknown as Response;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const released = (emits: { room: string; event: string }[]) =>
  emits.filter((e) => e.event === 'groupCompletedResReview').map((e) => e.room);

describe('the group a student leaves is recounted', () => {
  it('releases the old group when its last unfinished member is reassigned out', async () => {
    const { db } = fakeDb(2);
    const { io, emits } = fakeIo();
    const body = { email: 's11@x.edu', new_group_id: 3, class_id: 9001 };
    new GroupController(db, io).reassignStudent({ body } as AuthRequest, res);
    await settle();
    expect(released(emits)).toEqual(['group_2_class_9001']);
  });

  it('releases the old group when its last unfinished member is deleted', async () => {
    const { db } = fakeDb(2);
    const { io, emits } = fakeIo();
    const body = { email: 's11@x.edu', class_id: 9001 };
    new GroupController(db, io).deleteStudent({ body } as AuthRequest, res);
    await settle();
    expect(released(emits)).toEqual(['group_2_class_9001']);
  });

  it('recounts nothing when the deleted student had no group', async () => {
    const { db } = fakeDb(null);
    const { io, emits } = fakeIo();
    const body = { email: 's11@x.edu', class_id: 9001 };
    new GroupController(db, io).deleteStudent({ body } as AuthRequest, res);
    await settle();
    expect(emits).toEqual([]);
  });

  it('looks up the old group by email and class on reassign', () => {
    const { db, calls } = fakeDb(2);
    const body = { email: 's11@x.edu', new_group_id: 3, class_id: 9001 };
    new GroupController(db, fakeIo().io).reassignStudent({ body } as AuthRequest, res);
    const lookup = calls.find((c) => c.sql.startsWith('SELECT group_id'));
    expect(lookup?.sql).toMatch(/WHERE email = \? AND class = \?/);
    expect(lookup?.params).toEqual(['s11@x.edu', 9001]);
  });

  it('looks up the old group by email and class on delete', () => {
    const { db, calls } = fakeDb(2);
    const body = { email: 's11@x.edu', class_id: 9001 };
    new GroupController(db, fakeIo().io).deleteStudent({ body } as AuthRequest, res);
    const lookup = calls.find((c) => c.sql.startsWith('SELECT group_id'));
    expect(lookup?.sql).toMatch(/WHERE email = \? AND class = \?/);
    expect(lookup?.params).toEqual(['s11@x.edu', 9001]);
  });
});
