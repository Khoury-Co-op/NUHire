// src/routes/progress.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { ProgressController } from '../controller/progress.controller';
import { requireAuth, requireStudent } from '../middleware/auth.middleware';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const progressController = new ProgressController(db, io);

  router.get('/group/:crn/:group_id', requireAuth, progressController.getProgressByGroup);
  router.get('/user/:email', requireAuth, progressController.getProgressByUser);
  router.post('/', requireAuth, progressController.updateProgress);

  // Group-selection confirmations for res-review-group. No :group_id or
  // :student_id params on purpose: the controller takes all three of
  // group_id, class and student_id from the session, so there is nothing for a
  // client to spoof and nothing to forget to scope by class.
  router.get('/confirmations', requireStudent, progressController.getGroupConfirmations);
  router.post('/confirmations', requireStudent, progressController.confirmGroupSelection);
  router.delete('/confirmations', requireStudent, progressController.unconfirmGroupSelection);

  return router;
};
