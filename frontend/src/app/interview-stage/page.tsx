'use client';
export const dynamic = 'force-dynamic';
import React, { useEffect, useState, useRef } from 'react';
import Navbar from '../components/navbar';
import Instructions from '../components/instructions';
import { useProgress } from '../components/useProgress';
import Footer from '../components/footer';
import { usePathname } from 'next/navigation';
import { useSocket } from '../components/socketContext';
import RatingSlider from '../components/ratingSlider';
import Popup from '../components/popup';
import axios from 'axios';
import { useAuth } from '../components/AuthContext';
import { useJobDescription } from '../components/useJobDescription';
import { useProgressManager } from '../components/progress';
import { useInterviewProgress } from '../components/useInterviewProgress';
import Facts from '../components/facts';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Document, Page, pdfjs } from 'react-pdf';
import { API_BASE_URL } from '../../lib/api';
import { pdfSource } from '../../lib/pdfSource';
import { PageLoader, Spinner } from '../components/spinner';
import { CURVEBALL_COLUMN, NO_SHOW_SCORE, RATING_COLUMN, RATING_LABEL } from '../../lib/ratings';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface CandidateInterview {
  resume_id: number;
  title: string;
  interview: string;
  video_path: string;
  first_name: string;
  last_name: string;
  file_path?: string;
}

interface Resume {
  resume_number: number;
  checked: number;
}

type ViewMode = 'video' | 'resume' | 'jobDescription';

export default function Interview() {
  useProgress();
  const socket = useSocket();
  const { updateProgress } = useProgressManager();
  const { user, loading: userloading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);
  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  const pathname = usePathname();
  const [donePopup, setDonePopup] = useState(false);

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('video');
  const jobDescPath = useJobDescription(user).job?.filePath ?? '';
  const [jobDescNumPages, setJobDescNumPages] = useState<number | null>(null);
  const [jobDescPageNumber, setJobDescPageNumber] = useState(1);
  const [resumeNumPages, setResumeNumPages] = useState<number | null>(null);
  const [resumePageNumber, setResumePageNumber] = useState(1);

  // Video states
  const [finished, setFinished] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [videosLoading, setVideosLoading] = useState(true);

  const [interviews, setInterviews] = useState<
    Array<{
      resume_id: number;
      title: string;
      video_path: string;
      interview: string;
      first_name: string;
      last_name: string;
      file_path?: string;
    }>
  >([]);
  const {
    videoIndex,
    setVideoIndex,
    allRated,
    noShow,
    setNoShow,
    overall,
    setOverall,
    professionalPresence,
    setProfessionalPresence,
    qualityOfAnswer,
    setQualityOfAnswer,
    personality,
    setPersonality,
    resetRatings,
    clearSavedProgress,
  } = useInterviewProgress(user?.id, interviews);

  const interviewInstructions = [
    "Watch each candidate's interview video carefully.",
    'Rate the candidate on Overall, Professional Presence, Quality of Answer, and Personality.',
    'You can toggle between viewing the interview video, resume, and job description.',
    'Discuss with your group and submit your ratings for each candidate.',
  ];

  const hasUpdatedPageRef = useRef(false);

  const [groupSubmissions, setGroupSubmissions] = useState(0);
  const [groupSize, setGroupSize] = useState(0);
  const [groupFinished, setGroupFinished] = useState(false);

  const fetchFinished = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/interview/status/finished-count`, {
        params: { group_id: user?.group_id, class_id: user?.class },
        withCredentials: true,
      });

      const newGroupSubmissions = response.data.finishedCount;
      setGroupSubmissions(newGroupSubmissions);
      setGroupFinished(groupSize > 0 && newGroupSubmissions >= groupSize);
    } catch (err) {
      console.error('Failed to fetch finished count:', err);
    }
  };

  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return url;

    // Check if it's already an embed URL
    if (url.includes('/embed/')) {
      // Add parameters if not already present
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}rel=0&modestbranding=1&showinfo=0&controls=1`;
    }

    return url;
  };

  const fetchGroupSize = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/interview/group-size/${user?.group_id}/${user?.class}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setGroupSize(data.count);
      }
    } catch (err) {
      console.error('Failed to fetch group size:', err);
    }
  };

  // Clear state when finished
  useEffect(() => {
    if (finished) {
      clearSavedProgress();
    }
  }, [finished, clearSavedProgress]);

  useEffect(() => {
    const handleShowInstructions = () => {
      setShowInstructions(true);
    };

    window.addEventListener('showInstructions', handleShowInstructions);

    return () => {
      window.removeEventListener('showInstructions', handleShowInstructions);
    };
  }, []);

  // Reset video loaded state when video changes
  useEffect(() => {
    setVideoLoaded(false);
    setViewMode('video'); // Reset to video view when changing candidates
    setResumePageNumber(1); // Reset resume page
    setJobDescPageNumber(1); // Reset job desc page
  }, [videoIndex]);

  useEffect(() => {
    if (finished) {
      setDonePopup(true);
    }
  }, [finished]);

  useEffect(() => {
    if (!user?.group_id) return;

    const fetchCandidates = async () => {
      setVideosLoading(true);

      try {
        const resumeResponse = await axios.get(
          `${API_BASE_URL}/resume/group/${user.group_id}?class=${user.class}`,
          { withCredentials: true, timeout: 8000 }
        );

        const allResumes: Resume[] = resumeResponse.data;

        const checkedResumes = allResumes
          .filter((resume: Resume) => resume.checked === 1)
          .reduce<Resume[]>((unique, resume) => {
            if (!unique.some((r) => r.resume_number === resume.resume_number)) {
              unique.push(resume);
            }
            return unique;
          }, []);

        if (checkedResumes.length === 0) {
          setInterviews([]);
          setVideosLoading(false);
          return;
        }

        const candidatePromises = checkedResumes.map((resume) =>
          axios
            .get(`${API_BASE_URL}/candidates/resume-with-file/${resume.resume_number}`, {
              timeout: 8000,
              withCredentials: true,
            })
            .then((response) => {
              const candidateData: CandidateInterview = {
                resume_id: response.data.resume_id,
                title: response.data.title || `Candidate ${response.data.resume_id}`,
                interview: response.data.interview,
                video_path: response.data.interview,
                first_name: response.data.f_name,
                last_name: response.data.l_name,
                file_path: response.data.file_path,
              };

              return candidateData;
            })
            .catch((err) => {
              console.error(`Error fetching candidate for resume ${resume.resume_number}:`, err);
              return null;
            })
        );

        const results = await Promise.allSettled(candidatePromises);

        const finalInterviews = results
          .map((result) =>
            result.status === 'fulfilled' && result.value !== null ? result.value : null
          )
          .filter((item): item is CandidateInterview => item !== null)
          .slice(0, 4);

        setInterviews(finalInterviews);
      } catch (err) {
        console.error('Error fetching interviews:', err);
        setError('Failed to load interview data. Please try refreshing the page.');
      } finally {
        setVideosLoading(false);
      }
    };

    fetchCandidates();
  }, [user]);

  const currentVid = interviews[videoIndex];

  useEffect(() => {
    if (!socket || !user) return;

    fetchGroupSize();
    fetchFinished();
  }, [socket, user]);

  useEffect(() => {
    if (!socket || !user || !finished) return;

    socket.emit('interviewStageFinished', {
      group_id: user.group_id,
      class_id: user.class,
      student_id: user.id,
    });
  }, [finished, socket, user]);

  useEffect(() => {
    if (!socket || !user?.email) return;

    const roomId = `group_${user.group_id}_class_${user.class}`;
    socket.emit('joinGroup', roomId);

    socket.emit('studentOnline', { studentId: user.email });
    socket.emit('studentPageChanged', { studentId: user.email, currentPage: pathname });

    const handleMoveGroup = async ({
      groupId,
      classId,
      targetPage,
    }: {
      groupId: number;
      classId: number;
      targetPage: string;
    }) => {
      if (
        user &&
        groupId === user.group_id &&
        classId === user.class &&
        targetPage === '/makeOffer'
      ) {
        // Wait for the write so POST /offers sees the offer step. Navigate
        // even if it failed so the student is not stranded.
        try {
          await updateProgress(user, 'offer');
        } catch (err) {
          console.error('Error updating progress while moving group:', err);
        }
        localStorage.setItem('progress', 'offer');
        window.location.href = targetPage;
      }
    };

    socket.on('moveGroup', handleMoveGroup);

    // Only update the database once per page visit
    if (!hasUpdatedPageRef.current) {
      const updateCurrentPage = async () => {
        try {
          await axios.post(
            `${API_BASE_URL}/users/update-currentpage`,
            {
              page: 'interviewpage',
              user_email: user.email,
            },
            { withCredentials: true }
          );
          hasUpdatedPageRef.current = true;
        } catch (error) {
          console.error('Error updating current page:', error);
        }
      };

      updateCurrentPage();
    }

    return () => {
      socket.off('moveGroup', handleMoveGroup);
    };
  }, [socket, user?.email, pathname, updateProgress]);

  useEffect(() => {
    if (!socket) return;

    const handleReceivePopup = ({ headline, message }: { headline: string; message: string }) => {
      setPopup({ headline, message });
    };

    const handleInterviewStatusUpdated = ({ count, total }: { count: number; total: number }) => {
      setGroupSubmissions(count);
      setGroupSize(total);
      // >= rather than ===: a member who leaves mid-step drops the total under
      // a count that already included them, and === then never matches.
      setGroupFinished(total > 0 && count >= total);
    };

    const handleInterviewStageFinished = () => {
      fetchFinished();
      fetchGroupSize();
    };

    const handleStudentRemoved = ({ groupId, classId }: { groupId: number; classId: number }) => {
      if (user && groupId === user.group_id && classId == user.class) {
        fetchGroupSize();
        fetchFinished();
      }
    };

    const handleStudentAdded = ({ groupId, classId }: { groupId: number; classId: number }) => {
      if (user && groupId === user.group_id && classId == user.class) {
        fetchGroupSize();
        fetchFinished();
      }
    };

    socket.on('receivePopup', handleReceivePopup);
    socket.on('studentAddedToGroup', handleStudentAdded);
    socket.on('interviewStatusUpdated', handleInterviewStatusUpdated);
    socket.on('interviewStageFinished', handleInterviewStageFinished);
    socket.on('studentRemovedFromGroup', handleStudentRemoved);

    return () => {
      socket.off('receivePopup', handleReceivePopup);
      socket.off('studentAddedToGroup', handleStudentAdded);
      socket.off('interviewStatusUpdated', handleInterviewStatusUpdated);
      socket.off('interviewStageFinished', handleInterviewStageFinished);
      socket.off('studentRemovedFromGroup', handleStudentRemoved);
    };
  }, [socket, user]);

  // Reset group finished state when group size changes
  useEffect(() => {
    if (groupSize > 0) {
      // If group size increased and we were finished, reset
      if (groupFinished && groupSubmissions < groupSize) {
        setGroupFinished(false);
      }
    }
  }, [groupSize]);

  // Auto-complete if group size changes and all remaining members are done
  useEffect(() => {
    if (finished && groupSize > 0 && groupSubmissions >= groupSize) {
      setGroupFinished(true);
    }
  }, [groupSize, groupSubmissions, finished]);

  useEffect(() => {
    if (!socket || !user || !currentVid) return;

    const handleUpdateRatingsWithPreset = ({
      classId,
      groupId,
      vote,
      isNoShow,
      candidateId,
    }: {
      classId: number;
      groupId: number;
      vote: {
        professionalPresence?: number;
        qualityOfAnswer?: number;
        personality?: number;
        overall?: number;
      };
      isNoShow: boolean;
      candidateId: number;
    }) => {
      const voteData = {
        student_id: user.id,
        group_id: groupId,
        class: classId,
        [CURVEBALL_COLUMN.overall]: isNoShow ? NO_SHOW_SCORE : vote.overall || 0,
        [CURVEBALL_COLUMN.professionalPresence]: isNoShow
          ? NO_SHOW_SCORE
          : vote.professionalPresence || 0,
        [CURVEBALL_COLUMN.qualityOfAnswer]: isNoShow ? NO_SHOW_SCORE : vote.qualityOfAnswer || 0,
        [CURVEBALL_COLUMN.personality]: isNoShow ? NO_SHOW_SCORE : vote.personality || 0,
        candidate_id: candidateId,
      };

      socket.emit('sentPresetVotes', voteData);
    };

    socket.on('updateRatingsWithPresetFrontend', handleUpdateRatingsWithPreset);

    return () => {
      socket.off('updateRatingsWithPresetFrontend', handleUpdateRatingsWithPreset);
    };
  }, [socket, user, currentVid]);

  const completeInterview = async () => {
    if (!socket || !user) return;

    // Votes are already submitted when the last interview was submitted
    // Just update progress and navigate
    await updateProgress(user, 'offer');
    localStorage.setItem('progress', 'offer');
    clearSavedProgress();
    window.location.href = '/makeOffer';
    socket.emit('moveGroup', {
      groupId: user.group_id,
      classId: user.class,
      targetPage: '/makeOffer',
    });
  };

  // Rating change handlers
  const handleOverallSliderChange = (value: number) => {
    setOverall(value);
  };

  const handleProfessionalPresenceSliderChange = (value: number) => {
    setProfessionalPresence(value);
  };

  const handleQualityOfAnswerSliderChange = (value: number) => {
    setQualityOfAnswer(value);
  };

  const handlePersonalitySliderChange = (value: number) => {
    setPersonality(value);
  };

  const handleSubmit = async () => {
    if (!currentVid) {
      console.error('No current video selected');
      return;
    }

    if (!videoLoaded) {
      console.warn('Video not fully loaded yet, cannot submit');
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    const voteData = noShow
      ? {
          question1: 1,
          question2: 1,
          question3: 1,
          question4: 1,
          candidate_id: currentVid.resume_id,
        }
      : {
          [RATING_COLUMN.overall]: overall,
          [RATING_COLUMN.professionalPresence]: professionalPresence,
          [RATING_COLUMN.qualityOfAnswer]: qualityOfAnswer,
          [RATING_COLUMN.personality]: personality,
          candidate_id: currentVid.resume_id,
        };

    try {
      const res = await fetch(`${API_BASE_URL}/interview/batch-vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ votes: [voteData] }),
      });
      if (!res.ok) throw new Error(`Saving the rating failed with ${res.status}`);
    } catch (err) {
      console.error('Error saving interview vote:', err);
      setPopup({
        headline: 'Error Saving Ratings',
        message: 'Failed to save your interview ratings. Please try again.',
      });
      setSubmitting(false);
      return;
    }

    const nextVideoIndex = videoIndex + 1;
    const isLastInterview = nextVideoIndex >= interviews.length;

    if (!isLastInterview) {
      setVideoIndex(nextVideoIndex);
      setVideoLoaded(false);
      resetRatings();
      setNoShow(false);
    } else {
      await markFinished();
    }

    setSubmitting(false);
  };

  const markFinished = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/interview/status/finished`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finished: 1 }),
      });
      if (!res.ok) throw new Error(`Marking interviews finished failed with ${res.status}`);

      setFinished(true);
    } catch (err) {
      console.error('Error marking interviews finished:', err);
      setPopup({
        headline: 'Error Saving Ratings',
        message:
          'Your ratings are saved, but marking you finished failed. Refresh the page to try again.',
      });
    }
  };

  // Every candidate is already rated, e.g. after a refresh once finished.
  useEffect(() => {
    if (allRated && !finished) markFinished();
  }, [allRated, finished]);

  // Loading state
  if (userloading) {
    return <PageLoader />;
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sand">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p>{error}</p>
          <p className="mt-2">Please try refreshing the page or return to the dashboard.</p>
          <button
            onClick={() => (window.location.href = '/dashboard')}
            className="mt-4 bg-redHeader text-white px-4 py-2 rounded hover:bg-navy transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // No user state
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sand">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded max-w-md">
          <h2 className="text-xl font-bold mb-2">Authentication Required</h2>
          <p>Please log in to access this page.</p>
          <button
            onClick={() => (window.location.href = '/')}
            className="mt-4 bg-redHeader text-white px-4 py-2 rounded hover:bg-navy transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (videosLoading) {
    return (
      <div className="bg-sand font-rubik min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white p-8 rounded-lg shadow-lg">
            <h1 className="text-2xl font-bold text-center mb-6">Interview Stage</h1>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 border-t-4 border-redHeader border-solid rounded-full animate-spin mb-6"></div>
              <p className="text-lg font-semibold text-navy mb-2">Loading Interview Videos...</p>
              <p className="text-sm text-gray-600">
                Please wait while we fetch the candidate interviews
              </p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // No interviews state
  if (interviews.length === 0) {
    return (
      <div className="bg-sand font-rubik min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white p-8 rounded-lg shadow-lg">
            <h1 className="text-2xl font-bold text-center mb-6">Interview Stage</h1>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
              <p className="font-medium">No interviews are currently available.</p>
              <p>You need to select candidates in the Resume Review Group stage first.</p>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => (window.location.href = '/res-review-group')}
                className="px-4 py-2 bg-redHeader text-white rounded-lg shadow-md hover:bg-navy transition duration-300 font-rubik"
              >
                ← Go to Resume Review Group
              </button>
              <button
                onClick={() => (window.location.href = '/dashboard')}
                className="px-4 py-2 bg-redHeader text-white rounded-lg shadow-md hover:bg-navy transition duration-300 font-rubik"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-sand font-rubik overflow-hidden">
      {showInstructions && (
        <Instructions
          instructions={interviewInstructions}
          onDismiss={() => setShowInstructions(false)}
          title="Interview Instructions"
          progress={3}
        />
      )}
      <Navbar />

      <div className="flex justify-center items-center font-rubik text-redHeader text-xl font-bold py-1">
        Interview Page
      </div>

      <div className="flex-1 flex overflow-hidden px-4 pb-2 gap-4">
        {/* Evaluation panel - no scroll needed */}
        <div
          key={videoIndex}
          className="w-1/3 bg-blue-50 shadow-lg p-3 flex flex-col rounded-lg overflow-hidden"
        >
          <h1 className="text-lg text-redHeader font-bold mb-1">Evaluation</h1>
          <h3 className="text-xs text-navy text-center mb-2">
            Watch the interview and rate on a scale from 1-10. Submit to move to the next interview.
          </h3>

          {/* View toggle buttons */}
          <div className="flex flex-col gap-1 w-full mb-2">
            <button
              className={`px-2 py-1 rounded-lg shadow-md transition duration-300 font-rubik text-xs ${
                viewMode === 'video'
                  ? 'bg-redHeader text-white'
                  : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
              }`}
              onClick={() => {
                setViewMode('video');
                setResumePageNumber(1);
              }}
            >
              Interview Video
            </button>
            <button
              className={`px-2 py-1 rounded-lg shadow-md transition duration-300 font-rubik text-xs ${
                viewMode === 'resume'
                  ? 'bg-redHeader text-white'
                  : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
              }`}
              onClick={() => {
                setViewMode('resume');
                setResumePageNumber(1);
              }}
            >
              Resume
            </button>
            <button
              className={`px-2 py-1 rounded-lg shadow-md transition duration-300 font-rubik text-xs ${
                viewMode === 'jobDescription'
                  ? 'bg-redHeader text-white'
                  : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
              }`}
              onClick={() => {
                setViewMode('jobDescription');
                setJobDescPageNumber(1);
              }}
            >
              Job Description
            </button>
          </div>

          {/* Page navigation for resume */}
          {viewMode === 'resume' && resumeNumPages && resumeNumPages > 1 && (
            <div className="flex items-center justify-between bg-navy p-1 rounded-lg w-full mb-2">
              <button
                className="px-2 py-0.5 bg-sand text-navy rounded disabled:opacity-50 text-xs"
                onClick={() => setResumePageNumber((prev) => Math.max(1, prev - 1))}
                disabled={resumePageNumber <= 1}
              >
                ←
              </button>
              <span className="text-sand text-xs">
                {resumePageNumber}/{resumeNumPages}
              </span>
              <button
                className="px-2 py-0.5 bg-sand text-navy rounded disabled:opacity-50 text-xs"
                onClick={() => setResumePageNumber((prev) => Math.min(resumeNumPages, prev + 1))}
                disabled={resumePageNumber >= resumeNumPages}
              >
                →
              </button>
            </div>
          )}

          {/* Page navigation for job description */}
          {viewMode === 'jobDescription' && jobDescNumPages && jobDescNumPages > 1 && (
            <div className="flex items-center justify-between bg-navy p-1 rounded-lg w-full mb-2">
              <button
                className="px-2 py-0.5 bg-sand text-navy rounded disabled:opacity-50 text-xs"
                onClick={() => setJobDescPageNumber((prev) => Math.max(1, prev - 1))}
                disabled={jobDescPageNumber <= 1}
              >
                ←
              </button>
              <span className="text-sand text-xs">
                {jobDescPageNumber}/{jobDescNumPages}
              </span>
              <button
                className="px-2 py-0.5 bg-sand text-navy rounded disabled:opacity-50 text-xs"
                onClick={() => setJobDescPageNumber((prev) => Math.min(jobDescNumPages, prev + 1))}
                disabled={jobDescPageNumber >= jobDescNumPages}
              >
                →
              </button>
            </div>
          )}

          {/* Rating sliders - compact */}
          <div className="flex-1 flex flex-col justify-around">
            <div className="flex flex-col items-center text-center w-full">
              <h2 className="text-xs text-redHeader font-semibold mb-0.5">
                {RATING_LABEL.overall}
              </h2>
              <RatingSlider onChange={handleOverallSliderChange} value={overall} />
            </div>

            <div className="flex flex-col items-center text-center w-full">
              <h2 className="text-xs text-redHeader font-semibold mb-0.5">
                {RATING_LABEL.professionalPresence}
              </h2>
              <RatingSlider
                onChange={handleProfessionalPresenceSliderChange}
                value={professionalPresence}
              />
            </div>

            <div className="flex flex-col items-center text-center w-full">
              <h2 className="text-xs text-redHeader font-semibold mb-0.5">
                {RATING_LABEL.qualityOfAnswer}
              </h2>
              <RatingSlider onChange={handleQualityOfAnswerSliderChange} value={qualityOfAnswer} />
            </div>

            <div className="flex flex-col items-center text-center w-full">
              <h2 className="text-xs text-redHeader font-semibold mb-0.5">
                {RATING_LABEL.personality}
              </h2>
              <RatingSlider onChange={handlePersonalitySliderChange} value={personality} />
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={finished || !videoLoaded || submitting}
            className={`px-3 py-2 rounded-lg shadow-md transition duration-300 font-rubik text-xs mt-2 ${
              finished || !videoLoaded || submitting
                ? 'bg-gray-400 text-white opacity-50 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-900'
            }`}
          >
            {!videoLoaded ? 'Loading...' : 'Submit Response'}
          </button>

          {/* Video progress indicator */}
          <div className="mt-1 text-xs text-gray-700 text-center">
            {interviews.length > 0
              ? `Video ${Math.min(videoIndex + 1, interviews.length)} of ${interviews.length}`
              : 'Loading...'}
          </div>
        </div>

        {/* Content display - video, resume, or job description */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <h1 className="text-lg font-rubik font-bold mb-2 text-center">
            {noShow
              ? 'Candidate No-Show'
              : currentVid && currentVid.first_name && currentVid.last_name
                ? `Evaluating ${currentVid.first_name} ${currentVid.last_name}`
                : 'Evaluation'}
          </h1>
          <div className="flex-1 border-4 border-redHeader rounded-lg shadow-lg overflow-hidden bg-white">
            {viewMode === 'video' &&
              (noShow ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xl font-bold">This candidate did not show up.</p>
                </div>
              ) : currentVid && currentVid.interview ? (
                <iframe
                  key={`video-${videoIndex}`}
                  className="w-full h-full"
                  src={getYouTubeEmbedUrl(currentVid.interview)}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  onLoad={() => {
                    setTimeout(() => {
                      setVideoLoaded(true);
                    }, 500);
                  }}
                ></iframe>
              ) : (
                <div className="flex items-center justify-center h-full bg-gray-100">
                  <p className="text-gray-500">Loading Interview Video...</p>
                </div>
              ))}

            {viewMode === 'resume' && (
              <div className="h-full w-full overflow-auto flex justify-center items-start bg-gray-100">
                {currentVid?.file_path ? (
                  <Document
                    file={pdfSource(`${API_BASE_URL}/${currentVid.file_path}`)}
                    onLoadError={(error) => {
                      console.error('Resume PDF load error:', error);
                    }}
                    onLoadSuccess={({ numPages }) => {
                      setResumeNumPages(numPages);
                    }}
                    loading={
                      <div className="flex justify-center items-center h-96">
                        <div className="text-lg text-gray-600">Loading resume...</div>
                      </div>
                    }
                  >
                    <Page
                      pageNumber={resumePageNumber}
                      scale={1.2}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                    />
                  </Document>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-gray-500 mb-2">Resume not available</p>
                  </div>
                )}
              </div>
            )}

            {viewMode === 'jobDescription' && (
              <div className="h-full w-full overflow-auto flex justify-center items-start bg-gray-100">
                {jobDescPath ? (
                  <Document
                    file={pdfSource(`${API_BASE_URL}/${jobDescPath}`)}
                    onLoadError={console.error}
                    onLoadSuccess={({ numPages }) => {
                      setJobDescNumPages(numPages);
                    }}
                    loading={
                      <div className="flex justify-center items-center h-96">
                        <div className="text-lg text-gray-600">Loading job description...</div>
                      </div>
                    }
                  >
                    <Page
                      pageNumber={jobDescPageNumber}
                      scale={1.2}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                    />
                  </Document>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Job description not available</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation footer - compact */}
      <div className="flex justify-between px-4 py-1">
        <button
          onClick={() => (window.location.href = '/res-review-group')}
          className="px-3 py-1.5 bg-redHeader text-white rounded-lg shadow-md cursor-not-allowed opacity-50 transition duration-300 font-rubik text-xs"
          disabled={true}
        >
          ← Back: Resume Review Pt.2
        </button>
        <button
          onClick={completeInterview}
          className={`px-3 py-1.5 bg-redHeader text-white rounded-lg shadow-md transition duration-300 font-rubik text-xs
            ${
              !finished || !groupFinished
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:bg-navy'
            }`}
          disabled={!finished || !groupFinished}
        >
          {!finished
            ? 'Next: Make Offer →'
            : !groupFinished
              ? `Next: Make Offer (${groupSubmissions}/${groupSize})`
              : 'Next: Make Offer →'}
        </button>
      </div>

      <Footer />

      {/* Popup component */}
      {popup && (
        <Popup headline={popup.headline} message={popup.message} onDismiss={() => setPopup(null)} />
      )}
      {donePopup && (
        <Popup
          headline="Interview Complete"
          message="You have completed all interviews and ratings."
          onDismiss={() => setDonePopup(false)}
        />
      )}

      {finished && !groupFinished && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white border-4 border-navy rounded-lg shadow-lg p-8 text-center max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-navy mb-4">Waiting for Teammates</h2>
            <p className="text-lg text-gray-700 mb-4">
              You have completed your interviews and ratings.
              <br />
              Waiting for other group members to finish...
            </p>
            <Spinner className="mb-4" />
            <Facts />
          </div>
        </div>
      )}
    </div>
  );
}
