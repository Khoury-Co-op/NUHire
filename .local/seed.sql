-- Local dev seed. Runs after 01-schema.sql, before the API ever connects.
-- Claiming crn=1 here means the API's own `INSERT IGNORE` of the prod advisor
-- email is skipped (crn is UNIQUE), so class 1 belongs to our test advisor and
-- lines up with the job descriptions / resumes the API seeds for class_id 1.

INSERT INTO `Moderator` (`admin_email`, `crn`) VALUES ('advisor@northeastern.edu', 1);

INSERT INTO `GroupsInfo` (`class_id`, `group_id`, `started`) VALUES
  (1, 1, 0),
  (1, 2, 0);

INSERT INTO `Users` (`f_name`, `l_name`, `email`, `affiliation`, `group_id`, `class`, `seen`) VALUES
  ('Ada',   'Advisor', 'advisor@northeastern.edu',  'admin',   NULL, 1, 1),
  ('Sam',   'Student', 'student1@northeastern.edu', 'student', 1,    1, 0),
  ('Riley', 'Student', 'student2@northeastern.edu', 'student', 1,    1, 0),
  ('Jess',  'Student', 'student3@northeastern.edu', 'student', 2,    1, 0);
