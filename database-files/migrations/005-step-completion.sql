-- migrate:up
-- 005: durable per-student step completion, so the group barrier survives a
-- restart.
--
-- The "has every group member finished?" barrier lived in
-- `global.completedResReview`, a plain object in the API process. Every way out
-- of it was a permanent stuck, and each has happened in a live class:
--
--   * API restart  -> the object is gone. Students who already finished never
--                     re-emit, so the count restarts at 0 and can never reach
--                     the group total. The whole group waits forever.
--   * reconnect    -> the handler identified the student by reverse-lookup in
--                     another in-memory map, which a reconnected socket is no
--                     longer in, so the completion was dropped silently.
--   * one-shot     -> the release was emitted to a cached socket id and the key
--                     deleted. A student offline at that instant never got it
--                     and there was no retry.
--
-- With the rows here the barrier is a query, so it can be re-evaluated as often
-- as anyone asks: on completion, on room join, on a roster change, and from the
-- GET /groups/barrier-status poll.
--
-- NOT destructive: this only adds a table and backfills it. No existing row is
-- modified or deleted.
--
-- Safe to run twice: CREATE TABLE IF NOT EXISTS is a no-op the second time and
-- the backfill is INSERT IGNORE against the primary key below, so a second run
-- inserts nothing.

CREATE TABLE IF NOT EXISTS `Step_Completion` (
  `student_id` int NOT NULL,
  -- The CRN. A row scoped to group_id alone would count a student from another
  -- course section towards this group's tally; groups are keyed on the pair.
  `class` int NOT NULL,
  `group_id` int NOT NULL,
  -- Same vocabulary as `Progress`.`step` on purpose. There are already three
  -- competing names for "what step is a student on" in this codebase; a fourth
  -- spelling here would mean a completion recorded under one name and looked
  -- for under another, which reads as a student who never finished.
  `step` enum('none','job_description','res_1','res_2','interview','offer','employer') NOT NULL,
  `completed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Also the uniqueness constraint the handler's upsert relies on: a student
  -- who refreshes, reconnects or double-submits must not be counted twice
  -- against the group size, or a group of four releases at three real people.
  PRIMARY KEY (`student_id`, `class`, `group_id`, `step`),
  -- The barrier query reads every completion for one group and step. Without
  -- this it is a full scan on every completion, room join and poll, for every
  -- group in every section at once.
  KEY `barrier_lookup` (`class`, `group_id`, `step`),
  -- A student deleted from the roster mid-class must not leave a completion
  -- behind. The barrier counts only current members, but a stale row for a
  -- re-used id would otherwise count towards a group they never joined.
  CONSTRAINT `Step_Completion_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Backfill res_1 for students who have already finished their resume review.
--
-- Without this, applying the migration to a database with a class in progress
-- starts every group's count at 0 — the exact restart failure the table exists
-- to prevent. "Finished" is the definition resume.controller.ts already uses
-- for its finished-count endpoint (>= 10 decided resumes for that group and
-- class); a second definition here would disagree with the count students see
-- on the page.
--
-- Joined to Users so an orphaned Resume row cannot violate the foreign key
-- above and abort the whole migration.
INSERT IGNORE INTO `Step_Completion` (`student_id`, `class`, `group_id`, `step`)
SELECT r.`student_id`, r.`class`, r.`group_id`, 'res_1'
FROM `Resume` r
JOIN `Users` u ON u.`id` = r.`student_id`
GROUP BY r.`student_id`, r.`class`, r.`group_id`
HAVING COUNT(*) >= 10;

-- Confirm the shape landed. Expect five rows: student_id, class, group_id,
-- step, completed_at.
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Step_Completion'
ORDER BY ORDINAL_POSITION;

-- And how much the backfill picked up. Running the migration a second time
-- must not change this number.
SELECT COUNT(*) AS backfilled_completions FROM `Step_Completion` WHERE `step` = 'res_1';

-- migrate:down
