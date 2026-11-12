import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2';
import type { Server as SocketIOServer } from 'socket.io';
import { initializeSocketHandlers } from '../src/config/socket';

// Every socket event is checked against who is logged in. These cases are the
// attacks a student could run from devtools before that, plus the normal flow
// the checks must not break.

type User = {
  id: number;
  email: string;
  affiliation: 'student' | 'admin';
  group_id?: number;
  class?: number;
};
type Emit = { room: string; event: string; payload: unknown };
type Handler = (payload?: unknown) => void;

const advisor: User = { id: 1, email: 'advisor@northeastern.edu', affiliation: 'admin' };
// A teacher too, but only of class 9001. Every teacher event below is for class 1.
const otherTeacher: User = { id: 2, email: 'prof9001@northeastern.edu', affiliation: 'admin' };
const moderators = [
  { admin_email: advisor.email, crn: 1 },
  { admin_email: otherTeacher.email, crn: 9001 },
];
// Group 2 in class 1. Every attack below names group 1 in the payload.
const student: User = {
  id: 10,
  email: 'student3@northeastern.edu',
  affiliation: 'student',
  group_id: 2,
  class: 1,
};

// Answers the roster and class-teacher lookups; every other query is recorded.
// A query whose params match `slow` takes a little longer, to show ordering.
function fakeDb(roster: User[], slow?: unknown) {
  const writes: { sql: string; params: unknown[] }[] = [];
  const db = {
    promise: () => ({
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes('SET present_at = ?')) return [{ affectedRows: 0 }];
        if (sql.includes('FROM Users') && sql.includes('email = ?')) {
          return [roster.filter((u) => u.email === params[0] && u.affiliation === 'student')];
        }
        if (sql.includes('FROM Moderator')) {
          const [crn, email] = params;
          return [moderators.filter((m) => m.crn === crn && m.admin_email === email)];
        }
        if (slow !== undefined && params.includes(slow)) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        writes.push({ sql, params });
        return [[]];
      },
    }),
    query: (_sql: string, _params: unknown[], callback: (err: null, rows: unknown[]) => void) => {
      callback(null, [{ admin_email: advisor.email }]);
    },
  } as unknown as Pool;
  return { db, writes };
}

function fakeServer(db: Pool) {
  const emitted: Emit[] = [];
  let middleware: (socket: unknown, next: (err?: Error) => void) => void = () => {};
  let onConnection: (socket: unknown) => void = () => {};
  const to = (room: string) => ({
    emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }),
  });

  const io = {
    use: (fn: typeof middleware) => (middleware = fn),
    on: (_event: 'connection', fn: typeof onConnection) => (onConnection = fn),
    to,
  } as unknown as SocketIOServer;
  initializeSocketHandlers(io, db);

  // Runs the handshake and, if it is accepted, the connection handler.
  const connect = (user: User | undefined) => {
    const handlers: Record<string, Handler> = {};
    const socket = {
      id: `socket-${user?.email ?? 'anonymous'}`,
      request: { user },
      data: {} as { user?: User },
      on: (event: string, handler: Handler) => (handlers[event] = handler),
      join: () => {},
      to,
    };
    let refusal: Error | undefined;
    middleware(socket, (err) => (refusal = err));
    if (!refusal) onConnection(socket);
    return { refusal, send: (event: string, payload?: unknown) => handlers[event]?.(payload) };
  };

  return { emitted, connect };
}

// Handlers look the sender up in the database first; let them finish.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('socket identity', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('refuses a socket with no login', () => {
    const { connect } = fakeServer(fakeDb([]).db);
    expect(connect(undefined).refusal?.message).toMatch(/no session/);
  });

  it.each([
    ['makeOfferResponse', { classId: 1, groupId: 1, candidateId: 3, accepted: true }],
    ['sendPopupToGroups', { groups: [1], headline: 'Fake', message: 'x', class: 1 }],
    [
      'updateRatingsWithPresetBackend',
      { classId: 1, groupId: 1, candidateId: 3, vote: 'yes', isNoShow: false },
    ],
  ])(
    'drops and logs teacher-only %s from a student or a teacher of another class',
    async (event, payload) => {
      for (const sender of [student, otherTeacher]) {
        const { db, writes } = fakeDb([student]);
        const { emitted, connect } = fakeServer(db);

        connect(sender).send(event, payload);
        await settle();

        expect(emitted).toEqual([]);
        expect(writes).toEqual([]);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`teacher-only "${event}" for class 1`)
        );
      }
    }
  );

  it('lets an advisor answer an offer in their own class', async () => {
    const { emitted, connect } = fakeServer(fakeDb([]).db);

    connect(advisor).send('makeOfferResponse', {
      classId: 1,
      groupId: 1,
      candidateId: 3,
      accepted: true,
    });
    await settle();

    expect(emitted.map((e) => [e.room, e.event])).toEqual([
      ['group_1_class_1', 'makeOfferResponse'],
      [advisor.email, 'makeOfferResponse'],
    ]);
  });

  it("ticks the sender's own group's resume, not the one the payload names", async () => {
    const { db, writes } = fakeDb([student]);
    const { emitted, connect } = fakeServer(db);

    connect(student).send('check', {
      group_id: 'group_1_class_1',
      resume_number: 4,
      checked: true,
    });
    await settle();

    expect(writes).toHaveLength(1);
    expect(writes[0].params).toEqual([true, 2, 1, 4]);
    expect(emitted).toEqual([
      {
        room: 'group_2_class_1',
        event: 'checkboxUpdated',
        payload: { resume_number: 4, checked: true },
      },
    ]);
  });

  it("moves only the sender's own group", async () => {
    const { db } = fakeDb([student]);
    const { emitted, connect } = fakeServer(db);

    connect(student).send('moveGroup', { groupId: 1, classId: 1, targetPage: '/makeOffer' });
    await settle();

    expect(emitted).toEqual([
      {
        room: 'group_2_class_1',
        event: 'moveGroup',
        payload: { classId: 1, groupId: 2, targetPage: '/makeOffer' },
      },
    ]);
  });

  it('confirms an offer as the sender, never as the teammate the payload names', async () => {
    const { db } = fakeDb([student]);
    const { emitted, connect } = fakeServer(db);

    connect(student).send('confirmOffer', {
      candidateId: 3,
      studentId: 8,
      groupId: 1,
      classId: 1,
      roomId: 'group_1_class_1',
    });
    await settle();

    expect(emitted).toEqual([
      {
        room: 'group_2_class_1',
        event: 'confirmOffer',
        payload: { candidateId: 3, studentId: 10, groupId: 2, classId: 1 },
      },
    ]);
  });

  it('refuses student events from someone not in a group', async () => {
    const ungrouped: User = { ...student, group_id: undefined };
    const { db, writes } = fakeDb([ungrouped]);
    const { emitted, connect } = fakeServer(db);

    connect(ungrouped).send('check', { resume_number: 4, checked: true });
    await settle();

    expect(writes).toEqual([]);
    expect(emitted).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a student in a group'));
  });

  it('applies quick checkbox toggles in the order they were sent', async () => {
    // The first write is slower; without the per-socket queue the second
    // would land first and the resume would end up ticked.
    const { db, writes } = fakeDb([student], true);
    const { connect } = fakeServer(db);
    const socket = connect(student);

    socket.send('check', { resume_number: 4, checked: true });
    socket.send('check', { resume_number: 4, checked: false });
    await settle();

    expect(writes.map((w) => w.params[0])).toEqual([true, false]);
  });
});
