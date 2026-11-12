import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { Pool, RowDataPacket } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { dbErrorStatus } from '../config/database';
import { gateMemberIds } from '../config/socket';
import { User } from '../models/User';

type SessionStudent = { id: number; groupId: number; classId: number };

// Who a rating or a finish belongs to, from the session rather than the request
// body, so a student cannot file one under a classmate. requireStep already
// refuses a student with no group; an admin skips that check and has none.
const sessionStudent = (req: AuthRequest): SessionStudent | null => {
  const user: User = req.user!;
  if (!user.group_id || !user.class) return null;
  return { id: user.id, groupId: user.group_id, classId: user.class };
};

export class InterviewController {
  constructor(
    private db: Pool,
    private io: SocketIOServer
  ) {}

  submitVote = (req: AuthRequest, res: Response): void => {
    const {
      student_id,
      group_id,
      studentClass,
      question1,
      question2,
      question3,
      question4,
      candidate_id,
    } = req.body;

    if (
      !student_id ||
      !group_id ||
      !studentClass ||
      !question1 ||
      !question2 ||
      !question3 ||
      !question4 ||
      !candidate_id
    ) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const query = `
      INSERT INTO InterviewPage
        (student_id, group_id, class, question1, question2, question3, question4, candidate_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          question1 = VALUES(question1),
          question2 = VALUES(question2),
          question3 = VALUES(question3),
          question4 = VALUES(question4)
      `;

    this.db.query(
      query,
      [
        student_id,
        group_id,
        studentClass,
        question1,
        question2,
        question3,
        question4,
        candidate_id,
      ],
      (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: 'Database error' });
          return;
        }
        res.status(200).json({ message: 'Interview result updated successfully' });
      }
    );
  };

  getFinishedCount = async (req: AuthRequest, res: Response): Promise<void> => {
    const { group_id, class_id } = req.query;

    if (!group_id || !class_id) {
      res.status(400).json({ error: 'group_id and class_id are required' });
      return;
    }

    try {
      const { count } = await this.interviewProgress(String(class_id), String(group_id));
      res.json({ finishedCount: count });
    } catch (err) {
      console.error('Error counting finished interviews:', err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch finished count' });
    }
  };

  // How many of the members the interview gate waits for have finished, out of
  // how many. Only rows for those members count: a student moved out leaves
  // their row under the old group, and counting rows the total does not include
  // could push the count past it or stall it short.
  private async interviewProgress(
    classId: number | string,
    groupId: number | string
  ): Promise<{ count: number; total: number }> {
    const ids = await gateMemberIds(this.db, classId, groupId);
    if (ids.length === 0) return { count: 0, total: 0 };

    const [[row]] = await this.db.promise().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS finishedCount
         FROM Interview_Status s
         JOIN Users u ON u.id = s.student_id AND u.group_id = s.group_id AND u.class = s.class
        WHERE s.group_id = ? AND s.class = ? AND s.finished = 1
          AND u.id IN (${ids.map(() => '?').join(',')})`,
      [groupId, classId, ...ids]
    );
    return { count: Number(row.finishedCount), total: ids.length };
  }

  updateFinishedStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    const { finished } = req.body;

    if (typeof finished === 'undefined') {
      res.status(400).json({ error: 'finished is required' });
      return;
    }

    const student = sessionStudent(req);
    if (!student) {
      res.status(409).json({ error: 'You are not assigned to a group yet' });
      return;
    }
    const { id, groupId, classId } = student;

    try {
      const promiseDb = this.db.promise();
      await promiseDb.query(
        `INSERT INTO Interview_Status (student_id, finished, group_id, class)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE finished = VALUES(finished), group_id = VALUES(group_id), class = VALUES(class)`,
        [id, !!finished, groupId, classId]
      );
      const { count, total } = await this.interviewProgress(classId, groupId);

      this.io
        .to(`group_${groupId}_class_${classId}`)
        .emit('interviewStatusUpdated', { count, total });
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating interview finished status:', err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to update finished status' });
    }
  };

  // The total every group gate on the frontend compares against: the present
  // members, or the whole roster before anyone is stamped (see gateMemberIds).
  getGroupSize = async (req: AuthRequest, res: Response): Promise<void> => {
    const { group_id, class_id } = req.params;
    try {
      const members = await gateMemberIds(this.db, class_id, group_id);
      res.json({ group_id, count: members.length });
    } catch (err) {
      console.error('Error fetching group size:', err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch group size' });
    }
  };

  getInterviewsByGroup = (req: AuthRequest, res: Response): void => {
    const { group_id } = req.params;
    const { class: studentClass } = req.query;

    let query = 'SELECT * FROM InterviewPage WHERE group_id = ?';
    let params: any[] = [group_id];

    if (studentClass) {
      query = `
        SELECT r.*, u.f_name, u.l_name
        FROM InterviewPage r
        JOIN Users u ON r.student_id = u.id
        WHERE r.group_id = ? AND u.class = ?
      `;
      params = [group_id, studentClass];
    }

    this.db.query(query, params, (err, results) => {
      if (err) {
        console.error(`Error fetching interviews for group ${group_id}:`, err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch interviews' });
        return;
      }
      res.json(results);
    });
  };

  getInterviewPopup = (req: AuthRequest, res: Response): void => {
    const { resId, groupId, classId } = req.params;

    const query =
      'SELECT * FROM InterviewPopup WHERE candidate_id = ? AND group_id = ? AND class = ?';

    this.db.query(query, [resId, groupId, classId], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching interview popup votes:', err);
        res.status(500).json({ error: 'Failed to fetch interview popup votes' });
        return;
      }

      const result = results[0] || {
        question1: 0,
        question2: 0,
        question3: 0,
        question4: 0,
      };

      res.json(result);
    });
  };

  getAllInterviewVids = (req: AuthRequest, res: Response): void => {
    this.db.query('SELECT * FROM Interview_vids', (err, results) => {
      if (err) {
        console.error('Error fetching interview videos:', err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch interview videos' });
        return;
      }
      res.json(results);
    });
  };

  batchVote = async (req: AuthRequest, res: Response): Promise<void> => {
    const { votes } = req.body;

    if (!Array.isArray(votes) || votes.length === 0) {
      res.status(400).json({ error: 'Invalid votes array' });
      return;
    }

    const student = sessionStudent(req);
    if (!student) {
      res.status(409).json({ error: 'You are not assigned to a group yet' });
      return;
    }

    const values = votes.map((vote) => [
      student.id,
      student.groupId,
      student.classId,
      vote.question1,
      vote.question2,
      vote.question3,
      vote.question4,
      vote.candidate_id,
    ]);

    // The unique key is (student_id, candidate_id), so a student moved to
    // another group updates their old row. Moving group_id and class with it
    // keeps the rating visible to the group they are in now.
    const query = `
      INSERT INTO InterviewPage (student_id, group_id, class, question1, question2, question3, question4, candidate_id)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        group_id = VALUES(group_id),
        class = VALUES(class),
        question1 = VALUES(question1),
        question2 = VALUES(question2),
        question3 = VALUES(question3),
        question4 = VALUES(question4)
    `;

    try {
      await this.db.promise().query(query, [values]);
      res.json({ success: true, votesCount: votes.length });
    } catch (err) {
      console.error('Error saving batch interview votes:', err, 'Values:', values);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to save votes' });
    }
  };

  // The candidates the caller has rated in their current group, so the
  // interview page resumes at the first one they have not.
  getMyVotes = async (req: AuthRequest, res: Response): Promise<void> => {
    const student = sessionStudent(req);
    if (!student) {
      res.status(409).json({ error: 'You are not assigned to a group yet' });
      return;
    }

    try {
      const [rows] = await this.db
        .promise()
        .query<RowDataPacket[]>(
          'SELECT candidate_id FROM InterviewPage WHERE student_id = ? AND group_id = ? AND class = ?',
          [student.id, student.groupId, student.classId]
        );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching own interview votes:', err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to load your saved ratings' });
    }
  };
}
