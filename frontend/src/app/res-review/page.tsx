'use client';
export const dynamic = 'force-dynamic';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useProgress } from '../components/useProgress';
import Navbar from '../components/navbar';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Document, Page, pdfjs } from 'react-pdf';
import { pdfSource } from '../../lib/pdfSource';
import { dropOtherUsersKeys, userScope } from '../../lib/userStorage';
import Footer from '../components/footer';
import Popup from '../components/popup';
import { usePathname } from 'next/navigation';
import Instructions from '../components/instructions';
import { useProgressManager } from '../components/progress';
import { useSocket } from '../components/socketContext';
import Facts from '../components/facts';
import { useAuth } from '../components/AuthContext';
import { useJobDescription } from '../components/useJobDescription';
import { PageLoader, Spinner } from '../components/spinner';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

type VoteRecord = {
  student_id: string;
  group_id: number;
  class: number;
  timespent: number;
  resume_number: number;
  vote: 'yes' | 'no' | 'unanswered';
};

// One Resume row as /resume/student/:id returns it, trimmed to the fields the
// page needs to decide whether a decision counts for this group and section.
type SavedDecision = {
  group_id: number;
  class: number;
  resume_number: number;
  vote: 'yes' | 'no' | 'unanswered';
};

// Every localStorage key is scoped by user id. The old keys were shared
// constants, so a second student on the same lab machine inherited the
// previous student's 10/10 counters (and was announced finished with zero
// rows saved), and their Retry button replayed the previous student's queued
// votes under that student's student_id. Nothing is read or written until
// `user` is loaded, and keys that belong to anyone else are dropped on load.
const STORAGE_PREFIX = 'resumeReview';

const storageKeys = (userId: string) => {
  const scope = userScope(STORAGE_PREFIX, userId);
  return {
    index: `${scope}index`,
    accepted: `${scope}accepted`,
    rejected: `${scope}rejected`,
    noResponse: `${scope}noResponse`,
    // Decisions whose POST failed, parked beside the counters so a refresh
    // does not silently drop them. Without this a student can finish all ten
    // on screen while the database holds nine rows, and the group barrier,
    // which counts rows, not clicks, never opens for anyone in the group.
    unsaved: `${scope}unsaved`,
  };
};

const clearSavedProgress = (userId: string) => {
  const keys = storageKeys(userId);
  [keys.index, keys.accepted, keys.rejected, keys.noResponse].forEach((key) =>
    localStorage.removeItem(key)
  );
};

export default function ResumesPage() {
  useProgress();
  const socket = useSocket();
  const { updateProgress } = useProgressManager();
  const [resumes, setResumes] = useState(0);
  const [resumesList, setResumesList] = useState<
    {
      id: number;
      file_path: string;
      first_name: string;
      last_name: string;
      title: string;
      interview: string;
    }[]
  >([]);
  const { user, loading: userloading } = useAuth();
  const [accepted, setAccepted] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [noResponse, setNoResponse] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [currentResumeIndex, setCurrentResumeIndex] = useState(0);
  const [fadingEffect, setFadingEffect] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);
  const [groupSize, setGroupSize] = useState(0);
  const [groupSubmissions, setGroupSubmissions] = useState(0);
  const [disabled, setDisabled] = useState(true);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [popup, setPopup] = useState<{
    headline: string;
    message: string;
  } | null>(null);
  const pathname = usePathname();
  const [restricted, setRestricted] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [showJobDescription, setShowJobDescription] = useState(false);
  const jobDescPath = useJobDescription(user).job?.filePath ?? '';
  const [jobDescNumPages, setJobDescNumPages] = useState<number | null>(null);
  const [jobDescPageNumber, setJobDescPageNumber] = useState(1);
  const [unsavedVotes, setUnsavedVotes] = useState<VoteRecord[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [donePopup, setDonePopup] = useState(false);
  // POSTs that have been sent but not yet settled. The counters below are
  // bumped on the click, before the POST resolves, so without this the tenth
  // click would announce completion while the tenth row is still in flight
  // and a flaky wifi could leave the server barrier open on nine rows.
  const [pendingCount, setPendingCount] = useState(0);
  // The user id whose saved progress has been read from localStorage. Null
  // until then, which stops the persist effects from writing a fresh 0/10
  // over the saved values, or writing under nobody's key before login.
  const [storageUserId, setStorageUserId] = useState<string | null>(null);
  // Bumped to re-run the completion check when the server could not be
  // reached, so a student is never stuck unannounced after one failed GET.
  const [verifyAttempt, setVerifyAttempt] = useState(0);
  const totalDecisions = accepted + rejected + noResponse;
  const maxDecisions = totalDecisions >= 10;
  const resumeRef = useRef<HTMLDivElement | null>(null);
  const hasUpdatedPageRef = useRef(false);
  const hadSavedProgressRef = useRef(false);
  const serverRestoreDoneRef = useRef(false);
  const announcedFinishRef = useRef(false);

  const resumeInstructions = [
    'Review the resume and decide whether to accept, reject, or mark as no-response.',
    'You may accept as many as you like out of the 10.',
    'You have to wait for the rest of your group to finish before moving on.',
    "The decisions you make here will not affect the candidate's overall application.",
    'They will just be another factor your group considers when making a final decision.',
  ];

  const fetchResumes = useCallback(async (userClass: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/resume_pdf?class_id=${userClass}`, {
        credentials: 'include',
      });

      const data = await response.json();

      const missingPaths = data.filter((r: any) => !r.file_path);
      if (missingPaths.length > 0) {
        console.warn(`⚠️ [FETCH] ${missingPaths.length} resumes are missing file_path!`);
      }

      setResumesList(data);
    } catch (error) {
      console.error('❌ [FETCH] Error fetching resumes:', error);
    }
  }, []);

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
      console.error('❌ [FETCH-GROUP-SIZE] Failed to fetch group size:', err);
    }
  };

  const fetchFinished = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/resume/finished-count/${user?.group_id}/${user?.class}`,
        {
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        setGroupSubmissions(data.finishedCount);
      }
    } catch (err) {
      console.error('❌ [FETCH-FINISHED] Failed to fetch finished count:', err);
    }
  };

  // The saved counters used to be wiped the moment the tenth decision landed,
  // while the student was still sitting on this page waiting for teammates. A
  // refresh at that point dropped them back to resume 1 with 0/10 and no way to
  // reach the ten decisions the Next button requires. They are cleared when the
  // student actually leaves the page instead.
  //
  // This waits for `user` rather than running on mount: the keys are scoped
  // by user id, so there is nothing to read until we know who is logged in.
  useEffect(() => {
    if (!user?.id) return;
    const userId = String(user.id);
    const keys = storageKeys(userId);

    // Another student's counters must never seed this one. Before this, a
    // shared lab browser carried the previous student's 10/10 across logins.
    dropOtherUsersKeys(STORAGE_PREFIX, userId);

    const savedIndex = localStorage.getItem(keys.index);
    const savedAccepted = localStorage.getItem(keys.accepted);
    const savedRejected = localStorage.getItem(keys.rejected);
    const savedNoResponse = localStorage.getItem(keys.noResponse);
    // Always assign, so a user switch without a reload cannot keep the
    // previous user's in-memory counters.
    setCurrentResumeIndex(savedIndex !== null ? Number(savedIndex) : 0);
    setAccepted(savedAccepted !== null ? Number(savedAccepted) : 0);
    setRejected(savedRejected !== null ? Number(savedRejected) : 0);
    setNoResponse(savedNoResponse !== null ? Number(savedNoResponse) : 0);

    let restoredQueue: VoteRecord[] = [];
    const savedUnsaved = localStorage.getItem(keys.unsaved);
    if (savedUnsaved !== null) {
      try {
        const parsed = JSON.parse(savedUnsaved) as VoteRecord[];
        // The key is already per-user, but the record also carries the
        // student_id the server writes under (it trusts req.body). Drop
        // anything not stamped with this student in this group and section,
        // so a replay can never write a row under someone else's id or into
        // a group this student has since been moved out of.
        restoredQueue = parsed.filter(
          (record) =>
            record.student_id === userId &&
            record.group_id === user.group_id &&
            record.class === user.class
        );
      } catch (error) {
        console.error('❌ [RESTORE] Unreadable unsaved votes, discarding:', error);
        localStorage.removeItem(keys.unsaved);
      }
    }
    setUnsavedVotes(restoredQueue);

    // Recorded before the persist effects below write their first values, so
    // the server reconcile can tell "no saved progress" from "saved progress of
    // zero decisions".
    hadSavedProgressRef.current = savedIndex !== null;

    // Set last, in the same batch as the restored values: the persist effects
    // below key off it, so their first write is of the restored state, never
    // of the initial zeros.
    setStorageUserId(userId);
  }, [user?.id]);

  useEffect(() => {
    if (!storageUserId) return;
    const key = storageKeys(storageUserId).unsaved;
    if (unsavedVotes.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(unsavedVotes));
  }, [storageUserId, unsavedVotes]);

  useEffect(() => {
    if (!storageUserId) return;
    localStorage.setItem(storageKeys(storageUserId).index, String(currentResumeIndex));
  }, [storageUserId, currentResumeIndex]);

  useEffect(() => {
    if (!storageUserId) return;
    localStorage.setItem(storageKeys(storageUserId).accepted, String(accepted));
  }, [storageUserId, accepted]);

  useEffect(() => {
    if (!storageUserId) return;
    localStorage.setItem(storageKeys(storageUserId).rejected, String(rejected));
  }, [storageUserId, rejected]);

  useEffect(() => {
    if (!storageUserId) return;
    localStorage.setItem(storageKeys(storageUserId).noResponse, String(noResponse));
  }, [storageUserId, noResponse]);

  useEffect(() => {
    const handleShowInstructions = () => {
      setShowInstructions(true);
    };

    window.addEventListener('showInstructions', handleShowInstructions);

    return () => {
      window.removeEventListener('showInstructions', handleShowInstructions);
    };
  }, []);

  useEffect(() => {
    if (!socket || !user || !user.email) return;

    const roomId = `group_${user.group_id}_class_${user.class}`;

    // A socket that drops and reconnects gets a new id and is in no rooms, so
    // the barrier release and every group event would go past this student
    // for the rest of the class. Joining on 'connect' rather than once on
    // mount is what makes a wifi blip recoverable; the server re-evaluates the
    // barrier on every join, so a release missed while offline is re-sent.
    const announce = () => {
      socket.emit('studentOnline', { studentId: user.email });
      socket.emit('joinGroup', roomId);
      socket.emit('studentPageChanged', {
        studentId: user.email,
        currentPage: pathname,
      });
    };

    if (socket.connected) announce();
    socket.on('connect', announce);

    if (!hasUpdatedPageRef.current) {
      const updateCurrentPage = async () => {
        try {
          await fetch(`${API_BASE_URL}/users/update-currentpage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              page: 'resumepage',
              user_email: user.email,
            }),
            credentials: 'include',
          });
          hasUpdatedPageRef.current = true;
        } catch (error) {
          console.error('Error updating current page:', error);
        }
      };

      updateCurrentPage();
    }

    return () => {
      socket.off('connect', announce);
    };
  }, [socket, user?.email, pathname]);

  useEffect(() => {
    if (!socket || !user) return;

    const roomId = `group_${user.group_id}_class_${user.class}`;
    socket.emit('joinGroup', roomId);
    socket.emit('studentOnline', { studentId: user.email });
    socket.emit('studentPageChanged', { studentId: user.email, currentPage: pathname });

    const handleReceivePopup = ({ headline, message }: { headline: string; message: string }) => {
      setPopup({ headline, message });
    };

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
        groupId === user.group_id &&
        classId === user.class &&
        targetPage === '/res-review-group'
      ) {
        // Wait for the write so the next page's POST is one step ahead, not
        // a skip. Navigate even if it failed so the student is not stranded.
        try {
          await updateProgress(user, 'res_2');
        } catch (err) {
          console.error('[handleMoveGroup] Error updating progress:', err);
        }
        localStorage.setItem('progress', 'res_2');
        // The saved counters used to be dropped when the tenth decision landed.
        // Now that they survive until the student leaves, this path has to
        // clear them too or a return visit restores a finished review.
        clearSavedProgress(String(user.id));
        window.location.href = targetPage;
      }
    };

    const handleUserCompletedResReview = ({ groupId }: { groupId: number }) => {
      if (groupId === user.group_id) {
        fetchFinished();
      }
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

    socket.on('userCompletedResReview', handleUserCompletedResReview);
    socket.on('receivePopup', handleReceivePopup);
    socket.on('moveGroup', handleMoveGroup);
    socket.on('studentRemovedFromGroup', handleStudentRemoved);
    socket.on('studentAddedToGroup', handleStudentAdded);

    return () => {
      socket.off('receivePopup', handleReceivePopup);
      socket.off('userCompletedResReview', handleUserCompletedResReview);
      socket.off('moveGroup', handleMoveGroup);
      socket.off('studentRemovedFromGroup', handleStudentRemoved);
      socket.off('studentAddedToGroup', handleStudentAdded);
    };
  }, [socket, user]);

  useEffect(() => {
    if (!socket) return;

    const handleGroupCompletedResReview = () => {
      setDisabled(false);
    };

    socket.on('groupCompletedResReview', handleGroupCompletedResReview);

    return () => {
      socket.off('groupCompletedResReview', handleGroupCompletedResReview);
    };
  }, [socket]);

  useEffect(() => {
    if (totalDecisions === 10 && groupSize > 0 && groupSubmissions >= groupSize) {
      setDisabled(false);
    }
  }, [groupSize, groupSubmissions, totalDecisions]);

  useEffect(() => {
    if (!user?.group_id) return;

    fetchGroupSize();
    fetchFinished();
  }, [user?.group_id]);

  const userId = user?.id;
  const userGroupId = user?.group_id;
  const userClass = user?.class;

  // The rows the server actually holds for this student, scoped by group_id
  // AND class (a row from another section, or from a group this student was
  // moved out of, must not count towards the ten) and limited to resumes this
  // class still shows (or the total can exceed 10 and the Next button, which
  // tests for exactly 10, never unlocks). Returns null when the server could
  // not be reached, which callers must treat as "unknown", not "zero".
  //
  // This is the page's one definition of "saved". Both the mount restore and
  // the completion announce read it, so they cannot disagree about whether a
  // student is finished.
  const fetchSavedDecisions = useCallback(async (): Promise<SavedDecision[] | null> => {
    if (!userId || !userGroupId || !userClass) return null;
    try {
      const response = await fetch(`${API_BASE_URL}/resume/student/${userId}`, {
        credentials: 'include',
      });
      if (!response.ok) return null;

      const rows = (await response.json()) as SavedDecision[];
      const shown = new Set(resumesList.map((resume) => resume.id));
      return rows.filter(
        (row) =>
          row.group_id === userGroupId && row.class === userClass && shown.has(row.resume_number)
      );
    } catch (error) {
      console.error('❌ [RESTORE] Failed to read saved decisions:', error);
      return null;
    }
  }, [userId, userGroupId, userClass, resumesList]);

  // Replaces the on-screen counters and position with what the server holds.
  const applySavedDecisions = useCallback(
    (rows: SavedDecision[]) => {
      setAccepted(rows.filter((row) => row.vote === 'yes').length);
      setRejected(rows.filter((row) => row.vote === 'no').length);
      setNoResponse(rows.filter((row) => row.vote === 'unanswered').length);

      const decided = new Set(rows.map((row) => row.resume_number));
      const nextIndex = resumesList.findIndex((resume) => !decided.has(resume.id));
      setCurrentResumeIndex(nextIndex === -1 ? resumesList.length - 1 : nextIndex);
      setTimeRemaining(30);
      setTimeSpent(0);
    },
    [resumesList]
  );

  // localStorage is a cache, not the record. A student on a second device, or
  // one whose browser data was cleared, would otherwise see 0/10 with ten rows
  // already saved: they can never reach the ten decisions the Next button
  // needs, and their group waits at the barrier for nothing.
  useEffect(() => {
    if (serverRestoreDoneRef.current) return;
    if (!userId || !userGroupId || !userClass) return;
    if (resumesList.length === 0) return;

    serverRestoreDoneRef.current = true;
    if (hadSavedProgressRef.current) return;

    const restoreFromServer = async () => {
      const mine = await fetchSavedDecisions();
      if (mine === null || mine.length === 0) return;
      applySavedDecisions(mine);
    };

    restoreFromServer();
  }, [userId, userGroupId, userClass, resumesList, fetchSavedDecisions, applySavedDecisions]);

  // Announce completion only once every decision is actually in the database,
  // and the database says so. Three things used to let the announce run early,
  // and each one opens the server barrier (Step_Completion, which does not
  // count Resume rows) with fewer than ten rows saved:
  //
  //  1. The counters are bumped on the click, before the POST resolves, so the
  //     tenth click hit 10/10 with the tenth row still in flight. `pendingCount`
  //     holds the announce until every POST has settled.
  //  2. A tab closed mid-POST persisted the counter but never reached the
  //     unsaved queue, so a reload showed 10/10, an empty queue, and no row.
  //  3. Counters restored from localStorage (a previous student on a shared
  //     browser, the old batch flow, or devtools) drove the announce with
  //     nothing behind them.
  //
  // So the counters only decide when to ask; the server decides the answer.
  // If it holds fewer than ten rows, the screen is reconciled to what is
  // saved and the student decides the missing ones again. If it cannot be
  // reached, the check is retried rather than announced blind or abandoned.
  // Re-announcing after a refresh is harmless: Step_Completion is idempotent.
  useEffect(() => {
    if (!socket || !user) return;

    if (totalDecisions < 10 || unsavedVotes.length > 0 || pendingCount > 0) {
      announcedFinishRef.current = false;
      return;
    }
    if (announcedFinishRef.current) return;
    // The shown-resume filter needs the list; without it every row would be
    // dropped and a finished student would be reset to zero.
    if (resumesList.length === 0) return;

    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const verifyAndAnnounce = async () => {
      const saved = await fetchSavedDecisions();
      if (cancelled) return;

      if (saved === null) {
        retry = setTimeout(() => setVerifyAttempt((prev) => prev + 1), 5000);
        return;
      }

      if (saved.length < 10) {
        applySavedDecisions(saved);
        setPopup({
          headline: 'Decisions Not Saved',
          message: `Only ${saved.length} of your 10 resume decisions reached the server. Please decide on the remaining resumes again.`,
        });
        return;
      }

      announcedFinishRef.current = true;
      socket.emit('userCompletedResReview', { groupId: user.group_id });
      fetchFinished();
    };

    verifyAndAnnounce();

    return () => {
      cancelled = true;
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [
    socket,
    user,
    totalDecisions,
    unsavedVotes.length,
    pendingCount,
    resumesList.length,
    verifyAttempt,
    fetchSavedDecisions,
    applySavedDecisions,
  ]);

  const completeResumes = async () => {
    if (!socket || !user) {
      console.error('Socket or user not available');
      return;
    }

    // Moving on with decisions still unsaved strands the student at the next
    // barrier: a group is only counted finished once every member's ten rows
    // exist. Flush first, and stay put if the flush fails.
    if (unsavedVotes.length > 0) {
      const stillFailing = await retryUnsavedVotes();
      if (stillFailing > 0) {
        setPopup({
          headline: 'Decisions Not Saved',
          message: `${stillFailing} of your resume decisions have not been saved yet. Use the Retry button before continuing, or tell your instructor.`,
        });
        return;
      }
    }

    // Wait for progress update before navigating
    await updateProgress(user, 'res_2');
    localStorage.setItem('progress', 'res_2');
    clearSavedProgress(String(user.id));
    window.location.href = '/res-review-group';

    socket.emit('moveGroup', {
      groupId: user.group_id,
      classId: user.class,
      targetPage: '/res-review-group',
    });
  };

  useEffect(() => {
    if (user?.class) {
      fetchResumes(user.class);
    }
  }, [user?.class, fetchResumes]);

  useEffect(() => {
    if (!showInstructions) {
      const timer = setInterval(() => {
        setTimeSpent((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [currentResumeIndex, showInstructions]);

  // One decision, one POST. /resume/vote upserts a single row and has been
  // genuinely idempotent since uniq_resume_vote was added, so replaying a
  // decision is safe.
  const persistVote = useCallback(async (voteData: VoteRecord): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/resume/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voteData),
        credentials: 'include',
      });

      if (!response.ok) {
        console.error('❌ [VOTE] Backend rejected vote:', response.status, response.statusText);
        return false;
      }
      return true;
    } catch (error) {
      console.error('❌ [VOTE] Network error saving vote:', error);
      return false;
    }
  }, []);

  // Replays everything in the queue and reports how much is still unsaved, so
  // callers can decide whether it is safe to move on.
  const retryUnsavedVotes = async (): Promise<number> => {
    if (retrying) return unsavedVotes.length;

    const attempted = unsavedVotes;
    if (attempted.length === 0) return 0;

    setRetrying(true);
    const stillFailing: VoteRecord[] = [];
    for (const pending of attempted) {
      const saved = await persistVote(pending);
      if (!saved) stillFailing.push(pending);
    }

    // Functional update: a fresh decision may have failed while this loop ran,
    // and overwriting the queue wholesale would lose it.
    setUnsavedVotes((prev) => [
      ...prev.filter(
        (pending) => !attempted.some((item) => item.resume_number === pending.resume_number)
      ),
      ...stillFailing,
    ]);
    setRetrying(false);

    if (stillFailing.length > 0) {
      setPopup({
        headline: 'Still Not Saved',
        message:
          'Your decisions could not be saved. Check your connection and use the Retry button, or tell your instructor.',
      });
    }

    return stillFailing.length;
  };

  // Previously the votes accumulated in React state and only POSTed when the
  // array hit exactly 10. The counters persisted to localStorage but the array
  // did not, so a refresh mid-review meant the array never reached 10, the POST
  // never fired, the student was never counted finished, and the whole group's
  // barrier stayed shut. Each decision is written as it is cast instead.
  const sendVoteToBackend = async (vote: 'yes' | 'no' | 'unanswered') => {
    if (!user || !user.id || !user.group_id || !user.class) {
      console.error('❌ [VOTE] Missing user data');
      return;
    }

    if (timeSpent < 0) {
      console.error('❌ [VOTE] Invalid time spent:', timeSpent);
      return;
    }

    if (currentResumeIndex < 0) {
      console.error('❌ [VOTE] Invalid resume index:', currentResumeIndex);
      return;
    }

    const resumeId = resumesList[currentResumeIndex]?.id;
    const fallbackId = currentResumeIndex + 1;

    const voteData: VoteRecord = {
      student_id: String(user.id),
      group_id: user.group_id,
      class: user.class,
      timespent: timeSpent,
      resume_number: resumeId || fallbackId,
      vote: vote,
    };

    // Counted up before the POST and down only after the result has been
    // acted on. The caller bumps the decision counter in the same tick as
    // this call, so without this the tenth click reads as 10/10 with an empty
    // queue while the row is still in flight, and the completion announce
    // would fire before the server has it. The decrement sits in the same
    // continuation as the queue push so the two land in one render: a
    // failed vote can never be observed as "settled with nothing queued".
    setPendingCount((prev) => prev + 1);
    try {
      const saved = await persistVote(voteData);
      if (saved) return;

      // Queue it rather than drop it. The counter for this decision has
      // already been bumped, so without the queue the student would show
      // 10/10 on screen with only nine rows saved and wait at the barrier
      // forever.
      setUnsavedVotes((prev) => [
        ...prev.filter((pending) => pending.resume_number !== voteData.resume_number),
        voteData,
      ]);
    } finally {
      setPendingCount((prev) => prev - 1);
    }
  };

  const nextResume = () => {
    if (currentResumeIndex < resumesList.length - 1) {
      setFadingEffect(true);
      setResumeLoading(true);
      setShowJobDescription(false);
      setTimeout(() => {
        setCurrentResumeIndex(currentResumeIndex + 1);
        setRestricted(false);
        setTimeRemaining(30);
        setTimeSpent(0);
        setFadingEffect(false);

        if (resumeRef.current) {
          resumeRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      }, 500);
    }
  };

  useEffect(() => {
    if (totalDecisions === 10) {
      setDonePopup(true);
    }
  }, [totalDecisions]);

  useEffect(() => {
    if (!showInstructions) {
      if (timeRemaining > 0 && !maxDecisions) {
        const timer = setInterval(() => {
          setTimeRemaining((prevTime) => prevTime - 1);
        }, 1000);
        return () => clearInterval(timer);
      } else if (timeRemaining === 0 && !maxDecisions && restricted) {
        handleAccept();
      } else if (timeRemaining === 0 && !maxDecisions) {
        handleNoResponse();
      }
    }
  }, [timeRemaining, showInstructions]);

  const handleAccept = () => {
    if (maxDecisions) return;
    if (!user || userloading || resumeLoading) {
      console.warn('⚠️ [ACTION] User data not ready or resume still loading, skipping vote');
      return;
    }

    sendVoteToBackend('yes');
    setAccepted((prev) => prev + 1);
    setResumes((prev) => prev + 1);
    nextResume();
  };

  const handleReject = () => {
    if (maxDecisions) return;
    if (!user || userloading || resumeLoading) {
      console.warn('⚠️ [ACTION] User data not ready or resume still loading, skipping vote');
      return;
    }
    sendVoteToBackend('no');
    setRejected((prev) => prev + 1);
    setResumes((prev) => prev + 1);
    nextResume();
  };

  const handleNoResponse = () => {
    if (maxDecisions) return;
    if (!user || userloading || resumeLoading) {
      console.warn('⚠️ [ACTION] User data not ready or resume still loading, skipping vote');
      return;
    }
    sendVoteToBackend('unanswered');
    setNoResponse((prev) => prev + 1);
    nextResume();
  };

  const currentResumeFile = useMemo(() => {
    if (resumesList.length > 0 && resumesList[currentResumeIndex]) {
      return `${API_BASE_URL}/${resumesList[currentResumeIndex].file_path}`;
    }
    return null;
  }, [currentResumeIndex, resumesList]);

  const currentJobDescFile = useMemo(() => {
    if (jobDescPath) {
      return `${API_BASE_URL}/${jobDescPath}`;
    }
    return null;
  }, [jobDescPath]);

  if (userloading) {
    return <PageLoader />;
  }

  return (
    <div className="h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex justify-center items-center font-rubik text-redHeader text-2xl font-bold py-2">
          <h1>Resume Review Part 1</h1>
        </div>

        {showInstructions && (
          <Instructions
            instructions={resumeInstructions}
            onDismiss={() => setShowInstructions(false)}
            title="Resume Review Instructions"
            progress={1}
          />
        )}

        <div className="flex-1 flex gap-3 px-4 pb-2 overflow-hidden">
          <div className="flex flex-col gap-2 w-[280px] min-w-[280px]">
            <div className="bg-navy shadow-lg rounded-lg p-3 text-sand text-center">
              <h2 className="text-sm font-semibold">Time Remaining:</h2>
              <h2 className="text-2xl font-bold">{timeRemaining} sec</h2>
            </div>

            <div className="bg-navy shadow-lg rounded-lg p-3 text-sand text-sm">
              <div className="grid grid-cols-2 gap-1">
                <span className="text-left">Resume</span>
                <span className="text-right">{Math.min(currentResumeIndex + 1, 10)} / 10</span>
                <span className="text-left">Accepted</span>
                <span className="text-right">{accepted} / 10</span>
                <span className="text-left">Rejected</span>
                <span className="text-right">{rejected} / 10</span>
                <span className="text-left">No-response</span>
                <span className="text-right">{noResponse} / 10</span>
              </div>
            </div>

            {unsavedVotes.length > 0 && (
              <div className="bg-red-100 border-2 border-red-700 rounded-lg p-3 text-red-800">
                <h2 className="text-sm font-bold">
                  {unsavedVotes.length} decision{unsavedVotes.length === 1 ? '' : 's'} not saved
                </h2>
                <p className="text-xs mb-2">Your group cannot move on until these are saved.</p>
                <button
                  className={`w-full bg-red-700 text-white font-rubik px-3 py-1.5 rounded-lg shadow-md text-sm transition duration-300 ${
                    retrying ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-800'
                  }`}
                  onClick={retryUnsavedVotes}
                  disabled={retrying}
                >
                  {retrying ? 'Retrying…' : 'Retry saving'}
                </button>
              </div>
            )}

            <button
              className="bg-blue-600 text-white font-rubik px-4 py-2 rounded-lg shadow-md transition duration-300 hover:bg-blue-700"
              onClick={() => {
                setShowJobDescription(!showJobDescription);
                setJobDescPageNumber(1);
              }}
            >
              {showJobDescription ? '← Back to Resume' : 'View Job Description →'}
            </button>

            {showJobDescription && jobDescNumPages && jobDescNumPages > 1 && (
              <div className="flex items-center justify-between bg-navy p-2 rounded-lg">
                <button
                  className="px-3 py-1 bg-sand text-navy rounded disabled:opacity-50"
                  onClick={() => setJobDescPageNumber((prev) => Math.max(1, prev - 1))}
                  disabled={jobDescPageNumber <= 1}
                >
                  ←
                </button>
                <span className="text-sand text-sm">
                  Page {jobDescPageNumber} / {jobDescNumPages}
                </span>
                <button
                  className="px-3 py-1 bg-sand text-navy rounded disabled:opacity-50"
                  onClick={() =>
                    setJobDescPageNumber((prev) => Math.min(jobDescNumPages, prev + 1))
                  }
                  disabled={jobDescPageNumber >= jobDescNumPages}
                >
                  →
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {!restricted && (
                <>
                  <button
                    className={`bg-[#a2384f] text-white font-rubik px-4 py-2 rounded-lg shadow-md transition duration-300 ${
                      resumes > 10 || resumeLoading
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-red-600'
                    }`}
                    onClick={handleReject}
                    disabled={resumes > 10 || resumeLoading}
                  >
                    Reject
                  </button>

                  <button
                    className={`bg-gray-500 text-white font-rubik px-4 py-2 rounded-lg shadow-md transition duration-300 ${
                      resumes > 10 || resumeLoading
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-gray-600'
                    }`}
                    onClick={handleNoResponse}
                    disabled={resumes > 10 || resumeLoading}
                  >
                    Skip
                  </button>
                </>
              )}

              <button
                className={`bg-[#367b62] text-white font-rubik px-4 py-2 rounded-lg shadow-md transition duration-300 ${
                  resumes > 10 || resumeLoading
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-green-600'
                }`}
                onClick={handleAccept}
                disabled={resumes > 10 || resumeLoading}
              >
                Accept
              </button>
            </div>
          </div>

          <div className="flex-1 flex justify-center items-start overflow-hidden bg-gray-100">
            <div
              className={`${fadingEffect ? 'fade-out' : 'fade-in'} h-full w-full overflow-auto flex justify-center`}
              ref={resumeRef}
            >
              {showJobDescription && currentJobDescFile ? (
                <Document
                  file={pdfSource(currentJobDescFile)}
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
                    scale={window.innerWidth < 768 ? 0.5 : 1.3}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                  />
                </Document>
              ) : currentResumeFile ? (
                <Document
                  file={pdfSource(currentResumeFile)}
                  onLoadError={console.error}
                  onLoadSuccess={() => {
                    setResumeLoading(false);
                  }}
                  loading={
                    <div className="flex justify-center items-center h-96">
                      <div className="text-lg text-gray-600">Loading resume...</div>
                    </div>
                  }
                >
                  <Page
                    pageNumber={1}
                    scale={window.innerWidth < 768 ? 0.5 : 1.3}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    onLoadSuccess={() => {
                      setResumeLoading(false);
                    }}
                  />
                </Document>
              ) : (
                <p className="mt-10">Loading resumes...</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between px-4 pb-2 gap-2">
          <button
            onClick={() => (window.location.href = '/jobdes')}
            className="px-4 py-2 bg-redHeader text-white rounded-lg shadow-md hover:bg-blue-400 transition duration-300 font-rubik text-sm"
          >
            ← Back: Job Description
          </button>
          <button
            onClick={completeResumes}
            className={`px-4 py-2 bg-redHeader text-white rounded-lg shadow-md hover:bg-blue-400 transition duration-300 font-rubik text-sm
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-blue-400'}`}
            disabled={disabled}
          >
            {disabled && totalDecisions === 10 ? (
              <span className="flex items-center">
                <span className="w-4 h-4 mr-2 border-t-2 border-white border-solid rounded-full animate-spin"></span>
                Waiting for teammates...
              </span>
            ) : (
              'Next: Resume Review Pt. 2 →'
            )}
          </button>
        </div>

        {popup && (
          <Popup
            headline={popup.headline}
            message={popup.message}
            onDismiss={() => setPopup(null)}
          />
        )}
        {donePopup && (
          <Popup
            headline="Review Complete"
            message="You have made 10 resume decisions."
            onDismiss={() => setDonePopup(false)}
          />
        )}

        {disabled && totalDecisions === 10 && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
            {/* This overlay covers the sidebar, so the retry has to be reachable
                from inside it. Otherwise a student whose last POST failed is
                told to wait for teammates who are in fact waiting on them. */}
            {unsavedVotes.length > 0 ? (
              <div className="bg-white border-4 border-red-700 rounded-lg shadow-lg p-8 text-center max-w-md mx-auto">
                <h2 className="text-2xl font-bold text-red-700 mb-4">Decisions Not Saved</h2>
                <p className="text-lg text-gray-700 mb-4">
                  {unsavedVotes.length} of your decisions could not be saved.
                  <br />
                  Your group cannot move on until they are.
                </p>
                <button
                  className={`bg-red-700 text-white font-rubik px-4 py-2 rounded-lg shadow-md transition duration-300 ${
                    retrying ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-800'
                  }`}
                  onClick={retryUnsavedVotes}
                  disabled={retrying}
                >
                  {retrying ? 'Retrying…' : 'Retry saving'}
                </button>
              </div>
            ) : (
              <div className="bg-white border-4 border-navy rounded-lg shadow-lg p-8 text-center max-w-md mx-auto">
                <h2 className="text-2xl font-bold text-navy mb-4">Waiting for Teammates</h2>
                <p className="text-lg text-gray-700 mb-4">
                  You have completed your resume decisions.
                  <br />
                  Waiting for other group members to finish...
                </p>
                <Spinner className="mb-4" />
                <Facts />
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
