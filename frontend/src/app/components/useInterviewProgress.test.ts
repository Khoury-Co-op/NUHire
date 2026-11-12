import { describe, expect, it } from 'vitest';
import { firstUnratedIndex } from './useInterviewProgress';

// Where a refreshed student resumes. Landing past an unrated candidate leaves
// it short a rating for the whole group; landing before a rated one lets the
// student overwrite it.

const interviews = [{ resume_id: 4 }, { resume_id: 9 }, { resume_id: 2 }, { resume_id: 7 }];

describe('firstUnratedIndex', () => {
  it('starts at the first candidate when nothing is rated', () => {
    expect(firstUnratedIndex(interviews, [])).toBe(0);
  });

  it('resumes after the candidates already rated', () => {
    expect(firstUnratedIndex(interviews, [4, 9])).toBe(2);
  });

  it('goes back to a candidate skipped earlier', () => {
    expect(firstUnratedIndex(interviews, [4, 2, 7])).toBe(1);
  });

  it('ignores ratings for candidates not in this group', () => {
    expect(firstUnratedIndex(interviews, [4, 13])).toBe(1);
  });

  it('reports every candidate rated as the list length', () => {
    expect(firstUnratedIndex(interviews, [7, 2, 9, 4])).toBe(interviews.length);
  });
});
