import { User as AppUser } from '../models/User';

declare global {
  namespace Express {
    interface User extends AppUser {}
    interface Request {
      user?: AppUser;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    isModerator?: boolean;
  }
}
