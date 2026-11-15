-- migrate:up
-- 008: `extracted_text` on `Resume_pdfs` and `job_descriptions`, the text of
-- each PDF, which every ATS approach needs first.
--
-- NULL means not extracted yet. SQL cannot read a PDF, so the API fills these
-- in: on create, and from backfillPdfText in api/src/config/pdfText.ts, which
-- runs at every API start and covers the rows that exist before this migration.
-- mediumtext because TEXT stops at 64 KB and an upload may be up to 10 MB.
--
-- NOT destructive: it adds two nullable columns. No row is deleted.
--
-- Safe to run twice: ADD COLUMN has no IF NOT EXISTS in MySQL, so each column
-- is checked first.

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'Resume_pdfs'
    AND COLUMN_NAME  = 'extracted_text'
);

SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE `Resume_pdfs` ADD COLUMN `extracted_text` mediumtext NULL',
  'SELECT ''Resume_pdfs.extracted_text already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'job_descriptions'
    AND COLUMN_NAME  = 'extracted_text'
);

SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE `job_descriptions` ADD COLUMN `extracted_text` mediumtext NULL',
  'SELECT ''job_descriptions.extracted_text already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- migrate:down
