-- migrate:up
-- 007: index `Resume` by (group_id, class, resume_number).
--
-- `checked` is the group's shortlist flag, so the vote INSERT reads the group's
-- current value and the `check` socket handler updates it, both filtering on
-- these three columns. With no index starting at group_id each of them scanned
-- the whole table, and the INSERT ... SELECT locked every row it scanned, so
-- votes from different groups waited on each other.
--
-- NOT destructive: it only adds an index.
--
-- Safe to run twice: ADD KEY has no IF NOT EXISTS in MySQL, so check first.

SET @key_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'Resume'
    AND INDEX_NAME   = 'group_resume'
);

SET @stmt := IF(
  @key_exists = 0,
  'ALTER TABLE `Resume` ADD KEY `group_resume` (`group_id`, `class`, `resume_number`)',
  'SELECT ''group_resume already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- migrate:down
