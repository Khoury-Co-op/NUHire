'use client';

import { useState } from 'react';
import type { AcceptedOffer, Group, PendingOffer, Student } from '../../../types';
import CandidatePopup from '../candidatePopup';

export interface ScrollState {
  canScrollDown: boolean;
  canScrollUp: boolean;
}

interface GroupCardProps {
  group: Group;
  groupOffer: PendingOffer | undefined;
  acceptedOffer: AcceptedOffer | undefined;
  isDismissed: boolean;
  scrollState: ScrollState | undefined;
  isStarting: boolean;
  respondToOffer: (
    classId: number,
    groupId: number,
    candidateId: number,
    accepted: boolean,
    candidateName?: string
  ) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onDismiss: () => void;
  onToggleDismissed: () => void;
  onReassign: (student: Student) => void;
  onRemove: (email: string) => void;
  onDelete: (email: string) => void;
  onAddStudent: () => void;
  onAssignJob: () => void;
  onSendPopup: () => void;
  onStart: () => void;
}

export function GroupCard({
  group,
  groupOffer,
  acceptedOffer,
  isDismissed,
  scrollState,
  isStarting,
  respondToOffer,
  onScroll,
  onDismiss,
  onToggleDismissed,
  onReassign,
  onRemove,
  onDelete,
  onAddStudent,
  onAssignJob,
  onSendPopup,
  onStart,
}: GroupCardProps) {
  const showAcceptedOverlay = acceptedOffer && !isDismissed;
  const [showCandidate, setShowCandidate] = useState(false);

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-6 flex flex-col h-full min-w-[400px] relative ${acceptedOffer ? 'border-4 border-green-500' : groupOffer ? 'border-4 border-yellow-500' : 'border border-gray-200'}`}
    >
      {showAcceptedOverlay && (
        <div className="absolute inset-0 bg-green-50 bg-opacity-95 rounded-lg z-20 flex items-center justify-center p-6 border-2 border-green-400">
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 text-2xl font-bold"
            title="Dismiss"
          >
            ×
          </button>
          <div className="text-center w-full">
            <h4 className="text-2xl font-bold text-green-800 mb-3">✓ Offer Accepted!</h4>
            <p className="text-lg font-semibold text-gray-800 mb-2">
              Group {group.group_id} has hired:
            </p>
            <p className="text-2xl font-bold text-green-600">{acceptedOffer.candidateName}</p>
            <p className="text-sm text-gray-600 mt-4">🎉 Congratulations! 🎉</p>
          </div>
        </div>
      )}

      {groupOffer && (
        <div className="absolute inset-0 bg-yellow-50 bg-opacity-95 rounded-lg z-20 flex items-center justify-center p-6 border-2 border-yellow-400">
          <div className="text-center w-full">
            <h4 className="text-xl font-bold text-yellow-800 mb-3">🎯 Pending Offer</h4>
            <p className="text-lg font-semibold text-gray-800 mb-2">
              Group {group.group_id} wants to offer:
            </p>
            <button
              onClick={() => setShowCandidate(true)}
              className="block mx-auto text-xl font-bold text-red-600 mb-4 underline hover:text-red-800"
              title="See why the group picked this candidate"
            >
              {groupOffer.candidateName}
            </button>
            <p className="text-sm text-gray-600 mb-6">Do you approve this offer?</p>
            <div className="flex space-x-3 justify-center">
              <button
                onClick={() =>
                  respondToOffer(
                    groupOffer.classId,
                    groupOffer.groupId,
                    groupOffer.candidateId,
                    true,
                    groupOffer.candidateName
                  )
                }
                className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
              >
                ✓ Accept
              </button>
              <button
                onClick={() =>
                  respondToOffer(
                    groupOffer.classId,
                    groupOffer.groupId,
                    groupOffer.candidateId,
                    false,
                    groupOffer.candidateName
                  )
                }
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
              >
                × Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {groupOffer && showCandidate && (
        <CandidatePopup
          classId={groupOffer.classId}
          groupId={groupOffer.groupId}
          candidateId={groupOffer.candidateId}
          onDismiss={() => setShowCandidate(false)}
        />
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h3 className="text-xl font-semibold text-gray-900">
            {group.group_id !== -1 ? `Group ${group.group_id}` : 'No Group'}
          </h3>
        </div>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          {group.students.length} student{group.students.length !== 1 ? 's' : ''}
        </span>
      </div>

      {group.group_id !== -1 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="mb-2">
            <p className="text-xs font-semibold text-gray-600 uppercase">Job Assignment</p>
            <p className="text-sm text-gray-800">{group.jobAssignment}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase">Progress</p>
            <p className="text-sm text-gray-800 capitalize">{group.progress?.replace('_', ' ')}</p>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col justify-center mb-4 relative">
        {group.students.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[120px]">
            <p className="text-gray-400 text-base italic text-center">No students in this group</p>
          </div>
        ) : (
          <div className="relative">
            {scrollState?.canScrollUp && (
              <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none flex items-start justify-center">
                <div className="text-blue-600 text-xs font-semibold animate-bounce">
                  ▲ Scroll up
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2" onScroll={onScroll}>
              {group.students.map((student) => (
                <div key={student.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="mb-3">
                    <p className="font-medium text-gray-900 text-base">
                      {student.f_name && student.l_name
                        ? `${student.f_name} ${student.l_name}`
                        : student.f_name || student.l_name || 'No Name'}
                    </p>
                    <p className="text-sm text-gray-600 truncate" title={student.email}>
                      {student.email}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onReassign(student)}
                      className="flex-1 bg-blue-100 text-blue-700 hover:bg-blue-200 py-2 px-3 rounded-md text-sm font-medium transition-colors"
                      title="Reassign student"
                    >
                      ↻ Reassign
                    </button>
                    {group.group_id === -1 ? (
                      <button
                        onClick={() => onDelete(student.email)}
                        className="flex-1 bg-red-100 text-red-700 hover:bg-red-200 py-2 px-3 rounded-md text-sm font-medium transition-colors"
                        title="Delete student"
                      >
                        × Delete
                      </button>
                    ) : (
                      <button
                        onClick={() => onRemove(student.email)}
                        className="flex-1 bg-red-100 text-red-700 hover:bg-red-200 py-2 px-3 rounded-md text-sm font-medium transition-colors"
                        title="Remove from group"
                      >
                        × Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {scrollState?.canScrollDown && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none flex items-end justify-center">
                <div className="text-blue-600 text-xs font-semibold animate-bounce">
                  ▼ Scroll down
                </div>
              </div>
            )}
          </div>
        )}
        <button
          onClick={onAddStudent}
          className="w-full mt-2 bg-green-100 text-green-700 hover:bg-green-200 py-2 px-3 rounded-md text-sm font-medium transition-colors"
        >
          ➕ Add Student to Group
        </button>
      </div>
      <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
        {group.group_id !== -1 && (
          <>
            <button
              onClick={onAssignJob}
              className="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors bg-red-600 text-white hover:bg-red-700"
            >
              💼 Assign Job
            </button>
            <button
              onClick={onSendPopup}
              disabled={group.progress !== 'interview'}
              className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${group.progress === 'interview' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              title={
                group.progress !== 'interview'
                  ? 'Only available during interview stage'
                  : 'Send popup to this group'
              }
            >
              📢 Send Popup
            </button>
          </>
        )}
        {acceptedOffer && (
          <button
            onClick={onToggleDismissed}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors bg-green-600 text-white hover:bg-green-700"
          >
            {isDismissed ? '👁️ Show Hired Info' : '🎉 View Hired Candidate'}
          </button>
        )}
        <button
          onClick={onStart}
          disabled={group.isStarted || isStarting}
          className={`w-full py-3 px-4 rounded-lg text-sm font-medium transition-colors ${group.isStarted || isStarting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          {isStarting ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Starting...
            </div>
          ) : group.isStarted ? (
            '✅ Started'
          ) : (
            '🚀 Start Group'
          )}
        </button>
      </div>
    </div>
  );
}
