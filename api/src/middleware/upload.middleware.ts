// src/middleware/upload.middleware.ts

import multer, { FileFilterCallback, StorageEngine } from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { Request } from 'express';

// Absolute, because multer resolves a relative `destination` against the
// process cwd. The old value was the literal string 'uploads/resumes', so
// starting the API from the repo root instead of api/ wrote files into a
// directory the file route never reads from, and the upload looked successful.
export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

// The only subdirectories of UPLOADS_ROOT that exist. Uploads are routed here
// by multipart field name, and the file route serves only these names, so a
// request for /uploads/<anything else> cannot reach another directory.
export const UPLOAD_DIRS: Record<string, string> = {
  jobDescription: 'jobdescription',
  resume: 'resumes',
  file: 'other',
};

export const UPLOAD_SUBDIRS: readonly string[] = Object.values(UPLOAD_DIRS);

// 10 MB. A resume or job description is a few hundred KB; the limit exists so a
// student who reaches the advisor endpoint cannot fill the class server's disk.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');

/**
 * Rejection the professor should see as a message, not as a 500. Thrown from
 * the filter and the storage engine; `handleUploadError` in upload.routes.ts
 * turns it into a 415.
 */
export class UnsupportedUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedUploadError';
  }
}

// multer's diskStorage only mkdirs when `destination` is a string, and ours is
// a function. uploads/other has never existed, so POST /upload died on ENOENT.
for (const subdir of UPLOAD_SUBDIRS) {
  fs.mkdirSync(path.join(UPLOADS_ROOT, subdir), { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const subdir = UPLOAD_DIRS[file.fieldname] ?? UPLOAD_DIRS.file;
    cb(null, path.join(UPLOADS_ROOT, subdir));
  },
  // Server-generated, never derived from file.originalname. The old code used
  // the client's name verbatim, so "../../app.js" escaped the directory and two
  // advisors uploading "resume.pdf" silently overwrote each other mid-class.
  filename: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, `${randomUUID()}.pdf`);
  },
});

/**
 * Read the first `PDF_MAGIC.length` bytes without consuming them: whatever is
 * read is pushed back so the storage engine still writes the whole file.
 */
const readMagic = (
  stream: NodeJS.ReadableStream,
  cb: (err: Error | null, head: Buffer) => void
): void => {
  let head = Buffer.alloc(0);

  const cleanup = (): void => {
    stream.removeListener('readable', onReadable);
    stream.removeListener('end', onEnd);
    stream.removeListener('error', onError);
  };

  function onReadable(): void {
    let chunk: Buffer | null;
    while (head.length < PDF_MAGIC.length && (chunk = stream.read() as Buffer | null) !== null) {
      head = Buffer.concat([head, chunk]);
    }
    if (head.length < PDF_MAGIC.length) return;
    cleanup();
    cb(null, head);
  }

  // Ended before we had enough bytes, so it cannot be a PDF.
  function onEnd(): void {
    cleanup();
    cb(null, head);
  }

  function onError(err: Error): void {
    cleanup();
    cb(err, head);
  }

  stream.on('readable', onReadable);
  stream.once('end', onEnd);
  stream.once('error', onError);
};

/**
 * diskStorage, gated on the file actually starting with %PDF-.
 *
 * The check cannot live in multer's fileFilter: multer only attaches
 * `file.stream` after the filter has already accepted the file, so the filter
 * can see nothing but the client's own claims. Doing it here means a .html
 * renamed to .pdf is rejected before a single byte is written to disk.
 */
const pdfOnlyStorage: StorageEngine = {
  _handleFile(req, file, cb): void {
    readMagic(file.stream, (err, head) => {
      if (err) {
        cb(err);
        return;
      }

      if (!head.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
        // Drain, or busboy stalls waiting for this file to be consumed.
        file.stream.resume();
        cb(new UnsupportedUploadError('Only PDF files can be uploaded'));
        return;
      }

      file.stream.unshift(head);
      diskStorage._handleFile(req, file, cb);
    });
  },

  _removeFile(req, file, cb): void {
    diskStorage._removeFile(req, file, cb);
  },
};

// Cheap pre-check on the claims the client makes, so an obviously wrong file is
// rejected before it is streamed. The magic-byte check in pdfOnlyStorage is the
// one that actually decides; neither the extension nor the MIME header is
// trustworthy on its own.
const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const claimsPdf =
    path.extname(file.originalname).toLowerCase() === '.pdf' || file.mimetype === 'application/pdf';

  if (!claimsPdf) {
    cb(new UnsupportedUploadError('Only PDF files can be uploaded'));
    return;
  }

  cb(null, true);
};

export const upload = multer({
  storage: pdfOnlyStorage,
  fileFilter,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
});

/**
 * The path stored in Resume_pdfs.file_path / job_descriptions.file_path and
 * handed back to the browser. Relative to the API root, because the frontend
 * builds `${API_BASE_URL}/${file_path}`; `file.path` is now absolute and would
 * put a server filesystem path in the database.
 */
export const webPathFor = (file: Express.Multer.File): string =>
  `uploads/${path.basename(path.dirname(file.path))}/${file.filename}`;
