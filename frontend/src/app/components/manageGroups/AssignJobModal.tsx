'use client';

import type { JobOption } from '../../../types';

interface AssignJobModalProps {
  groupId: number | null;
  jobs: JobOption[];
  selectedJobId: number | null;
  onSelectJob: (jobId: number) => void;
  groupCount: number;
  isAssigning: boolean;
  // Changes the job and keeps every group's work.
  onChangeJob: () => void;
  // Opens the ERASE confirmation; nothing is deleted from here.
  onReset: () => void;
  onCancel: () => void;
}

// Two separate actions on purpose: changing the job is the safe default, and
// erasing work is a distinct, visibly destructive choice behind its own
// confirmation, so fixing a job title mid-class never wipes anyone's work.
export function AssignJobModal({
  groupId,
  jobs,
  selectedJobId,
  onSelectJob,
  groupCount,
  isAssigning,
  onChangeJob,
  onReset,
  onCancel,
}: AssignJobModalProps) {
  const disabled = isAssigning || !selectedJobId;
  const target = groupId ? 'this group' : 'all groups';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">
          {groupId ? `Assign Job to Group ${groupId}` : 'Assign Job to All Groups'}
        </h3>
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Job:</label>
        <select
          value={selectedJobId || ''}
          onChange={(e) => onSelectJob(parseInt(e.target.value))}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
        >
          <option value="">-- Select a Job --</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        {!groupId && (
          <p className="text-sm text-gray-600 mb-4">
            This will assign the selected job to all {groupCount} groups in this class.
          </p>
        )}
        <button
          onClick={onChangeJob}
          disabled={disabled}
          className={`w-full bg-blue-600 text-white py-2 px-4 rounded-lg ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
        >
          {isAssigning ? 'Saving...' : 'Change job'}
        </button>
        <p className="text-xs text-gray-600 mt-1 mb-4">
          Keeps everyone&apos;s votes, ratings, notes and progress.
        </p>

        <div className="border-t border-gray-200 pt-4 mb-4">
          <button
            onClick={onReset}
            disabled={disabled}
            className={`w-full border-2 border-red-600 text-red-700 py-2 px-4 rounded-lg ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-50'}`}
          >
            Reset {target} and assign...
          </button>
          <p className="text-xs text-gray-600 mt-1">
            Erases saved work and any offer, and sends students back to the start. You confirm on
            the next screen.
          </p>
        </div>

        <button
          onClick={onCancel}
          className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
