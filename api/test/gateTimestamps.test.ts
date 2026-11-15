import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import type { Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { dbNow } from '../src/config/database';
import { markPresent } from '../src/config/socket';
import { recordStep } from '../src/config/steps';
import { ProgressController } from '../src/controller/progress.controller';
import type { AuthRequest } from '../src/models/AuthRequest';

// The gates compare Users.present_at with Step_Completion.completed_at, and the
// group view shows GroupConfirmations.confirmed_at beside them. Every write of
// those three comes from dbNow(), so they all read one clock: a gate comparing
// a MySQL-clock time with an API-clock time could put a student on the wrong
// side of it within the same second.

type Call = { sql: string; params: unknown[] };
const DB_NOW = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

describe('dbNow', () => {
  it('formats the instant in UTC, whatever the host time zone', () => {
    // 23:30 on Oct 31 in UTC is still Oct 31 in UTC, though it is Nov 1 in
    // some zones and 19:30 in New York: only the UTC reading may come out.
    expect(dbNow(new Date(Date.UTC(2026, 9, 31, 23, 30, 5)))).toBe('2026-10-31 23:30:05');
  });

  it('cuts to whole seconds rather than rounding, as a TIMESTAMP(0) does', () => {
    expect(dbNow(new Date(Date.UTC(2026, 9, 1, 10, 0, 59, 999)))).toBe('2026-10-01 10:00:59');
  });

  it('defaults to now', () => {
    const before = Math.floor(Date.now() / 1000) * 1000;
    const stamped = Date.parse(`${dbNow().replace(' ', 'T')}Z`);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });
});

describe('every gate timestamp is written from dbNow()', () => {
  it('present_at, when a student first shows up', async () => {
    const calls: Call[] = [];
    const db = {
      promise: () => ({
        query: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return [{ affectedRows: 0 }];
        },
      }),
    } as unknown as Pool;
    await markPresent({} as SocketIOServer, db, { id: 8, group_id: 3, class: 42 });
    expect(calls[0].sql).toMatch(/SET present_at = \? WHERE id = \? AND present_at IS NULL/);
    expect(calls[0].params).toEqual([expect.stringMatching(DB_NOW), 8]);
  });

  it('completed_at, when the professor moves a group past earlier steps', async () => {
    const calls: Call[] = [];
    const conn = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return [{ affectedRows: 1 }];
      },
    } as unknown as PoolConnection;
    const members = [
      { id: 8, email: 'a@x.edu' },
      { id: 9, email: 'b@x.edu' },
    ];
    await recordStep(conn, 42, 3, members, 'interview');

    const insert = calls.find((c) => c.sql.includes('INTO Step_Completion'))!;
    expect(insert.sql).toMatch(/\(student_id, class, group_id, step, completed_at\)/);
    // Each row is (student, class, group, step, time); all rows share one time.
    const times = insert.params.filter((_, i) => i % 5 === 4);
    expect(times.length).toBeGreaterThan(0);
    expect(new Set(times).size).toBe(1);
    expect(times[0]).toMatch(DB_NOW);
  });

  it('confirmed_at, on the first confirm and on a repeat', async () => {
    const calls: Call[] = [];
    const db = {
      query: (sql: string, params: unknown[], cb: (err: null, result: unknown) => void) => {
        calls.push({ sql, params });
        cb(null, sql.startsWith('INSERT') ? { affectedRows: 1 } : []);
      },
    } as unknown as Pool;
    const res = { status: () => res, json: () => res } as unknown as Response;
    const io = { to: () => ({ emit: () => {} }) };
    const req = { user: { id: 8, group_id: 3, class: 42 } } as unknown as AuthRequest;
    new ProgressController(db, io).confirmGroupSelection(req, res);

    const insert = calls.find((c) => c.sql.includes('INTO GroupConfirmations'))!;
    expect(insert.sql).toMatch(/\(group_id, class, student_id, confirmed_at\)/);
    expect(insert.sql).toMatch(/ON DUPLICATE KEY UPDATE confirmed_at = VALUES\(confirmed_at\)/);
    expect(insert.params).toEqual([3, 42, 8, expect.stringMatching(DB_NOW)]);
  });

  it('nothing in api/src writes them with the MySQL clock any more', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (name === 'generated') continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith('.ts')) files.push(path);
      }
    };
    walk(join(__dirname, '../src'));
    const offenders = files.filter((f) =>
      /CURRENT_TIMESTAMP|NOW\(\)/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
