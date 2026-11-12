// src/routes/csv.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { CSVController } from '../controller/csv.controller';
import { requireAdmin } from '../middleware/auth.middleware';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const csvController = new CSVController(db, io);

  router.post('/import', requireAdmin, csvController.importCSV);

  return router;
};
