// src/middleware/step.middleware.ts

import { Response, NextFunction } from 'express';
import { Pool, RowDataPacket } from 'mysql2';
import { AuthRequest } from '../models/AuthRequest';
import { isAdmin } from '../models/User';
import { STEP_ORDER } from '../config/steps';

const ORDER: readonly string[] = STEP_ORDER;

// Refuses the request unless stored step has reached minStep
// Admin can still pass them through manually
export const requireStep =
  (db: Pool, minStep: string) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (isAdmin(req.user)) {
      next();
      return;
    }

    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }

    const crn = req.user?.class;
    const groupId = req.user?.group_id;
    if (!crn || !groupId) {
      res.status(409).json({ error: 'You are not assigned to a group yet', currentStep: 'none' });
      return;
    }

    // Scoped to the student's current class and group so a row left over
    // from before a move does not let them act at the old group's step.
    db.query(
      'SELECT step FROM Progress WHERE email = ? AND crn = ? AND group_id = ?',
      [email, crn, groupId],
      (err, rows) => {
        if (err) {
          console.error('Error checking step:', err);
          res.status(500).json({ error: 'Could not verify your step' });
          return;
        }

        const stored: string = (rows as RowDataPacket[])[0]?.step ?? 'none';
        if (ORDER.indexOf(stored) < ORDER.indexOf(minStep)) {
          res.status(409).json({ error: 'Step not reached yet', currentStep: stored });
          return;
        }
        next();
      }
    );
  };
