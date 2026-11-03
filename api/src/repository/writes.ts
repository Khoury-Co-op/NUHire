import { Prisma } from '../generated/prisma/client';

// Writes that several students can make at the same instant, such as a whole
// group submitting one offer. MySQL made these atomic with ON DUPLICATE KEY
// UPDATE and INSERT IGNORE. Prisma has neither, and its upsert is a SELECT and
// then an INSERT or UPDATE, so two first writes can both choose INSERT and one
// fails on the unique key. `npm run races` checks each helper here under 30
// concurrent first writes.

const MAX_TRIES = 3;

// P2002: another writer inserted the same unique key first. P2034: a
// transaction lost a deadlock or a write conflict and was rolled back.
const CONFLICT_CODES = new Set(['P2002', 'P2034']);

function isWriteConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && CONFLICT_CODES.has(err.code);
}

/**
 * Runs `write` again when it loses a race for a unique key, three tries in all.
 * By the second try the winner's row is committed, so an upsert takes its
 * UPDATE path. Every upsert goes through this.
 *
 * Wrap a single upsert, or a whole `$transaction` call. Never wrap an upsert
 * inside a transaction: the retry reads the transaction's snapshot, which still
 * has no row, and fails the same way. Rerunning the whole transaction starts a
 * new snapshot.
 */
export async function withUniqueRetry<T>(write: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write();
    } catch (err) {
      if (attempt >= MAX_TRIES || !isWriteConflict(err)) {
        throw err;
      }
    }
  }
}

/** The part of a Prisma model that insertIfAbsent uses. */
interface CreateManyModel<Row> {
  createMany(args: { data: Row[]; skipDuplicates: true }): PromiseLike<{ count: number }>;
}

/**
 * Replaces `INSERT IGNORE`, and the `ON DUPLICATE KEY UPDATE col = col` that
 * means the same. True if the row went in, false if a row with its key was
 * already there. Like `INSERT IGNORE`, it also skips a row that breaks another
 * constraint, such as a foreign key, rather than throwing.
 */
export async function insertIfAbsent<Row>(
  model: CreateManyModel<Row>,
  row: NoInfer<Row>
): Promise<boolean> {
  const { count } = await model.createMany({ data: [row], skipDuplicates: true });
  return count > 0;
}

/** The part of a Prisma model that compareAndSet uses. */
interface CompareAndSetModel<Key, Where, Create, Update> {
  count(args: { where: Key }): PromiseLike<number>;
  create(args: { data: Create }): PromiseLike<unknown>;
  updateMany(args: { where: { AND: Where[] }; data: Update }): PromiseLike<{ count: number }>;
}

export type CompareAndSetResult = 'created' | 'updated' | 'unchanged';

/**
 * Replaces an `ON DUPLICATE KEY UPDATE` that contains `IF(...)`. Creates the row
 * if no row has its key. Otherwise applies `update` only if the row matches
 * `when`, in one UPDATE, so two racing writers cannot both pass the check.
 *
 * `where` is the row's whole unique key, as plain columns. It is checked:
 * matching more than one row throws rather than updating them all.
 */
export function compareAndSet<Key, Where, Create, Update>(
  model: CompareAndSetModel<Key, Where, Create, Update>,
  args: {
    where: NoInfer<Key & Where>;
    when: NoInfer<Where>;
    create: NoInfer<Create>;
    update: NoInfer<Update>;
  }
): Promise<CompareAndSetResult> {
  // Read first, as Prisma's upsert does. Inserting first and updating on a
  // duplicate deadlocks inside a transaction: every loser holds a shared lock
  // on the winner's row and then waits for an exclusive one.
  return withUniqueRetry(async () => {
    const matching = await model.count({ where: args.where });
    if (matching > 1) {
      throw new Error(`compareAndSet: where matched ${matching} rows; it must name a unique key`);
    }
    if (matching === 0) {
      await model.create({ data: args.create });
      return 'created';
    }
    const { count } = await model.updateMany({
      where: { AND: [args.where, args.when] },
      data: args.update,
    });
    return count > 0 ? 'updated' : 'unchanged';
  });
}
