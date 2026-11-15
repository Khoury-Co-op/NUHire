// src/routes/group.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { GroupController } from '../controller/group.controller';
import { CatchUpController } from '../controller/catchUp.controller';
import {
  requireAuth,
  requireAdmin,
  requireClassModerator,
  requireStudent,
} from '../middleware/auth.middleware';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const groupController = new GroupController(db, io);
  const catchUpController = new CatchUpController(db, io);

  // Advisor only: anything that changes the class, and the roster reads that
  // return every student's name and email.
  router.get('/', requireAdmin, groupController.getGroups);
  router.post('/update-group', requireAdmin, groupController.updateGroup);
  router.post('/create-groups', requireAdmin, groupController.createGroups);
  router.get('/students-by-class/:classId', requireAdmin, groupController.getStudentsByClass);
  router.patch('/reassign-student', requireAdmin, groupController.reassignStudent);
  router.patch('/remove-from-group', requireAdmin, groupController.removeFromGroup);
  router.patch('/start-all-groups', requireAdmin, groupController.startAllGroups);
  router.patch('/start-group', requireAdmin, groupController.startGroup);
  router.post('/add-student', requireAdmin, groupController.addStudent);
  router.post('/create-single-group', requireAdmin, groupController.createSingleGroup);
  router.delete('/delete-student', requireAdmin, groupController.deleteStudent);
  // The professor's override for a stuck group. Admin only: it moves a whole
  // group's progress, so a student able to call it could drag their own team
  // past a step they have not done.
  router.post('/force-advance', requireAdmin, groupController.forceAdvance);
  router.get('/live/:classId', requireClassModerator(db, 'classId'), groupController.getLiveClass);

  // Students read their own group's state from these.
  router.get('/started/:classId/:groupId', requireAuth, groupController.getGroupStarted);
  router.get('/status/:classId/:groupId', requireAuth, groupController.getGroupStatus);
  router.get('/seen', requireAuth, groupController.getGroupsSeen);
  router.get('/getProgress/:classId/:groupId', requireAuth, groupController.getProgress);
  // The non-socket way to ask whether the group's barrier is open. A student
  // whose socket dropped cannot receive the release event, and the client stops
  // retrying after five attempts; this is how they recover without one. The
  // handler checks the caller is in the group it names.
  router.get('/barrier-status/:classId/:groupId', requireAuth, groupController.getBarrierStatus);

  // A late student's way to their group's current step. Identity is the session.
  router.get('/catch-up', requireStudent, catchUpController.getCatchUp);
  router.post('/catch-up', requireStudent, catchUpController.catchUp);
  return router;
};
