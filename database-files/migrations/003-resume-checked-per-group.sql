-- migrate:up
-- 003: make `Resume.checked` agree with what writes it.
--
-- `checked` is the GROUP's shortlist, not one student's opinion. The only
-- writer, the `check` socket handler in api/src/config/socket.ts, has always
-- treated it that way: it updates every row matching (group_id, class,
-- resume_number) with no student_id, so one member ticking a box ticks it for
-- the whole group. The readers agree — getCheckedResumes and the candidate
-- query both filter `checked = 1` for a group — but nobody wrote the rule down,
-- so the per-student row grain made it look per-student. The decision is
-- recorded on the column in ../Pandployer.sql.
--
-- The rows drifted anyway. A vote row is INSERTed with `checked` at its DEFAULT
-- 0, so a student who votes on a resume AFTER their group shortlisted it gets a
-- row saying 0 while their teammates' rows say 1. `res-review-group` builds its
-- checkbox map by iterating the group's rows and letting the last one win, so
-- that late voter can silently untick a resume for everyone, mid-class.
--
-- Not destructive: no rows are deleted. This raises every row in a group to the
-- group's answer, which is what the socket handler would have written had the
-- row existed at the time. Idempotent by construction — running it again finds
-- nothing left to change — so it is safe to run twice.
--
-- This converges the data that exists today. It does not stop the drift
-- recurring; that needs the vote INSERT in resume.controller.ts to carry the
-- group's current `checked` forward, and the group reads to aggregate with
-- MAX(checked) instead of taking whichever row came back last.

-- How many rows this is about to raise. Run on its own first if you want to see
-- the scope before committing to it.
SELECT COUNT(*) AS rows_out_of_step
FROM `Resume` r
JOIN (
  SELECT `group_id`, `class`, `resume_number`, MAX(`checked`) AS group_checked
  FROM `Resume`
  GROUP BY `group_id`, `class`, `resume_number`
) g
  ON  g.`group_id`      = r.`group_id`
  AND g.`class`         = r.`class`
  AND g.`resume_number` = r.`resume_number`
WHERE r.`checked` <> g.group_checked;

UPDATE `Resume` r
JOIN (
  SELECT `group_id`, `class`, `resume_number`, MAX(`checked`) AS group_checked
  FROM `Resume`
  GROUP BY `group_id`, `class`, `resume_number`
) g
  ON  g.`group_id`      = r.`group_id`
  AND g.`class`         = r.`class`
  AND g.`resume_number` = r.`resume_number`
SET r.`checked` = g.group_checked
WHERE r.`checked` <> g.group_checked;

-- migrate:down
