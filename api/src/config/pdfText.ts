// src/config/pdfText.ts

import fs from 'fs/promises';
import path from 'path';
import { extractText, getDocumentProxy } from 'unpdf';
import { UPLOADS_ROOT, UPLOAD_DIRS } from '../middleware/upload.middleware';
import { PdfTable } from '../models/StoredPdf';
import { PdfTextRepository } from '../repository/pdfText.repository';

// The upload directory each table's files are in.
const PDF_DIRS: Record<PdfTable, string> = {
  Resume_pdfs: UPLOAD_DIRS.resume,
  job_descriptions: UPLOAD_DIRS.jobDescription,
};

const PDF_TABLES: readonly PdfTable[] = ['Resume_pdfs', 'job_descriptions'];

/**
 * The text of a stored PDF, or null when the file is missing or will not parse.
 * A scanned PDF with no text layer gives '', which counts as done; null leaves
 * the row for backfillPdfText to retry, so the upload itself never fails on it.
 */
export async function extractPdfText(table: PdfTable, filePath: string): Promise<string | null> {
  try {
    // file_path reaches the create endpoints in the request body, so only its
    // name is used, and only inside this table's upload directory.
    const name = path.basename(String(filePath));
    if (!name || name === '.' || name === '..') return null;

    const data = await fs.readFile(path.join(UPLOADS_ROOT, PDF_DIRS[table], name));
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(data)), {
      mergePages: true,
    });
    return text.trim();
  } catch (error) {
    // A missing file is counted by backfillPdfText; anything else is a PDF that
    // will not parse, worth one line each.
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      console.warn(`Could not extract text from ${table} file ${String(filePath)}:`, error);
    }
    return null;
  }
}

/**
 * Stores the text of every PDF row that has none: rows from before migration
 * 008, the defaults seeded at boot and on class creation, and any whose
 * extraction failed. Safe to run any number of times, and never throws, so a
 * caller that has already committed its own work is not turned into a failure.
 */
export async function backfillPdfText(pdfs: PdfTextRepository, classId?: number): Promise<void> {
  let missing = 0;
  try {
    for (const table of PDF_TABLES) {
      for (const row of await pdfs.listWithoutText(table, classId)) {
        const text = await extractPdfText(table, row.file_path);
        if (text === null) {
          missing++;
          continue;
        }
        await pdfs.saveText(table, row.id, text);
      }
    }
  } catch (error) {
    console.error('PDF text backfill stopped early:', error);
  }
  if (missing > 0) {
    console.warn(`${missing} PDF row(s) still have no text: the file is missing or unreadable`);
  }
}
