'use client';

import type { Group, Student } from '../../../types';

interface ReassignStudentModalProps {
  student: Student;
  groups: Group[];
  availableGroups: number[];
  newGroupId: number;
  onSelectGroup: (groupId: number) => void;
  onReassign: () => void;
  onCancel: () => void;
}

export function ReassignStudentModal({
  student: selectedStudent,
  groups,
  availableGroups,
  newGroupId,
  onSelectGroup,
  onReassign,
  onCancel,
}: ReassignStudentModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">
          Reassign{' '}
          {selectedStudent.f_name && selectedStudent.l_name
            ? `${selectedStudent.f_name} ${selectedStudent.l_name}`
            : selectedStudent.email}
        </h3>
        <p className="text-gray-600 mb-4">
          Current group: Group {selectedStudent.group_id}
          {(() => {
            const currentGroup = groups.find((g) => g.group_id === selectedStudent.group_id);
            return currentGroup?.isStarted ? (
              <span className="ml-2 text-green-600 text-sm">✅ Started</span>
            ) : (
              <span className="ml-2 text-gray-500 text-sm">⏳ Not Started</span>
            );
          })()}
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select New Group:</label>
          <select
            value={newGroupId}
            onChange={(e) => onSelectGroup(parseInt(e.target.value))}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {availableGroups.map((groupId) => (
              <option key={groupId} value={groupId}>
                Group {groupId}
              </option>
            ))}
          </select>
          <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
            <div>
              <p className="font-medium">Moving to Group {newGroupId}:</p>
              {(() => {
                const targetGroup = groups.find((g) => g.group_id === newGroupId);
                if (!targetGroup || targetGroup.students.length === 0) {
                  return <p className="text-gray-500 italic">Empty group</p>;
                }
                return (
                  <div className="mt-1">
                    {targetGroup.students.map((student) => (
                      <p key={student.id} className="text-gray-600">
                        •{' '}
                        {student.f_name && student.l_name
                          ? `${student.f_name} ${student.l_name}`
                          : student.f_name || student.l_name || 'No Name'}
                      </p>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={onReassign}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
          >
            Reassign
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
