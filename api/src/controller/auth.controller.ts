import { Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthRequest } from '../models/AuthRequest';
import { User, isAdmin } from '../models/User';
import { Pool, RowDataPacket } from 'mysql2';

// Pre-fills the signup form for someone who is not set up yet.
interface SignupName {
  firstName?: string | null;
  lastName?: string | null;
}

// The one place that decides where a user lands after logging in, shared by the
// callback, a repeat callback and the post-signup redirect so they cannot
// disagree about who needs the signup form or whether a group has started.
export async function postLoginPath(
  db: Pool,
  dbUser: User | undefined,
  email: string,
  name: SignupName
): Promise<string> {
  const signupPath =
    `/signupform?email=${encodeURIComponent(email)}` +
    `&firstName=${encodeURIComponent(name.firstName ?? '')}` +
    `&lastName=${encodeURIComponent(name.lastName ?? '')}`;

  if (!dbUser) return signupPath;

  const fullName = encodeURIComponent(`${dbUser.f_name || ''} ${dbUser.l_name || ''}`.trim());

  if (isAdmin(dbUser)) return `/advisor-dashboard?name=${fullName}`;
  if (!dbUser.f_name || !dbUser.l_name || dbUser.affiliation === 'none') return signupPath;

  try {
    const [rows] = await db
      .promise()
      .query<RowDataPacket[]>(
        'SELECT started FROM `GroupsInfo` WHERE class_id = ? AND group_id = ?',
        [dbUser.class, dbUser.group_id]
      );
    if (rows.length === 0 || rows[0].started !== 1) return '/waitingGroup';
  } catch (err) {
    console.error('Error checking group start status:', err);
    return '/waitingGroup';
  }

  return dbUser.seen === 1 ? `/dashboard?name=${fullName}` : '/about';
}

export class AuthController {
  constructor(private db: Pool) {}

  // Looks the user up and hands the decided URL to `send`, which is either a
  // plain redirect or the callback's cookie-setting redirect.
  private sendPostLoginRedirect = async (
    email: string,
    name: SignupName,
    send: (url: string) => void
  ): Promise<void> => {
    const FRONT_URL = process.env.REACT_APP_FRONT_URL;

    let dbUser: User | undefined;
    try {
      const [rows] = await this.db
        .promise()
        .query<RowDataPacket[]>('SELECT * FROM Users WHERE email = ?', [email]);
      dbUser = rows[0] as User | undefined;
    } catch (err) {
      console.error('Database error:', err);
      send(`${FRONT_URL}/?error=db_error`);
      return;
    }

    send(`${FRONT_URL}${await postLoginPath(this.db, dbUser, email, name)}`);
  };

  initiateKeycloakAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
    passport.authenticate('keycloak')(req, res, next);
  };

  handleKeycloakCallback = [
    (req: AuthRequest, res: Response, next: NextFunction) => {
      // If no OAuth code parameter, this is not a legitimate callback
      if (!req.query.code) {
        const FRONT_URL = process.env.REACT_APP_FRONT_URL;

        if (req.isAuthenticated && req.isAuthenticated() && req.user) {
          const user = req.user;
          void this.sendPostLoginRedirect(
            user.email,
            { firstName: user.f_name, lastName: user.l_name },
            (url) => res.redirect(url)
          );
        } else {
          res.redirect(`${FRONT_URL}/?error=invalid_callback`);
        }
        return;
      }

      next();
    },
    passport.authenticate('keycloak', {
      failureRedirect: `${process.env.REACT_APP_FRONT_URL}/?error=auth_failed`,
      failureFlash: false,
    }),
    (req: AuthRequest, res: Response) => {
      const user = req.user;
      const FRONT_URL = process.env.REACT_APP_FRONT_URL;

      if (!user || !user.email) {
        console.error('No user or email found after authentication');
        res.redirect(`${FRONT_URL}/?error=no_user`);
        return;
      }

      // Helper function to explicitly set cookie and redirect (for Safari)
      const setCookieAndRedirect = (redirectUrl: string) => {
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
          }

          // Explicitly set cookie in response header for Safari
          const cookieSecure = process.env.COOKIE_SECURE !== 'false';
          res.cookie('connect.sid', req.sessionID, {
            maxAge: 86400000,
            httpOnly: true,
            secure: cookieSecure,
            sameSite: cookieSecure ? 'none' : 'lax',
            path: '/',
          });

          res.redirect(redirectUrl);
        });
      };

      // Regenerate session to ensure clean state and proper cookie setting
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          res.redirect(`${FRONT_URL}/?error=session_error`);
          return;
        }

        // regenerate() drops the logged-in user, so log them back in.
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error('Login error:', loginErr);
            res.redirect(`${FRONT_URL}/?error=login_error`);
            return;
          }

          const email = user.email;
          const prof = user.keycloakProfile;
          const parts = prof.name.split(' ');
          const firstName = parts[0];
          const lastName = parts[1];

          void this.sendPostLoginRedirect(email, { firstName, lastName }, setCookieAndRedirect);
        });
      });
    },
  ];

  getAuthenticatedUser = (req: AuthRequest, res: Response): void => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    res.json(req.user);
  };

  logout = (req: AuthRequest, res: Response, next: NextFunction): void => {
    req.logout((err) => {
      if (err) {
        next(err);
        return;
      }

      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logged out successfully' });
      });
    });
  };

  moderatorLogin = (req: AuthRequest, res: Response): void => {
    const { username, password } = req.body;
    const expectedUser = process.env.MODERATOR_USERNAME;
    const expectedPass = process.env.MODERATOR_PASSWORD;

    // Without these guards a request with an empty body authenticates whenever
    // the env vars are unset, because `undefined === undefined` is true.
    if (!expectedUser || !expectedPass) {
      console.error('MODERATOR_USERNAME / MODERATOR_PASSWORD are not set; refusing login.');
      res.status(503).json({ error: 'Moderator login is not configured' });
      return;
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (username === expectedUser && password === expectedPass) {
      req.session.isModerator = true;
      res.status(200).json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  };

  verifyModerator = (req: AuthRequest, res: Response): void => {
    if (req.session.isModerator) {
      res.status(200).json({
        authenticated: true,
      });
    } else {
      res.status(401).json({ authenticated: false });
    }
  };

  handlePostSignupRedirect = (req: AuthRequest, res: Response): void => {
    const FRONT_URL = process.env.REACT_APP_FRONT_URL;

    if (!req.isAuthenticated || !req.isAuthenticated()) {
      res.redirect(`${FRONT_URL}/?error=not_authenticated`);
      return;
    }

    const user = req.user;
    void this.sendPostLoginRedirect(
      user.email,
      { firstName: user.f_name, lastName: user.l_name },
      (url) => res.redirect(url)
    );
  };
}
