'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import { useSocket } from './socketContext';
import type { User } from '../../types';

export interface JobDescription {
  title: string;
  // Path of the job PDF relative to the API, or null when it was not fetched
  // (`includeFile: false`) or could not be found.
  filePath: string | null;
}

// Which step failed, so a page can keep its own rule for what to show:
// `assignment` the assignment request returned an error status,
// `none` the group has no job assigned, `file` the PDF lookup failed,
// `network` a request threw.
export type JobDescriptionError = 'assignment' | 'none' | 'file' | 'network';

interface Options {
  // The dashboard only needs the title to unlock steps; the other pages also
  // need the PDF.
  includeFile?: boolean;
  // Refetch when the professor changes the job. Only the dashboard listens.
  refetchOnJobUpdated?: boolean;
}

// The job assigned to a group, found by /jobs/assignment and then /jobs/title.
// Every student page used to carry its own copy of this pair of requests.
export async function loadJobDescription(
  groupId: number,
  classId: number,
  includeFile: boolean
): Promise<{ job: JobDescription | null; error: JobDescriptionError | null }> {
  try {
    const assignmentResponse = await fetch(
      `${API_BASE_URL}/jobs/assignment/${groupId}/${classId}`,
      {
        credentials: 'include',
      }
    );
    if (!assignmentResponse.ok) return { job: null, error: 'assignment' };

    const assignment: { job?: string } = await assignmentResponse.json();
    if (!assignment.job) return { job: null, error: 'none' };
    if (!includeFile) return { job: { title: assignment.job, filePath: null }, error: null };

    const fileResponse = await fetch(
      `${API_BASE_URL}/jobs/title?title=${encodeURIComponent(assignment.job)}&class_id=${classId}`,
      { credentials: 'include' }
    );
    if (!fileResponse.ok) return { job: null, error: 'file' };

    const file: { file_path?: string } = await fileResponse.json();
    return { job: { title: assignment.job, filePath: file.file_path ?? null }, error: null };
  } catch (err) {
    console.error('Error fetching job description:', err);
    return { job: null, error: 'network' };
  }
}

export const useJobDescription = (
  user: Pick<User, 'group_id' | 'class'> | null,
  { includeFile = true, refetchOnJobUpdated = false }: Options = {}
) => {
  const socket = useSocket();
  const [job, setJob] = useState<JobDescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<JobDescriptionError | null>(null);

  const groupId = user?.group_id;
  const classId = user?.class;

  // A failed refetch keeps the job already on screen; only a change of group
  // starts from nothing.
  const lastGroup = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    if (!groupId || !classId) {
      setJob(null);
      setLoading(false);
      return;
    }

    const groupKey = `${groupId}:${classId}`;
    if (lastGroup.current !== groupKey) {
      lastGroup.current = groupKey;
      setJob(null);
    }

    setLoading(true);
    const result = await loadJobDescription(groupId, classId, includeFile);
    if (result.job) setJob(result.job);
    setError(result.error);
    setLoading(false);
  }, [groupId, classId, includeFile]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!refetchOnJobUpdated || !socket) return;
    const onJobUpdated = () => {
      refetch();
    };
    socket.on('jobUpdated', onJobUpdated);
    return () => {
      socket.off('jobUpdated', onJobUpdated);
    };
  }, [refetchOnJobUpdated, socket, refetch]);

  return { job, loading, error, refetch };
};
