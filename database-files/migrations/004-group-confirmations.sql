-- migrate:up
-- 004: durable group-selection confirmations for res-review-group.
--
-- `teamConfirmations` lived only in React state and was never fetched. Any
-- refresh reset it to [], and the student who had already confirmed could not
-- confirm again because the button is disabled once `hasConfirmed` is set. The
-- group deadlocked at "Waiting for team confirmation (0/4)" with no way out
-- short of every member reloading in the same instant. This table is the
-- server-side record the page reads on mount and on socket reconnect.
--
-- Keyed on (group_id, class, student_id). `class` is the CRN; a row scoped to
-- group_id alone would count a student from another course section towards this
-- group's tally, which is the leak AGENTS.md warns about.
--
-- NOT destructive: it only adds a table, and no existing rows move.
--
-- Safe to run twice: CREATE TABLE IF NOT EXISTS is a no-op the second time, so
-- the primary key and the foreign key below are only ever created once.

CREATE TABLE IF NOT EXISTS `GroupConfirmations` (
  `group_id` int NOT NULL,
  `class` int NOT NULL,
  `student_id` int NOT NULL,
  `confirmed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- The primary key is also the uniqueness constraint the confirm endpoint's
  -- ON DUPLICATE KEY UPDATE relies on: a student who double-clicks Confirm, or
  -- whose request is retried, must not be counted twice against group size.
  PRIMARY KEY (`group_id`, `class`, `student_id`),
  KEY `student_id` (`student_id`),
  -- A student deleted from the roster mid-class must not leave a confirmation
  -- behind, or their group waits forever on a member who no longer exists.
  CONSTRAINT `GroupConfirmations_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Confirm the shape landed. Expect four rows: group_id, class, student_id,
-- confirmed_at.
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'GroupConfirmations'
ORDER BY ORDINAL_POSITION;

-- migrate:down
