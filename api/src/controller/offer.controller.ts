import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { Pool } from 'mysql2';

export class OfferController {
  constructor(private db: Pool) {}

  createOffer = (req: AuthRequest, res: Response): void => {
    const { candidate_id } = req.body;

    // The group and section come from the session, never the body. The insert
    // below is an upsert on UNIQUE (class_id, group_id), so a body-supplied
    // group_id would let any logged-in student overwrite another group's offer.
    const group_id = req.user?.group_id;
    const class_id = req.user?.class;

    if (!group_id || !class_id) {
      res.status(400).json({ error: 'You are not in a group yet' });
      return;
    }

    if (!candidate_id) {
      res.status(400).json({ error: 'candidate_id is required' });
      return;
    }

    // A group has one offer, so two members submitting at once update the same
    // row rather than showing the professor the group twice.
    //
    // `status` is not taken from the body. The only caller sends 'pending', and
    // accepting is the professor's call through PUT /offers/:id (requireAdmin);
    // a student posting status: 'accepted' would otherwise accept their own.
    //
    // The ON DUPLICATE clause moves candidate_id only while the offer is pending
    // or rejected, and puts a rejected offer back to pending, so the group can
    // try again after a rejection but a late click cannot repoint an accepted one.
    // LAST_INSERT_ID(id) makes insertId the existing row's id on the update path,
    // where it would otherwise be 0 and the client would store a bogus offer id.
    this.db.query(
      `INSERT INTO Offers (group_id, class_id, candidate_id, status)
       VALUES (?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         candidate_id = IF(status IN ('pending', 'rejected'), VALUES(candidate_id), candidate_id),
         status       = IF(status = 'rejected', 'pending', status),
         id           = LAST_INSERT_ID(id)`,
      [group_id, class_id, candidate_id],
      (err, result: any) => {
        if (err) {
          console.error('Error creating offer:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        res.json({
          id: result.insertId,
          message: 'Offer submitted successfully',
          offer_id: result.insertId,
        });
      }
    );
  };

  getOffersByGroupAndClass = (req: AuthRequest, res: Response): void => {
    const { group_id, class_id } = req.params;

    const query = `SELECT * FROM Offers WHERE class_id = ? AND group_id = ?`;

    this.db.query(query, [class_id, group_id], (err, results) => {
      if (err) {
        console.error('Error fetching pending offers:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      res.json(results);
    });
  };

  getOffersByClass = (req: AuthRequest, res: Response): void => {
    const { class_id } = req.params;

    const query = `SELECT * FROM Offers WHERE class_id = ?`;

    this.db.query(query, [class_id], (err, results) => {
      if (err) {
        console.error('Error fetching pending offers:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      res.json(results);
    });
  };

  getOfferVotes = (req: AuthRequest, res: Response): void => {
    const { group_id, class_id, candidate_id } = req.params;

    // candidate_id is a Resume_pdfs id, which is what resume_number and InterviewPage.candidate_id hold.
    const query = `
      SELECT
        u.id,
        u.f_name,
        u.l_name,
        r.vote,
        i.question1,
        i.question2,
        i.question3,
        i.question4
      FROM Users u
      LEFT JOIN Resume r
        ON r.student_id = u.id AND r.group_id = u.group_id AND r.class = u.class AND r.resume_number = ?
      LEFT JOIN InterviewPage i
        ON i.student_id = u.id AND i.group_id = u.group_id AND i.class = u.class AND i.candidate_id = ?
      WHERE u.group_id = ? AND u.class = ? AND u.affiliation = 'student'
      ORDER BY u.l_name, u.f_name
    `;

    this.db.query(query, [candidate_id, candidate_id, group_id, class_id], (err, results) => {
      if (err) {
        console.error('Error fetching offer votes:', err);
        res.status(500).json({ error: 'Failed to load offer votes' });
        return;
      }

      res.json(results);
    });
  };

  updateOffer = (req: AuthRequest, res: Response): void => {
    const { offer_id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      res.status(400).json({ error: "Status must be 'accepted' or 'rejected'" });
      return;
    }

    this.db.query(
      `UPDATE Offers SET status = ? WHERE id = ?`,
      [status, offer_id],
      (err, result: any) => {
        if (err) {
          console.error('Error updating offer:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        if (result.affectedRows === 0) {
          res.status(404).json({ error: 'Offer not found' });
          return;
        }

        res.json({ message: 'Offer updated successfully' });
      }
    );
  };
}
