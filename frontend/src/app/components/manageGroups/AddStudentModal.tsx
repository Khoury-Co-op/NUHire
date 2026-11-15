'use client';

interface AddStudentModalProps {
  groupId: number | null;
  email: string;
  onEmailChange: (email: string) => void;
  isAdding: boolean;
  onAdd: () => void;
  onCancel: () => void;
}

export function AddStudentModal({
  groupId,
  email,
  onEmailChange,
  isAdding,
  onAdd,
  onCancel,
}: AddStudentModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">Add Student to Group {groupId}</h3>
        <label className="block text-sm font-medium text-gray-700 mb-2">Student Email:</label>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
          placeholder="Enter student email"
          autoFocus
        />
        <div className="flex space-x-3">
          <button
            onClick={onAdd}
            disabled={isAdding || !email}
            className={`flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 ${isAdding ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isAdding ? 'Adding...' : 'Add Student'}
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
