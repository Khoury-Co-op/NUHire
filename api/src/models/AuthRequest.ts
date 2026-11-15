// src/models/AuthRequest.ts

import { Request } from 'express';
import { Session } from 'express-session';
import { User } from './User';

export interface AuthRequest extends Request {
  user?: User;
  session: Session & {
    passport?: { user?: number | string };
    isModerator?: boolean;
  };
}
