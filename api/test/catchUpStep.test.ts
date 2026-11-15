import { describe, expect, it } from 'vitest';
import { catchUpStep } from '../src/config/steps';

// catchUpStep decides where a late student joins their group. Sending them too
// far back strands them alone on the timed solo review; too far forward skips a
// step the group has not reached.

describe('catchUpStep', () => {
  it('offers nothing while the group is still on the solo review', () => {
    // The barrier is closed, so the student is waited for and reviews normally.
    expect(catchUpStep(['res_1', 'res_1', 'res_1'], 'none', false)).toBeNull();
  });

  it('skips the solo review once the group is through it', () => {
    // Everyone else finished, but nobody has clicked on to the group review yet.
    expect(catchUpStep(['res_1', 'res_1', 'res_1'], 'none', true)).toBe('res_2');
  });

  it('joins the group at its slowest member', () => {
    expect(catchUpStep(['interview', 'offer', 'interview'], 'job_description', true)).toBe(
      'interview'
    );
  });

  it('offers nothing to a student already level with the group', () => {
    expect(catchUpStep(['res_2', 'res_2'], 'res_2', true)).toBeNull();
  });

  it('never moves a student backwards', () => {
    expect(catchUpStep(['res_2', 'res_2'], 'interview', true)).toBeNull();
  });
});
