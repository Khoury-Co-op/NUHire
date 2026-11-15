'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import { STEP_TO_ROUTE } from './useProgress';
import type { Step } from '../../types';

// The step a late student's group has reached, offered so they can join the
// group there instead of starting from the beginning (GET /groups/catch-up).
// `join` moves them; it rejects with a message to show if that fails.
export const useCatchUp = (enabled: boolean) => {
  const [step, setStep] = useState<Step | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    fetch(`${API_BASE_URL}/groups/catch-up`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { step: null }))
      .then((data: { step: Step | null }) => setStep(data.step))
      // No offer is the safe default: the student carries on from the dashboard.
      .catch((error) => console.error('Error checking where the group is:', error));
  }, [enabled]);

  const join = async () => {
    setJoining(true);
    try {
      const res = await fetch(`${API_BASE_URL}/groups/catch-up`, {
        method: 'POST',
        credentials: 'include',
      });
      const data: { step?: Step; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.step) throw new Error(data.error ?? 'Could not join your group.');
      // useProgress trusts the furthest of the server step and this cache.
      localStorage.setItem('progress', data.step);
      window.location.href = STEP_TO_ROUTE[data.step];
    } finally {
      setJoining(false);
      setStep(null);
    }
  };

  return { step, joining, join, dismiss: () => setStep(null) };
};
