// Where each simulated student should end a run, and how long they "think".

import { STUDENTS } from '../lib/roster.mjs';
import { STEP_ORDER } from '../seed/scenarios.mjs';

// Groups holding a student who never logs in. Every group gate counts the whole
// roster, so these can only move when the teacher force-advances them.
export const NEEDS_TEACHER = new Set(STUDENTS.filter((s) => s.dormant).map((s) => s.group));

export function expectedStep(student) {
  if (student.group === null) return null;
  return NEEDS_TEACHER.has(student.group) ? 'offer' : 'employer';
}

export const nextStep = (step) => STEP_ORDER[STEP_ORDER.indexOf(step) + 1];

// An hour-long class, compressed. Ranges in ms.
export const THINK = {
  click: [300, 1200],
  resume: [500, 2500],
  interview: [1500, 4000],
};

// Students arrive over this window.
export const LOGIN_SPREAD_MS = 20_000;

// How long the teacher takes to notice a group that cannot move.
export const TEACHER_NOTICE_MS = 5_000;

// Waiting at one point longer than this counts as stuck.
export const STUCK_MS = 180_000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const pick = ([min, max]) => min + Math.random() * (max - min);
export const think = (range) => sleep(pick(range));
