import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { isAdmin } from '../models/User';
import { Pool, RowDataPacket } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { emitToClassModerators, markPresent } from '../config/socket';

export class UserController {
  constructor(
    private db: Pool,
    private io: SocketIOServer
  ) {}

  getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      this.db.query('SELECT * FROM Users', (err, results) => {
        if (err) {
          console.error('Error fetching users:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(results);
      });
    } catch (error) {
      console.error('Unexpected error in getAllUsers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  // Completes signup for the logged-in user. The row already exists by the
  // time this runs: the Keycloak callback inserts it with affiliation 'none',
  // and the instructor's CSV import creates students ahead of time. So this
  // only fills in names and, for emails listed in Moderator, promotes to admin.
  //
  // The email comes from the session, and the requested affiliation is only
  // granted once it checks out: admin needs a Moderator row, student a roster.
  createUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { First_name, Last_name, Affiliation } = req.body;
      const me = req.user!;

      if (!First_name || !Last_name || !Affiliation) {
        res.status(400).json({ message: 'First name, last name, and affiliation are required' });
        return;
      }

      const finish = (affiliation: 'student' | 'admin') => {
        this.db.query(
          'UPDATE Users SET f_name = ?, l_name = ?, affiliation = ? WHERE email = ?',
          [First_name, Last_name, affiliation, me.email],
          (updateErr) => {
            if (updateErr) {
              console.error('Failed to update user record:', updateErr);
              res.status(500).json({ error: 'Failed to update user' });
              return;
            }

            // Only the advisor's Manage Groups view cares, and only for the
            // class this student is in.
            if (me.class) {
              emitToClassModerators(this.io, this.db, me.class, 'userAdded');
            }

            res.status(200).json({
              message: 'User information updated successfully',
              action: 'updated',
              f_name: First_name,
              l_name: Last_name,
              email: me.email,
              affiliation,
            });
          }
        );
      };

      if (Affiliation === 'admin') {
        this.db.query(
          'SELECT crn FROM Moderator WHERE admin_email = ? LIMIT 1',
          [me.email],
          (err, results) => {
            if (err) {
              console.error('Database error during moderator lookup:', err);
              res.status(500).json({ error: 'Failed to verify instructor status' });
              return;
            }
            if ((results as RowDataPacket[]).length === 0) {
              res.status(403).json({ message: 'Please use an instructor email to sign up.' });
              return;
            }
            finish('admin');
          }
        );
        return;
      }

      if (Affiliation === 'student') {
        // Being on a roster is what makes someone a student, and the CSV import
        // is the only thing that puts a row on one. It sets both `affiliation`
        // and `class`, so either is proof. `class` is checked as well because
        // rows imported before that was true are still sitting at 'none' with a
        // class assigned, and rejecting them would strand a real student on the
        // signup form. A row with neither was auto-created at login and belongs
        // to nobody's class yet.
        if (me.affiliation !== 'student' && me.class == null) {
          res.status(404).json({
            message: 'Student not found. Please contact your instructor to be added to the class.',
            action: 'student_not_found',
          });
          return;
        }
        finish('student');
        return;
      }

      res.status(400).json({ message: 'Invalid affiliation' });
    } catch (error) {
      console.error('Unexpected error in createUser:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getStudents = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { class: classId } = req.query;

      let query = "SELECT f_name, l_name, email, group_id FROM Users WHERE affiliation = 'student'";
      const params: any[] = [];

      if (classId) {
        query += ' AND class = ?';
        params.push(classId);
      }

      this.db.query(query, params, (err, results) => {
        if (err) {
          console.error('Error fetching students:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(results);
      });
    } catch (error) {
      console.error('Unexpected error in getStudents:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateCurrentPage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { page, user_email } = req.body;

      if (!page || !user_email) {
        res.status(400).json({ error: 'Page and email are required.' });
        return;
      }

      // Every student page calls this on mount, so it doubles as attendance
      // for a student whose socket arrived with no session and was never
      // stamped. Taken from the session, never from the body's email, and
      // skipped once stamped, so it is not a write per page load.
      const me = req.user;
      if (me?.affiliation === 'student' && !me.present_at) {
        await markPresent(this.io, this.db, me).catch((err) => {
          console.error(`Could not mark ${me.email} present:`, err);
        });
      }

      this.db.query(
        'UPDATE Users SET `current_page` = ? WHERE email = ?',
        [page, user_email],
        (err) => {
          if (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: 'Failed to update current page.' });
            return;
          }
          res.json({ message: 'Page updated successfully!' });
        }
      );
    } catch (error) {
      console.error('Unexpected error in updateCurrentPage:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateUserClass = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { email, class: classId } = req.body;

      if (req.user?.email !== email && !isAdmin(req.user)) {
        res.status(403).json({ message: 'Forbidden: You can only update your own profile' });
        return;
      }

      if (!email || !classId) {
        res.status(400).json({ error: 'Email and class are required.' });
        return;
      }

      this.db.query(
        'UPDATE Users SET `class` = ? WHERE email = ?',
        [classId, email],
        (err, result) => {
          if (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: 'Failed to update class.' });
            return;
          }

          const updateResult = result as RowDataPacket;
          if (updateResult.affectedRows === 0) {
            res.status(404).json({ error: 'User not found.' });
            return;
          }

          res.json({ message: 'Class updated successfully!' });
        }
      );
    } catch (error) {
      console.error('Unexpected error in updateUserClass:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateUserSeen = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email is required.' });
        return;
      }
      this.db.query('UPDATE Users SET `seen` = 1 WHERE email = ?', [email], (err) => {
        if (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Failed to update seen.' });
          return;
        }
        res.json({ message: 'Seen updated successfully!' });
      });
    } catch (error) {
      console.error('Unexpected error in updateUserSeen:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  // Answers only for the caller.
  check = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { email } = req.params;

      if (!email) {
        res.status(400).json({ error: 'Email is required.' });
        return;
      }

      if (email !== req.user?.email) {
        res.status(403).json({ error: 'You can only check your own registration.' });
        return;
      }

      this.db.query(
        'SELECT group_id, class AS class_id FROM Users WHERE email = ?',
        [email],
        (err, results) => {
          if (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: 'Failed to check if email is within users.' });
            return;
          }

          const rows = results as RowDataPacket[];
          if (rows.length === 0) {
            res.json({ exists: false });
            return;
          }

          res.json({
            exists: true,
            group_id: rows[0].group_id,
            class_id: rows[0].class_id,
          });
        }
      );
    } catch (error) {
      console.error('Unexpected error in check:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
