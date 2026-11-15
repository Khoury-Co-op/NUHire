import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { Pool } from 'mysql2';
import { dbErrorStatus } from '../config/database';

export class CandidateController {
  constructor(private db: Pool) {}

  getCandidatesByGroups = (req: AuthRequest, res: Response): void => {
    const { classId, groupIds } = req.params;
    const groupIdArray = groupIds.split(',');

    const placeholders = groupIdArray.map(() => '?').join(',');

    const query = `
      SELECT DISTINCT 
        c.resume_id as id, 
        c.f_name, 
        c.l_name, 
        c.resume_id,
        r.title
      FROM Candidates c
      INNER JOIN Resume_pdfs r ON c.resume_id = r.id
      INNER JOIN Resume res ON res.resume_number = c.resume_id
      INNER JOIN Users u ON res.student_id = u.id
      WHERE u.class = ? 
        AND u.group_id IN (${placeholders})
        AND res.checked = 1
      ORDER BY c.f_name, c.l_name
    `;

    const params = [classId, ...groupIdArray];

    this.db.query(query, params, (err, results) => {
      if (err) {
        console.error('Error fetching candidates by groups:', err);
        res.status(500).json({ error: 'Failed to fetch candidates' });
        return;
      }

      res.json(results);
    });
  };

  getCandidatesByClass = (req: AuthRequest, res: Response): void => {
    const { classId } = req.params;

    const query = `
      SELECT DISTINCT 
        c.resume_id as id, 
        c.f_name, 
        c.l_name, 
        c.resume_id,
        r.title
      FROM Candidates c
      INNER JOIN Resume_pdfs r ON c.resume_id = r.id
      INNER JOIN Resume res ON res.resume_number = c.resume_id
      INNER JOIN Users u ON res.student_id = u.id
      WHERE u.class = ?
      ORDER BY c.f_name, c.l_name
    `;

    this.db.query(query, [classId], (err, results) => {
      if (err) {
        console.error('Error fetching candidates by class:', err);
        res.status(500).json({ error: 'Failed to fetch candidates' });
        return;
      }

      res.json(results);
    });
  };

  getAllCandidates = (req: AuthRequest, res: Response): void => {
    this.db.query('SELECT * FROM Candidates', (err, results) => {
      if (err) {
        console.error('Error fetching candidates:', err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch candidates' });
        return;
      }
      res.json(results);
    });
  };

  getCandidateById = (req: AuthRequest, res: Response): void => {
    const { id } = req.params;
    this.db.query('SELECT * FROM Candidates WHERE id = ?', [id], (err, results: any[]) => {
      if (err) {
        console.error(`Error fetching candidate ${id}:`, err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch candidate' });
        return;
      }
      // A 404, not an empty 200: an empty body makes the caller's
      // response.json() throw somewhere unrelated to the real cause.
      if (results.length === 0) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }
      res.json(results[0]);
    });
  };

  getCandidateByResumeNumber = (req: AuthRequest, res: Response): void => {
    const { resume_number } = req.params;
    this.db.query(
      'SELECT * FROM Candidates WHERE resume_id = ?',
      [resume_number],
      (err, results: any[]) => {
        if (err) {
          console.error(`Error fetching candidate for resume ${resume_number}:`, err);
          res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch candidate' });
          return;
        }
        if (results.length === 0) {
          res.status(404).json({ error: 'Candidate not found' });
          return;
        }
        res.json(results[0]);
      }
    );
  };

  getCandidateByResumeNumberWithFile = (req: AuthRequest, res: Response): void => {
    const { resume_number } = req.params;

    const query = `
    SELECT 
      c.*,
      r.file_path,
      r.title
    FROM Candidates c
    LEFT JOIN Resume_pdfs r ON c.resume_id = r.id
    WHERE c.resume_id = ?
  `;

    this.db.query(query, [resume_number], (err, results: any[]) => {
      if (err) {
        console.error(`Error fetching candidate file for resume ${resume_number}:`, err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch candidate' });
        return;
      }
      // A 404 lets interview-stage/page.tsx drop the candidate; an empty 200
      // would render a card with every field undefined.
      if (results.length === 0) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }
      res.json(results[0]);
    });
  };
}
