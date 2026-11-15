-- migrate:up
-- 006: `Users`.`present_at`, so a group waits only for students who showed up.
--
-- Every gate counted the whole roster. A CSV-imported student who never logged
-- in held their group at "3 of 4" for the rest of the class. The API stamps
-- this column when a student's socket connects or a page loads, clears it for a group's members
-- when the professor starts that group, and the gates count only stamped rows.
--
-- NOT destructive: it adds a nullable column and backfills it. No row is
-- deleted.
--
-- Safe to run twice: ADD COLUMN has no IF NOT EXISTS in MySQL, so it is checked
-- first, and the backfill only touches rows that are still NULL.

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'Users'
    AND COLUMN_NAME  = 'present_at'
);

SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE `Users` ADD COLUMN `present_at` timestamp NULL DEFAULT NULL',
  'SELECT ''present_at already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- Mark present anyone already partway through a running class, so a deploy
-- mid-class does not drop them from their group's count. `job_description` is
-- not evidence: assigning a job writes it for every member, logged in or not.
--
-- Stamped with created_at, not now. The barrier opens at the first completion
-- by which everyone present had finished, so a stamp later than a student's own
-- completion would leave a group that is already through it reading closed.
UPDATE `Users` u
SET u.`present_at` = u.`created_at`
WHERE u.`present_at` IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM `Step_Completion` sc
      WHERE sc.`student_id` = u.`id`
        AND sc.`class` = u.`class`
        AND sc.`group_id` = u.`group_id`
    )
    OR EXISTS (
      SELECT 1 FROM `Progress` p
      WHERE p.`email` = u.`email`
        AND p.`crn` = u.`class`
        AND p.`step` NOT IN ('none', 'job_description')
    )
  );

-- migrate:down
