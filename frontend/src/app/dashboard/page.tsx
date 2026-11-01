'use client';
export const dynamic = 'force-dynamic';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

import { useState, useRef, useEffect, useCallback } from 'react';
import Navbar from '../components/navbar';
import Footer from '../components/footer';
import { usePathname } from 'next/navigation';
import Popup from '../components/popup';
import Slideshow from '../components/slideshow';
import { useProgressManager } from '../components/progress';
import { STEP_LABEL } from '../components/useProgress';
import { useAuth } from '../components/AuthContext';
import { useSocket } from '../components/socketContext';
import { PageLoader } from '../components/spinner';
import { useCatchUp } from '../components/useCatchUp';
import { useJobDescription } from '../components/useJobDescription';

const Dashboard = () => {
  const { updateProgress, fetchProgress } = useProgressManager();
  const socket = useSocket();
  const pathname = usePathname();

  const steps = [
    {
      key: 'job_description',
      label: STEP_LABEL.job_description,
      path: '/jobdes',
      emoji: '📝',
      desc: 'Review your assigned job description.',
    },
    {
      key: 'res_1',
      label: STEP_LABEL.res_1,
      path: '/res-review',
      emoji: '📄',
      desc: 'Individually review candidate resumes.',
    },
    {
      key: 'res_2',
      label: STEP_LABEL.res_2,
      path: '/res-review-group',
      emoji: '👥',
      desc: 'Discuss resumes with your group.',
    },
    {
      key: 'interview',
      label: STEP_LABEL.interview,
      path: '/interview-stage',
      emoji: '🎤',
      desc: 'Interview selected candidates.',
    },
    {
      key: 'offer',
      label: STEP_LABEL.offer,
      path: '/makeOffer',
      emoji: '💼',
      desc: 'Decide which candidate to hire.',
    },
    {
      key: 'employer',
      label: STEP_LABEL.employer,
      path: '/employerPanel',
      emoji: '🚧',
      desc: 'Coming Soon...',
    },
  ];

  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  const [progress, setProgress] = useState<string>('none');
  const [flipped, setFlipped] = useState(Array(steps.length).fill(false));
  const { user, loading: userloading } = useAuth();
  const catchUp = useCatchUp(!!user);
  // The title alone decides which steps unlock; the hook also refetches it
  // when the professor changes the job.
  const { job, refetch: refetchJob } = useJobDescription(user, {
    includeFile: false,
    refetchOnJobUpdated: true,
  });
  const jobDescription = job?.title ?? null;

  const refreshDashboardUI = useCallback(async () => {
    if (!user) return;

    try {
      // Inline the progress fetch
      const progressResponse = await fetch(`${API_BASE_URL}/progress/user/${user.email}`, {
        credentials: 'include',
      });
      if (progressResponse.ok) {
        const progressData = await progressResponse.json();
        const currentProgress = progressData.step || 'none';
        setProgress(currentProgress);
        localStorage.setItem('progress', currentProgress);
      }

      setFlipped(Array(steps.length).fill(false));
    } catch (error) {
      console.error('Error refreshing dashboard UI:', error);
    }
  }, [user?.group_id, user?.class]); // ✅ Only depends on user

  useEffect(() => {
    if (!user) return;

    const loadDashboardData = async () => {
      const currentProgress = await fetchProgress(user);
      setProgress(currentProgress);
      localStorage.setItem('progress', currentProgress);
    };

    loadDashboardData();
  }, [user]); // ✅ Only depends on user

  useEffect(() => {
    if (!socket || !user) return;

    const roomId = `group_${user.group_id}_class_${user.class}`;
    socket.emit('joinGroup', roomId);

    const handleReconnect = async () => {
      socket.emit('joinGroup', roomId);
      // A jobUpdated sent while this socket was down went to a room it was not
      // in. Re-read the job and progress so the dashboard is not left stale.
      await refetchJob();
      const currentProgress = await fetchProgress(user);
      setProgress(currentProgress);
      localStorage.setItem('progress', currentProgress);
    };

    socket.on('connect', handleReconnect);

    return () => {
      socket.off('connect', handleReconnect);
    };
  }, [socket, user]);

  const hasUpdatedPageRef = useRef(false);

  useEffect(() => {
    if (!socket || !user?.email) return;

    // Emit socket events (these are fine to run multiple times)
    socket.emit('studentOnline', { studentId: user.email });
    socket.emit('studentPageChanged', { studentId: user.email, currentPage: pathname });

    // Only update the database once per page visit
    if (hasUpdatedPageRef.current) return;

    const updateCurrentPage = async () => {
      try {
        await fetch(`${API_BASE_URL}/users/update-currentpage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: 'dashboard', user_email: user.email }),
          credentials: 'include',
        });
        hasUpdatedPageRef.current = true; // Mark as updated
      } catch (error) {
        console.error('Error updating current page:', error);
      }
    };

    updateCurrentPage();
  }, [socket, user?.email, pathname]);

  useEffect(() => {
    if (!socket || !user) return;

    const handleJobUpdated = async ({ job, reset }: { job: string; reset?: boolean }) => {
      // Show popup with the job title (job is an array, so use job[0])
      setPopup({
        headline: 'You have been assigned a new job!',
        message: `You are an employer for ${job}!`,
      });

      // Only a reset erases the group's work. A job change with reset: false
      // must keep the student's comments and progress. A missing flag is an
      // older payload, which always meant a reset.
      if (reset !== false) {
        localStorage.removeItem('pdf-comments');
        await updateProgress(user, 'job_description');
        setProgress('job_description');
        localStorage.setItem('progress', 'job_description');
      }

      // Refresh progress; useJobDescription refetches the new job itself.
      await refreshDashboardUI();

      // Reset all flipped cards
      setFlipped(Array(steps.length).fill(false));
    };

    const handleReceivePopup = ({ headline, message }: { headline: string; message: string }) => {
      setPopup({ headline, message });
    };

    socket.on('jobUpdated', handleJobUpdated);
    socket.on('receivePopup', handleReceivePopup);

    return () => {
      socket.off('jobUpdated', handleJobUpdated);
      socket.off('receivePopup', handleReceivePopup);
    };
  }, [socket, user?.email, user?.group_id, user?.class, updateProgress]);

  const isStepUnlocked = (stepKey: string) => {
    // If no job description assigned, block all steps except job_description
    if (!jobDescription && stepKey !== 'job_description') {
      return false;
    }

    // If it's the job_description step but no job assigned, block it
    if (stepKey === 'job_description' && !jobDescription) {
      return false;
    }

    // If progress is "none", only allow job_description step if job is assigned
    if (progress === 'none') {
      return stepKey === 'job_description' && jobDescription;
    }

    const stepIndex = steps.findIndex((step) => step.key === stepKey);
    const progressIndex = steps.findIndex((step) => step.key === progress);

    const unlocked = stepIndex <= progressIndex;
    return unlocked;
  };

  const handleFlip = (idx: number) => {
    if (!isStepUnlocked(steps[idx].key)) return;
    if (steps[idx].key === 'employer') return;
    setFlipped((prev) => {
      const newArr = [...prev];
      newArr[idx] = !newArr[idx];
      return newArr;
    });
  };

  if (userloading) {
    return <PageLoader />;
  }

  if (!user || user.affiliation !== 'student') return null;

  return (
    <div className="bg-sand font-rubik min-h-screen flex flex-col">
      <div className="fixed inset-0 z-0">
        <Slideshow />
      </div>

      <div className="fixed inset-0 bg-sand/80 z-[5]" />
      <Navbar />
      <div className="flex-1 flex flex-col px-4 py-8 relative z-10">
        <div className="font-extrabold text-3xl font-rubik text-northeasternBlack mb-6 text-center">
          <h3>Progress Steps</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
            {steps.map((step, idx) => {
              const unlocked = isStepUnlocked(step.key);
              const isEmployerPanel = step.key === 'employer';
              return (
                <div
                  key={step.key}
                  className={`flip-card w-full aspect-[4/3] min-h-[200px] max-h-[280px] max-w-[500px] mx-auto perspective cursor-pointer ${!unlocked || isEmployerPanel ? 'opacity-60 cursor-not-allowed' : ''}`}
                  onClick={() => handleFlip(idx)}
                  title={
                    isEmployerPanel
                      ? 'Coming Soon'
                      : !jobDescription && step.key !== 'job_description'
                        ? 'You need to be assigned a job description first.'
                        : step.key === 'job_description' && !jobDescription
                          ? 'You have not been assigned a job description yet.'
                          : !unlocked
                            ? 'Complete previous steps to unlock this stage.'
                            : 'Click to flip'
                  }
                  style={{ pointerEvents: unlocked ? 'auto' : 'none' }}
                >
                  <div
                    className={`relative w-full h-full transition-transform duration-500 ${flipped[idx] ? 'rotate-y-180' : ''}`}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    {/* Front Side */}
                    <div
                      className={`absolute w-full h-full ${!unlocked ? 'bg-gray-300' : 'bg-northeasternWhite'} border-2 border-northeasternRed text-white rounded-xl shadow-lg flex flex-col justify-center items-center font-semibold text-lg backface-hidden p-4`}
                    >
                      <span className="mb-2 text-northeasternRed text-center">{step.desc}</span>
                      <span className="text-2xl">{step.emoji}</span>
                      {(!unlocked || isEmployerPanel) && (
                        <span className="text-4xl mt-4" title="Locked">
                          🔒
                        </span>
                      )}
                    </div>
                    {/* Back Side */}
                    <div className="absolute w-full h-full bg-northeasternWhite text-northeasternRed border-2 border-northeasternRed bg-opacity-50 rounded-xl shadow-lg flex flex-col justify-center items-center font-extrabold text-xl rotate-y-180 backface-hidden p-4">
                      <a
                        href={unlocked ? step.path : undefined}
                        className={`mt-2 underline ${unlocked ? 'text-northeasternBlack' : 'text-gray-400 pointer-events-none'}`}
                        style={{ pointerEvents: unlocked ? 'auto' : 'none' }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <div className="mb-2 text-northeasternRed text-center">Go To</div>
                        <div className="mb-2 text-northeasternRed text-center">{step.emoji}</div>
                        <div className="mb-2 text-northeasternRed text-center">{step.label}</div>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="relative z-10">
        <Footer />
      </div>
      {popup && (
        <Popup headline={popup.headline} message={popup.message} onDismiss={() => setPopup(null)} />
      )}
      {catchUp.step && (
        <Popup
          headline="Your group is ahead of you"
          // Offered to anyone behind, not only late arrivals, so it names no
          // step as skipped: someone who already did their review keeps it.
          message={`Your group is on ${STEP_LABEL[catchUp.step]}. Join them there? Any steps before it that you have not done will be skipped.`}
          confirmLabel="Join my group"
          busy={catchUp.joining}
          onDismiss={catchUp.dismiss}
          onConfirm={() =>
            catchUp
              .join()
              .catch((error: Error) =>
                setPopup({ headline: 'Could not join your group', message: error.message })
              )
          }
        />
      )}

      <style jsx>{`
        .flip-card {
          perspective: 1000px;
        }
        .flip-card > div {
          transform-style: preserve-3d;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .flip-card .rotate-y-180 .backface-hidden {
          backface-visibility: hidden;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
