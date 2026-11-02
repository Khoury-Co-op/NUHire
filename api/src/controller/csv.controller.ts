import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';

export class CSVController {
  constructor(
    private db: Pool,
    private io: SocketIOServer
  ) {}

  importCSV = (req: AuthRequest, res: Response): void => {
    const { class_id, assignments } = req.body;

    if (!class_id || !assignments || !Array.isArray(assignments)) {
      res.status(400).json({
        error: 'class_id and assignments array are required',
      });
      return;
    }

    if (assignments.length === 0) {
      res.status(400).json({
        error: 'assignments array cannot be empty',
      });
      return;
    }

    const updatePromises = assignments.map((assignment: any) => {
      const { email, group_id } = assignment;

      if (!email || !group_id) {
        return Promise.resolve({ skipped: true, email, reason: 'Missing email or group_id' });
      }

      return new Promise((resolve, reject) => {
        // A student who logs in before the roster is imported already has a row
        // with affiliation 'none' (the Keycloak callback creates it), and signup
        // only completes for a row on a roster, so promote 'none' to 'student'.
        // An existing admin is left alone in case the professor's own address
        // appears in the file.
        const query = `
          INSERT INTO Users (email, class, group_id, affiliation)
          VALUES (?, ?, ?, 'student')
          ON DUPLICATE KEY UPDATE
            class = VALUES(class),
            group_id = VALUES(group_id),
            affiliation = IF(affiliation = 'none', 'student', affiliation)
        `;

        this.db.query(query, [email, class_id, group_id], (err, result: any) => {
          if (err) {
            // This rejection reason is returned to the browser in `failed[]`,
            // so err.message would put MySQL's table and column names on the
            // professor's roster-import screen. The real error stays in the log.
            console.error(`❌ Database error for ${email}:`, err);
            reject({ email, error: 'Failed to assign this student' });
          } else {
            resolve({
              email,
              group_id,
              action: result.insertId ? 'inserted' : 'updated',
              affectedRows: result.affectedRows,
            });
          }
        });
      });
    });

    Promise.allSettled(updatePromises).then((results) => {
      const successful: any[] = [];
      const failed: any[] = [];
      const skipped: any[] = [];

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          if ((result.value as any).skipped) {
            skipped.push(result.value);
          } else {
            successful.push(result.value);
          }
        } else {
          failed.push(result.reason);
        }
      });

      if (successful.length > 0) {
        this.io.to(`class_${class_id}`).emit('csvGroupsImported', {
          class_id,
          successful_count: successful.length,
          total_processed: assignments.length,
          message: `${successful.length} group assignments imported successfully`,
        });
      }

      res.json({
        message: 'CSV import completed',
        class_id,
        total_assignments: assignments.length,
        successful: successful.length,
        failed: failed.length,
        skipped: skipped.length,
        results: {
          successful,
          failed,
          skipped,
        },
      });
    });
  };
}
