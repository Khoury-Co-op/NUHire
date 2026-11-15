import type { InterviewRating, Resume } from '../types';

export const RATING_LABEL = {
  overall: 'Overall',
  professionalPresence: 'Professional Presence',
  qualityOfAnswer: 'Quality of Answer',
  personality: 'Personality',
} as const;

export type Rating = keyof typeof RATING_LABEL;

export const RATINGS = Object.keys(RATING_LABEL) as Rating[];

type RatingColumn = keyof Pick<
  InterviewRating,
  'question1' | 'question2' | 'question3' | 'question4'
>;

// InterviewPage stores each student's ratings in this order.
export const RATING_COLUMN = {
  overall: 'question1',
  professionalPresence: 'question2',
  qualityOfAnswer: 'question3',
  personality: 'question4',
} as const satisfies Record<Rating, RatingColumn>;

// InterviewPopup stores a group's curveball adjustments in a different order.
export const CURVEBALL_COLUMN = {
  overall: 'question4',
  professionalPresence: 'question1',
  qualityOfAnswer: 'question2',
  personality: 'question3',
} as const satisfies Record<Rating, RatingColumn>;

// A No Show curveball writes NO_SHOW_SCORE on every rating; any total this low reads as one.
export const NO_SHOW_SCORE = -10000;
export const NO_SHOW_THRESHOLD = -1000;

export const VOTE_LABEL: Record<Resume['vote'], string> = {
  yes: '✔ Accepted',
  no: '✖ Rejected',
  unanswered: '? Skipped',
};
