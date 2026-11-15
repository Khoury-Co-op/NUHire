-- migrate:up
-- 001: one vote row per student per resume.
--
-- `Resume` had only PRIMARY KEY (id) and a non-unique KEY on student_id. Both
-- writers in resume.controller.ts use ON DUPLICATE KEY UPDATE, which needs a
-- unique key to fire, so it never did: every submission appended a row and
-- res-review-group counted all of them. A student who changed an answer, or
-- whose client retried, was counted twice in their group's tally.
--
-- DESTRUCTIVE. The dedupe below deletes duplicate vote rows, keeping the
-- highest id for each (student_id, group_id, class, resume_number) — the most
-- recent submission, which is the one the student meant. Take a backup first:
--
--   mysqldump -h <host> -u <user> -p <database> Resume > Resume-backup.sql
--
-- Safe to run twice: the dedupe is a no-op once there are no duplicates, and
-- the ALTER is skipped if the key already exists.

-- How many rows this is about to remove. Run on its own first if you want to
-- see the damage before committing to it.
SELECT COUNT(*) AS duplicate_rows_to_delete
FROM `Resume` r
JOIN `Resume` newer
  ON  newer.`student_id`    = r.`student_id`
  AND newer.`group_id`      = r.`group_id`
  AND newer.`class`         = r.`class`
  AND newer.`resume_number` = r.`resume_number`
  AND newer.`id`            > r.`id`;

DELETE r
FROM `Resume` r
JOIN `Resume` newer
  ON  newer.`student_id`    = r.`student_id`
  AND newer.`group_id`      = r.`group_id`
  AND newer.`class`         = r.`class`
  AND newer.`resume_number` = r.`resume_number`
  AND newer.`id`            > r.`id`;

-- ADD UNIQUE KEY has no IF NOT EXISTS in MySQL, so check first.
SET @key_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'Resume'
    AND INDEX_NAME   = 'uniq_resume_vote'
);

SET @stmt := IF(
  @key_exists = 0,
  'ALTER TABLE `Resume` ADD UNIQUE KEY `uniq_resume_vote` (`student_id`, `group_id`, `class`, `resume_number`)',
  'SELECT ''uniq_resume_vote already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- migrate:down
