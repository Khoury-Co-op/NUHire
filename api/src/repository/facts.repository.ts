import { DbClient } from '../config/database';
import { WaitingFacts } from '../models/WaitingFacts';

export interface FactsRepository {
  /** null for a class that has never saved any. */
  findByClass(classId: number): Promise<WaitingFacts | null>;
  /** Creates the class's row, or replaces all three facts in it. */
  save(classId: number, facts: WaitingFacts): Promise<void>;
}

export function createFactsRepository(db: DbClient): FactsRepository {
  return {
    findByClass: (classId) =>
      db.waitingFacts.findUnique({
        where: { class_id: classId },
        select: { one: true, two: true, three: true },
      }),

    save: async (classId, { one, two, three }) => {
      // One statement, as before. On MySQL Prisma's upsert is a SELECT and then
      // an INSERT or UPDATE, so two first saves for a class can both insert and
      // one fails on the primary key. OAS-213 replaces this with a retried upsert.
      await db.$executeRaw`
        INSERT INTO WaitingFacts (class_id, one, two, three) VALUES (${classId}, ${one}, ${two}, ${three})
        ON DUPLICATE KEY UPDATE one = ${one}, two = ${two}, three = ${three}`;
    },
  };
}
