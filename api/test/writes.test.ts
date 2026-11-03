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
  type Key = { id?: number; class_id_group_id?: { class_id: number; group_id: number } };
  type Where = { class_id?: number; group_id?: number; id?: number; status?: string };
  type Row = { class_id: number; group_id: number; status: string; value: number };

  const ARGS = {
    key: { class_id_group_id: { class_id: 7, group_id: 2 } },
    when: { status: 'open' },
    create: { class_id: 7, group_id: 2, status: 'open', value: 5 },
    update: { value: 5 },
  };

  // `found` is whether a row has the key, one answer per read.
  function fakeModel(found: boolean[], updated = 1) {
    const reads = [...found];
    return {
      findUnique: vi.fn(async (_args: { where: Key }) => (reads.shift() ? {} : null)),
      create: vi.fn(async (_args: { data: Row }) => ({})),
      updateMany: vi.fn(async (_args: { where: { AND: Where[] }; data: Partial<Row> }) => ({
        count: updated,
      })),
    };
  }

  it('creates the row when none has its key', async () => {
    const model = fakeModel([false]);
    expect(await compareAndSet(model, ARGS)).toBe('created');
    expect(model.findUnique).toHaveBeenCalledWith({ where: ARGS.key });
    expect(model.create).toHaveBeenCalledWith({ data: ARGS.create });
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('updates in one statement that checks the key as plain columns and the condition', async () => {
    const model = fakeModel([true]);
    expect(await compareAndSet(model, ARGS)).toBe('updated');
    expect(model.updateMany).toHaveBeenCalledWith({
      where: { AND: [{ class_id: 7, group_id: 2 }, { status: 'open' }] },
      data: { value: 5 },
    });
    expect(model.create).not.toHaveBeenCalled();
  });

  it('passes a one-column key through as it is', async () => {
    const model = fakeModel([true]);
    await compareAndSet(model, { ...ARGS, key: { id: 3 } });
    expect(model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ id: 3 }, { status: 'open' }] } })
    );
  });

  it('leaves a row that fails the condition alone', async () => {
    const model = fakeModel([true, true], 0);
    expect(await compareAndSet(model, ARGS)).toBe('unchanged');
    expect(model.create).not.toHaveBeenCalled();
  });

  it('creates the row when it was deleted between the read and the update', async () => {
    const model = fakeModel([true, false], 0);
    expect(await compareAndSet(model, ARGS)).toBe('created');
    expect(model.create).toHaveBeenCalledWith({ data: ARGS.create });
  });

  it('does not retry by itself, so a lost race reaches the caller', async () => {
    const model = fakeModel([false]);
    model.create.mockRejectedValueOnce(prismaError('P2002'));
    await expect(compareAndSet(model, ARGS)).rejects.toMatchObject({ code: 'P2002' });
    expect(model.findUnique).toHaveBeenCalledTimes(1);
  });

  it('updates once withUniqueRetry reruns it after another writer created the row', async () => {
    const model = fakeModel([false, true]);
    model.create.mockRejectedValueOnce(prismaError('P2002'));
    expect(await withUniqueRetry(() => compareAndSet(model, ARGS))).toBe('updated');
  });

  it('refuses a key with a condition beside it', async () => {
    const model = fakeModel([true]);
    const key = { id: 3, class_id_group_id: { class_id: 7, group_id: 2 } };
    await expect(compareAndSet(model, { ...ARGS, key })).rejects.toThrow(/unique key alone/);
    expect(model.findUnique).not.toHaveBeenCalled();
  });
});
