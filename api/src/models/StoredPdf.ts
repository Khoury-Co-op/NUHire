/** The tables that store an uploaded PDF, each with an `extracted_text` column. */
export type PdfTable = 'Resume_pdfs' | 'job_descriptions';

/** A stored PDF row, as the text backfill reads it. */
export interface StoredPdf {
  id: number;
  file_path: string;
}
