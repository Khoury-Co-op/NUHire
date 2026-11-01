'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { useSocket } from '../components/socketContext';
import Navbar from '../components/navbar';
import { usePathname } from 'next/navigation';
import { useProgress } from '../components/useProgress';
import Footer from '../components/footer';
import Popup from '../components/popup';
import axios from 'axios';
import Instructions from '../components/instructions';
import { useProgressManager } from '../components/progress';
import { useAuth } from '../components/AuthContext';
import { PageLoader } from '../components/spinner';
import {
  CURVEBALL_COLUMN,
  NO_SHOW_THRESHOLD,
  RATING_COLUMN,
  RATING_LABEL,
  RATINGS,
  Rating,
} from '../../lib/ratings';
import type { Candidate, InterviewRating, OfferCandidate, ResumePdf } from '../../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type VoteData = Record<Rating, number>;

const NO_VOTES: VoteData = {
  overall: 0,
  professionalPresence: 0,
  qualityOfAnswer: 0,
  personality: 0,
};

type InterviewPopup = Pick<InterviewRating, 'question1' | 'question2' | 'question3' | 'question4'>;

interface Offer {
  id: number;
  class_id: number;
  group_id: number;
  candidate_id: number;
  status: 'pending' | 'accepted' | 'rejected';
}

export default function MakeOffer() {
  useProgress();
  const socket = useSocket();
  const { user, loading } = useAuth();
  const { updateProgress } = useProgressManager();
  const [checkedState, setCheckedState] = useState<{ [key: number]: boolean }>({});
  const [voteCounts, setVoteCounts] = useState<{ [key: number]: VoteData }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [popup, setPopup] = useState<{
    headline: string;
    message: string;
  } | null>(null);
  const pathname = usePathname();
  const [offerPending, setOfferPending] = useState(false);
  const [resumes, setResumes] = useState<ResumePdf[]>([]);
  const [interviews, setInterviews] = useState<InterviewRating[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviewsWithVideos, setInterviewsWithVideos] = useState<OfferCandidate[]>([]);
  const [acceptedOffer, setAcceptedOffer] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [sentIn, setSentIn] = useState<(true | false | 'none')[]>(['none', 'none', 'none', 'none']);
  const [videosLoading, setVideosLoading] = useState(true);
  const [allRejected, setAllRejected] = useState(false);

  const offerInstructions = [
    'Review everything about the candidates you know.',
    'Discuss as a team which person is getting the job offer.',
    "Make the offer and wait for the candidate's decision.",
  ];
  const [groupSize, setGroupSize] = useState(4);
  const selectedCandidateId = Object.entries(checkedState)
    .filter(([_, checked]) => checked)
    .map(([id]) => Number(id))[0];
  const [offerConfirmations, setOfferConfirmations] = useState<{ [candidateId: number]: string[] }>(
    {}
  );
  const confirmations = selectedCandidateId ? offerConfirmations[selectedCandidateId] || [] : [];
  const hasConfirmed = user?.id ? confirmations.includes(user.id.toString()) : false;
  const confirmationCount = confirmations.length;
  const allConfirmed = confirmationCount >= groupSize;
  const [popupVotes, setPopupVotes] = useState<{ [key: number]: InterviewPopup }>({});

  const [existingOffer, setExistingOffer] = useState<Offer | null>(null);
  const [ableToMakeOffer, setAbleToMakeOffer] = useState(true);
  const [checkedStateRestored, setCheckedStateRestored] = useState(false);

  // Check if all candidates are rejected
  useEffect(() => {
    const totalCandidates = interviewsWithVideos.length;
    if (totalCandidates === 0) return;

    const rejectedCount = sentIn.filter((status) => status === false).length;
    const hasAllRejected = rejectedCount === totalCandidates && rejectedCount > 0;

    if (hasAllRejected && !allRejected) {
      setAllRejected(true);
      setPopup({
        headline: 'All Candidates Rejected',
        message:
          'Unfortunately, all four candidates have been rejected by the advisor. In the real world you would have to restart the hiring process from the beginning.',
      });
    }
  }, [sentIn, interviewsWithVideos, allRejected]);

  const checkExistingOffer = async () => {
    if (!user?.group_id || !user?.class) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/offers/group/${user.group_id}/class/${user.class}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        // This endpoint returns every offer the group has made, as an array.
        // The check below used to read `.id` straight off that array: an array
        // is truthy but has no `id`, so the guard was always false and this
        // whole block never ran. That is why submitting twice created two
        // offers, and why a refresh mid-review showed no pending state.
        //
        // A group should only ever have one offer. Where the data says
        // otherwise, a decision the professor already made outranks one still
        // waiting, and the newest outranks an older rejection.
        const offers = await response.json();
        const list: Offer[] = Array.isArray(offers) ? offers : [];
        const byNewest = [...list].sort((a, b) => b.id - a.id);
        const offer =
          byNewest.find((o) => o.status === 'accepted') ??
          byNewest.find((o) => o.status === 'pending') ??
          byNewest[0];

        if (offer && offer.id) {
          setExistingOffer(offer);

          if (offer.status === 'pending') {
            setOfferPending(true);
          } else if (offer.status === 'accepted') {
            setAcceptedOffer(true);
            setSentIn((prev) => {
              const newSentIn = [...prev];
              newSentIn[offer.candidate_id] = true;
              return newSentIn;
            });
          } else if (offer.status === 'rejected') {
            setSentIn((prev) => {
              const newSentIn = [...prev];
              newSentIn[offer.candidate_id] = false;
              return newSentIn;
            });
            setOfferPending(false);
          }
        } else {
          setExistingOffer(null);
          setOfferPending(false);
        }
      } else {
        setExistingOffer(null);
        setOfferPending(false);
      }
    } catch (error) {
      console.error('Error checking existing offer:', error);
      setExistingOffer(null);
      setOfferPending(false);
    }
  };

  useEffect(() => {
    if (acceptedOffer) {
      localStorage.removeItem('makeOffer_existingOffer');
      localStorage.removeItem('makeOffer_acceptedOffer');
      localStorage.removeItem('makeOffer_sentIn');
      localStorage.removeItem('makeOffer_offerPending');
      localStorage.removeItem('makeOffer_checkedState');
      localStorage.removeItem('makeOffer_offerConfirmations');
    }
  }, [acceptedOffer]);

  useEffect(() => {
    const savedCheckedState = localStorage.getItem('makeOffer_checkedState');
    if (savedCheckedState) {
      setCheckedState(JSON.parse(savedCheckedState));
      setCheckedStateRestored(true);
    }
  }, []);

  useEffect(() => {
    const savedOffer = localStorage.getItem('makeOffer_existingOffer');
    const savedAccepted = localStorage.getItem('makeOffer_acceptedOffer');
    const savedSentIn = localStorage.getItem('makeOffer_sentIn');
    const savedPending = localStorage.getItem('makeOffer_offerPending');
    const savedOfferConfirmations = localStorage.getItem('makeOffer_offerConfirmations');

    if (savedOfferConfirmations) setOfferConfirmations(JSON.parse(savedOfferConfirmations));
    if (savedOffer) setExistingOffer(JSON.parse(savedOffer));
    if (savedAccepted) setAcceptedOffer(savedAccepted === 'true');
    if (savedSentIn) setSentIn(JSON.parse(savedSentIn));
    if (savedPending) setOfferPending(savedPending === 'true');
  }, []);

  useEffect(() => {
    localStorage.setItem('makeOffer_checkedState', JSON.stringify(checkedState));
  }, [checkedState]);

  useEffect(() => {
    localStorage.setItem('makeOffer_offerConfirmations', JSON.stringify(offerConfirmations));
  }, [offerConfirmations]);

  useEffect(() => {
    localStorage.setItem('makeOffer_existingOffer', JSON.stringify(existingOffer));
  }, [existingOffer]);

  useEffect(() => {
    localStorage.setItem('makeOffer_acceptedOffer', String(acceptedOffer));
  }, [acceptedOffer]);

  useEffect(() => {
    localStorage.setItem('makeOffer_sentIn', JSON.stringify(sentIn));
  }, [sentIn]);

  useEffect(() => {
    localStorage.setItem('makeOffer_offerPending', String(offerPending));
  }, [offerPending]);

  useEffect(() => {
    if (user?.group_id && user?.class) {
      checkExistingOffer();
    }
  }, [user]);

  useEffect(() => {
    if (!user?.group_id || !candidates.length) return;

    const fetchPopupVotes = async () => {
      try {
        const promises = candidates.map((candidate) =>
          fetch(
            `${API_BASE_URL}/interview/popup/${candidate.resume_id}/${user.group_id}/${user.class}`,
            { credentials: 'include' }
          ).then((res) => res.json())
        );

        const results = await Promise.all(promises);
        const votesMap = results.reduce((acc, vote, index) => {
          acc[candidates[index].resume_id] = vote;
          return acc;
        }, {});

        setPopupVotes(votesMap);
      } catch (error) {
        console.error('Error fetching popup votes:', error);
      }
    };

    fetchPopupVotes();
  }, [user, candidates]);

  useEffect(() => {
    if (user && user.email) {
      socket?.emit('studentOnline', { studentId: user.email });
      socket?.emit('studentPageChanged', {
        studentId: user.email,
        currentPage: pathname,
      });

      const updateCurrentPage = async () => {
        try {
          await axios.post(
            `${API_BASE_URL}/users/update-currentpage`,
            {
              page: 'makeofferpage',
              user_email: user.email,
            },
            { withCredentials: true }
          );
        } catch (error) {
          console.error('Error updating current page:', error);
        }
      };

      updateCurrentPage();
    }
  }, [user, pathname]);

  useEffect(() => {
    if (!user?.group_id) return;

    const fetchInterviews = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/interview/group/${user.group_id}?class=${user.class}`,
          { credentials: 'include' }
        );
        const data = await response.json();
        setInterviews(data);
      } catch (err) {
        console.error('Error fetching interviews:', err);
      }
    };

    fetchGroupSize();
    fetchInterviews();
  }, [user]);

  const fetchGroupSize = async () => {
    if (!user?.group_id) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/interview/group-size/${user.group_id}/${user.class}`,
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

  useEffect(() => {
    if (!interviews.length) {
      setVideosLoading(false);
      return;
    }

    setVideosLoading(true);

    const fetchCandidates = async () => {
      try {
        const fetchedCandidates = await Promise.all(
          interviews.map(async (interview) => {
            const id = interview.candidate_id;
            const url = `${API_BASE_URL}/candidates/resume/${id}`;

            try {
              const res = await fetch(url, { credentials: 'include' });

              if (!res.ok) {
                console.error(`Invalid response for candidate ${id}`);
                return null;
              }

              const contentType = res.headers.get('content-type');
              if (!contentType || !contentType.includes('application/json')) {
                console.error(`Invalid content-type for candidate ${id}`);
                return null;
              }

              const responseText = await res.text();

              if (!responseText.trim()) {
                console.error(`Empty response for candidate ${id}`);
                return null;
              }

              const data = JSON.parse(responseText);

              if (!data) {
                console.error(`No data found for candidate ${id}`);
                return null;
              }

              return data;
            } catch (parseError) {
              console.error(`Error processing candidate ${id}:`, parseError);
              return null;
            }
          })
        );

        const validCandidates = fetchedCandidates.filter((candidate) => candidate !== null);
        setCandidates(validCandidates);
      } catch (err) {
        console.error('Error in fetchCandidates:', err);
        setCandidates([]);
      } finally {
        setVideosLoading(false);
      }
    };

    fetchCandidates();
  }, [interviews]);

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
    if (!candidates.length) return;

    const fetchResumes = async () => {
      try {
        const fetchedResumes = await Promise.all(
          candidates.map(async (candidate) => {
            const id = candidate.resume_id;
            const res = await fetch(`${API_BASE_URL}/resume_pdf/id/${id}`, {
              credentials: 'include',
            });

            if (!res.ok) {
              throw new Error(`Invalid response for resume ${candidate.resume_id}`);
            }

            const data = await res.json();
            const resumeData = Array.isArray(data) ? data[0] : data;
            return resumeData;
          })
        );

        setResumes(fetchedResumes);
      } catch (err) {
        console.error('Error fetching resumes:', err);
      }
    };

    fetchResumes();
  }, [candidates]);

  const groupInterviewsByCandidate = (interviews: InterviewRating[]) => {
    const grouped: Record<number, InterviewRating[]> = {};
    for (const interview of interviews) {
      const id = interview.candidate_id;
      if (!grouped[id]) {
        grouped[id] = [];
      }
      grouped[id].push(interview);
    }
    return grouped;
  };

  useEffect(() => {
    if (!user || !interviews.length) return;

    const grouped = groupInterviewsByCandidate(interviews);
    const voteData: { [key: number]: VoteData } = {};
    const checkboxData: { [key: number]: boolean } = {};

    for (const [candidateIdStr, candidateInterviews] of Object.entries(grouped)) {
      const candidateId = parseInt(candidateIdStr);
      voteData[candidateId] = { ...NO_VOTES };

      candidateInterviews.forEach((interview) => {
        RATINGS.forEach((rating) => {
          voteData[candidateId][rating] += interview[RATING_COLUMN[rating]];
        });

        checkboxData[candidateId] = checkboxData[candidateId] || interview.checked === 1;
      });
    }

    setVoteCounts(voteData);

    if (!checkedStateRestored) {
      setCheckedState(checkboxData);
    }
  }, [interviews, user, checkedStateRestored]);

  useEffect(() => {
    if (!interviews.length || !candidates.length) return;

    const uniqueCandidateIds = [...new Set(interviews.map((i) => i.candidate_id))];

    const merged = uniqueCandidateIds.map((id) => {
      const candidate = candidates.find((c) => c.resume_id === id);

      if (!candidate) {
        console.warn(`No candidate found with resume_id ${id}`);
        return {
          candidate_id: id,
          video_path: 'https://www.youtube.com/embed/srw4r3htm4U',
          resume_path: 'uploads/resumes/sample1.pdf',
          f_name: 'Unknown',
          l_name: 'Candidate',
        };
      }

      const resume = resumes.find((r) => r.id === candidate.resume_id);

      return {
        candidate_id: id,
        video_path: candidate?.interview || 'https://www.youtube.com/embed/srw4r3htm4U',
        resume_path: resume?.file_path || 'uploads/resumes/sample1.pdf',
        f_name: candidate?.f_name || 'First',
        l_name: candidate?.l_name || 'Last',
      };
    });

    setInterviewsWithVideos(merged);
  }, [resumes]);

  const handleConfirmOfferClick = (candidateId: number) => {
    if (!socket || !user?.id || !candidateId) return;

    if (
      existingOffer &&
      (existingOffer.status === 'pending' || existingOffer.status === 'accepted')
    ) {
      let message = '';
      if (existingOffer.status === 'pending') {
        message = 'You already have a pending offer awaiting advisor approval.';
      } else if (existingOffer.status === 'accepted') {
        message = 'You already have an accepted offer. You cannot make another offer.';
      }
      setPopup({
        headline: 'Offer Already Exists',
        message: message,
      });
      return;
    }

    // Don't update local state - let the socket handler do it for everyone including yourself
    socket.emit('confirmOffer', {
      groupId: user.group_id,
      classId: user.class,
      candidateId,
      studentId: user.id,
      roomId: `group_${user.group_id}_class_${user.class}`,
    });
  };

  useEffect(() => {
    if (!socket || !user) return;

    setIsConnected(socket.connected);

    const roomId = `group_${user.group_id}_class_${user.class}`;

    if (socket.connected) {
      socket.emit('joinGroup', roomId);
    }

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('joinGroup', roomId);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleGroupMemberOffer = () => {
      setPopup({
        headline: 'Offer submitted',
        message: 'Awaiting approval from your advisor…',
      });
      setOfferPending(true);
    };

    const handleConfirmOfferSocket = ({
      candidateId,
      studentId,
    }: {
      candidateId: number;
      studentId: string;
    }) => {
      setOfferConfirmations((prev) => {
        const current = prev[candidateId] || [];
        if (!current.includes(studentId)) {
          return { ...prev, [candidateId]: [...current, studentId] };
        }
        return prev;
      });
    };

    const handleMakeOfferResponse = ({
      classId,
      groupId,
      candidateId,
      accepted,
    }: {
      classId: number;
      groupId: number;
      candidateId: number;
      accepted: boolean;
    }) => {
      if (classId !== user.class || groupId !== user.group_id) {
        return;
      }

      checkExistingOffer();

      if (accepted) {
        setPopup({
          headline: 'Offer accepted!',
          message: "Congratulations—you've extended the offer successfully.",
        });
        setSentIn((prev) => {
          const newSentIn = [...prev];
          newSentIn[candidateId] = true;
          return newSentIn;
        });

        setAcceptedOffer(true);
        setExistingOffer((prev) => (prev ? { ...prev, status: 'accepted' } : null));
      } else {
        setPopup({
          headline: 'Offer rejected',
          message:
            "That candidate wasn't available or has chosen another offer. Please choose again.",
        });

        setCheckedState({});
        setSentIn((prev) => {
          const newSentIn = [...prev];
          newSentIn[candidateId] = false;
          return newSentIn;
        });

        setOfferPending(false);
        setExistingOffer((prev) => (prev ? { ...prev, status: 'rejected' } : null));
        setAbleToMakeOffer(true);
      }
    };

    const handleCheckboxUpdated = ({
      interview_number,
      checked,
    }: {
      interview_number: number;
      checked: boolean;
    }) => {
      setCheckedState((prev) => ({ ...prev, [interview_number]: checked }));
    };

    const handleStudentRemoved = ({ groupId, classId }: { groupId: number; classId: number }) => {
      if (groupId === user.group_id && classId == user.class) {
        // Reset confirmations for the selected candidate
        if (selectedCandidateId) {
          setOfferConfirmations((prev) => ({
            ...prev,
            [selectedCandidateId]: [],
          }));
        }

        fetchGroupSize();
      }
    };

    const handleStudentAdded = ({ groupId, classId }: { groupId: number; classId: number }) => {
      if (groupId === user.group_id && classId == user.class) {
        // Reset confirmations for the selected candidate
        if (selectedCandidateId) {
          setOfferConfirmations((prev) => ({
            ...prev,
            [selectedCandidateId]: [],
          }));
        }

        fetchGroupSize();
      }
    };

    socket.on('connect', handleConnect);
    socket.on('studentRemovedFromGroup', handleStudentRemoved);
    socket.on('disconnect', handleDisconnect);
    socket.on('studentAddedToGroup', handleStudentAdded);
    socket.on('groupMemberOffer', handleGroupMemberOffer);
    socket.on('confirmOffer', handleConfirmOfferSocket);
    socket.on('makeOfferResponse', handleMakeOfferResponse);
    socket.on('checkboxUpdated', handleCheckboxUpdated);

    return () => {
      socket.off('studentRemovedFromGroup', handleStudentRemoved);
      socket.off('connect', handleConnect);
      socket.off('studentAddedToGroup', handleStudentAdded);
      socket.off('disconnect', handleDisconnect);
      socket.off('groupMemberOffer', handleGroupMemberOffer);
      socket.off('confirmOffer', handleConfirmOfferSocket);
      socket.off('makeOfferResponse', handleMakeOfferResponse);
      socket.off('checkboxUpdated', handleCheckboxUpdated);
    };
  }, [socket, user, checkExistingOffer]);

  useEffect(() => {
    if (groupSize > 0 && selectedCandidateId) {
      const currentConfirmations = offerConfirmations[selectedCandidateId] || [];

      // If everyone confirmed but group size increased, reset confirmations
      if (currentConfirmations.length > 0 && currentConfirmations.length >= groupSize) {
        setOfferConfirmations((prev) => ({
          ...prev,
          [selectedCandidateId]: [],
        }));
      }
    }
  }, [groupSize, selectedCandidateId]);

  const handleCheckboxChange = (interviewNumber: number) => {
    if (!socket || !isConnected) return;

    const roomId = `group_${user!.group_id}_class_${user!.class}`;

    const newCheckedState = !checkedState[interviewNumber];
    setCheckedState((prev) => ({
      ...prev,
      [interviewNumber]: newCheckedState,
    }));

    socket.emit('checkint', {
      group_id: roomId,
      interview_number: interviewNumber,
      checked: newCheckedState,
    });
  };

  const handleMakeOffer = async () => {
    if (
      existingOffer &&
      (existingOffer.status === 'pending' || existingOffer.status === 'accepted')
    ) {
      let message = '';
      if (existingOffer.status === 'pending') {
        message = 'You already have a pending offer awaiting advisor approval.';
      } else if (existingOffer.status === 'accepted') {
        message = 'You already have an accepted offer. You cannot make another offer.';
      }

      setPopup({
        headline: 'Offer Already Exists',
        message: message,
      });
      setAbleToMakeOffer(false);
      return;
    }

    const selectedIds = Object.entries(checkedState)
      .filter(([_, checked]) => checked)
      .map(([id]) => Number(id));

    if (selectedIds.length !== 1) return;

    const candidateId = selectedIds[0];
    const confirmations = offerConfirmations[candidateId] || [];
    if (confirmations.length < groupSize) {
      setPopup({
        headline: 'Team Confirmation Required',
        message: `All ${groupSize} team members must confirm before making an offer.`,
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group_id: user!.group_id,
          class_id: user!.class,
          candidate_id: candidateId,
          status: `pending`,
        }),
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        setPopup({
          headline: 'Error',
          message: result.error || 'Failed to submit offer',
        });
        return;
      }

      setExistingOffer({
        id: result.id,
        class_id: user!.class,
        group_id: user!.group_id,
        candidate_id: candidateId,
        status: 'pending',
      });

      socket?.emit('makeOfferRequest', {
        classId: user!.class,
        groupId: user!.group_id,
        candidateId,
      });

      setPopup({
        headline: 'Offer submitted',
        message: 'Awaiting approval from your advisor…',
      });
      setOfferPending(true);
    } catch (error) {
      console.error('Error submitting offer:', error);
      setPopup({
        headline: 'Error',
        message: 'Failed to submit offer. Please try again.',
      });
    }
  };

  const completeMakeOffer = () => {
    const hasAcceptedOffer = Object.values(sentIn).some((status) => status === true);

    if (!hasAcceptedOffer && !allRejected) {
      setPopup({
        headline: 'Action Required',
        message: 'You must have an accepted offer to proceed.',
      });
      return;
    }

    updateProgress(user!, 'employer');
    localStorage.setItem('progress', 'employer');
    window.location.href = '/dashboard';
  };

  const selectedCount = Object.values(checkedState).filter(Boolean).length;
  const isOfferDisabled =
    existingOffer !== null &&
    (existingOffer.status === 'pending' || existingOffer.status === 'accepted');

  if (loading) {
    return <PageLoader />;
  }

  if (videosLoading) {
    return (
      <div className="min-h-screen bg-sand font-rubik">
        <Navbar />
        <div className="flex-1 flex flex-col px-4 py-8">
          <div className="w-full p-6">
            <h1 className="text-3xl font-bold text-center text-navy mb-6">
              Make an Offer as a Group
            </h1>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 border-t-4 border-redHeader border-solid rounded-full animate-spin mb-6"></div>
              <p className="text-lg font-semibold text-navy mb-2">Loading Candidate Offers...</p>
              <p className="text-sm text-gray-600">
                Please wait while we fetch the candidate information
              </p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!user || user.affiliation !== 'student') return null;

  return (
    <div className="min-h-screen bg-sand font-rubik">
      {showInstructions && (
        <Instructions
          instructions={offerInstructions}
          onDismiss={() => setShowInstructions(false)}
          title="Offer Instructions"
          progress={4}
        />
      )}

      <Navbar />
      <div className="flex-1 flex flex-col px-4 py-8">
        <div className="w-full p-6">
          <h1 className="text-3xl font-bold text-center text-navy mb-6">
            Make an Offer as a Group
          </h1>

          {existingOffer && (
            <div
              className={`mb-6 p-4 rounded-lg text-center ${
                existingOffer.status === 'pending'
                  ? 'bg-yellow-100 border border-yellow-400 text-yellow-800'
                  : existingOffer.status === 'accepted'
                    ? 'bg-green-100 border border-green-400 text-green-800'
                    : 'bg-red-100 border border-red-400 text-red-800'
              }`}
            >
              <h3 className="font-bold mb-2">
                {existingOffer.status === 'pending' && 'Offer Pending Approval'}
                {existingOffer.status === 'accepted' && 'Offer Accepted!'}
                {existingOffer.status === 'rejected' && 'Offer Rejected'}
              </h3>
              <p>
                {existingOffer.status === 'pending' &&
                  `Your offer for Candidate ${existingOffer.candidate_id} is awaiting advisor approval.`}
                {existingOffer.status === 'accepted' &&
                  `Your offer for Candidate ${existingOffer.candidate_id} has been accepted! Congratulations!`}
                {existingOffer.status === 'rejected' &&
                  `Your offer for Candidate ${existingOffer.candidate_id} was rejected. You may select a different candidate.`}
              </p>
            </div>
          )}

          {allRejected && (
            <div className="mb-6 p-4 rounded-lg text-center bg-red-100 border-2 border-red-500 text-red-900">
              <h3 className="font-bold mb-2 text-xl">All Candidates Rejected</h3>
              <p className="mb-2">
                Unfortunately, all four candidates have been rejected by the advisor.
              </p>
              <p className="font-semibold">
                You will need to restart the hiring process from the Job Description stage.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-8 w-full min-h-[60vh] items-stretch">
            {interviewsWithVideos.map((interview) => {
              const interviewNumber = interview.candidate_id;
              const votes = voteCounts[interviewNumber] || NO_VOTES;
              const total = (rating: Rating) =>
                (votes[rating] || 0) +
                (popupVotes[interviewNumber]?.[CURVEBALL_COLUMN[rating]] || 0);

              const isNoShow = RATINGS.some((rating) => total(rating) <= NO_SHOW_THRESHOLD);
              const isAccepted = sentIn[interviewNumber] === true;
              const isRejected = sentIn[interviewNumber] === false;

              return (
                <div
                  key={interviewNumber}
                  className={`p-6 rounded-lg shadow-md flex flex-col gap-4 ${
                    isAccepted
                      ? 'bg-green-100 border border-green-500'
                      : isRejected
                        ? 'bg-red-100 border border-red-300 pointer-events-none'
                        : isNoShow
                          ? 'bg-gray-100 border border-gray-400 opacity-75'
                          : 'bg-wood'
                  }`}
                >
                  <h3 className="text-xl font-semibold text-navy text-center">
                    {interview.f_name} {interview.l_name}
                    {isAccepted && ' ✓ Offered'}
                    {isRejected && ' ✗ Not Offered'}
                    {isNoShow && ' (No Show)'}
                  </h3>

                  <div className="aspect-video w-full">
                    <iframe
                      className="w-full h-full rounded-lg shadow-md"
                      src={interview.video_path}
                      title="Interview Video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    ></iframe>
                  </div>

                  <div className="mt-2 space-y-1 text-navy text-sm">
                    {RATINGS.map((rating) => (
                      <p key={rating}>
                        <span className="font-medium">{RATING_LABEL[rating]}:</span>{' '}
                        {groupSize > 0 ? Math.max(0, total(rating) / groupSize).toFixed(1) : 'N/A'}
                      </p>
                    ))}
                  </div>

                  <a
                    href={`${API_BASE_URL}/${interview.resume_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-navy hover:underline ${isRejected ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    View / Download Resume
                  </a>

                  {!isRejected && !isNoShow && (
                    <label
                      className={`flex items-center mt-2 ${isOfferDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedState[interviewNumber] || false}
                        onChange={() => !isOfferDisabled && handleCheckboxChange(interviewNumber)}
                        disabled={isOfferDisabled}
                        className="h-4 w-4 text-redHeader"
                      />
                      <span className="ml-2 text-navy text-sm">Selected for Offer</span>
                    </label>
                  )}

                  {isNoShow && (
                    <div className="text-center text-red-600 text-sm font-medium bg-red-50 p-2 rounded">
                      This candidate did not show up for the interview
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {popup && (
            <Popup
              headline={popup.headline}
              message={popup.message}
              onDismiss={() => setPopup(null)}
            />
          )}

          {selectedCount === 1 && !isOfferDisabled && !acceptedOffer && (
            <div className="flex flex-col items-center my-6 gap-4">
              <div className="text-center">
                <p className="text-navy font-medium">
                  Team Confirmation: {confirmationCount}/{groupSize} members ready
                </p>
              </div>

              <div className="flex gap-4">
                {!allConfirmed ? (
                  <button
                    onClick={() => handleConfirmOfferClick(selectedCandidateId)}
                    disabled={hasConfirmed || offerPending || isOfferDisabled}
                    className={`px-6 py-3 rounded-lg shadow-md font-rubik transition duration-300 ${
                      hasConfirmed
                        ? 'bg-green-500 text-white cursor-not-allowed'
                        : isOfferDisabled
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {hasConfirmed
                      ? `✓ Confirmed (${confirmationCount}/${groupSize})`
                      : 'Confirm Selection'}
                  </button>
                ) : (
                  <button
                    onClick={handleMakeOffer}
                    disabled={offerPending || isOfferDisabled}
                    className={`px-6 py-3 rounded-lg shadow-md font-rubik transition duration-300 ${
                      offerPending || isOfferDisabled
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                        : 'bg-redHeader text-white hover:bg-blue-700'
                    }`}
                  >
                    {offerPending
                      ? 'Awaiting Advisor…'
                      : isOfferDisabled
                        ? 'Offer Already Submitted'
                        : 'Make Team Offer'}
                  </button>
                )}
              </div>

              {!allConfirmed && confirmationCount > 0 && !isOfferDisabled && (
                <p className="text-sm text-orange-600 text-center">
                  Waiting for {groupSize - confirmationCount} more team member
                  {groupSize - confirmationCount !== 1 ? 's' : ''} to confirm
                </p>
              )}
            </div>
          )}

          {selectedCount === 1 && isOfferDisabled && (
            <div className="flex flex-col items-center my-6 gap-4">
              <div className="text-center">
                <p className="text-gray-600 font-medium">
                  {ableToMakeOffer &&
                    !acceptedOffer &&
                    'Offer actions disabled - awaiting advisor approval'}
                  {ableToMakeOffer &&
                    acceptedOffer &&
                    'Offer actions disabled - offer already accepted'}
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex justify-between mt-6 px-4">
          <button
            onClick={() => (window.location.href = '/jobdes')}
            className="px-4 py-2 bg-redHeader text-white rounded-lg shadow-md cursor-not-allowed opacity-50 transition duration-300 font-rubik"
            disabled={true}
          >
            ← Back: Interview Stage
          </button>
          <button
            onClick={completeMakeOffer}
            className={`px-4 py-2 bg-redHeader text-white rounded-lg shadow-md font-rubik transition duration-300 ${
              !acceptedOffer && !allRejected ? 'cursor-not-allowed opacity-50' : 'hover:bg-blue-400'
            }`}
            disabled={!acceptedOffer && !allRejected}
          >
            Next: Employer Panel →
          </button>
        </footer>
      </div>
      <Footer />
    </div>
  );
}
