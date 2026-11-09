import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { Pool } from 'mysql2';
import { backfillPdfText } from '../config/pdfText';
import { PdfTextRepository } from '../repository/pdfText.repository';

export class ModeratorController {
  constructor(
    private db: Pool,
    private pdfs: PdfTextRepository
  ) {}

  addModeratorCRN = async (req: AuthRequest, res: Response): Promise<void> => {
    const { admin_email, crn } = req.body;
    if (!admin_email || !crn) {
      res.status(400).json({ error: 'admin_email and crn are required' });
      return;
    }

    // Creating a class seeds job descriptions, resumes, candidates and
    // interview videos, all on one connection, so a failure partway rolls back
    // instead of leaving a half-seeded class whose CRN blocks recreating it.
    const conn = await this.db.promise().getConnection();

    try {
      await conn.beginTransaction();

      await conn.query('INSERT INTO Moderator (admin_email, crn) VALUES (?, ?)', [
        admin_email,
        crn,
      ]);

      const jobDescriptions = [
        { title: 'Carbonite', file_path: 'uploads/jobdescription/carbonite-jobdes.pdf' },
        {
          title: 'Cygilant',
          file_path: 'uploads/jobdescription/Cygilant Security Research Job Description.pdf',
        },
        {
          title: 'Motionlogic',
          file_path: 'uploads/jobdescription/QA Coop Motionlogic (Berlin, Germany).pdf',
        },
        { title: 'Source One', file_path: 'uploads/jobdescription/SourceOneJobDescription.pdf' },
        {
          title: 'Two Six Labs',
          file_path:
            'uploads/jobdescription/Two Six Labs Data Visualization Co-op Job Description.pdf',
        },
      ];

      for (const job of jobDescriptions) {
        await conn.query(
          'INSERT IGNORE INTO job_descriptions (title, file_path, class_id) VALUES (?, ?, ?)',
          [job.title, job.file_path, crn]
        );
      }

      const resumePdfs = [
        { title: 'sample1', file_path: 'uploads/resumes/sample1.pdf' },
        { title: 'sample2', file_path: 'uploads/resumes/sample2.pdf' },
        { title: 'sample3', file_path: 'uploads/resumes/sample3.pdf' },
        { title: 'sample4', file_path: 'uploads/resumes/sample4.pdf' },
        { title: 'sample5', file_path: 'uploads/resumes/sample5.pdf' },
        { title: 'sample6', file_path: 'uploads/resumes/sample6.pdf' },
        { title: 'sample7', file_path: 'uploads/resumes/sample7.pdf' },
        { title: 'sample8', file_path: 'uploads/resumes/sample8.pdf' },
        { title: 'sample9', file_path: 'uploads/resumes/sample9.pdf' },
        { title: 'sample10', file_path: 'uploads/resumes/sample10.pdf' },
      ];

      const resumeIds: number[] = [];
      for (const resume of resumePdfs) {
        const [result] = (await conn.query(
          'INSERT IGNORE INTO Resume_pdfs (title, file_path, class_id) VALUES (?, ?, ?)',
          [resume.title, resume.file_path, crn]
        )) as any;

        if (result.insertId > 0) {
          resumeIds.push(result.insertId);
        } else {
          // If INSERT IGNORE skipped, fetch the existing ID
          const [existing] = (await conn.query(
            'SELECT id FROM Resume_pdfs WHERE title = ? AND class_id = ?',
            [resume.title, crn]
          )) as any;
          if (existing.length > 0) {
            resumeIds.push(existing[0].id);
          }
        }
      }

      // Seed candidates (linked to the resume IDs we just created)
      const candidates = [
        {
          resume_index: 0,
          interview: 'https://www.youtube.com/embed/aA7k6WM4_7A?si=ahwZZpSKUow0-dG2',
          f_name: 'Aisha',
          l_name: 'Patel',
        },
        {
          resume_index: 1,
          interview: 'https://www.youtube.com/embed/4d6v7p0N9Sg?si=nax_IkG0gk3zNae-',
          f_name: 'Casey',
          l_name: 'Fisch',
        },
        {
          resume_index: 2,
          interview: 'https://www.youtube.com/embed/typ4aN11feI?si=7jFsNwhB9ZkKyuo9',
          f_name: 'Ethan',
          l_name: 'Martinez',
        },
        {
          resume_index: 3,
          interview: 'https://www.youtube.com/embed/ySKRfElNPCY?si=2B1cl7djMtE1GLJL',
          f_name: 'Jason',
          l_name: 'Jones',
        },
        {
          resume_index: 4,
          interview: 'https://www.youtube.com/embed/_KGOo1WGKZU?si=aTLlkNgS7di69Sga',
          f_name: 'Lucas',
          l_name: 'Nyugen',
        },
        {
          resume_index: 5,
          interview: 'https://www.youtube.com/embed/AhJrqbDTn1Y?si=_XjOXZJBzSvpN_aM',
          f_name: 'Maya',
          l_name: 'Collins',
        },
        {
          resume_index: 6,
          interview: 'https://www.youtube.com/embed/1dIhJmX4uLo?si=aAna0LIIsxRu8E0K',
          f_name: 'Paula',
          l_name: 'McCartney',
        },
        {
          resume_index: 7,
          interview: 'https://www.youtube.com/embed/cnIv3Zf5nJo?si=aa3ObgHLN5BBP-tp',
          f_name: 'Alex',
          l_name: 'Johnson',
        },
        {
          resume_index: 8,
          interview: 'https://www.youtube.com/embed/0aVcquEhOtQ?si=gzDkWve3Izy9uTFx',
          f_name: 'Jordan',
          l_name: 'Lee',
        },
        {
          resume_index: 9,
          interview: 'https://www.youtube.com/embed/HS3ShcKt288?si=uWmWIVKtNJRvqSu_',
          f_name: 'Zhiyuan',
          l_name: 'Yang',
        },
      ];

      for (const candidate of candidates) {
        if (resumeIds[candidate.resume_index]) {
          await conn.query(
            'INSERT IGNORE INTO Candidates (resume_id, interview, f_name, l_name) VALUES (?, ?, ?, ?)',
            [
              resumeIds[candidate.resume_index],
              candidate.interview,
              candidate.f_name,
              candidate.l_name,
            ]
          );
        }
      }

      // Seed interview videos (using the same resume IDs)
      const interviewVids = [
        {
          resume_index: 0,
          title: 'Interview1',
          video_path: 'https://www.youtube.com/embed/aA7k6WM4_7A?si=ahwZZpSKUow0-dG2',
        },
        {
          resume_index: 1,
          title: 'Interview2',
          video_path: 'https://www.youtube.com/embed/4d6v7p0N9Sg?si=nax_IkG0gk3zNae-',
        },
        {
          resume_index: 2,
          title: 'Interview3',
          video_path: 'https://www.youtube.com/embed/typ4aN11feI?si=7jFsNwhB9ZkKyuo9',
        },
        {
          resume_index: 3,
          title: 'Interview4',
          video_path: 'https://www.youtube.com/embed/ySKRfElNPCY?si=2B1cl7djMtE1GLJL',
        },
        {
          resume_index: 4,
          title: 'Interview5',
          video_path: 'https://www.youtube.com/embed/_KGOo1WGKZU?si=aTLlkNgS7di69Sga',
        },
        {
          resume_index: 5,
          title: 'Interview6',
          video_path: 'https://www.youtube.com/embed/AhJrqbDTn1Y?si=_XjOXZJBzSvpN_aM',
        },
        {
          resume_index: 6,
          title: 'Interview7',
          video_path: 'https://www.youtube.com/embed/1dIhJmX4uLo?si=aAna0LIIsxRu8E0K',
        },
        {
          resume_index: 7,
          title: 'Interview8',
          video_path: 'https://www.youtube.com/embed/cnIv3Zf5nJo?si=aa3ObgHLN5BBP-tp',
        },
        {
          resume_index: 8,
          title: 'Interview9',
          video_path: 'https://www.youtube.com/embed/0aVcquEhOtQ?si=gzDkWve3Izy9uTFx',
        },
        {
          resume_index: 9,
          title: 'Interview10',
          video_path: 'https://www.youtube.com/embed/HS3ShcKt288?si=uWmWIVKtNJRvqSu_',
        },
      ];

      for (const vid of interviewVids) {
        if (resumeIds[vid.resume_index]) {
          await conn.query(
            'INSERT IGNORE INTO Interview_vids (resume_id, title, video_path) VALUES (?, ?, ?)',
            [resumeIds[vid.resume_index], vid.title, vid.video_path]
          );
        }
      }

      await conn.commit();

      // After the commit, so reading 15 files does not hold the transaction open.
      await backfillPdfText(this.pdfs, Number(crn));

      res.status(201).json({
        admin_email,
        crn,
        seeded: {
          jobs: jobDescriptions.length,
          resumes: resumePdfs.length,
          candidates: candidates.length,
          interview_videos: interviewVids.length,
        },
      });
    } catch (err: any) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }

      if (err.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'CRN already exists' });
        return;
      }

      console.error('Error creating class with seed data:', err);
      res.status(500).json({ error: err.message });
    } finally {
      conn.release();
    }
  };

  getAllModeratorCRNs = (req: AuthRequest, res: Response): void => {
    this.db.query('SELECT * FROM Moderator', (err, results) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(results);
    });
  };

  deleteModeratorCRN = (req: AuthRequest, res: Response): void => {
    const { crn } = req.params;
    this.db.query('DELETE FROM Moderator WHERE crn = ?', [crn], (err, result: any) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'CRN not found' });
        return;
      }
      res.json({ success: true });
    });
  };

  getModeratorCRN = (req: AuthRequest, res: Response): void => {
    const { crn } = req.params;
    this.db.query('SELECT * FROM Moderator WHERE crn = ?', [crn], (err, results: any[]) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(results[0]);
    });
  };

  getModeratorClasses = (req: AuthRequest, res: Response): void => {
    const { email } = req.params;
    this.db.query(
      'SELECT crn FROM Moderator WHERE admin_email = ?',
      [email],
      (err, results: any[]) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(results.map((row) => row.crn));
      }
    );
  };

  getModeratorClassesFull = (req: AuthRequest, res: Response): void => {
    const { email } = req.params;
    this.db.query('SELECT * FROM Moderator WHERE admin_email = ?', [email], (err, results) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(results);
    });
  };

  addStudent = (req: AuthRequest, res: Response): void => {
    const { class_id, group_id, email, f_name, l_name } = req.body;
    this.db.query(
      "INSERT INTO Users (email, f_name, l_name, class, group_id, affiliation) VALUES (?, ?, ?, ?, ?, 'student') ON DUPLICATE KEY UPDATE group_id = ?, class = ?, f_name = ?, l_name = ?",
      [email, f_name, l_name, class_id, group_id, group_id, class_id, f_name, l_name],
      (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ success: true });
      }
    );
  };

  deleteStudent = (req: AuthRequest, res: Response): void => {
    const { email } = req.body;
    this.db.query('DELETE FROM Users WHERE email = ?', [email], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ success: true });
    });
  };
}
