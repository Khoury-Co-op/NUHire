import { DbClient } from '../config/database';
import { WaitingFacts } from '../models/WaitingFacts';
import { withUniqueRetry } from './writes';

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
      await withUniqueRetry(() =>
        db.waitingFacts.upsert({
          where: { class_id: classId },
          create: { class_id: classId, one, two, three },
          update: { one, two, three },
        })
      );
    },
  };
}
