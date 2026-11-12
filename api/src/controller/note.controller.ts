import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { dbErrorStatus } from '../config/database';
import { NotesRepository } from '../repository/notes.repository';

export class NoteController {
  constructor(private notes: NotesRepository) {}

  getNotes = async (req: AuthRequest, res: Response): Promise<void> => {
    // Notes are private. Always use the authenticated identity; a client-supplied
    // user_email let any student read any other student's notes.
    const userEmail = req.user?.email;
    if (!userEmail) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    try {
      const notes = await this.notes.listForUser(userEmail);
      res.json(notes);
    } catch (err) {
      // err.message names the table and column that failed, which handed
      // any student a map of the schema. Log it, return nothing useful.
      console.error('Error fetching notes:', err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch notes' });
    }
  };

  createNote = async (req: AuthRequest, res: Response): Promise<void> => {
    const { content } = req.body;
    // Ignore any client-supplied email; notes belong to the caller.
    const user_email = req.user?.email;

    if (!user_email) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    // mysql2 stored a number as text. Prisma rejects anything but a string, so
    // that is a 400 here rather than a 500 from the query.
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Note content is required' });
      return;
    }

    try {
      const note = await this.notes.create(user_email, content);
      res.status(200).json({ content, id: note.id });
    } catch (err) {
      console.error('Error creating note:', err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to save note' });
    }
  };
}
