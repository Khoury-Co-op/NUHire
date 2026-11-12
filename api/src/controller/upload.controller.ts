// src/controller/upload.controller.ts

import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../models/AuthRequest';
import { UPLOADS_ROOT, UPLOAD_SUBDIRS, webPathFor } from '../middleware/upload.middleware';

interface MulterRequest extends AuthRequest {
  file?: Express.Multer.File;
}

export class UploadController {
  uploadFile = (req: MulterRequest, res: Response): void => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    res.json({ filePath: webPathFor(req.file) });
  };

  uploadResume = (req: MulterRequest, res: Response): void => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    res.json({ filePath: webPathFor(req.file) });
  };

  uploadJob = (req: MulterRequest, res: Response): void => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    res.json({ filePath: webPathFor(req.file) });
  };

  /**
   * GET /uploads/:subdir/:fileName
   *
   * Replaces the unauthenticated express.static mount. Two things that mount
   * got wrong, beyond serving every resume to the public internet:
   *
   * - it served whatever type the extension implied, so an uploaded .html ran
   *   as script on the API's own origin, against the session cookie;
   * - it had no notion of which directories were legitimate.
   *
   * Containment is the same shape as resume.controller.getResumeFile:
   * path.basename to drop any separators Express decoded out of %2F, plus
   * sendFile's `root`, which refuses a resolved path outside it.
   */
  serveUploadedFile = (req: AuthRequest, res: Response): void => {
    const { subdir, fileName } = req.params;

    if (!UPLOAD_SUBDIRS.includes(subdir)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const safeName = path.basename(fileName);

    if (!safeName || safeName === '.' || safeName === '..') {
      res.status(400).json({ error: 'Invalid file name' });
      return;
    }

    const dir = path.join(UPLOADS_ROOT, subdir);

    if (!fs.existsSync(path.join(dir, safeName))) {
      res.status(404).json({ error: `File not found: ${safeName}` });
      return;
    }

    // Never hand the browser a type it will render as a document. Files that
    // predate the PDF-only upload filter are still on disk and may be anything,
    // so only a .pdf is served inline; everything else downloads as bytes.
    // nosniff stops the browser second-guessing that, and the CSP neuters any
    // script in a PDF that a viewer decides to honour.
    const isPdf = path.extname(safeName).toLowerCase() === '.pdf';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'application/octet-stream');
    // filename* rather than a quoted filename: legacy names contain spaces and
    // parentheses, and percent-encoding also keeps a newline in a name from
    // making Node throw on an invalid header value.
    res.setHeader(
      'Content-Disposition',
      `${isPdf ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );

    res.sendFile(safeName, { root: dir, dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) {
        res.removeHeader('Content-Type');
        res.removeHeader('Content-Disposition');
        res.status(404).json({ error: `File not found: ${safeName}` });
      }
    });
  };
}
