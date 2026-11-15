/** A row of `Notes`. Only the student who wrote a note can read it. */
export interface Note {
  id: number;
  user_email: string;
  content: string;
  created_at: Date | null;
}
