import { DbClient } from '../config/database';
import { Note } from '../models/Note';

export interface NotesRepository {
  /** Newest first. */
  listForUser(userEmail: string): Promise<Note[]>;
  create(userEmail: string, content: string): Promise<Note>;
}

// Selecting the columns keeps a column added later out of the response until
// someone adds it to `Note` on purpose.
const NOTE_COLUMNS = { id: true, user_email: true, content: true, created_at: true } as const;

export function createNotesRepository(db: DbClient): NotesRepository {
  return {
    listForUser: (userEmail) =>
      db.notes.findMany({
        where: { user_email: userEmail },
        orderBy: { created_at: 'desc' },
        select: NOTE_COLUMNS,
      }),

    create: (userEmail, content) =>
      db.notes.create({
        data: { user_email: userEmail, content },
        select: NOTE_COLUMNS,
      }),
  };
}
