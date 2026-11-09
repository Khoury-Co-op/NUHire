import { DbClient } from '../config/database';
import { PdfTable, StoredPdf } from '../models/StoredPdf';

export interface PdfTextRepository {
  /** Rows of `table` with no text stored yet, in one class when `classId` is given. */
  listWithoutText(table: PdfTable, classId?: number): Promise<StoredPdf[]>;
  /** Stores a row's text, unless another run stored it first. */
  saveText(table: PdfTable, id: number, text: string): Promise<void>;
}

const PDF_COLUMNS = { id: true, file_path: true } as const;

export function createPdfTextRepository(db: DbClient): PdfTextRepository {
  return {
    listWithoutText: (table, classId) => {
      const where = {
        extracted_text: null,
        ...(classId === undefined ? {} : { class_id: classId }),
      };
      return table === 'Resume_pdfs'
        ? db.resume_pdfs.findMany({ where, select: PDF_COLUMNS })
        : db.job_descriptions.findMany({ where, select: PDF_COLUMNS });
    },

    saveText: async (table, id, text) => {
      const update = { where: { id, extracted_text: null }, data: { extracted_text: text } };
      if (table === 'Resume_pdfs') {
        await db.resume_pdfs.updateMany(update);
      } else {
        await db.job_descriptions.updateMany(update);
      }
    },
  };
}
