import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import type { Pool } from 'mysql2';
import { requireClassModerator } from '../src/middleware/auth.middleware';
import type { AuthRequest } from '../src/models/AuthRequest';

// One professor must not be able to read another section's students.

function fakeDb(moderatorRows: unknown[]) {
  const query = vi.fn(async () => [moderatorRows]);
  return { db: { promise: () => ({ query }) } as unknown as Pool, query };
}

function fakeReq(affiliation: string, classId: string) {
  return {
    isAuthenticated: () => true,
    user: { email: 'prof@northeastern.edu', affiliation },
    params: { class_id: classId },
  } as unknown as AuthRequest;
}

function fakeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: ReturnType<typeof vi.fn> };
}

async function run(db: Pool, req: AuthRequest, res: Response) {
  const next = vi.fn() as unknown as NextFunction;
  requireClassModerator(db)(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
  return next;
}

describe('requireClassModerator', () => {
  it('lets a professor into a class they teach', async () => {
    const { db, query } = fakeDb([{ 1: 1 }]);
    const next = await run(db, fakeReq('admin', '101'), fakeRes());
    expect(next).toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM Moderator'), [
      101,
      'prof@northeastern.edu',
    ]);
  });

  it("blocks a professor from another professor's class", async () => {
    const { db } = fakeDb([]);
    const res = fakeRes();
    const next = await run(db, fakeReq('admin', '202'), res);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks students before touching the database', async () => {
    const { db, query } = fakeDb([{ 1: 1 }]);
    const res = fakeRes();
    const next = await run(db, fakeReq('student', '101'), res);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('checks a class id sent in the body, for routes without it in the URL', async () => {
    const { db, query } = fakeDb([]);
    const res = fakeRes();
    const req = {
      ...fakeReq('admin', '101'),
      params: {},
      body: { class_id: 202 },
    } as unknown as AuthRequest;
    const next = await run(db, req, res);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM Moderator'), [
      202,
      'prof@northeastern.edu',
    ]);
  });

  it('rejects a class id that is not a number', async () => {
    const { db, query } = fakeDb([{ 1: 1 }]);
    const res = fakeRes();
    const next = await run(db, fakeReq('admin', 'abc'), res);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(query).not.toHaveBeenCalled();
  });
});
