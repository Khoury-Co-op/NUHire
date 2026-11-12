// src/routes/interview.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { InterviewController } from '../controller/interview.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireStep } from '../middleware/step.middleware';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const interviewController = new InterviewController(db, io);

  router.post('/vote', requireAuth, requireStep(db, 'interview'), interviewController.submitVote);
  router.get('/status/finished-count', requireAuth, interviewController.getFinishedCount);
  router.post(
    '/status/finished',
    requireAuth,
    requireStep(db, 'interview'),
    interviewController.updateFinishedStatus
  );
  router.get('/group/:group_id', requireAuth, interviewController.getInterviewsByGroup);
  router.get('/popup/:resId/:groupId/:classId', requireAuth, interviewController.getInterviewPopup);
  router.get('/vids', requireAuth, interviewController.getAllInterviewVids);
  router.get('/group-size/:group_id/:class_id', requireAuth, interviewController.getGroupSize);
  router.post(
    '/batch-vote',
    requireAuth,
    requireStep(db, 'interview'),
    interviewController.batchVote
  );
  router.get(
    '/my-votes',
    requireAuth,
    requireStep(db, 'interview'),
    interviewController.getMyVotes
  );

  return router;
};
