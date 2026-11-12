// src/middleware/auth.middleware.ts

import { Response, NextFunction } from 'express';
import { Pool, RowDataPacket } from 'mysql2';
import { AuthRequest } from '../models/AuthRequest';
import { isAdmin } from '../models/User';

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: 'Unauthorized: Please log in' });
    return;
  }
  next();
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: 'Unauthorized: Please log in' });
    return;
  }

  if (!isAdmin(req.user)) {
    res.status(403).json({ message: 'Forbidden: Admin access required' });
    return;
  }

  next();
};

// requireAdmin, plus the class in the URL or body must be one this admin teaches (a
// Moderator row with their email). requireAdmin alone lets any professor read
// any section's students. Use this on admin routes that take a class id.
export const requireClassModerator =
  (db: Pool, param = 'class_id') =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    requireAdmin(req, res, async () => {
      const crn = Number(req.params[param] ?? req.body?.[param]);
      if (!Number.isInteger(crn)) {
        res.status(400).json({ error: 'Invalid class' });
        return;
      }
      try {
        const [rows] = await db
          .promise()
          .query<RowDataPacket[]>(
            'SELECT 1 FROM Moderator WHERE crn = ? AND admin_email = ? LIMIT 1',
            [crn, req.user?.email]
          );
        if (rows.length === 0) {
          res.status(403).json({ error: 'Forbidden: not your class' });
          return;
        }
        next();
      } catch (err) {
        console.error('Class access check failed:', err);
        res.status(500).json({ error: 'Could not check class access' });
      }
    });
  };

// Accepts either a Keycloak admin session or the legacy moderator login
// (session.isModerator, set by POST /auth/moderator-login). The /moderator/crns
// routes are driven from /mod-dashboard, which still uses the legacy login.
// When SEC-5 removes that login this collapses into requireAdmin.
export const requireModerator = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.session?.isModerator === true) {
    next();
    return;
  }
  requireAdmin(req, res, next);
};

export const requireStudent = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: 'Unauthorized: Please log in' });
    return;
  }

  if (req.user?.affiliation !== 'student') {
    res.status(403).json({ message: 'Forbidden: Student access required' });
    return;
  }

  next();
};
