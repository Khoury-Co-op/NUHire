import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../src/generated/prisma/client';
import { compareAndSet, insertIfAbsent, withUniqueRetry } from '../src/repository/writes';

// These check the order of calls and the retry rules against fake models.
// Whether the patterns hold up under real concurrency is `npm run races`,
// which needs MySQL.

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`fake ${code}`, { code, clientVersion: 'test' });
}

describe('withUniqueRetry', () => {
  it('returns what the write returns', async () => {
    expect(await withUniqueRetry(async () => 'row')).toBe('row');
  });

  it.each(['P2002', 'P2034'])('runs the write again after %s', async (code) => {
    const write = vi.fn().mockRejectedValueOnce(prismaError(code)).mockResolvedValueOnce('row');
    expect(await withUniqueRetry(write)).toBe('row');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('gives up after three tries and throws the last error', async () => {
    const write = vi.fn().mockRejectedValue(prismaError('P2002'));
    await expect(withUniqueRetry(write)).rejects.toMatchObject({ code: 'P2002' });
    expect(write).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['a record that does not exist', prismaError('P2025')],
    ['an error that is not from Prisma', new Error('Prisma queue limit reached.')],
  ])('does not retry %s', async (_name, error) => {
    const write = vi.fn().mockRejectedValue(error);
    await expect(withUniqueRetry(write)).rejects.toBe(error);
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('insertIfAbsent', () => {
  type Row = { id: number; name: string };

  it('sends one row with skipDuplicates, and says whether it went in', async () => {
    const createMany = vi.fn(async (_args: { data: Row[]; skipDuplicates: true }) => ({
      count: 1,
    }));
    expect(await insertIfAbsent({ createMany }, { id: 1, name: 'a' })).toBe(true);
    expect(createMany).toHaveBeenCalledWith({ data: [{ id: 1, name: 'a' }], skipDuplicates: true });
  });

  it('says false when a row with the key was already there', async () => {
    const createMany = vi.fn(async (_args: { data: Row[]; skipDuplicates: true }) => ({
      count: 0,
    }));
    expect(await insertIfAbsent({ createMany }, { id: 1, name: 'a' })).toBe(false);
  });
});

describe('compareAndSet', () => {
  type Where = { id?: number; status?: string };
  type Row = { id: number; status: string; value: number };

  const ARGS = {
    where: { id: 1 },
    when: { status: 'open' },
    create: { id: 1, status: 'open', value: 5 },
    update: { value: 5 },
  };

  // `existing` is how many rows match `where`, one answer per read.
  function fakeModel(existing: number[], updated = 1) {
    const counts = [...existing];
    return {
      count: vi.fn(async (_args: { where: Where }) => counts.shift() ?? 0),
      create: vi.fn(async (_args: { data: Row }) => ({})),
      updateMany: vi.fn(async (_args: { where: { AND: Where[] }; data: Partial<Row> }) => ({
        count: updated,
      })),
    };
  }

  it('creates the row when none has its key', async () => {
    const model = fakeModel([0]);
    expect(await compareAndSet(model, ARGS)).toBe('created');
    expect(model.create).toHaveBeenCalledWith({ data: ARGS.create });
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('updates the row in one statement that also checks the condition', async () => {
    const model = fakeModel([1]);
    expect(await compareAndSet(model, ARGS)).toBe('updated');
    expect(model.updateMany).toHaveBeenCalledWith({
      where: { AND: [{ id: 1 }, { status: 'open' }] },
      data: { value: 5 },
    });
    expect(model.create).not.toHaveBeenCalled();
  });

  it('leaves a row that fails the condition alone', async () => {
    const model = fakeModel([1], 0);
    expect(await compareAndSet(model, ARGS)).toBe('unchanged');
  });

  it('updates instead when another writer creates the row first', async () => {
    const model = fakeModel([0, 1]);
    model.create.mockRejectedValueOnce(prismaError('P2002'));
    expect(await compareAndSet(model, ARGS)).toBe('updated');
    expect(model.count).toHaveBeenCalledTimes(2);
  });

  it('refuses a where that matches more than one row', async () => {
    const model = fakeModel([2]);
    await expect(compareAndSet(model, ARGS)).rejects.toThrow(/unique key/);
    expect(model.updateMany).not.toHaveBeenCalled();
  });
});
