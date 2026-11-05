'use client';

import { useState, useRef, useEffect } from 'react';
import Popup from './popup';
import { useAuth } from './AuthContext';
import type { ClassInfo } from '../../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

/** Students per group when the professor has not said otherwise. Four members
 *  reviewing ten resumes is what the activity is written for. */
const DEFAULT_STUDENTS_PER_GROUP = 4;

interface CSVStudent {
  email: string;
  group_id: number;
}

interface ValidationError {
  row: number;
  error: string;
  /** The offending cell, echoed back so the professor can find the row in the
   *  spreadsheet without guessing which column we rejected. */
  value?: string;
}

export function StudentCSVTab() {
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [csvStudents, setCsvStudents] = useState<CSVStudent[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false); // Add submit loading state
  const [submitSuccess, setSubmitSuccess] = useState(false); // Add submit success state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, loading: userloading } = useAuth();

  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  // Held as the raw string the professor typed, not a number. When this was a
  // number coerced on every keystroke, clearing the box parsed '' as NaN and
  // wrote the default 4 back before the next key, so select-all, Backspace,
  // "3" produced "43" and Auto-assign dropped the whole class into group 1.
  // resolveStudentsPerGroup turns it into a usable number where it is consumed.
  const [studentsPerGroup, setStudentsPerGroup] = useState<string>(
    String(DEFAULT_STUDENTS_PER_GROUP)
  );

  // This was `/^.*$/` with the real check commented out, so a header row, a
  // stray "N/A" or a trailing blank cell all became students. Those rows then
  // count toward the "has every group member finished" barrier and hang the
  // real students behind a teammate who does not exist.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const NORTHEASTERN_DOMAIN = '@northeastern.edu';

  useEffect(() => {
    const fetchClasses = async () => {
      if (!user?.email) return;

      try {
        const response = await fetch(`${API_BASE_URL}/moderator/classes-full/${user.email}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const classData = await response.json();
          setClasses(classData);
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      }
    };

    fetchClasses();
  }, [user]);

  // Hand-rolled because this was `split(',')`, and a Canvas gradebook export
  // quotes any name containing a comma ("Doe, John"), which shifted every
  // column after it — the email column then held a surname and the whole class
  // failed validation. Windows CRLF also left a `\r` glued to the last field,
  // so a trailing email column never matched. RFC 4180: quoted fields may hold
  // commas, newlines and `""` for a literal quote, and Excel prefixes a UTF-8
  // BOM that otherwise ends up inside the first header name.
  const parseCSV = (csvText: string): string[][] => {
    const text = csvText.replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let fieldWasQuoted = false;

    // Only unquoted fields get trimmed; whitespace inside quotes was deliberate.
    const endField = () => {
      row.push(fieldWasQuoted ? field : field.trim());
      field = '';
      fieldWasQuoted = false;
    };

    const endRow = () => {
      endField();
      // Drop blank lines rather than reporting them as empty-email rows.
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    };

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else if (char === '\r' && text[i + 1] === '\n') {
          field += '\n';
          i++;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        fieldWasQuoted = true;
      } else if (char === ',') {
        endField();
      } else if (char === '\r') {
        if (text[i + 1] === '\n') i++;
        endRow();
      } else if (char === '\n') {
        endRow();
      } else {
        field += char;
      }
    }

    // A file with no trailing newline still has one row left in the buffer.
    if (field !== '' || row.length > 0) endRow();

    return rows;
  };

  // Fills groups in file order: the first `perGroup` valid rows are group 1,
  // the next `perGroup` are group 2, and so on. Replaces a hardcoded
  // `group_id: 1` that put the whole class in one group and left the professor
  // hand-typing 30 group numbers while the room waited.
  const assignGroupsSequentially = (students: CSVStudent[], perGroup: number): CSVStudent[] => {
    const size = Math.max(1, Math.floor(perGroup) || 1);
    return students.map((student, index) => ({
      ...student,
      group_id: Math.floor(index / size) + 1,
    }));
  };

  // The only place the typed "students per group" becomes a number. Defaulting
  // and clamping live here, not in the input's onChange, so the box can sit
  // empty or hold a half-typed value while the professor edits it. The upper
  // clamp to the class size is what `max=` on the input does not enforce for
  // typed values: a size above the class size makes assignGroupsSequentially
  // return group 1 for everyone.
  const resolveStudentsPerGroup = (raw: string, classSize: number): number => {
    const parsed = parseInt(raw, 10);
    const size = Number.isNaN(parsed) ? DEFAULT_STUDENTS_PER_GROUP : Math.max(1, parsed);
    return classSize > 0 ? Math.min(size, classSize) : size;
  };

  const validateAndExtractEmails = (
    data: string[][]
  ): { students: CSVStudent[]; errors: ValidationError[] } => {
    const students: CSVStudent[] = [];
    const errors: ValidationError[] = [];

    if (data.length === 0) {
      errors.push({ row: 0, error: 'CSV file is empty' });
      return { students, errors };
    }

    // Find email column
    const headers = data[0].map((h) => h.toLowerCase().trim());
    const emailIndex = headers.findIndex((h) => h.includes('email'));

    if (emailIndex === -1) {
      errors.push({ row: 1, error: 'No email column found in headers' });
      return { students, errors };
    }

    // Process data rows. Every rejected row is reported and none of them reach
    // `students`, so an unparseable cell cannot be submitted as a classmate.
    data.slice(1).forEach((row, index) => {
      const rowNumber = index + 2;
      const raw = row[emailIndex]?.trim() ?? '';
      const email = raw.toLowerCase();

      if (!email) {
        errors.push({ row: rowNumber, error: 'Empty email address' });
      } else if (!emailRegex.test(email)) {
        errors.push({ row: rowNumber, error: 'Not a valid email address', value: raw });
      } else if (!email.endsWith(NORTHEASTERN_DOMAIN)) {
        errors.push({ row: rowNumber, error: 'Not a northeastern.edu address', value: raw });
      } else {
        // group_id is a placeholder; assignGroupsSequentially sets the real one
        // once the whole file has been validated and the count is known.
        students.push({ email, group_id: 1 });
      }
    });
    return { students, errors };
  };

  const handleFileUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setValidationErrors([{ row: 0, error: 'Please upload a CSV file' }]);
      return;
    }

    // Clear existing data when new file is uploaded
    setCsvStudents([]);
    setValidationErrors([]);
    setSubmitSuccess(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target?.result as string;
      const parsedData = parseCSV(csvText);
      const { students, errors } = validateAndExtractEmails(parsedData);

      // Resolve against the freshly parsed list, not csvStudents, which was
      // just cleared and would clamp the size to 0.
      setCsvStudents(
        assignGroupsSequentially(
          students,
          resolveStudentsPerGroup(studentsPerGroup, students.length)
        )
      );
      setValidationErrors(errors);
    };

    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Keyed by row, not by email: a Canvas export with the same address twice
  // moved both copies when the professor edited one of them.
  const updateStudentGroup = (index: number, groupId: number) => {
    setCsvStudents((prev) =>
      prev.map((student, i) =>
        i === index ? { ...student, group_id: Math.max(1, groupId) } : student
      )
    );
  };

  const effectiveStudentsPerGroup = resolveStudentsPerGroup(studentsPerGroup, csvStudents.length);

  const reapplyAutoAssign = () => {
    setCsvStudents((prev) => assignGroupsSequentially(prev, effectiveStudentsPerGroup));
  };

  const projectedGroupCount = Math.ceil(csvStudents.length / effectiveStudentsPerGroup);

  // New submit function
  const handleSubmit = async () => {
    if (!selectedClass || csvStudents.length === 0) {
      // This was a bare string expression, so the button did nothing at all and
      // gave no reason why.
      setPopup({
        headline: 'Error',
        message: 'Please select a class and upload student data first',
      });
      return;
    }

    const payload = {
      class_id: selectedClass,
      assignments: csvStudents.map((student) => ({
        email: student.email,
        group_id: student.group_id,
      })),
    };

    const uniqueGroupIds = [...new Set(csvStudents.map((student) => student.group_id))];
    const numGroups = Math.max(...uniqueGroupIds);

    setIsSubmitting(true);

    try {
      const createPayload = {
        class_id: selectedClass,
        num_groups: numGroups,
      };

      const createRes = await fetch(`${API_BASE_URL}/groups/create-groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(createPayload),
      });

      if (!createRes.ok) {
        const createError = await createRes.json();
        console.error('Failed to create groups:', createError);
        if (!createError.error?.includes('already exist')) {
          throw new Error(`Failed to create groups: ${createError.error}`);
        }

        // create-groups refuses to add rows once the class has any, however
        // many it asked for, and /csv/import writes Users.group_id with no
        // check against GroupsInfo (there is no FK). This branch used to log
        // and carry on, so a class that already had k groups got students
        // written into groups k+1..N that do not exist. Those students are
        // dropped from the admin tab (it only buckets known ids or null) and
        // their group can never be started, so the barrier never opens for
        // them. Groups are only ever inserted as 1..N, so the count in the
        // body is the highest id that exists; refuse anything above it.
        const existingGroups: unknown = createError.existing_groups;
        if (typeof existingGroups !== 'number') {
          setPopup({
            headline: 'Error',
            message:
              'This class already has groups, but the server did not say how many. ' +
              'Nothing was imported. Please try again.',
          });
          return;
        }
        if (numGroups > existingGroups) {
          setPopup({
            headline: 'Error',
            message:
              `This class already has ${existingGroups} group${existingGroups === 1 ? '' : 's'}, ` +
              `but these assignments use group numbers up to ${numGroups}. Nothing was imported. ` +
              `Raise "Students per group" or edit the group numbers so none exceed ${existingGroups}.`,
          });
          return;
        }
      }

      const response = await fetch(`${API_BASE_URL}/csv/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSubmitSuccess(true);
        setPopup({ headline: 'Success', message: '✅ Group assignments submitted successfully!' });
      } else {
        const errorData = await response.json();
        console.error('Response error:', errorData);
        setPopup({
          headline: 'Error',
          message: `Failed to submit group assignments: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('Fetch error:', error);
      setPopup({
        headline: 'Error',
        message: 'An error occurred while submitting group assignments. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadCSV = () => {
    if (!selectedClass || csvStudents.length === 0) {
      setPopup({
        headline: 'Error',
        message: 'Please select a class and upload student data first',
      });
      return;
    }

    const csvContent = csvStudents
      .map((student) => `${student.group_id},${student.email}`)
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `group_assignments_class_${selectedClass}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const clearData = () => {
    setCsvStudents([]);
    setValidationErrors([]);
    setSubmitSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (userloading) {
    return (
      <div className="flex flex-col min-h-screen bg-northeasternWhite font-rubik">
        <div className="max-w-4xl mx-auto p-4">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen bg-northeasternWhite font-rubik">
        <div className="max-w-4xl mx-auto p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Access Denied</h2>
            <p className="text-gray-600">You must be logged in to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-northeasternWhite font-rubik">
      <div className="w-full p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 w-full">
          {/* Class Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Class to Assign Groups:
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
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

          {/* CSV Upload */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Upload CSV with Student Emails
            </h2>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4 ${
                dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-lg font-medium text-gray-900 mb-2">
                  Drop your CSV file here or{' '}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-500 underline"
                  >
                    browse
                  </button>
                </p>
                <p className="text-sm text-gray-500">CSV must have an "Email" column</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="hidden"
                />
              </div>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">CSV Format:</h3>
              <p className="text-blue-800 text-sm mb-2">
                Must include "Email" column with @northeastern.edu addresses
              </p>
              <div className="text-blue-800 text-xs font-mono bg-white p-2 rounded">
                Email,Name
                <br />
                john.doe@northeastern.edu,John Doe
                <br />
                jane.smith@northeastern.edu,Jane Smith
              </div>
            </div>
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-lg font-semibold text-red-900 mb-3">
                Skipped rows ({validationErrors.length}):
              </h3>
              <p className="text-red-800 text-sm mb-2">
                These rows were not imported and are not included in the submission below.
              </p>
              {validationErrors.map((error, index) => (
                <div key={index} className="text-red-800 text-sm">
                  Row {error.row}: {error.error}
                  {error.value !== undefined && (
                    <span className="font-mono"> — &quot;{error.value}&quot;</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Submit Success Message */}
          {submitSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-semibold">
                ✅ Group assignments submitted successfully!
              </p>
            </div>
          )}

          {/* Group Assignment Interface */}
          {csvStudents.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Assign Groups ({csvStudents.length} students):
              </h3>

              <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Students per group:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={csvStudents.length}
                    value={studentsPerGroup}
                    // Store what was typed, including ''. Coercing here is what
                    // made an emptied box snap back to 4 and turn "3" into "43".
                    onChange={(e) => setStudentsPerGroup(e.target.value)}
                    // Once focus leaves, show the number that will actually be
                    // used, so an empty or out-of-range box never disagrees with
                    // the "N groups for M students" line beside it.
                    onBlur={() => setStudentsPerGroup(String(effectiveStudentsPerGroup))}
                    className="w-24 p-2 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={reapplyAutoAssign}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                >
                  Auto-assign groups
                </button>
                <p className="text-sm text-gray-600">
                  {projectedGroupCount} group{projectedGroupCount !== 1 ? 's' : ''} for{' '}
                  {csvStudents.length} students. Auto-assign overwrites any group numbers you
                  changed by hand below.
                </p>
              </div>

              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                <div className="space-y-2 p-4">
                  {csvStudents.map((student, index) => (
                    <div
                      key={`${student.email}-${index}`}
                      className="flex items-center justify-between bg-gray-50 p-3 rounded"
                    >
                      <span className="text-sm font-medium">{student.email}</span>
                      <div className="flex items-center space-x-2">
                        <label className="text-sm text-gray-600">Group:</label>
                        <input
                          type="number"
                          min="1"
                          value={student.group_id}
                          onChange={(e) => updateStudentGroup(index, parseInt(e.target.value) || 1)}
                          className="w-20 p-2 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {csvStudents.length > 0 && (
            <div className="flex space-x-4">
              <button
                onClick={handleSubmit}
                disabled={!selectedClass || isSubmitting || submitSuccess}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  !selectedClass || isSubmitting || submitSuccess
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </div>
                ) : (
                  'Submit Group Assignments'
                )}
              </button>

              <button
                onClick={downloadCSV}
                disabled={!selectedClass}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  selectedClass
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Download CSV
              </button>

              <button
                onClick={clearData}
                className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600"
              >
                Clear Data
              </button>
            </div>
          )}
        </div>
      </div>
      {popup && (
        <Popup headline={popup.headline} message={popup.message} onDismiss={() => setPopup(null)} />
      )}
    </div>
  );
}
