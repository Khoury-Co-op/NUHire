// src/controller/catchUp.controller.ts

import { Response } from 'express';
import { Pool, RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { Server as SocketIOServer } from 'socket.io';
import { AuthRequest } from '../models/AuthRequest';
import { User } from '../models/User';
import { dbErrorStatus } from '../config/database';
import {
  RES_REVIEW_BARRIER_STEP,
  emitToClassModerators,
  evaluateGroupBarrier,
  presentMembers,
} from '../config/socket';
import { catchUpStep, recordStep } from '../config/steps';

type Student = Pick<User, 'id' | 'email'> & Required<Pick<User, 'group_id' | 'class'>>;

// A student who arrives after their group finished the solo resume review is
// offered the group's current step instead of starting from the beginning.
export class CatchUpController {
  constructor(
    private db: Pool,
    private io: SocketIOServer
  ) {}

  // Group and class come from Users, not the session, which holds whatever
  // group the student had when they logged in.
  private async offerFor(studentId: number): Promise<{ student: Student; step: string } | null> {
    const promiseDb = this.db.promise();
    const [[student]] = await promiseDb.query<(RowDataPacket & Student)[]>(
      "SELECT id, email, group_id, class FROM Users WHERE id = ? AND affiliation = 'student'",
      [studentId]
    );
    if (!student?.group_id || !student.class) return null;

    const [members, barrier, [progress]] = await Promise.all([
      presentMembers(this.db, student.class, student.group_id),
      evaluateGroupBarrier(this.db, student.class, student.group_id, RES_REVIEW_BARRIER_STEP),
      promiseDb.query<RowDataPacket[]>(
        'SELECT email, step FROM Progress WHERE crn = ? AND group_id = ?',
        [student.class, student.group_id]
      ),
    ]);

    const stepOf = new Map(progress.map((row) => [row.email as string, row.step as string]));
    const othersSteps = members
      .filter((member) => member.id !== student.id)
      .map((member) => stepOf.get(member.email) ?? 'none');
    const step = catchUpStep(othersSteps, stepOf.get(student.email) ?? 'none', barrier.released);
    return step ? { student, step } : null;
  }

  getCatchUp = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const offer = await this.offerFor(req.user!.id);
      res.json({ step: offer?.step ?? null });
    } catch (err) {
      console.error('Error reading catch-up offer:', err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to check where your group is' });
    }
  };

  catchUp = async (req: AuthRequest, res: Response): Promise<void> => {
    let conn: PoolConnection | undefined;
    try {
      const offer = await this.offerFor(req.user!.id);
      if (!offer) {
        res.status(409).json({ error: 'Your group is not ahead of you' });
        return;
      }
      const { student, step } = offer;

      conn = await this.db.promise().getConnection();
      await conn.beginTransaction();
      await recordStep(conn, student.class, student.group_id, [student], step);
      await conn.commit();

      emitToClassModerators(this.io, this.db, student.class, 'progressUpdated', {
        crn: student.class,
        group_id: student.group_id,
        step,
        email: student.email,
      });
      res.json({ step });
    } catch (err) {
      await conn?.rollback().catch((rollbackErr) => {
        console.error('Rollback failed after catch-up error:', rollbackErr);
      });
      console.error('Error catching a student up to their group:', err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to join your group' });
    } finally {
      conn?.release();
    }
  };
}
