// src/routes/note.routes.ts
import { Router } from 'express';
import { PrismaDb } from '../config/database';
import { NoteController } from '../controller/note.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { createNotesRepository } from '../repository/notes.repository';

export default (prisma: PrismaDb): Router => {
  const router = Router();
  const noteController = new NoteController(createNotesRepository(prisma));

  router.get('/', requireAuth, noteController.getNotes);
  router.post('/', requireAuth, noteController.createNote);

  return router;
};
