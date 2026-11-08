import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { FactsController } from '../src/controller/facts.controller';
import type { AuthRequest } from '../src/models/AuthRequest';
import type { FactsRepository } from '../src/repository/facts.repository';
import type { ModeratorRepository } from '../src/repository/moderator.repository';

// A student sees only their own class's facts, and a professor reads and
// writes only the sections they teach.

const PROF = 'prof@northeastern.edu';
const FACTS = { one: 'a', two: 'b', three: 'c' };

// moderatorEmail is who teaches the class asked for; null means no Moderator row.
function fakeRepos(moderatorEmail: string | null) {
  const facts = {
    findByClass: vi.fn<FactsRepository['findByClass']>(async () => FACTS),
    save: vi.fn<FactsRepository['save']>(async () => undefined),
  };
  const moderators = {
    teaches: vi.fn<ModeratorRepository['teaches']>(async (email) => email === moderatorEmail),
  };
  return { facts, moderators };
}

function controller(repos: ReturnType<typeof fakeRepos>, io = fakeIo().io) {
  return new FactsController(repos.facts, repos.moderators, io);
}

function fakeIo() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { io: { to } as unknown as SocketIOServer, to, emit };
}

function fakeReq(user: object, classId: string, body: object = {}) {
  return { user, params: { class_id: classId }, body } as unknown as AuthRequest;
}

const student = { email: 'student@northeastern.edu', affiliation: 'student', class: 101 };
const admin = { email: PROF, affiliation: 'admin' };

function fakeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe('getFacts', () => {
  it("gives a student their own class's facts, whatever the URL names", async () => {
    const repos = fakeRepos(null);
    const res = fakeRes();
    await controller(repos).getFacts(fakeReq(student, '202'), res);
    expect(repos.facts.findByClass).toHaveBeenCalledWith(101);
    expect(repos.moderators.teaches).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(FACTS);
  });

  it('gives a student with no class an empty list without a query', async () => {
    const repos = fakeRepos(null);
    const res = fakeRes();
    const noClass = { ...student, class: undefined };
    await controller(repos).getFacts(fakeReq(noClass, '101'), res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(repos.facts.findByClass).not.toHaveBeenCalled();
  });

  it('gives a class with no facts saved an empty list, not null', async () => {
    const repos = fakeRepos(null);
    repos.facts.findByClass.mockResolvedValueOnce(null);
    const res = fakeRes();
    await controller(repos).getFacts(fakeReq(student, '101'), res);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('gives a professor the facts for a class they teach', async () => {
    const repos = fakeRepos(PROF);
    const res = fakeRes();
    await controller(repos).getFacts(fakeReq(admin, '101'), res);
    expect(repos.moderators.teaches).toHaveBeenCalledWith(PROF, 101);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(FACTS);
  });

  it("blocks a professor from another professor's class", async () => {
    const repos = fakeRepos('other@northeastern.edu');
    const res = fakeRes();
    await controller(repos).getFacts(fakeReq(admin, '202'), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(repos.facts.findByClass).not.toHaveBeenCalled();
  });

  it('gives a professor who has not picked a class an empty list', async () => {
    const repos = fakeRepos(PROF);
    const res = fakeRes();
    await controller(repos).getFacts(fakeReq(admin, 'undefined'), res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(repos.moderators.teaches).not.toHaveBeenCalled();
  });
});

describe('newFacts', () => {
  it('saves facts for a class the professor teaches and tells the class', async () => {
    const repos = fakeRepos(PROF);
    const { io, to, emit } = fakeIo();
    const res = fakeRes();
    await controller(repos, io).newFacts(fakeReq(admin, '101', FACTS), res);
    expect(repos.facts.save).toHaveBeenCalledWith(101, FACTS);
    expect(to).toHaveBeenCalledWith('class_101');
    expect(emit).toHaveBeenCalledWith('factsUpdated');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('saves a fact left out of the body as null', async () => {
    const repos = fakeRepos(PROF);
    const res = fakeRes();
    await controller(repos).newFacts(fakeReq(admin, '101', { one: 'a' }), res);
    expect(repos.facts.save).toHaveBeenCalledWith(101, { one: 'a', two: null, three: null });
  });

  it("does not save to another professor's class", async () => {
    const repos = fakeRepos('other@northeastern.edu');
    const { io, to } = fakeIo();
    const res = fakeRes();
    await controller(repos, io).newFacts(fakeReq(admin, '202', FACTS), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(repos.facts.save).not.toHaveBeenCalled();
    expect(to).not.toHaveBeenCalled();
  });

  it('rejects a class id that is not a number', async () => {
    const repos = fakeRepos(PROF);
    const res = fakeRes();
    await controller(repos).newFacts(fakeReq(admin, 'abc', FACTS), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(repos.moderators.teaches).not.toHaveBeenCalled();
  });

  it('rejects a fact that is not text', async () => {
    const repos = fakeRepos(PROF);
    const res = fakeRes();
    const body = { one: { x: 1 }, two: 'b', three: 'c' };
    await controller(repos).newFacts(fakeReq(admin, '101', body), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(repos.moderators.teaches).not.toHaveBeenCalled();
    expect(repos.facts.save).not.toHaveBeenCalled();
  });
});
