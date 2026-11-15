'use client';
export const dynamic = 'force-dynamic';
import { API_BASE_URL } from '../../lib/api';
import { useState, useEffect } from 'react';
import NavbarAdmin from '../components/navbar-admin';
import Popup from '../components/popup';
import { useAuth } from '../components/AuthContext';

interface Job {
  id: number;
  title: string;
  file_path: string;
  class_id: number;
}

interface Resume {
  id: number;
  title: string;
  file_path: string;
  first_name?: string;
  last_name?: string;
  interview?: string;
  class_id: number;
}

interface ClassInfo {
  crn: number;
  class_name?: string;
  admin_email: string;
}

const Upload = () => {
  const { user, loading: userloading } = useAuth();
  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClass, setSelectedClass] = useState('');

  // Separate states for Job Description
  const [jobTitle, setJobTitle] = useState('');
  const [jobFile, setJobFile] = useState<File | null>(null);
  const [jobUploading, setJobUploading] = useState(false);

  // Separate states for Resume
  const [resTitle, setResTitle] = useState('');
  const [resFirstName, setResFirstName] = useState('');
  const [resLastName, setResLastName] = useState('');
  const [resYouTubeVideo, setResYouTubeVideo] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);

  // Scroll states for jobs and resumes
  const [jobsScrollState, setJobsScrollState] = useState({
    canScrollDown: false,
    canScrollUp: false,
  });
  const [resumesScrollState, setResumesScrollState] = useState({
    canScrollDown: false,
    canScrollUp: false,
  });

  const handleJobsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const canScrollDown =
      element.scrollHeight > element.clientHeight &&
      element.scrollTop < element.scrollHeight - element.clientHeight - 5;
    const canScrollUp = element.scrollTop > 5;
    setJobsScrollState({ canScrollDown, canScrollUp });
  };

  const handleResumesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const canScrollDown =
      element.scrollHeight > element.clientHeight &&
      element.scrollTop < element.scrollHeight - element.clientHeight - 5;
    const canScrollUp = element.scrollTop > 5;
    setResumesScrollState({ canScrollDown, canScrollUp });
  };

  // Check initial scroll states when jobs/resumes update
  useEffect(() => {
    const checkInitialScroll = () => {
      const jobsElement = document.getElementById('jobs-list');
      const resumesElement = document.getElementById('resumes-list');

      if (jobsElement && jobs.length > 0) {
        const canScrollDown = jobsElement.scrollHeight > jobsElement.clientHeight;
        setJobsScrollState({ canScrollDown, canScrollUp: false });
      }

      if (resumesElement && resumes.length > 0) {
        const canScrollDown = resumesElement.scrollHeight > resumesElement.clientHeight;
        setResumesScrollState({ canScrollDown, canScrollUp: false });
      }
    };

    setTimeout(checkInitialScroll, 100);
  }, [jobs, resumes]);

  // Fetch classes when user is loaded
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
          if (classData.length > 0) {
            setSelectedClass(classData[0].crn.toString());
          }
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      }
    };

    fetchClasses();
  }, [user]);

  // Fetch jobs and resumes when selectedClass changes
  useEffect(() => {
    if (selectedClass) {
      fetchJobs();
      fetchResumes();
    }
  }, [selectedClass]);

  const fetchJobs = async () => {
    if (!selectedClass) return;

    try {
      const response = await fetch(`${API_BASE_URL}/jobs?class_id=${selectedClass}`, {
        credentials: 'include',
      });
      const data = await response.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const fetchResumes = async () => {
    if (!selectedClass) return;

    try {
      const response = await fetch(`${API_BASE_URL}/resume_pdf?class_id=${selectedClass}`, {
        credentials: 'include',
      });
      const data = await response.json();
      setResumes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching resumes:', error);
    }
  };

  const deleteResume = async (filePath: string, classId: number) => {
    const fileName = filePath.split('/').pop();
    try {
      const response = await fetch(
        `${API_BASE_URL}/delete/resume/${fileName}?class_id=${classId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error(`Error: ${await response.text()}`);
      }

      setPopup({ headline: 'Success', message: 'Resume deleted successfully.' });
      fetchResumes();
    } catch (error) {
      console.error('Failed to delete file:', error);
      setPopup({ headline: 'Error', message: 'Failed to delete the resume.' });
    }
  };

  const deleteJob = async (filePath: string, classId: number) => {
    const fileName = filePath.split('/').pop();
    try {
      const response = await fetch(`${API_BASE_URL}/delete/job/${fileName}?class_id=${classId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Error: ${await response.text()}`);
      }

      setPopup({ headline: 'Success', message: 'Job description deleted successfully.' });
      fetchJobs();
    } catch (error) {
      console.error('Failed to delete file:', error);
      setPopup({ headline: 'Error', message: 'Failed to delete the job description.' });
    }
  };

  const handleJobFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setJobFile(e.target.files[0]);
    }
  };

  const handleResumeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setResumeFile(e.target.files[0]);
    }
  };

  // Extract YouTube URL from HTML embed code or regular URL
  const extractYouTubeUrl = (input: string): string | null => {
    const cleanInput = input.trim();

    // Pattern 1: Extract from iframe src attribute
    const iframeMatch = cleanInput.match(
      /src=["'](https?:\/\/(?:www\.)?youtube\.com\/embed\/[^"']+)["']/i
    );
    if (iframeMatch) {
      return iframeMatch[1];
    }

    // Pattern 2: Extract video ID from various YouTube URL formats
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = cleanInput.match(pattern);
      if (match && match[1]) {
        return `https://www.youtube.com/watch?v=${match[1]}`;
      }
    }

    // If input is already a valid YouTube URL, return it
    if (/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)/.test(cleanInput)) {
      return cleanInput;
    }

    return null;
  };

  const uploadJobDescription = async () => {
    if (!selectedClass)
      return setPopup({ headline: 'Error', message: 'Please select a class first.' });
    if (!jobFile) return setPopup({ headline: 'Error', message: 'No file selected for upload.' });
    if (!jobTitle.trim())
      return setPopup({ headline: 'Error', message: 'Please enter a job title before uploading.' });

    const formData = new FormData();
    formData.append('jobDescription', jobFile);

    try {
      setJobUploading(true);
      const response = await fetch(`${API_BASE_URL}/upload/job`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Job description upload failed');

      const { filePath } = await response.json();

      await fetch(`${API_BASE_URL}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: jobTitle, filePath, class_id: selectedClass }),
        credentials: 'include',
      });

      fetchJobs();
      setJobTitle('');
      setJobFile(null);

      const jobFileInput = document.querySelector(
        'input[type="file"][accept="application/pdf"]:first-of-type'
      ) as HTMLInputElement;
      if (jobFileInput) {
        jobFileInput.value = '';
      }

      setPopup({ headline: 'Success', message: 'Job description uploaded successfully!' });
    } catch (error) {
      console.error('Job upload error:', error);
      setPopup({ headline: 'Error', message: 'Failed to upload job description' });
    } finally {
      setJobUploading(false);
    }
  };

  const uploadResume = async () => {
    if (!selectedClass)
      return setPopup({ headline: 'Error', message: 'Please select a class first.' });
    if (!resumeFile)
      return setPopup({ headline: 'Error', message: 'No file selected for upload.' });
    if (!resTitle.trim())
      return setPopup({
        headline: 'Error',
        message: 'Please enter a resume title before uploading.',
      });
    if (!resFirstName.trim())
      return setPopup({ headline: 'Error', message: "Please enter the candidate's first name." });
    if (!resLastName.trim())
      return setPopup({ headline: 'Error', message: "Please enter the candidate's last name." });
    if (!resYouTubeVideo.trim())
      return setPopup({
        headline: 'Error',
        message: 'Please paste the YouTube video link or embed code.',
      });

    // Extract the YouTube URL from whatever format the user provided
    const extractedUrl = extractYouTubeUrl(resYouTubeVideo);

    if (!extractedUrl)
      return setPopup({
        headline: 'Error',
        message: 'Please enter a valid YouTube URL or embed code.',
      });

    const formData = new FormData();
    formData.append('resume', resumeFile);

    try {
      setResumeUploading(true);
      const response = await fetch(`${API_BASE_URL}/upload/resume`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Resume upload failed');

      const { filePath } = await response.json();

      const dbResponse = await fetch(`${API_BASE_URL}/resume_pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resTitle,
          filePath,
          f_name: resFirstName,
          l_name: resLastName,
          vid: extractedUrl, // Use the extracted URL
          class_id: selectedClass,
        }),
        credentials: 'include',
      });

      if (!dbResponse.ok) {
        const errorData = await dbResponse.json();
        throw new Error(errorData.error || 'Database error');
      }

      fetchResumes();
      setResTitle('');
      setResFirstName('');
      setResLastName('');
      setResYouTubeVideo('');
      setResumeFile(null);

      const resumeFileInput = document.querySelector(
        'input[type="file"][accept="application/pdf"]:last-of-type'
      ) as HTMLInputElement;
      if (resumeFileInput) {
        resumeFileInput.value = '';
      }

      setPopup({ headline: 'Success', message: 'Resume uploaded successfully!' });
    } catch (error) {
      console.error('Resume upload error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Resume upload failed. Please try again.';
      setPopup({ headline: 'Error', message: errorMessage });
    } finally {
      setResumeUploading(false);
    }
  };

  if (userloading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user || user.affiliation !== 'admin')
    return <div className="text-center mt-10 text-xl text-red-600">Unauthorized</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <NavbarAdmin />
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Class Selector */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <label className="block text-lg font-semibold text-gray-700 mb-3">Select Class:</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy focus:border-navy"
          >
            <option value="">Choose a class...</option>
            {classes.map((cls) => (
              <option key={cls.crn} value={cls.crn}>
                CRN: {cls.crn} - {cls.admin_email}
              </option>
            ))}
          </select>
        </div>

        {!selectedClass ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-gray-500 text-lg">
              Please select a class to upload jobs and resumes
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Job Description Upload Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-navy mb-6">Upload Job Description</h2>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Job Title"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                />
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleJobFile}
                  className="w-full p-3 border border-gray-300 rounded-md"
                />
                <button
                  onClick={uploadJobDescription}
                  disabled={jobUploading}
                  className="w-full bg-navy text-white py-3 rounded-md hover:bg-opacity-90 transition duration-200 disabled:opacity-50"
                >
                  {jobUploading ? 'Uploading...' : 'Upload Job Description'}
                </button>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">
                  Existing Job Descriptions (Class {selectedClass})
                </h3>
                {jobsScrollState.canScrollUp && (
                  <div className="text-center py-2 bg-gray-100 rounded-t-lg text-sm text-gray-600">
                    ▲ Scroll up
                  </div>
                )}
                <div
                  id="jobs-list"
                  onScroll={handleJobsScroll}
                  className="max-h-96 overflow-y-auto border border-gray-300 rounded-lg p-4"
                >
                  {jobs.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No job descriptions uploaded yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {jobs.map((job) => (
                        <li
                          key={job.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <span className="font-medium text-gray-700">{job.title}</span>
                          <div className="flex gap-2">
                            <a
                              href={`${API_BASE_URL}/${job.file_path.replace(/^\//, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-navy text-white rounded hover:bg-opacity-90 transition duration-200"
                            >
                              View PDF
                            </a>
                            <button
                              onClick={() => deleteJob(job.file_path, job.class_id)}
                              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition duration-200"
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {jobsScrollState.canScrollDown && (
                  <div className="text-center py-2 bg-gray-100 rounded-b-lg text-sm text-gray-600">
                    ▼ Scroll down
                  </div>
                )}
              </div>
            </div>

            {/* Resume Upload Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-navy mb-6">Upload Candidate</h2>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Resume Title"
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="First Name"
                    value={resFirstName}
                    onChange={(e) => setResFirstName(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={resLastName}
                    onChange={(e) => setResLastName(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                  />
                </div>
                <input
                  type="text"
                  placeholder="YouTube Video URL or Embed Code"
                  value={resYouTubeVideo}
                  onChange={(e) => setResYouTubeVideo(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                />
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleResumeFile}
                  className="w-full p-3 border border-gray-300 rounded-md"
                />
                <button
                  onClick={uploadResume}
                  disabled={resumeUploading}
                  className="w-full bg-navy text-white py-3 rounded-md hover:bg-opacity-90 transition duration-200 disabled:opacity-50"
                >
                  {resumeUploading ? 'Uploading...' : 'Upload Candidate'}
                </button>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">
                  Existing Candidates (Class {selectedClass})
                </h3>
                {resumesScrollState.canScrollUp && (
                  <div className="text-center py-2 bg-gray-100 rounded-t-lg text-sm text-gray-600">
                    ▲ Scroll up
                  </div>
                )}
                <div
                  id="resumes-list"
                  onScroll={handleResumesScroll}
                  className="max-h-96 overflow-y-auto border border-gray-300 rounded-lg p-4"
                >
                  {resumes.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No Candidates uploaded yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {resumes.map((resume) => (
                        <li key={resume.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="font-medium text-gray-700 mb-2">
                            {resume.first_name} {resume.last_name}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={`${API_BASE_URL}/${resume.file_path.replace(/^\//, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-navy text-white rounded hover:bg-opacity-90 transition duration-200 text-sm"
                            >
                              View PDF
                            </a>
                            {resume.interview && (
                              <a
                                href={resume.interview}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition duration-200 text-sm"
                              >
                                Watch Interview
                              </a>
                            )}
                            <button
                              onClick={() => deleteResume(resume.file_path, resume.class_id)}
                              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition duration-200 ml-auto text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {resumesScrollState.canScrollDown && (
                  <div className="text-center py-2 bg-gray-100 rounded-b-lg text-sm text-gray-600">
                    ▼ Scroll down
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {popup && (
          <Popup
            headline={popup.headline}
            message={popup.message}
            onDismiss={() => setPopup(null)}
          />
        )}
      </div>
    </div>
  );
};

export default Upload;
