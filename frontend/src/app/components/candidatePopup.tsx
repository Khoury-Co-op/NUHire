'use client';

import React, { useEffect, useState } from 'react';
import {
  CURVEBALL_COLUMN,
  NO_SHOW_THRESHOLD,
  RATING_COLUMN,
  RATING_LABEL,
  RATINGS,
  VOTE_LABEL,
} from '../../lib/ratings';
import type { Candidate, InterviewRating, Resume, Student } from '../../types';
import { API_BASE_URL } from '../../lib/api';

// Students who haven't voted or rated yet come back with these fields null.
type StudentVote = Pick<Student, 'id' | 'f_name' | 'l_name'> &
  Partial<
    Pick<Resume, 'vote'> &
      Pick<InterviewRating, 'question1' | 'question2' | 'question3' | 'question4'>
  >;

const VOTE_STYLE: Record<Resume['vote'], string> = {
  yes: 'bg-green-100 text-green-700',
  no: 'bg-red-100 text-red-700',
  unanswered: 'bg-yellow-100 text-yellow-700',
};

interface CandidatePopupProps {
  classId: number;
  groupId: number;
  candidateId: number;
  onDismiss: () => void;
}

const CandidatePopup = ({ classId, groupId, candidateId, onDismiss }: CandidatePopupProps) => {
  const [candidate, setCandidate] = useState<(Candidate & { file_path: string }) | null>(null);
  const [votes, setVotes] = useState<StudentVote[]>([]);
  const [curveballs, setCurveballs] = useState<Pick<
    InterviewRating,
    'question1' | 'question2' | 'question3' | 'question4'
  > | null>(null);

  useEffect(() => {
    // Clear the last candidate and drop any response that lands after the ids change.
    let cancelled = false;
    setCandidate(null);
    setVotes([]);
    setCurveballs(null);

    const fetchCandidateDetails = async () => {
      try {
        const candidateRes = await fetch(
          `${API_BASE_URL}/candidates/resume-with-file/${candidateId}`,
          { credentials: 'include' }
        );
        if (candidateRes.ok) {
          const data = await candidateRes.json();
          if (!cancelled) setCandidate(data);
        }

        const votesRes = await fetch(
          `${API_BASE_URL}/offers/group/${groupId}/class/${classId}/candidate/${candidateId}`,
          { credentials: 'include' }
        );
        if (votesRes.ok) {
          const data = await votesRes.json();
          if (!cancelled) setVotes(data);
        }

        const curveballsRes = await fetch(
          `${API_BASE_URL}/interview/popup/${candidateId}/${groupId}/${classId}`,
          { credentials: 'include' }
        );
        if (curveballsRes.ok) {
          const data = await curveballsRes.json();
          if (!cancelled) setCurveballs(data);
        }
      } catch (error) {
        console.error('Error fetching candidate details:', error);
      }
    };

    fetchCandidateDetails();

    return () => {
      cancelled = true;
    };
  }, [classId, groupId, candidateId]);

  const isNoShow =
    !!curveballs &&
    RATINGS.some((rating) => curveballs[CURVEBALL_COLUMN[rating]] <= NO_SHOW_THRESHOLD);

  // Every teammate on interview-stage adds the curveball once, so the stored
  // value is a group total. makeOffer divides by group size; do the same here
  // so the teacher sees the per-student effect the students saw.
  // Without the roster there's no group size to divide by, so show nothing
  // rather than an inflated total.
  const groupSize = votes.length;
  const hasCurveball =
    groupSize > 0 &&
    !!curveballs &&
    RATINGS.some((rating) => curveballs[CURVEBALL_COLUMN[rating]] !== 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[700px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          Group {groupId} offered {candidate?.f_name} {candidate?.l_name}
        </h3>

        {candidate && (
          <div className="mb-4">
            <div className="aspect-video w-full mb-2">
              <iframe
                className="w-full h-full rounded-lg shadow-md"
                src={candidate.interview}
                title="Interview Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              ></iframe>
            </div>
            <a
              href={`${API_BASE_URL}/${candidate.file_path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy hover:underline"
            >
              View / Download Resume
            </a>
          </div>
        )}

        <div className="space-y-3 mb-4">
          {votes.map((vote) => (
            <div key={vote.id} className="p-4 border border-gray-200 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold">
                  {vote.f_name} {vote.l_name}
                </span>
                {vote.vote && (
                  <span className={`px-1 py-0.5 rounded ${VOTE_STYLE[vote.vote]}`}>
                    {VOTE_LABEL[vote.vote]}
                  </span>
                )}
              </div>
              <div className="space-y-1 text-navy text-sm">
                {RATINGS.map((rating) => (
                  <p key={rating}>
                    <span className="font-medium">{RATING_LABEL[rating]}:</span>{' '}
                    {vote[RATING_COLUMN[rating]] ?? 'N/A'}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {curveballs && hasCurveball && (
          <div className="mb-4 text-navy text-sm">
            <p className="font-semibold mb-1">Curveball adjustments</p>
            {isNoShow ? (
              <p>No Show</p>
            ) : (
              <div className="space-y-1">
                {RATINGS.map((rating) => (
                  <p key={rating}>
                    <span className="font-medium">{RATING_LABEL[rating]}:</span>{' '}
                    {Number((curveballs[CURVEBALL_COLUMN[rating]] / groupSize).toFixed(1))}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onDismiss}
          className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default CandidatePopup;
