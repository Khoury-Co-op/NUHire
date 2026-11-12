'use client';

import type { ClassInfo } from '../../../types';

interface ClassPickerProps {
  classes: ClassInfo[];
  selectedClass: string;
  onChange: (classId: string) => void;
}

export function ClassPicker({ classes, selectedClass, onChange }: ClassPickerProps) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Select Class to Manage:
      </label>
      <select
        value={selectedClass}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">Choose a class...</option>
        {classes.map((cls) => (
          <option key={cls.crn} value={cls.crn}>
            {cls.class_name} (CRN: {cls.crn})
          </option>
        ))}
      </select>
    </div>
  );
}
