'use client';

import { API_BASE_URL } from '../../lib/api';

interface User {
  email: string;
  class: number;
  group_id: number;
}

interface ProgressOperations {
  fetchProgress: (user: User) => Promise<string>;
  updateProgress: (user: User, step: string) => Promise<void>;
}

export const useProgressManager = (): ProgressOperations => {
  const fetchProgress = async (user: User): Promise<string> => {
    if (!user?.email) {
      return 'none';
    }

    try {
      const response = await fetch(`${API_BASE_URL}/progress/user/${user.email}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        return data?.step || 'none';
      }
      return 'none';
    } catch (error) {
      return 'none';
    }
  };

  const updateProgress = async (user: User, step: string): Promise<void> => {
    if (!user?.email) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // Callers navigate right after this resolves or fails. keepalive lets
      // the write finish even if the page unloads first, otherwise the next
      // page's progress POST is a skip and gets a 409.
      keepalive: true,
      body: JSON.stringify({
        crn: user.class,
        group_id: user.group_id,
        step: step,
        email: user.email,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update progress: ${errorText}`);
    }
  };

  return {
    fetchProgress,
    updateProgress,
  };
};
