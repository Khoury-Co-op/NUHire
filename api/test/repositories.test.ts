import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../src/config/database';
import { Prisma } from '../src/generated/prisma/client';
import { createFactsRepository } from '../src/repository/facts.repository';
import { createModeratorRepository } from '../src/repository/moderator.repository';
import { createNotesRepository } from '../src/repository/notes.repository';
import { createPdfTextRepository } from '../src/repository/pdfText.repository';

// The controllers are tested against fake repositories, so these check the
// other half: each repository asks Prisma for the right rows.

const PROF = 'prof@northeastern.edu';

describe('moderator repository', () => {
  function withModerator(adminEmail: string | null) {
    const findUnique = vi.fn(async () => (adminEmail ? { admin_email: adminEmail } : null));
    const db = { moderator: { findUnique } } as unknown as DbClient;
    return { moderators: createModeratorRepository(db), findUnique };
  }

  it('says a professor teaches the class on their Moderator row', async () => {
    const { moderators, findUnique } = withModerator(PROF);
    expect(await moderators.teaches(PROF, 101)).toBe(true);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { crn: 101 } }));
  });

  it("says no for another professor's class", async () => {
    const { moderators } = withModerator('other@northeastern.edu');
    expect(await moderators.teaches(PROF, 101)).toBe(false);
  });

  it('says no for a class with no Moderator row', async () => {
    const { moderators } = withModerator(null);
    expect(await moderators.teaches(PROF, 101)).toBe(false);
  });
});

describe('facts repository', () => {
  it("reads one class's facts by its id", async () => {
    const findUnique = vi.fn(async () => null);
    const db = { waitingFacts: { findUnique } } as unknown as DbClient;
    expect(await createFactsRepository(db).findByClass(101)).toBeNull();
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { class_id: 101 } }));
  });

  it('saves all three facts with an upsert, retried when a first save races another', async () => {
    const raced = new Prisma.PrismaClientKnownRequestError('raced', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const upsert = vi.fn().mockRejectedValueOnce(raced).mockResolvedValueOnce({});
    const db = { waitingFacts: { upsert } } as unknown as DbClient;
    await createFactsRepository(db).save(101, { one: 'a', two: null, three: 'c' });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({
      where: { class_id: 101 },
      create: { class_id: 101, one: 'a', two: null, three: 'c' },
      update: { one: 'a', two: null, three: 'c' },
    });
  });
});

describe('notes repository', () => {
  it("lists only the caller's notes, newest first", async () => {
    const findMany = vi.fn(async () => []);
    const db = { notes: { findMany } } as unknown as DbClient;
    await createNotesRepository(db).listForUser('student@northeastern.edu');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_email: 'student@northeastern.edu' },
        orderBy: { created_at: 'desc' },
      })
    );
  });
});

describe('pdf text repository', () => {
  function withTables() {
    const resumes = { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({})) };
    const jobs = { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({})) };
    const db = { resume_pdfs: resumes, job_descriptions: jobs } as unknown as DbClient;
    return { pdfs: createPdfTextRepository(db), resumes, jobs };
  }

  it('lists only rows with no text, in one class when asked', async () => {
    const { pdfs, resumes, jobs } = withTables();
    await pdfs.listWithoutText('Resume_pdfs', 101);
    await pdfs.listWithoutText('job_descriptions');
    expect(resumes.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { extracted_text: null, class_id: 101 } })
    );
    expect(jobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { extracted_text: null } })
    );
  });

  it('never overwrites text another run already stored', async () => {
    const { pdfs, resumes, jobs } = withTables();
    await pdfs.saveText('job_descriptions', 7, 'Software Engineer Co-op');
    expect(jobs.updateMany).toHaveBeenCalledWith({
      where: { id: 7, extracted_text: null },
      data: { extracted_text: 'Software Engineer Co-op' },
    });
    expect(resumes.updateMany).not.toHaveBeenCalled();
  });
});
