// src/routes/candidate.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { CandidateController } from '../controller/candidate.controller';
import { requireAuth } from '../middleware/auth.middleware';

export default (db: Pool): Router => {
  const router = Router();
  const candidateController = new CandidateController(db);

  router.get(
    '/by-groups/:classId/:groupIds',
    requireAuth,
    candidateController.getCandidatesByGroups
  );
  router.get('/by-class/:classId', requireAuth, candidateController.getCandidatesByClass);
  router.get('/', requireAuth, candidateController.getAllCandidates);
  router.get('/:id', requireAuth, candidateController.getCandidateById);
  router.get('/resume/:resume_number', requireAuth, candidateController.getCandidateByResumeNumber);
  router.get(
    '/resume-with-file/:resume_number',
    requireAuth,
    candidateController.getCandidateByResumeNumberWithFile
  );

  return router;
};
