// src/routes/user.routes.ts

import { Router } from 'express';
import { Pool } from 'mysql2';
import { UserController } from '../controller/user.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { Server as SocketIOServer } from 'socket.io';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const userController = new UserController(db, io);

  router.post('/', requireAuth, userController.createUser);
  // Full roster dumps. Nothing in the frontend calls these today.
  router.get('/', requireAdmin, userController.getAllUsers);
  router.get('/students', requireAdmin, userController.getStudents);
  router.post('/update-currentpage', requireAuth, userController.updateCurrentPage);
  router.post('/update-user-class', requireAuth, userController.updateUserClass);
  router.post('/update-seen', requireAuth, userController.updateUserSeen);
  router.get('/check/:email', requireAuth, userController.check);

  return router;
};
