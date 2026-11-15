// src/routes/upload.routes.ts
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { UploadController } from '../controller/upload.controller';
import { upload, UnsupportedUploadError, MAX_UPLOAD_BYTES } from '../middleware/upload.middleware';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware';

/**
 * A rejected upload reaches Express as an error, and the app-level handler
 * turns every error into a 500 "Internal server error". A professor who picks
 * the wrong file mid-class needs to be told which file and why.
 */
const handleUploadError = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof UnsupportedUploadError) {
    res.status(415).json({ error: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: `File is too large. The limit is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      });
      return;
    }

    res.status(400).json({ error: `Upload rejected: ${err.message}` });
    return;
  }

  next(err);
};

export default (): Router => {
  const router = Router();
  const uploadController = new UploadController();

  // Advisor only. Filenames are server-generated and the content must start
  // with %PDF-; see upload.middleware.ts (SEC-9).
  router.post('/', requireAdmin, upload.single('file'), uploadController.uploadFile);
  router.post('/resume', requireAdmin, upload.single('resume'), uploadController.uploadResume);
  router.post('/job', requireAdmin, upload.single('jobDescription'), uploadController.uploadJob);

  router.use(handleUploadError);

  return router;
};

/**
 * Mounted at /uploads, replacing the unauthenticated express.static mount.
 * Students read resumes and job descriptions here, so this is requireAuth and
 * not requireAdmin.
 */
export const uploadedFileRoutes = (): Router => {
  const router = Router();
  const uploadController = new UploadController();

  router.get('/:subdir/:fileName', requireAuth, uploadController.serveUploadedFile);

  return router;
};
