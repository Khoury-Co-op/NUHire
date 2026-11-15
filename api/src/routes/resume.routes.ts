// src/routes/resume.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { ResumeController } from '../controller/resume.controller';
import { Server as SocketIOServer } from 'socket.io';
import { requireAuth } from '../middleware/auth.middleware';
import { requireStep } from '../middleware/step.middleware';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const resumeController = new ResumeController(db, io);

  router.post('/vote', requireAuth, requireStep(db, 'res_1'), resumeController.submitVote);
  router.get('/student/:student_id', requireAuth, resumeController.getResumesByStudent);
  router.get('/group/:group_id', requireAuth, resumeController.getResumesByGroup);
  router.get('/finished-count/:group_id/:class_id', requireAuth, resumeController.getFinishedCount);

  return router;
};
