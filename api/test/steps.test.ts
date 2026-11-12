import { describe, expect, it } from 'vitest';
import { decideStep, isStep } from '../src/config/steps';

// decideStep is the whole rule behind POST /progress: a student may move one
// step forward, never skip, and a stale request for an earlier step is a
// no-op. A student who was moved to another group or section starts over.

describe('decideStep', () => {
  it('allows moving exactly one step forward', () => {
    expect(decideStep('res_1', 'res_2')).toBe('allow');
    expect(decideStep('interview', 'offer')).toBe('allow');
  });

  it('treats a missing row or null step as none', () => {
    expect(decideStep(null, 'job_description')).toBe('allow');
    expect(decideStep(undefined, 'job_description')).toBe('allow');
    expect(decideStep(null, 'res_1')).toBe('reject');
  });

  it('rejects skipping ahead', () => {
    expect(decideStep('job_description', 'res_2')).toBe('reject');
    expect(decideStep('res_1', 'offer')).toBe('reject');
  });

  it('ignores the same or an earlier step', () => {
    expect(decideStep('res_2', 'res_2')).toBe('noop');
    expect(decideStep('offer', 'res_1')).toBe('noop');
  });

  it('rejects an unknown step', () => {
    expect(decideStep('res_1', 'bogus')).toBe('reject');
    expect(decideStep('bogus', 'res_1')).toBe('reject');
  });

  it('accepts any step after a group or section change', () => {
    expect(decideStep('offer', 'res_1', true)).toBe('allow');
    expect(decideStep('job_description', 'interview', true)).toBe('allow');
    expect(decideStep('res_2', 'res_2', true)).toBe('allow');
  });

  it('still rejects an unknown step after a move', () => {
    expect(decideStep('res_1', 'bogus', true)).toBe('reject');
  });
});

describe('isStep', () => {
  it('only accepts known step names', () => {
    expect(isStep('interview')).toBe(true);
    expect(isStep('Interview')).toBe(false);
    expect(isStep(3)).toBe(false);
  });
});
