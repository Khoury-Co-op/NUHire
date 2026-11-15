// src/routes/job.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { JobController } from '../controller/job.controller';
import { requireAuth, requireAdmin, requireClassModerator } from '../middleware/auth.middleware';

export default (db: Pool, io: SocketIOServer, onlineStudents: Record<string, string>): Router => {
  const router = Router();
  const jobController = new JobController(db, io, onlineStudents);

  router.get('/', requireAuth, jobController.getAllJobs);
  router.get('/title', requireAuth, jobController.getJobByTitle);
  router.get('/assignment/:groupId/:classId', requireAuth, jobController.getJobAssignment);

  // Assigning a job with `reset: true` deletes the group's work. Advisor only.
  router.get('/reset-preview/:class_id', requireClassModerator(db), jobController.getResetPreview);
  router.post('/', requireAdmin, jobController.createJob);
  router.post('/update-job', requireClassModerator(db), jobController.updateJob);
  router.post('/assign-job-to-all', requireClassModerator(db), jobController.assignJobToAllGroups);

  return router;
};
