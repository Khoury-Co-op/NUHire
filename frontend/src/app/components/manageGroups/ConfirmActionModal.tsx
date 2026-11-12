'use client';

interface ConfirmActionModalProps {
  actionType: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionModal({ actionType, onConfirm, onCancel }: ConfirmActionModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">Confirm Action</h3>
        <p className="text-gray-600 mb-6">
          {actionType === 'removeStudent' &&
            'Are you sure you want to remove this student from their group?'}
          {actionType === 'deleteStudent' &&
            'Are you sure you want to permanently delete this student?'}
          {actionType === 'startAllGroups' &&
            'Are you sure you want to start all groups? This action cannot be undone.'}
        </p>
        <div className="flex space-x-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-northeasternRed text-white py-2 px-4 rounded-lg hover:bg-red-700"
          >
            Confirm
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
