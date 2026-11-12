import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import { AuthController, postLoginPath } from '../src/controller/auth.controller';
import type { AuthRequest } from '../src/models/AuthRequest';
import type { User } from '../src/models/User';

// postLoginPath is the single decision for where a user lands after login. The
// callback, a repeat callback and the post-signup redirect each used to decide
// on their own, and disagreed.

type Row = Record<string, unknown>;

function fakeDb({ users = [] as Row[], groups = [] as Row[], groupError = false } = {}) {
  const db = {
    promise: () => ({
      query: async (sql: string) => {
        if (sql.includes('GroupsInfo')) {
          if (groupError) throw new Error('db down');
          return [groups];
        }
        return [users];
      },
    }),
  } as unknown as Pool;
  return db;
}

const student = (over: Partial<User> = {}): User => ({
  id: 8,
  f_name: 'Sam',
  l_name: 'Student',
  email: 'sam@x.edu',
  affiliation: 'student',
  group_id: 1,
  class: 1,
  seen: 1,
  ...over,
});

const name = { firstName: 'Sam', lastName: 'Student' };

describe('postLoginPath', () => {
  it('sends an admin to the advisor dashboard', async () => {
    const path = await postLoginPath(fakeDb(), student({ affiliation: 'admin' }), 'a@x.edu', name);
    expect(path).toBe('/advisor-dashboard?name=Sam%20Student');
  });

  it('sends someone with no Users row to the signup form', async () => {
    const path = await postLoginPath(fakeDb(), undefined, 'new@x.edu', name);
    expect(path).toBe('/signupform?email=new%40x.edu&firstName=Sam&lastName=Student');
  });

  it('sends a first-time login (affiliation none) to the signup form', async () => {
    const path = await postLoginPath(fakeDb(), student({ affiliation: 'none' }), 'n@x.edu', name);
    expect(path).toMatch(/^\/signupform\?/);
  });

  it('sends a profile with no last name to the signup form', async () => {
    const path = await postLoginPath(fakeDb(), student({ l_name: '' }), 'n@x.edu', name);
    expect(path).toMatch(/^\/signupform\?/);
  });

  it('does not print "undefined" into the signup form for a one-word name', async () => {
    const path = await postLoginPath(fakeDb(), undefined, 'n@x.edu', { firstName: 'Cher' });
    expect(path).toBe('/signupform?email=n%40x.edu&firstName=Cher&lastName=');
  });

  it('holds a student whose group has not started on the waiting page', async () => {
    const db = fakeDb({ groups: [{ started: 0 }] });
    expect(await postLoginPath(db, student(), 's@x.edu', name)).toBe('/waitingGroup');
  });

  it('holds a student with no GroupsInfo row on the waiting page', async () => {
    expect(await postLoginPath(fakeDb({ groups: [] }), student(), 's@x.edu', name)).toBe(
      '/waitingGroup'
    );
  });

  it('holds a student on the waiting page when the group check fails', async () => {
    const db = fakeDb({ groupError: true });
    expect(await postLoginPath(db, student(), 's@x.edu', name)).toBe('/waitingGroup');
  });

  it('sends a started student who has not seen the intro to /about', async () => {
    const db = fakeDb({ groups: [{ started: 1 }] });
    expect(await postLoginPath(db, student({ seen: 0 }), 's@x.edu', name)).toBe('/about');
  });

  it('sends a started student who has seen the intro to the dashboard', async () => {
    const db = fakeDb({ groups: [{ started: 1 }] });
    expect(await postLoginPath(db, student(), 's@x.edu', name)).toBe(
      '/dashboard?name=Sam%20Student'
    );
  });
});

// The two non-reference paths changed behaviour; pin the changes.
function captureRedirect(): { res: Response; done: Promise<string> } {
  let resolve: (url: string) => void = () => {};
  const done = new Promise<string>((r) => (resolve = r));
  const res = { redirect: (url: string) => resolve(url) } as unknown as Response;
  return { res, done };
}

function loggedIn(user: User): AuthRequest {
  return { isAuthenticated: () => true, user, query: {} } as unknown as AuthRequest;
}

describe('the other two paths now use the same decision', () => {
  process.env.REACT_APP_FRONT_URL = 'http://front';

  it('post-signup: an incomplete profile goes back to the signup form', async () => {
    const incomplete = student({ affiliation: 'none' });
    const controller = new AuthController(fakeDb({ users: [incomplete] }));
    const { res, done } = captureRedirect();
    controller.handlePostSignupRedirect(loggedIn(incomplete), res);
    expect(await done).toMatch(/^http:\/\/front\/signupform\?/);
  });

  it('repeat callback: a student whose group has not started waits', async () => {
    const s = student();
    const controller = new AuthController(fakeDb({ users: [s], groups: [{ started: 0 }] }));
    const { res, done } = captureRedirect();
    const firstStep = controller.handleKeycloakCallback[0] as (
      req: AuthRequest,
      res: Response,
      next: () => void
    ) => void;
    firstStep(loggedIn(s), res, () => {});
    expect(await done).toBe('http://front/waitingGroup');
  });
});
