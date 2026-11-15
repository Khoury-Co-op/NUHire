'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import { dropOtherUsersKeys, userScope } from '../../lib/userStorage';
import type { InterviewRating } from '../../types';

const STORAGE_PREFIX = 'interviewStage';

const storageKeys = (userId: string) => {
  const scope = userScope(STORAGE_PREFIX, userId);
  return {
    videoIndex: `${scope}videoIndex`,
    candidateId: `${scope}candidateId`,
    overall: `${scope}overall`,
    professionalPresence: `${scope}professionalPresence`,
    qualityOfAnswer: `${scope}qualityOfAnswer`,
    personality: `${scope}personality`,
    noShow: `${scope}noShow`,
  };
};

// The position of the first candidate not yet rated, or interviews.length when
// every one is.
export const firstUnratedIndex = (interviews: { resume_id: number }[], rated: number[]) => {
  const ratedIds = new Set(rated);
  const index = interviews.findIndex((candidate) => !ratedIds.has(candidate.resume_id));
  return index === -1 ? interviews.length : index;
};

// Where a student is in the interview stage and the ratings they have entered
// for the current candidate, kept in localStorage so a refresh does not lose them.
export const useInterviewProgress = (
  userId: number | undefined,
  interviews: { resume_id: number }[]
) => {
  const [noShow, setNoShow] = useState(false);
  const [overall, setOverall] = useState(5);
  const [professionalPresence, setProfessionalPresence] = useState(5);
  const [qualityOfAnswer, setQualityOfAnswer] = useState(5);
  const [personality, setPersonality] = useState(5);
  const [videoIndex, setVideoIndex] = useState(0);
  const [currentCandidateId, setCurrentCandidateId] = useState<number | null>(null);
  // The user whose progress has been read back. Null until then, which stops
  // the save effect writing the initial values over the saved ones, or writing
  // under nobody's key before login.
  const [storageUserId, setStorageUserId] = useState<string | null>(null);
  const [allRated, setAllRated] = useState(false);
  const serverRestoreDoneRef = useRef(false);

  // Waits for the user because the keys are per user. The shared keys these
  // replace handed a previous student's position on a lab browser to the next.
  useEffect(() => {
    if (!userId) return;
    const id = String(userId);
    dropOtherUsersKeys(STORAGE_PREFIX, id);

    const keys = storageKeys(id);
    const savedVideoIndex = localStorage.getItem(keys.videoIndex);
    const savedCandidateId = localStorage.getItem(keys.candidateId);
    const savedOverall = localStorage.getItem(keys.overall);
    const savedProfessionalPresence = localStorage.getItem(keys.professionalPresence);
    const savedQualityOfAnswer = localStorage.getItem(keys.qualityOfAnswer);
    const savedPersonality = localStorage.getItem(keys.personality);
    const savedNoShow = localStorage.getItem(keys.noShow);

    if (savedVideoIndex) setVideoIndex(Number(savedVideoIndex));
    if (savedCandidateId) setCurrentCandidateId(Number(savedCandidateId));
    if (savedOverall) setOverall(Number(savedOverall));
    if (savedProfessionalPresence) setProfessionalPresence(Number(savedProfessionalPresence));
    if (savedQualityOfAnswer) setQualityOfAnswer(Number(savedQualityOfAnswer));
    if (savedPersonality) setPersonality(Number(savedPersonality));
    if (savedNoShow) setNoShow(savedNoShow === 'true');
    setStorageUserId(id);
  }, [userId]);

  useEffect(() => {
    if (!storageUserId) return;
    const keys = storageKeys(storageUserId);
    localStorage.setItem(keys.videoIndex, String(videoIndex));
    localStorage.setItem(keys.overall, String(overall));
    localStorage.setItem(keys.professionalPresence, String(professionalPresence));
    localStorage.setItem(keys.qualityOfAnswer, String(qualityOfAnswer));
    localStorage.setItem(keys.personality, String(personality));
    localStorage.setItem(keys.noShow, String(noShow));
    if (currentCandidateId !== null) {
      localStorage.setItem(keys.candidateId, String(currentCandidateId));
    }
  }, [
    storageUserId,
    videoIndex,
    overall,
    professionalPresence,
    qualityOfAnswer,
    personality,
    noShow,
    currentCandidateId,
  ]);

  // localStorage is a cache; the saved ratings are the record. Without this a
  // student on another browser, or who refreshes after finishing, starts again
  // at the first video and overwrites ratings they already gave.
  useEffect(() => {
    if (!storageUserId || interviews.length === 0 || serverRestoreDoneRef.current) return;
    serverRestoreDoneRef.current = true;

    fetch(`${API_BASE_URL}/interview/my-votes`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Loading saved ratings failed with ${res.status}`);
        return res.json();
      })
      .then((rows: Pick<InterviewRating, 'candidate_id'>[]) => {
        const next = firstUnratedIndex(
          interviews,
          rows.map((row) => row.candidate_id)
        );
        if (next === interviews.length) setAllRated(true);
        else setVideoIndex(next);
      })
      // The position saved in this browser still applies, so the student can carry on.
      .catch((error) => console.error('Error loading saved interview ratings:', error));
  }, [storageUserId, interviews]);

  const currentVid = interviews[videoIndex];

  // currentCandidateId records which candidate the saved slider values belong
  // to. When the restored position lands on a different candidate, the values
  // were given to another candidate and are reset below.
  useEffect(() => {
    if (currentVid) {
      setCurrentCandidateId(currentVid.resume_id);
    }
  }, [currentVid]);

  useEffect(() => {
    if (interviews.length > 0 && currentCandidateId !== null) {
      const currentVideoCandidate = interviews[videoIndex]?.resume_id;

      if (currentVideoCandidate !== currentCandidateId) {
        resetRatings();
        setNoShow(false);
        setCurrentCandidateId(currentVideoCandidate);
      }
    }
  }, [interviews, videoIndex, currentCandidateId]);

  const resetRatings = () => {
    setOverall(5);
    setProfessionalPresence(5);
    setQualityOfAnswer(5);
    setPersonality(5);
  };

  const clearSavedProgress = useCallback(() => {
    if (!storageUserId) return;
    Object.values(storageKeys(storageUserId)).forEach((key) => localStorage.removeItem(key));
  }, [storageUserId]);

  return {
    videoIndex,
    setVideoIndex,
    allRated,
    noShow,
    setNoShow,
    overall,
    setOverall,
    professionalPresence,
    setProfessionalPresence,
    qualityOfAnswer,
    setQualityOfAnswer,
    personality,
    setPersonality,
    resetRatings,
    clearSavedProgress,
  };
};
