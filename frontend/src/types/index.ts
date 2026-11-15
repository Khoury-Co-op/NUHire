// The one place the frontend describes a row that comes back from the API.
//
// `interface User` was declared 15 times across `src/app`, and the two that
// were actually in use disagreed: `id` was `number` in AuthContext and `string`
// in interview-stage, so `user.id === resume.student_id` was false for every
// student in the class. `Note.id`, `Resume.checked` and `Group.group_id` had
// the same split. Every shape below is pinned to the column type in
// `database-files/Pandployer.sql`, which is what `mysql2` actually hands back.
//
// Add to this file rather than redeclaring a shape next to the component that
// consumes it; a local copy is how the drift above happened.

/** `Users.affiliation` is an ENUM. 'none' is what the Keycloak callback writes
 *  for a first login that is not on any roster yet. */
export type Affiliation = 'student' | 'admin' | 'none';

/** MySQL `tinyint(1)`. `mysql2` does not cast these to booleans, so a column
 *  declared BOOLEAN in the dump still arrives as 0 or 1 over JSON. Comparing
 *  one with `=== true` is always false. */
export type DbBool = 0 | 1;

/** The logged-in user, as `/auth/user` returns it. */
export interface User {
  id: number;
  f_name: string;
  l_name: string;
  email: string;
  affiliation: Affiliation;
  group_id: number;
  class: number;
}

/** A roster row from `/groups/students-by-class/:class`.
 *  `group_id` is nullable: `Users.group_id` has no NOT NULL and a student who
 *  is on the roster but not yet in a group comes back with null, which is what
 *  the admin UI shows as the "No Group" bucket. */
export interface Student {
  id: number;
  email: string;
  f_name: string;
  l_name: string;
  group_id: number | null;
  class: number;
}

/** One team, as the admin UI assembles it: a `GroupsInfo` row plus the roster
 *  rows that point at it and the two per-group lookups the cards display. */
export interface Group {
  group_id: number;
  students: Student[];
  isStarted: boolean;
  jobAssignment?: string;
  progress?: string;
}

/** A course section. `crn` is the value every query and socket room calls
 *  `class`. */
export interface ClassInfo {
  crn: number;
  class_name: string;
}

/** A row of `Notes`. `id` is `int AUTO_INCREMENT`, not a string. */
export interface Note {
  id: number;
  content: string;
  user_email?: string;
  created_at?: string;
}

/** A row of `Resume`: one student's vote on one resume.
 *  `checked` is the GROUP's shortlist, not this student's — the `check` socket
 *  handler writes it to every member row for the same
 *  (group_id, class, resume_number). Read it with MAX(checked) GROUP BY
 *  resume_number; off a single row, a student who votes after the group
 *  shortlisted a resume unticks it for everyone. */
export interface Resume {
  student_id: number;
  group_id: number;
  class: number;
  timespent: number;
  resume_number: number;
  vote: 'yes' | 'no' | 'unanswered';
  checked: DbBool;
}

/** A row of `InterviewPage`: one student's ratings of one candidate.
 *  `checked` is the shortlist tick makeOffer restores; the column has no
 *  NOT NULL, so it can come back null. */
export interface InterviewRating {
  student_id: number;
  group_id: number;
  class: number;
  candidate_id: number;
  question1: number;
  question2: number;
  question3: number;
  question4: number;
  checked: DbBool | null;
}

/** A row of `Candidates`. */
export interface Candidate {
  id: number;
  resume_id: number;
  f_name: string;
  l_name: string;
  interview?: string;
}

/** A row of `Resume_pdfs`. `id` is what `Candidates.resume_id` points at. */
export interface ResumePdf {
  id: number;
  title: string;
  file_path: string;
  class_id: number;
  uploaded_at: string | null;
}

/** One card on the make-offer page: a candidate with their interview video and
 *  resume file resolved. `candidate_id` is the candidate's `resume_id`, which is
 *  what `InterviewPage.candidate_id` stores. */
export type OfferCandidate = Pick<Candidate, 'f_name' | 'l_name'> & {
  candidate_id: number;
  video_path: string;
  resume_path: string;
};

/** A `job_descriptions` row, trimmed to what the assignment dropdowns read. */
export interface JobOption {
  id: number;
  title: string;
}

/** A candidate as the teacher panel lists one: id plus display name. */
export interface CandidateOption {
  id: number;
  name: string;
}

/** An offer a group has made that the teacher has not answered yet. */
export interface PendingOffer {
  classId: number;
  groupId: number;
  candidateId: number;
  candidateName?: string;
}

/** An offer the teacher accepted, as shown on the group's card. */
export interface AcceptedOffer {
  groupId: number;
  candidateName: string;
}

/** `Progress.step`, an ENUM. */
export type Step =
  'none' | 'job_description' | 'res_1' | 'res_2' | 'interview' | 'offer' | 'employer';

/** A roster row from `/groups/live/:classId`. */
export type LiveStudent = Pick<Student, 'id' | 'email' | 'f_name' | 'l_name'> & {
  group_id: number;
  started: DbBool | null;
  /** When the student was first connected since their group started. Null means no gate waits for them. */
  present_at: string | null;
  step: Step | null;
  review_completed_at: string | null;
  confirmed_at: string | null;
  online: boolean;
};
