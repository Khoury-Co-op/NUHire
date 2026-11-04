// ============================================
// src/controller/job.controller.ts
// ============================================

import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import type { Pool as PromisePool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Every group-scoped table a reset wipes. The reset deletes from this list and
// the reset preview counts from it, so the warning the professor reads cannot
// drift from what actually gets deleted. Table and column names are constants,
// never user input, which is why they are interpolated below.
//
// Offers, GroupConfirmations and Step_Completion are here for the same reason:
// each describes work the reset erases. Leaving Offers behind locked a wiped
// group out of ever submitting again, and a leftover confirmation or completion
// marks the group as done with an empty table behind it.
export const GROUP_WORK_TABLES = [
  { table: 'Resume', classColumn: 'class', label: 'resume votes' },
  { table: 'InterviewPage', classColumn: 'class', label: 'interview ratings' },
  { table: 'Interview_Status', classColumn: 'class', label: 'interview progress' },
  { table: 'InterviewPopup', classColumn: 'class', label: 'curveball interview results' },
  { table: 'GroupConfirmations', classColumn: 'class', label: 'shortlist confirmations' },
  { table: 'Step_Completion', classColumn: 'class', label: 'step completions' },
  { table: 'Offers', classColumn: 'class_id', label: 'offers' },
] as const;

type Queryable = PromisePool | PoolConnection;

async function groupStudentEmails(
  db: Queryable,
  classId: number,
  groupId: number
): Promise<string[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT email FROM Users WHERE group_id = ? AND class = ? AND affiliation = 'student'",
    [groupId, classId]
  );
  return rows.map((row) => row.email as string);
}

export interface GroupResetPreview {
  group_id: number;
  students: number;
  counts: Record<string, number>;
  offer_status: 'pending' | 'accepted' | 'rejected' | null;
}

// What a reset of one group would erase, counted from the live tables.
export async function previewGroupReset(
  db: Queryable,
  classId: number,
  groupId: number
): Promise<GroupResetPreview> {
  const counts: Record<string, number> = {};
  for (const { table, classColumn, label } of GROUP_WORK_TABLES) {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${classColumn} = ? AND group_id = ?`,
      [classId, groupId]
    );
    counts[label] = Number(rows[0].n);
  }

  const emails = await groupStudentEmails(db, classId, groupId);
  counts.notes = 0;
  if (emails.length > 0) {
    const placeholders = emails.map(() => '?').join(',');
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM Notes WHERE user_email IN (${placeholders})`,
      emails
    );
    counts.notes = Number(rows[0].n);
  }

  const [offers] = await db.query<RowDataPacket[]>(
    'SELECT status FROM Offers WHERE class_id = ? AND group_id = ? LIMIT 1',
    [classId, groupId]
  );

  return {
    group_id: groupId,
    students: emails.length,
    counts,
    offer_status: offers.length > 0 ? offers[0].status : null,
  };
}

// Erases one group's work and sends its students back to the job description.
// Runs on the caller's connection so it joins the caller's transaction.
export async function resetGroupWork(
  conn: PoolConnection,
  classId: number,
  groupId: number
): Promise<number> {
  await conn.query(
    "UPDATE Users SET `current_page` = 'jobdes' WHERE group_id = ? AND class = ? AND affiliation = 'student'",
    [groupId, classId]
  );
  await conn.query("UPDATE Progress SET step = 'job_description' WHERE crn = ? AND group_id = ?", [
    classId,
    groupId,
  ]);

  for (const { table, classColumn } of GROUP_WORK_TABLES) {
    await conn.query(`DELETE FROM \`${table}\` WHERE ${classColumn} = ? AND group_id = ?`, [
      classId,
      groupId,
    ]);
  }

  const emails = await groupStudentEmails(conn, classId, groupId);
  if (emails.length > 0) {
    const placeholders = emails.map(() => '?').join(',');
    await conn.query(`DELETE FROM Notes WHERE user_email IN (${placeholders})`, emails);
  }
  return emails.length;
}

const CLEARED_TABLES = [...GROUP_WORK_TABLES.map(({ table }) => table), 'Notes'];

export class JobController {
  constructor(
    private db: Pool,
    private io: SocketIOServer,
    private onlineStudents: Record<string, string>
  ) {}

  getAllJobs = (req: AuthRequest, res: Response): void => {
    const { class_id } = req.query; // Get class_id from query params

    if (!class_id) {
      res.status(400).json({ error: 'class_id is required' });
      return;
    }

    this.db.query(
      'SELECT * FROM job_descriptions WHERE class_id = ?',
      [class_id],
      (err, results) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(results);
      }
    );
  };

  createJob = async (req: AuthRequest, res: Response): Promise<void> => {
    const { title, filePath, class_id } = req.body; // Add class_id

    if (!title || !filePath || !class_id) {
      res.status(400).json({ error: 'Missing title, filePath, or class_id' });
      return;
    }

    try {
      const sql = 'INSERT INTO job_descriptions (title, file_path, class_id) VALUES (?, ?, ?)';
      this.db.query(sql, [title, filePath, class_id], (err) => {
        if (err) {
          console.error('Error inserting into DB:', err);
          res.status(500).json({ error: 'Database error' });
          return;
        }
        res.json({ message: 'Job description added successfully!' });
      });
    } catch (error) {
      console.error('Error inserting into DB:', error);
      res.status(500).json({ error: 'Database error' });
    }
  };

  getJobByTitle = (req: AuthRequest, res: Response): void => {
    const { title, class_id } = req.query; // Add class_id

    if (!title || !class_id) {
      res.status(400).json({ error: 'Title and class_id are required' });
      return;
    }

    this.db.query(
      'SELECT * FROM job_descriptions WHERE title = ? AND class_id = ?',
      [title, class_id],
      (err, results: any[]) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        if (results.length === 0) {
          res.status(404).json({ error: 'Job description not found' });
          return;
        }

        res.json(results[0]);
      }
    );
  };

  deleteJobFile = (req: AuthRequest, res: Response): void => {
    const fileName = req.params.fileName;
    const classId = req.query.class_id;

    if (!classId) {
      res.status(400).json({ error: 'class_id is required' });
      return;
    }

    const filePath = path.join(__dirname, '../../uploads/jobdescription', fileName);

    this.db.query(
      'DELETE FROM job_descriptions WHERE file_path = ? AND class_id = ?',
      [`uploads/jobdescription/${fileName}`, classId],
      (err, result: any) => {
        if (err) {
          console.error('Database deletion error:', err);
          res.status(500).json({ error: 'Database deletion failed' });
          return;
        }

        if (result.affectedRows === 0) {
          res.status(404).json({ error: 'Job description not found for this class' });
          return;
        }

        this.db.query(
          'SELECT COUNT(*) as count FROM job_descriptions WHERE file_path = ?',
          [`uploads/jobdescription/${fileName}`],
          (err, results: any[]) => {
            if (err) {
              console.error('Error checking file usage:', err);
              res.json({
                message: `Database entry deleted successfully for class ${classId}. Physical file not removed.`,
              });
              return;
            }

            if (results[0].count === 0 && fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              res.json({
                message: `File "${fileName}" and database entry deleted successfully.`,
              });
            } else {
              res.json({
                message: `Database entry deleted for class ${classId}. File still in use by other classes.`,
              });
            }
          }
        );
      }
    );
  };

  // GET /jobs/reset-preview/:class_id?group_id=  (group_id omitted = every group)
  // Feeds the confirmation the professor must pass before a reset, so it can say
  // what will actually be lost instead of a hardcoded list.
  getResetPreview = async (req: AuthRequest, res: Response): Promise<void> => {
    const classId = parseInt(req.params.class_id);
    const groupParam = req.query.group_id;
    const groupId = groupParam === undefined ? null : parseInt(String(groupParam));

    if (isNaN(classId) || classId <= 0 || (groupId !== null && (isNaN(groupId) || groupId <= 0))) {
      res
        .status(400)
        .json({ error: 'class_id (and group_id, if given) must be positive integers' });
      return;
    }

    try {
      const db = this.db.promise();
      let groupIds: number[];
      if (groupId !== null) {
        groupIds = [groupId];
      } else {
        const [rows] = await db.query<RowDataPacket[]>(
          'SELECT DISTINCT group_id FROM `GroupsInfo` WHERE class_id = ? ORDER BY group_id',
          [classId]
        );
        groupIds = rows.map((row) => row.group_id as number);
      }

      const groups: GroupResetPreview[] = [];
      for (const id of groupIds) {
        groups.push(await previewGroupReset(db, classId, id));
      }
      res.json({ class_id: classId, groups });
    } catch (error) {
      console.error('Error building reset preview:', error);
      res.status(500).json({ error: 'Could not load what a reset would erase' });
    }
  };

  // `reset` must be exactly `true` to erase anything. Without it this only
  // changes the job, so fixing a typo in a title no longer wipes the class.
  assignJobToAllGroups = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class_id, job_title } = req.body;
    const reset = req.body.reset === true;

    if (!class_id || !job_title) {
      res.status(400).json({
        error: 'Missing required fields: class_id, job_title',
      });
      return;
    }

    const classIdInt = parseInt(class_id);
    if (isNaN(classIdInt) || classIdInt <= 0) {
      res.status(400).json({ error: 'class_id must be a valid positive integer.' });
      return;
    }

    // This runs every DELETE below inside one real transaction. It used to send
    // START TRANSACTION through the pool, which hands each query whichever
    // connection is free, so the statements ran on different connections, every
    // DELETE auto-committed on its own, the ROLLBACK in the catch applied to a
    // connection that had done nothing, and a connection went back to the pool
    // with a transaction still open on it. A failure halfway through this loop
    // left one group's votes deleted and the next group's intact, permanently.
    // Acquiring is outside the try below on purpose: there is no connection to
    // release yet. But it must not be bare either. When the pool is saturated
    // or the DB is down the acquire rejects, Express 4 does not catch a
    // rejected async handler, and the request hangs with no response while
    // the process-level handler only logs. Answer 503 so the advisor sees it.
    let conn;
    try {
      conn = await this.db.promise().getConnection();
    } catch (acquireErr) {
      console.error('Could not get a database connection for assignJobToAllGroups:', acquireErr);
      res.status(503).json({ error: 'Database is busy, please try again' });
      return;
    }

    try {
      // Get all groups for the class
      const [groupsResult] = (await conn.query(
        'SELECT DISTINCT group_id FROM `GroupsInfo` WHERE class_id = ? ORDER BY group_id',
        [class_id]
      )) as any[];

      if (groupsResult.length === 0) {
        res.status(404).json({ error: 'No groups found for this class' });
        return;
      }

      const groupIds = groupsResult.map((group: any) => group.group_id);

      await conn.beginTransaction();

      for (const groupId of groupIds) {
        await conn.query(
          `INSERT INTO Job_Assignment (\`group\`, \`class\`, job)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE job = VALUES(job)`,
          [groupId, classIdInt, job_title]
        );

        if (reset) {
          await resetGroupWork(conn, classIdInt, groupId);
        }
      }

      await conn.commit();

      // Only after the commit. These used to fire inside the loop, so a failure
      // partway through told the earlier groups their job had changed and then
      // rolled the change back underneath them.
      for (const groupId of groupIds) {
        this.io.to(`group_${groupId}_class_${classIdInt}`).emit('jobUpdated', {
          job: job_title,
          reset,
        });
      }

      res.json({
        message: reset
          ? 'Job assigned to all groups and their work was reset'
          : 'Job assigned to all groups; no work was erased',
        class_id: classIdInt,
        job_title,
        reset,
        groups_updated: groupIds.length,
        group_ids: groupIds,
        cleared_tables: reset ? CLEARED_TABLES : [],
      });
    } catch (error) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }

      console.error('Error assigning job to all groups:', error);
      res.status(500).json({
        error: 'Database error occurred while assigning job to all groups',
      });
    } finally {
      conn.release();
    }
  };

  // Same `reset` contract as assignJobToAllGroups, for one group.
  updateJob = async (req: AuthRequest, res: Response): Promise<void> => {
    const { job_group_id, class_id, job } = req.body;
    const reset = req.body.reset === true;

    if (!job_group_id || !class_id || !job || job.length === 0) {
      res.status(400).json({ error: 'Group ID, class ID, and job are required.' });
      return;
    }

    const groupIdInt = parseInt(job_group_id);
    if (isNaN(groupIdInt) || groupIdInt <= 0) {
      res.status(400).json({ error: 'job_group_id must be a valid positive integer.' });
      return;
    }

    const classIdInt = parseInt(class_id);
    if (isNaN(classIdInt) || classIdInt <= 0) {
      res.status(400).json({ error: 'class_id must be a valid positive integer.' });
      return;
    }

    // Same fix as assignJobToAllGroups: one connection, a real transaction, and
    // a release in `finally`. Through the pool the reset's DELETEs each
    // committed on their own and the ROLLBACK did nothing.
    // See assignJobToAllGroups for why the acquire has its own catch.
    let conn;
    try {
      conn = await this.db.promise().getConnection();
    } catch (acquireErr) {
      console.error('Could not get a database connection for updateJob:', acquireErr);
      res.status(503).json({ error: 'Database is busy, please try again' });
      return;
    }

    try {
      await conn.beginTransaction();

      const jobTitle = Array.isArray(job) ? job[0] : job;
      await conn.query(
        `INSERT INTO Job_Assignment (\`group\`, \`class\`, job)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE job = VALUES(job)`,
        [groupIdInt, classIdInt, jobTitle]
      );

      const studentsAffected = reset ? await resetGroupWork(conn, classIdInt, groupIdInt) : 0;

      await conn.commit();

      const roomID = `group_${groupIdInt}_class_${classIdInt}`;
      this.io.to(roomID).emit('jobUpdated', {
        job: jobTitle,
        reset,
      });

      res.json({
        message: reset
          ? 'Group job updated and its work was reset'
          : 'Group job updated; no work was erased',
        job_group_id: groupIdInt,
        class_id: classIdInt,
        job: jobTitle,
        reset,
        cleared_tables: reset ? CLEARED_TABLES : [],
        students_affected: studentsAffected,
        job_assignment_updated: true,
      });
    } catch (error) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }

      console.error('Error updating job and clearing data:', error);
      res.status(500).json({
        error: 'Database error occurred while updating job and clearing data',
      });
    } finally {
      conn.release();
    }
  };

  getJobAssignment = (req: AuthRequest, res: Response): void => {
    const { groupId, classId } = req.params;

    this.db.query(
      'SELECT job FROM Job_Assignment WHERE `group` = ? AND `class` = ?',
      [groupId, classId],
      (err, results: any[]) => {
        if (err) {
          console.error('Error fetching job assignment:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        if (results.length === 0) {
          res.status(201).json({ message: 'No job assignment found for this group' });
          return;
        }

        res.json({ job: results[0].job });
      }
    );
  };
}
