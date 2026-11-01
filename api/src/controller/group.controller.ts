import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { User, isAdmin } from '../models/User';
import { Pool, RowDataPacket } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { PoolConnection } from 'mysql2/promise';
import {
  RES_REVIEW_BARRIER_STEP,
  broadcastGroupBarrier,
  connectedEmails,
  evaluateGroupBarrier,
} from '../config/socket';
import { STEP_ORDER, STEP_TO_ROUTE, leftmostStep, recordStep } from '../config/steps';

// A student moved into a group arrives there now, whatever their stamp says.
// Kept, a stamp from before the new group's barrier released makes them look
// present all along: the barrier reads closed for a group already through it,
// and the student is never offered the catch-up. Someone never stamped stays
// unstamped, since they still have not shown up.
const RESTAMP_ON_MOVE = 'present_at = IF(present_at IS NULL, NULL, CURRENT_TIMESTAMP)';

export class GroupController {
  constructor(
    private db: Pool,
    private io: SocketIOServer
  ) {}

  // Re-evaluate a group's barrier after its roster changed, and release the
  // group if that change completed it. Fire-and-forget on purpose: the caller
  // has already told the student their change succeeded, and a failure to
  // recount must not turn that into a 500.
  private recountBarrier(classId: number | string, groupId: number | string): void {
    broadcastGroupBarrier(this.io, this.db, classId, groupId, RES_REVIEW_BARRIER_STEP).catch(
      (error) => {
        console.error(`Error recounting the barrier for group ${groupId}/${classId}:`, error);
      }
    );
  }

  getGroups = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class: classId } = req.query;

    try {
      const promiseDb = this.db.promise();
      const [groupsResult] = (await promiseDb.query(
        'SELECT DISTINCT group_id FROM `GroupsInfo` WHERE class_id = ? ORDER BY group_id',
        [classId]
      )) as any[];

      const groupIds = groupsResult.map((group: any) => group.group_id);
      res.json(groupIds);
    } catch (error) {
      console.error('Error fetching groups:', error);
      res.status(500).json({ error: 'Failed to fetch groups' });
    }
  };

  updateGroup = (req: AuthRequest, res: Response): void => {
    const { group_id, students } = req.body;

    if (!group_id || students.length === 0) {
      res.status(400).json({ error: 'Group ID and students are required.' });
      return;
    }

    const queries = students.map((email: string) => {
      return new Promise((resolve, reject) => {
        this.db.query(
          'UPDATE Users SET `group_id` = ? WHERE email = ?',
          [group_id, email],
          (err, result) => {
            if (err) reject(err);
            resolve(result);
          }
        );
      });
    });

    Promise.all(queries)
      .then(() => res.json({ message: 'Group updated successfully!' }))
      .catch((error) => res.status(500).json({ error: (error as any).message }));
  };

  createGroups = (req: AuthRequest, res: Response): void => {
    const { class_id, num_groups } = req.body;

    if (!class_id || !num_groups) {
      res.status(400).json({
        error: 'Missing required fields: class_id, num_groups',
      });
      return;
    }

    this.db.query(
      'SELECT COUNT(*) as group_count FROM `GroupsInfo` WHERE class_id = ?',
      [class_id],
      (err, result: any[]) => {
        if (err) {
          console.error('Error checking existing groups:', err);
          res.status(500).json({ error: 'Failed to check existing groups' });
          return;
        }

        const existingGroupCount = result[0].group_count;

        if (existingGroupCount > 0) {
          res.status(400).json({
            error: 'Groups already exist for this class',
            existing_groups: existingGroupCount,
          });
          return;
        }

        const insertPromises = [];
        for (let i = 1; i <= num_groups; i++) {
          const insertPromise = new Promise((resolve, reject) => {
            const query = `
            INSERT INTO GroupsInfo (class_id, group_id, started)
            VALUES (?, ?, 0)
          `;

            this.db.query(query, [class_id, i], (insertErr, insertResult: any) => {
              if (insertErr) {
                reject({ id: i, error: insertErr.message });
              } else {
                resolve({
                  id: i,
                  insertId: insertResult.insertId,
                });
              }
            });
          });

          insertPromises.push(insertPromise);
        }

        Promise.allSettled(insertPromises).then((results) => {
          const successful = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => (r as any).value);
          const failed = results
            .filter((r) => r.status === 'rejected')
            .map((r) => (r as any).reason);

          if (failed.length > 0) {
            console.error(`Failed to create ${failed.length} groups:`, failed);
          }

          res.json({
            message: 'Groups created successfully',
            class_id: parseInt(class_id),
            groups_created: successful.length,
            groups_failed: failed.length,
            groups: successful,
          });
        });
      }
    );
  };

  getStudentsByClass = (req: AuthRequest, res: Response): void => {
    const { classId } = req.params;

    const query = `SELECT * FROM Users WHERE class = ?`;

    this.db.query(query, [classId], (err, results) => {
      if (err) {
        console.error('Error fetching students by class:', err);
        res.status(500).json({ error: 'Failed to fetch students' });
        return;
      }

      res.json(results);
    });
  };

  reassignStudent = (req: AuthRequest, res: Response): void => {
    const { email, new_group_id, class_id } = req.body;

    if (!email || !new_group_id || !class_id) {
      res.status(400).json({
        error: 'Missing required fields: email, new_group_id, class_id',
      });
      return;
    }

    const updateQuery = `UPDATE Users SET group_id = ?, ${RESTAMP_ON_MOVE} WHERE email = ? AND class = ?`;

    this.db.query(updateQuery, [new_group_id, email, class_id], (err, result: any) => {
      if (err) {
        console.error('Error reassigning student to new group:', err);
        res.status(500).json({ error: 'Failed to reassign student' });
        return;
      }

      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'Student not found in this class' });
        return;
      }

      const roomId = `group_${new_group_id}_class_${class_id}`;
      this.io.to(roomId).emit('studentAddedToGroup', {
        groupId: new_group_id,
        classId: class_id,
      });

      // A moved student's confirmation and step-completion rows describe the
      // group they LEFT. Left in place they are ignored by the current-member
      // joins, but the moment the student is moved back (a mis-click, undone)
      // they would reappear as already confirmed and already finished for a
      // selection they never saw. Clear them before recounting.
      const clearStale = (cb: () => void) => {
        this.db.query(
          'DELETE gc FROM GroupConfirmations gc JOIN Users u ON u.id = gc.student_id WHERE u.email = ? AND u.class = ?',
          [email, class_id],
          (e1) => {
            if (e1) console.error('Could not clear stale confirmations on reassign:', e1);
            this.db.query(
              'DELETE sc FROM Step_Completion sc JOIN Users u ON u.id = sc.student_id WHERE u.email = ? AND u.class = ?',
              [email, class_id],
              (e2) => {
                if (e2) console.error('Could not clear stale completions on reassign:', e2);
                cb();
              }
            );
          }
        );
      };

      clearStale(() => {
        // The roster is what the barrier counts against, so a change to it can
        // open or close the gate. Re-evaluating here is what stops a group that
        // was waiting on somebody who has just been moved out from waiting
        // forever. (The OLD group is not recounted: this handler never learns
        // which group the student came from. That is TCH-16.)
        this.recountBarrier(class_id, new_group_id);

        res.json({
          message: 'Student reassigned successfully',
          email,
          new_group_id,
          class_id,
        });
      });
    });
  };

  removeFromGroup = (req: AuthRequest, res: Response): void => {
    const { email, class_id } = req.body;

    if (!email || !class_id) {
      res.status(400).json({
        error: 'Missing required fields: email, class_id',
      });
      return;
    }

    const getGroupQuery = 'SELECT group_id FROM Users WHERE email = ? AND class = ?';

    this.db.query(getGroupQuery, [email, class_id], (err, results: any) => {
      if (err) {
        console.error('Error fetching student group:', err);
        res.status(500).json({ error: 'Failed to fetch student information' });
        return;
      }

      const studentGroupId = results[0]?.group_id;

      const updateQuery = 'UPDATE Users SET group_id = NULL WHERE email = ? AND class = ?';

      this.db.query(updateQuery, [email, class_id], (err, result: any) => {
        if (err) {
          console.error('Error removing student from group:', err);
          res.status(500).json({ error: 'Failed to remove student from group' });
          return;
        }

        if (result.affectedRows === 0) {
          res.status(404).json({ error: 'Student not found in this class' });
          return;
        }

        if (studentGroupId && this.io) {
          const roomId = `group_${studentGroupId}_class_${class_id}`;
          this.io.to(roomId).emit('studentRemovedFromGroup', {
            email,
            groupId: studentGroupId,
            classId: class_id,
          });
        }

        // Same reason as reassignStudent: rows for the group this student just
        // left would come back as "already confirmed / already finished" the
        // moment an advisor re-adds them. Clear, then recount.
        this.db.query(
          'DELETE gc FROM GroupConfirmations gc JOIN Users u ON u.id = gc.student_id WHERE u.email = ? AND u.class = ?',
          [email, class_id],
          (e1) => {
            if (e1) console.error('Could not clear stale confirmations on remove:', e1);
            this.db.query(
              'DELETE sc FROM Step_Completion sc JOIN Users u ON u.id = sc.student_id WHERE u.email = ? AND u.class = ?',
              [email, class_id],
              (e2) => {
                if (e2) console.error('Could not clear stale completions on remove:', e2);

                // Removing the member a group was waiting on can complete it.
                // The barrier is a count against the roster, and nothing else
                // recounts it, so without this the remaining members stay
                // blocked on someone who is no longer in their group.
                if (studentGroupId) this.recountBarrier(class_id, studentGroupId);

                res.json({
                  message: 'Student removed from group successfully',
                  email,
                  class_id,
                });
              }
            );
          }
        );
      });
    });
  };

  // Start every group in the class that has not started yet, or just one, and
  // take attendance: whoever has the app open now counts toward the group's
  // gates, and anyone else counts once they connect. A stamp from some earlier
  // day would otherwise have the group wait for a student who is not in the
  // room. Groups already started keep theirs, so pressing Start All again
  // mid-class is harmless.
  //
  // One transaction, so a failure between the two cannot leave a started group
  // with nobody marked present.
  private async startGroups(classId: number | string, groupId?: number | string): Promise<void> {
    const oneGroup = groupId !== undefined;
    const online = [...(await connectedEmails(this.io))];

    const conn = await this.db.promise().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE GroupsInfo g
           LEFT JOIN Users u ON u.class = g.class_id AND u.group_id = g.group_id
            SET g.started = 1, u.present_at = NULL
          WHERE g.class_id = ? AND g.started = 0 ${oneGroup ? 'AND g.group_id = ?' : ''}`,
        oneGroup ? [classId, groupId] : [classId]
      );
      if (online.length > 0) {
        await conn.query(
          `UPDATE Users SET present_at = CURRENT_TIMESTAMP
            WHERE class = ? AND present_at IS NULL AND email IN (${online.map(() => '?').join(',')})`,
          [classId, ...online]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  startAllGroups = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class_id } = req.body;

    if (!class_id) {
      res.status(400).json({
        error: 'Missing required field: class_id',
      });
      return;
    }

    try {
      await this.startGroups(class_id);
      this.io.to(`class_${class_id}`).emit('groupStartedClass');
      res.json({
        message: 'All groups started successfully',
        class_id,
      });
    } catch (err) {
      console.error('Error starting all groups:', err);
      res.status(500).json({ error: 'Failed to start all groups' });
    }
  };

  startGroup = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class_id, group_id } = req.body;

    if (!class_id || !group_id) {
      res.status(400).json({
        error: 'Missing required fields: class_id, group_id',
      });
      return;
    }

    try {
      await this.startGroups(class_id, group_id);
      this.io.to(`class_${class_id}`).emit('groupStartedGroup', { group_id });
      res.json({
        message: 'Group started successfully',
        class_id,
        group_id,
      });
    } catch (err) {
      console.error('Error starting group:', err);
      res.status(500).json({ error: 'Failed to start group' });
    }
  };

  getGroupStarted = (req: AuthRequest, res: Response): void => {
    const { classId, groupId } = req.params;

    const query = 'SELECT started FROM `GroupsInfo` WHERE class_id = ? AND group_id = ?';

    this.db.query(query, [classId, groupId], (err, results: any[]) => {
      if (err) {
        console.error('Error checking if group is started:', err);
        res.status(500).json({ error: 'Failed to check group status' });
        return;
      }

      if (results.length === 0) {
        res.status(404).json({ error: 'Group not found' });
        return;
      }

      res.json({ started: results[0].started });
    });
  };

  getGroupStatus = (req: AuthRequest, res: Response): void => {
    const { classId, groupId } = req.params;

    const query = 'SELECT started FROM `GroupsInfo` WHERE class_id = ? AND group_id = ?';

    this.db.query(query, [classId, groupId], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching group status:', err);
        res.status(500).json({ error: 'Failed to fetch group status' });
        return;
      }

      if (results.length === 0) {
        res.status(404).json({ error: 'Group not found' });
        return;
      }

      res.json({ started: results[0].started });
    });
  };

  getGroupsSeen = (req: AuthRequest, res: Response): void => {
    const { email } = req.query;

    const query = `SELECT seen FROM Users WHERE email = ?`;

    this.db.query(query, [email], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching groups seen status:', err);
        res.status(500).json({ error: 'Failed to fetch groups seen status' });
        return;
      }

      if (results.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ seen: results[0].seen });
    });
  };

  createSingleGroup = (req: AuthRequest, res: Response): void => {
    const { class_id, group_id } = req.body;

    if (!class_id || !group_id) {
      res.status(400).json({
        error: 'Missing required fields: class_id, group_id',
      });
      return;
    }

    const query = `
      INSERT INTO GroupsInfo (class_id, group_id, started)
      VALUES (?, ?, 0)
    `;

    this.db.query(query, [class_id, group_id], (err) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          res.status(409).json({ error: 'Group already exists' });
          return;
        }
        console.error('Error creating group:', err);
        res.status(500).json({ error: 'Failed to create group' });
        return;
      }

      res.json({
        message: 'Group created successfully',
        class_id: parseInt(class_id),
        group_id: parseInt(group_id),
      });
    });
  };

  addStudent = (req: AuthRequest, res: Response): void => {
    const { email, class_id, group_id, f_name, l_name } = req.body;

    if (!email || !class_id || !group_id) {
      res.status(400).json({
        error: 'Missing required fields: email, class_id, group_id',
      });
      return;
    }

    const checkStudentQuery = 'SELECT * FROM Users WHERE email = ?';

    this.db.query(checkStudentQuery, [email], (checkErr, checkResults: any[]) => {
      if (checkErr) {
        console.error('Error checking student:', checkErr);
        res.status(500).json({ error: 'Failed to check student' });
        return;
      }

      if (!checkResults || checkResults.length === 0) {
        const insertQuery = `
          INSERT INTO Users (email, affiliation, class, group_id)
          VALUES (?, 'student', ?, ?)
        `;

        this.db.query(insertQuery, [email, class_id, group_id], (insertErr) => {
          if (insertErr) {
            console.error('Error creating student:', insertErr);
            res.status(500).json({ error: 'Failed to create student' });
            return;
          }

          const roomId = `group_${group_id}_class_${class_id}`;
          this.io.to(roomId).emit('studentAddedToGroup', {
            groupId: group_id,
            classId: class_id,
          });

          // A new member raises the group's total, so the barrier has to be
          // recounted against the roster it now has.
          this.recountBarrier(class_id, group_id);

          res.status(201).json({
            message: 'Student created and added to group successfully',
            email,
            group_id,
            class_id,
            f_name,
            l_name,
            action: 'created',
          });
        });
        return;
      }

      const existingStudent = checkResults[0];

      if (existingStudent.class === class_id) {
        res.status(409).json({ error: 'Student already exists in this class' });
        return;
      }

      const updateQuery = `UPDATE Users SET class = ?, group_id = ?, ${RESTAMP_ON_MOVE} WHERE email = ?`;

      this.db.query(updateQuery, [class_id, group_id, email], (updateErr, updateResult: any) => {
        if (updateErr) {
          console.error('Error updating student:', updateErr);
          res.status(500).json({ error: 'Failed to add student to class and group' });
          return;
        }

        if (updateResult.affectedRows === 0) {
          res.status(404).json({ error: 'Student not added' });
          return;
        }

        const roomId = `group_${group_id}_class_${class_id}`;
        this.io.to(roomId).emit('studentAddedToGroup', {
          groupId: group_id,
          classId: class_id,
        });

        this.recountBarrier(class_id, group_id);

        res.json({
          message: 'Student added to group successfully',
          email,
          group_id,
          class_id,
          action: 'updated',
        });
      });
    });
  };

  deleteStudent = (req: AuthRequest, res: Response): void => {
    const { email, class_id } = req.body;

    if (!email || !class_id) {
      res.status(400).json({ error: 'Missing required fields: email, class_id' });
      return;
    }

    this.db.query(
      'DELETE FROM Users WHERE email = ? AND class = ?',
      [email, class_id],
      (err, result: any) => {
        if (err) {
          res.status(500).json({ error: 'Failed to delete student' });
          return;
        }
        if (result.affectedRows === 0) {
          res.status(404).json({ error: 'Student not found' });
          return;
        }
        res.json({ message: 'Student deleted successfully', email, class_id });
      }
    );
  };

  getProgress = (req: AuthRequest, res: Response): void => {
    const { classId, groupId } = req.params;

    const query = `
      SELECT step
      FROM Progress
      WHERE crn = ? AND group_id = ?
    `;

    this.db.query(query, [classId, groupId], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching group progress:', err);
        res.status(500).json({ error: 'Failed to fetch group progress' });
        return;
      }

      const leftmost = leftmostStep(results.map((row: any) => row.step));

      res.json({ progress: leftmost });
    });
  };

  // How many members of this group have finished a step, answered over HTTP,
  // so a client that missed the release event while its socket was down can
  // poll and recover on its own.
  getBarrierStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    const { classId, groupId } = req.params;
    const user: User = req.user!;
    const step = typeof req.query.step === 'string' ? req.query.step : RES_REVIEW_BARRIER_STEP;

    if (!(STEP_ORDER as readonly string[]).includes(step)) {
      res.status(400).json({ error: `Unknown step: ${step}` });
      return;
    }

    // A student may only read their own group. The params are client-supplied,
    // and without this check anyone could walk another section's group numbers
    // and watch who in it has finished.
    if (!isAdmin(user)) {
      const ownGroup =
        String(user.group_id) === String(groupId) && String(user.class) === String(classId);
      if (!ownGroup) {
        res.status(403).json({ error: 'Forbidden: that is not your group' });
        return;
      }
    }

    try {
      const status = await evaluateGroupBarrier(this.db, classId, groupId, step);
      res.json(status);
    } catch (error) {
      console.error('Error evaluating group barrier:', error);
      res.status(500).json({ error: 'Failed to evaluate group barrier' });
    }
  };

  getLiveClass = (req: AuthRequest, res: Response): void => {
    const { classId } = req.params;

    // Joined on the student's current group, so rows left from an old group do not count.
    const query = `
      SELECT
        u.id,
        u.f_name,
        u.l_name,
        u.email,
        u.group_id,
        u.present_at,
        g.started,
        p.step,
        sc.completed_at AS review_completed_at,
        gc.confirmed_at
      FROM Users u
      -- Nothing makes (class_id, group_id) unique, so collapse duplicates rather
      -- than doubling every member of a duplicated group.
      LEFT JOIN (
        SELECT class_id, group_id, MAX(started) AS started
        FROM GroupsInfo
        GROUP BY class_id, group_id
      ) g ON g.class_id = u.class AND g.group_id = u.group_id
      LEFT JOIN Progress p ON p.email = u.email AND p.crn = u.class AND p.group_id = u.group_id
      LEFT JOIN Step_Completion sc
        ON sc.student_id = u.id AND sc.class = u.class AND sc.group_id = u.group_id AND sc.step = ?
      LEFT JOIN GroupConfirmations gc
        ON gc.student_id = u.id AND gc.class = u.class AND gc.group_id = u.group_id
      WHERE u.class = ? AND u.affiliation = 'student' AND u.group_id IS NOT NULL
      ORDER BY u.group_id, u.l_name, u.f_name
    `;

    this.db.query<RowDataPacket[]>(query, [RES_REVIEW_BARRIER_STEP, classId], (err, students) => {
      if (err) {
        console.error('Error fetching live class view:', err);
        res.status(500).json({ error: 'Failed to fetch live class view' });
        return;
      }

      connectedEmails(this.io)
        .then((online) => {
          res.json(students.map((student) => ({ ...student, online: online.has(student.email) })));
        })
        .catch((error) => {
          console.error('Error reading connected sockets:', error);
          res.status(500).json({ error: 'Failed to fetch live class view' });
        });
    });
  };

  // The professor's way past a stuck group. Writes the step for every member,
  // records the barrier behind it as satisfied so nothing pulls them back, and
  // emits moveGroup to the room.
  //
  // `target_step` must be the step right after the group's current one (its
  // slowest member's, the number getProgress shows the professor). That is the
  // only move the clients can follow: each page's moveGroup handler navigates
  // only to its own successor, and useProgress redirects only a student who is
  // ahead of their server step. A group pushed two steps would ignore the emit
  // and stay put, while the professor got a 200 saying it worked.
  //
  // /jobdes and /makeOffer have no moveGroup listener, so job_description ->
  // res_1 and offer -> employer write the rows but nobody navigates.
  //
  // Works with nobody connected: the barrier is re-evaluated when a socket
  // joins the room, so a member who reconnects later finds their button
  // unlocked rather than being moved.
  forceAdvance = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class_id, group_id, target_step } = req.body;

    if (!class_id || !group_id || !target_step) {
      res.status(400).json({
        error: 'Missing required fields: class_id, group_id, target_step',
      });
      return;
    }

    const stepOrder: readonly string[] = STEP_ORDER;
    const targetIndex = stepOrder.indexOf(target_step);
    if (targetIndex <= 0) {
      // 'none' is index 0 and is not somewhere to send a group.
      res.status(400).json({
        error: `target_step must be one of: ${STEP_ORDER.slice(1).join(', ')}`,
      });
      return;
    }

    // Declared outside the try so `finally` can release it, but checked out
    // inside it: Express 4 does not catch a rejected promise, so a full pool
    // or a down database would otherwise leave the professor with no response.
    let conn: PoolConnection | undefined;

    try {
      conn = await this.db.promise().getConnection();
      await conn.beginTransaction();

      const [members] = await conn.query<(RowDataPacket & Pick<User, 'id' | 'email'>)[]>(
        "SELECT id, email FROM Users WHERE group_id = ? AND class = ? AND affiliation = 'student'",
        [group_id, class_id]
      );

      if (members.length === 0) {
        // Not an error the professor can fix by retrying, so say what is
        // actually wrong rather than reporting a success that moved nobody.
        await conn.rollback();
        res.status(404).json({
          error: `No students on the roster for group ${group_id} in class ${class_id}`,
        });
        return;
      }

      // Where the group is now, read in the same transaction as the write so
      // the step this decision is based on is the step that gets overwritten.
      // Same query and same reduction as getProgress, deliberately: the
      // advisor dashboard shows the professor that number, and what this
      // accepts has to line up with what they were just looking at.
      const [progressRows] = await conn.query<RowDataPacket[]>(
        'SELECT step FROM Progress WHERE crn = ? AND group_id = ?',
        [class_id, group_id]
      );
      const currentStep = leftmostStep(progressRows.map((row) => row.step));
      const nextStep: string | undefined = stepOrder[stepOrder.indexOf(currentStep) + 1];

      if (target_step !== nextStep) {
        // See the header comment: any other target writes rows the connected
        // clients will not act on, and reports success anyway. Say where the
        // group actually is and what the one accepted move is, so the advisor
        // can act on the refusal instead of pressing the same button again.
        await conn.rollback();
        res.status(400).json({
          error:
            nextStep === undefined
              ? `Group ${group_id} in class ${class_id} is already at the final step (${currentStep})`
              : `Group ${group_id} in class ${class_id} is at ${currentStep}; the only step it can be forced to is ${nextStep}`,
          current_step: currentStep,
          next_step: nextStep ?? null,
        });
        return;
      }

      await recordStep(conn, class_id, group_id, members, target_step);

      await conn.commit();
    } catch (error) {
      // `conn` is undefined when getConnection() itself was what failed, and
      // rollback can reject in its own right when the connection is the thing
      // that broke. Neither may escape this block: the whole point of the try
      // is that the professor gets a response, so the rollback failure is
      // logged and the 500 below still goes out.
      if (conn) {
        await conn.rollback().catch((rollbackError) => {
          console.error('Rollback failed after force-advance error:', rollbackError);
        });
      }
      console.error('Error force-advancing group:', error);
      res.status(500).json({ error: 'Failed to force-advance group' });
      return;
    } finally {
      conn?.release();
    }

    // Audit, not diagnostics: a teacher overriding a gate is a thing someone
    // will need to reconstruct afterwards when a group ends up somewhere
    // unexpected. One line per override, and overrides are rare.
    console.info(
      `[AUDIT] force-advance: ${req.user?.email} moved group ${group_id} in class ${class_id} to ${target_step}`
    );

    const roomId = `group_${group_id}_class_${class_id}`;
    this.io.to(roomId).emit('moveGroup', {
      classId: Number(class_id),
      groupId: Number(group_id),
      targetPage: STEP_TO_ROUTE[target_step],
    });

    // Also re-announce the res-review barrier. A member still sitting on
    // res-review with a disabled button is released by that event, not by
    // moveGroup, and the rows written above have just made it true.
    broadcastGroupBarrier(this.io, this.db, class_id, group_id, RES_REVIEW_BARRIER_STEP).catch(
      (error) => {
        console.error('Error re-announcing the barrier after force-advance:', error);
      }
    );

    res.json({
      message: 'Group force-advanced successfully',
      class_id,
      group_id,
      target_step,
      target_page: STEP_TO_ROUTE[target_step],
    });
  };
}
