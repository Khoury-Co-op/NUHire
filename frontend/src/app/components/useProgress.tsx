'use client';

import { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useProgressManager } from './progress';
import { useSocket } from './socketContext';
import type { Step } from '../../types';

/**
 * Maps a Progress.step enum value to the route that renders it.
 *
 * These are three different vocabularies in this codebase (Progress.step,
 * Users.current_page, and route paths) and nothing else maps between them.
 * Until they are unified, this table is the one place that translates
 * step -> route. Do not inline a fourth version somewhere else.
 *
 * The API has its own copy, in api/src/config/steps.ts, because
 * force-advance has to send a route path over the wire. Change both together.
 */
export const STEP_TO_ROUTE: Record<string, string> = {
  none: '/dashboard',
  job_description: '/jobdes',
  res_1: '/res-review',
  res_2: '/res-review-group',
  interview: '/interview-stage',
  offer: '/makeOffer',
  employer: '/employerPanel',
};

export const STEP_LABEL: Record<Step, string> = {
  none: 'Not started',
  job_description: 'Job Description',
  res_1: 'Resume Review',
  res_2: 'Resume Review Group',
  interview: 'Interview Stage',
  offer: 'Make an Offer',
  employer: 'Employer Panel',
};

// The order a group walks the steps. Declared rather than derived from the keys
// above so that reordering that table for readability cannot silently change
// which step counts as "further along".
export const STEP_ORDER = [
  'none',
  'job_description',
  'res_1',
  'res_2',
  'interview',
  'offer',
  'employer',
];

const allowedRoutes: Record<string, string[]> = {
  '/jobdes': ['job_description', 'res_1', 'res_2', 'interview', 'offer', 'employer'],
  '/res-review': ['res_1', 'res_2', 'interview', 'offer', 'employer'],
  '/res-review-group': ['res_2', 'interview', 'offer', 'employer'],
  '/interview-stage': ['interview', 'offer', 'employer'],
  '/makeOffer': ['offer', 'employer'],
  '/employerPanel': ['employer'],
};

const furthestStep = (a: string, b: string): string =>
  STEP_ORDER.indexOf(b) > STEP_ORDER.indexOf(a) ? b : a;

export const useProgress = () => {
  const { user, loading } = useAuth();
  const { fetchProgress } = useProgressManager();
  const socket = useSocket();

  // A job reset erases the group's work and puts Progress back to
  // job_description. Students already on a step page would keep voting into
  // wiped tables, and Progress only moves forward, so send them back now.
  useEffect(() => {
    if (!socket) return;
    const handleJobUpdated = (data?: { reset?: boolean }) => {
      if (data?.reset !== true) return;
      if (!(window.location.pathname in allowedRoutes)) return;
      localStorage.setItem('progress', 'job_description');
      window.location.replace('/dashboard');
    };
    socket.on('jobUpdated', handleJobUpdated);
    return () => {
      socket.off('jobUpdated', handleJobUpdated);
    };
  }, [socket]);

  useEffect(() => {
    const currentPath = window.location.pathname;
    if (!(currentPath in allowedRoutes)) return;

    // Nothing is decided until auth has resolved. This hook used to read
    // localStorage on mount and redirect immediately, which bounced a student
    // whose progress had not been cached on this device — a second browser, a
    // cleared cache — off the page their group was actually on.
    if (loading || !user) return;

    let cancelled = false;

    const check = async () => {
      const serverStep = await fetchProgress(user);
      if (cancelled) return;

      // fetchProgress returns 'none' both for "no Progress row yet" and for a
      // request that failed, so trusting it alone would throw a student to the
      // dashboard mid-activity over one bad response. Take whichever source is
      // further along: this guard exists to stop someone jumping AHEAD, and
      // over-trusting the cache at worst leaves them where they already are.
      const cachedStep = localStorage.getItem('progress') || 'none';
      const progress = furthestStep(serverStep, cachedStep);

      if (allowedRoutes[currentPath].includes(progress)) return;

      // Previously this did `replace('/' + progress)`, which produced paths
      // like "/res_1" that are not routes, so the guard itself 404'd. Fall back
      // to the dashboard for any step we do not recognise.
      window.location.replace(STEP_TO_ROUTE[progress] ?? '/dashboard');
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [loading, user]);
};
