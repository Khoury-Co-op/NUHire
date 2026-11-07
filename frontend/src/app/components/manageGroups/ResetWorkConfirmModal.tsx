'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../lib/api';

const CONFIRM_WORD = 'ERASE';

interface GroupResetPreview {
  group_id: number;
  students: number;
  counts: Record<string, number>;
  offer_status: 'pending' | 'accepted' | 'rejected' | null;
}

interface ResetWorkConfirmModalProps {
  classId: string;
  // null means every group in the class
  groupId: number | null;
  jobTitle: string;
  isWorking: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// The last step before a reset erases a group's work. It reads what would be
// lost from GET /jobs/reset-preview rather than listing tables from memory, and
// it will not confirm until the professor types ERASE. Cancel takes focus so a
// stray Enter backs out instead of wiping the class.
export function ResetWorkConfirmModal({
  classId,
  groupId,
  jobTitle,
  isWorking,
  onConfirm,
  onCancel,
}: ResetWorkConfirmModalProps) {
  const [preview, setPreview] = useState<GroupResetPreview[] | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const query = groupId !== null ? `?group_id=${groupId}` : '';

    let cancelled = false;
    setPreview(null);
    setPreviewFailed(false);
    fetch(`${API_BASE_URL}/jobs/reset-preview/${encodeURIComponent(classId)}${query}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { groups: GroupResetPreview[] }) => {
        if (!cancelled) setPreview(data.groups);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, groupId, previewAttempt]);

  const totals: Record<string, number> = {};
  for (const group of preview ?? []) {
    for (const [label, count] of Object.entries(group.counts)) {
      totals[label] = (totals[label] ?? 0) + count;
    }
  }
  const lostItems = Object.entries(totals).filter(([, count]) => count > 0);
  const studentCount = (preview ?? []).reduce((sum, g) => sum + g.students, 0);
  const groupsWithOffers = (preview ?? []).filter(
    (g) => g.offer_status === 'pending' || g.offer_status === 'accepted'
  );

  const scope =
    groupId !== null
      ? `Group ${groupId}`
      : preview
        ? `all ${preview.length} groups in this class`
        : 'every group in this class';
  // The professor has to see the real counts before erasing anything, so the
  // button stays off while the preview loads and after it fails.
  const canConfirm = typed === CONFIRM_WORD && preview !== null && !isWorking;

  return (
    <div
      role="presentation"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isWorking) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-work-title"
        className="bg-white rounded-lg p-6 w-[28rem] max-h-[90vh] overflow-y-auto"
      >
        <h3 id="reset-work-title" className="text-lg font-semibold text-red-700 mb-2">
          Erase work for {scope}?
        </h3>
        <p className="text-sm text-gray-700 mb-3">
          Assigning <span className="font-semibold">{jobTitle}</span> resets {scope}. Their students
          go back to the job description, and this permanently deletes:
        </p>

        {!preview && !previewFailed && (
          <p className="text-sm text-gray-500 mb-3">Checking what would be erased...</p>
        )}

        {previewFailed && (
          <div className="text-sm text-red-700 mb-3">
            <p className="mb-2">
              Could not load what would be erased, so this cannot be confirmed yet.
            </p>
            <button
              onClick={() => setPreviewAttempt((n) => n + 1)}
              className="px-3 py-1 rounded-lg border border-red-600 hover:bg-red-50"
            >
              Retry
            </button>
          </div>
        )}

        {/* Progress resets even when nothing is saved yet, so it is listed on
            its own rather than folded into a "nothing will be lost" message. */}
        {preview && lostItems.length === 0 && (
          <p className="text-sm text-gray-700 mb-2">No saved work yet.</p>
        )}
        {preview && (lostItems.length > 0 || studentCount > 0) && (
          <ul className="list-disc pl-5 text-sm text-gray-800 mb-3">
            {lostItems.map(([label, count]) => (
              <li key={label}>
                {label}: {count}
              </li>
            ))}
            {studentCount > 0 && <li>progress for students: {studentCount}</li>}
          </ul>
        )}

        {groupsWithOffers.length > 0 && (
          <div className="border-2 border-red-600 bg-red-50 rounded-lg p-3 mb-3 text-sm text-red-800">
            <p className="font-semibold mb-1">These groups have already made an offer:</p>
            <ul className="list-disc pl-5">
              {groupsWithOffers.map((g) => (
                <li key={g.group_id}>
                  Group {g.group_id}: {g.offer_status}
                </li>
              ))}
            </ul>
            <p className="mt-1">The offer is deleted and the group has to start over.</p>
          </div>
        )}

        <label htmlFor="reset-work-confirm" className="block text-sm text-gray-700 mb-1">
          Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm:
        </label>
        <input
          id="reset-work-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="w-full p-2 border border-gray-300 rounded-lg mb-4 font-mono"
        />

        <div className="flex space-x-3">
          <button
            autoFocus
            onClick={onCancel}
            disabled={isWorking}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`flex-1 bg-red-600 text-white py-2 px-4 rounded-lg ${canConfirm ? 'hover:bg-red-700' : 'opacity-50 cursor-not-allowed'}`}
          >
            {isWorking ? 'Erasing...' : 'Erase and assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
