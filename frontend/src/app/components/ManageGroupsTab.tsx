'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from './socketContext';
import Popup from './popup';
import { AssignJobModal } from './manageGroups/AssignJobModal';
import { ResetWorkConfirmModal } from './manageGroups/ResetWorkConfirmModal';
import { SendPopupModal } from './manageGroups/SendPopupModal';
import { AddStudentModal } from './manageGroups/AddStudentModal';
import { ConfirmActionModal } from './manageGroups/ConfirmActionModal';
import { ReassignStudentModal } from './manageGroups/ReassignStudentModal';
import { ClassPicker } from './manageGroups/ClassPicker';
import { GroupCard, type ScrollState } from './manageGroups/GroupCard';
import { useClassGroups } from './manageGroups/useClassGroups';
import { useOffers } from './manageGroups/useOffers';
import { useAuth } from './AuthContext';
import type { JobOption, Student } from '../../types';
import { API_BASE_URL } from '../../lib/api';

export function ManageGroupsTab() {
  const { user, loading: userloading } = useAuth();
  const [isStartingAll, setIsStartingAll] = useState(false);
  const [startingGroups, setStartingGroups] = useState<Set<number>>(new Set());
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [newGroupId, setNewGroupId] = useState<number>(1);
  const router = useRouter();
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  const socket = useSocket();
  const {
    selectedClass,
    classes,
    groups,
    setGroups,
    students,
    availableGroups,
    isLoadingGroups,
    refreshGroupsAndStudents,
    handleClassChange,
  } = useClassGroups(socket, user, setPopup);
  const {
    pendingOffers,
    setPendingOffers,
    acceptedOffers,
    setAcceptedOffers,
    dismissedOffers,
    setDismissedOffers,
  } = useOffers(socket, user, selectedClass, availableGroups);
  const [addStudentModalOpen, setAddStudentModalOpen] = useState(false);
  const [addStudentEmail, setAddStudentEmail] = useState('');
  const [addStudentGroupId, setAddStudentGroupId] = useState<number | null>(null);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [assignJobModalOpen, setAssignJobModalOpen] = useState(false);
  const [selectedGroupForJob, setSelectedGroupForJob] = useState<number | null>(null);
  const [availableJobs, setAvailableJobs] = useState<JobOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [isAssigningJob, setIsAssigningJob] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string; data: any } | null>(null);
  const [scrollStates, setScrollStates] = useState<Record<number, ScrollState>>({});
  const [sendPopupModalOpen, setSendPopupModalOpen] = useState(false);
  const [selectedGroupForPopup, setSelectedGroupForPopup] = useState<number | null>(null);
  const [popupHeadline, setPopupHeadline] = useState('');
  const [popupMessage, setPopupMessage] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [availableCandidates, setAvailableCandidates] = useState<{ id: number; name: string }[]>(
    []
  );
  const [selectedCandidateForPopup, setSelectedCandidateForPopup] = useState<string>('');
  const [isSendingPopup, setIsSendingPopup] = useState(false);

  const presetPopups = useMemo(
    () => [
      {
        title: 'Internal Referral',
        headline: 'Internal Referral',
        message:
          '{candidateName} has an internal referral for this position! The averages of scores will be skewed in favor of the candidate!',
        location: 'interview',
        vote: { overall: 10, professionalPresence: 0, qualityOfAnswer: 0, personality: 0 },
      },
      {
        title: 'No Show',
        headline: 'Abandoned Interview',
        message:
          '{candidateName} did not show up for the interview. You can change the scores, but everything will be saved as the lowest score.',
        location: 'interview',
        vote: {
          overall: -1000,
          professionalPresence: -1000,
          qualityOfAnswer: -1000,
          personality: -1000,
        },
      },
      {
        title: 'Resume Discrepancy',
        headline: 'Inconsistent Information',
        message:
          "{candidateName}'s resume did not align with their responses during the interview and they couldn't explain their projects, raising concerns about accuracy.",
        location: 'interview',
        vote: { overall: -5, professionalPresence: 0, qualityOfAnswer: -10, personality: 0 },
      },
      {
        title: 'Late Arrival',
        headline: 'Late Interview Start',
        message:
          '{candidateName} arrived late to the interview. This may have impacted the flow and available time for questions.',
        location: 'interview',
        vote: { overall: -5, professionalPresence: -10, qualityOfAnswer: 0, personality: 0 },
      },
    ],
    []
  );

  // A signed-in non-teacher. The bounce below has to be an effect, and the
  // "access denied" screen has to be a return value from the render body after
  // every hook has run: the previous version called setPopup() during render
  // and then `return;`, which React answers with "Too many re-renders" and
  // "Nothing was returned from render", and skipped the ~12 hooks declared
  // below it, changing the hook count between renders. Any of the three
  // white-screens the admin tab mid-class.
  const isNotTeacher = !!user && user.affiliation !== 'admin';

  useEffect(() => {
    if (!isNotTeacher) return;

    // Cleared on unmount so a professor who navigates away inside the 2s
    // window is not yanked back to the landing page.
    const timer = setTimeout(() => router.push('/'), 2000);
    return () => clearTimeout(timer);
  }, [isNotTeacher, router]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>, groupId: number) => {
    const element = e.currentTarget;
    const canScrollDown =
      element.scrollHeight > element.clientHeight &&
      element.scrollTop < element.scrollHeight - element.clientHeight - 5;
    const canScrollUp = element.scrollTop > 5;

    setScrollStates((prev) => ({
      ...prev,
      [groupId]: { canScrollDown, canScrollUp },
    }));
  };

  const downloadCSV = () => {
    if (!selectedClass || students.length === 0) {
      setPopup({
        headline: 'Error',
        message: 'Please select a class and upload student data first',
      });
      return;
    }

    const csvContent = students.map((student) => `${student.group_id},${student.email}`).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `group_assignments_class_${selectedClass}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const initialStates: Record<number, ScrollState> = {};
    groups.forEach((group) => {
      if (group.students.length > 3) {
        initialStates[group.group_id] = { canScrollDown: true, canScrollUp: false };
      }
    });
    setScrollStates(initialStates);
  }, [groups]);

  useEffect(() => {
    const fetchJobs = async () => {
      if (!assignJobModalOpen || !selectedClass) return;

      try {
        const response = await fetch(`${API_BASE_URL}/jobs?class_id=${selectedClass}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const jobsData = await response.json();
          setAvailableJobs(jobsData);
          if (jobsData.length > 0) {
            setSelectedJobId(jobsData[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching jobs:', error);
      }
    };

    fetchJobs();
  }, [assignJobModalOpen, selectedClass]);

  // `reset` false only changes the job; true also erases the groups' work and
  // must only be sent after the ERASE confirmation.
  const assignJobToAllGroups = async (reset: boolean) => {
    if (!selectedJobId || !selectedClass) {
      setPopup({ headline: 'Error', message: 'Please select a job first.' });
      return;
    }

    setIsAssigningJob(true);

    try {
      const selectedJob = availableJobs.find((job) => job.id === selectedJobId);

      if (!selectedJob) {
        setPopup({ headline: 'Error', message: 'Selected job not found.' });
        setIsAssigningJob(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/jobs/assign-job-to-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          class_id: selectedClass,
          job_title: selectedJob.title,
          reset,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        await refreshGroupsAndStudents();

        setPopup({
          headline: 'Success',
          message: reset
            ? `Job "${selectedJob.title}" assigned to all ${result.groups_updated} groups, and their work was reset.`
            : `Job changed to "${selectedJob.title}" for all ${result.groups_updated} groups. Everyone's work was kept.`,
        });
        setAssignJobModalOpen(false);
        setSelectedGroupForJob(null);
        setSelectedJobId(null);
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to assign job: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('Error assigning job to all groups:', error);
      setPopup({
        headline: 'Error',
        message: 'Failed to assign job to all groups. Please try again.',
      });
    } finally {
      setIsAssigningJob(false);
    }
  };

  const assignJobToGroup = async (reset: boolean) => {
    if (!selectedGroupForJob || !selectedJobId || !selectedClass) return;

    setIsAssigningJob(true);

    try {
      const selectedJob = availableJobs.find((job) => job.id === selectedJobId);

      if (!selectedJob) {
        setPopup({ headline: 'Error', message: 'Selected job not found.' });
        setIsAssigningJob(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/jobs/update-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          job_group_id: selectedGroupForJob,
          class_id: selectedClass,
          job: selectedJob.title,
          reset,
        }),
      });

      if (response.ok) {
        await refreshGroupsAndStudents();

        setPopup({
          headline: 'Success',
          message: reset
            ? `Job "${selectedJob.title}" assigned to Group ${selectedGroupForJob}, and its work was reset.`
            : `Job changed to "${selectedJob.title}" for Group ${selectedGroupForJob}. Its work was kept.`,
        });
        setAssignJobModalOpen(false);
        setSelectedGroupForJob(null);
        setSelectedJobId(null);
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to assign job: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('Error assigning job:', error);
      setPopup({ headline: 'Error', message: 'Failed to assign job. Please try again.' });
    } finally {
      setIsAssigningJob(false);
    }
  };

  const createNewGroup = async () => {
    if (!selectedClass) return;

    setIsCreatingGroup(true);

    try {
      const maxGroupNumber = Math.max(...availableGroups, 0);
      const nextGroupNumber = maxGroupNumber + 1;

      const response = await fetch(`${API_BASE_URL}/groups/create-single-group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          class_id: selectedClass,
          group_id: nextGroupNumber,
        }),
      });

      if (response.ok) {
        await refreshGroupsAndStudents();

        setPopup({
          headline: 'Success',
          message: `Group ${nextGroupNumber} created successfully!`,
        });
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to create group: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('Error creating group:', error);
      setPopup({ headline: 'Error', message: 'Failed to create group. Please try again.' });
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const reassignStudent = async (studEmail: string, newGroup: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/groups/reassign-student`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: studEmail,
          new_group_id: newGroup,
          class_id: selectedClass,
        }),
      });

      if (response.ok) {
        await refreshGroupsAndStudents();

        setReassignModalOpen(false);
        setSelectedStudent(null);
        setPopup({ headline: 'Success', message: 'Student reassigned successfully!' });
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to reassign student: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('Error reassigning student:', error);
      setPopup({ headline: 'Error', message: 'Failed to reassign student. Please try again.' });
    }
  };

  const addStudentToGroup = async () => {
    if (!addStudentEmail || !addStudentGroupId) return;
    setIsAddingStudent(true);
    try {
      const response = await fetch(`${API_BASE_URL}/groups/add-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: addStudentEmail,
          class_id: selectedClass,
          group_id: addStudentGroupId,
        }),
      });
      if (response.ok) {
        await refreshGroupsAndStudents();
        setPopup({ headline: 'Success', message: 'Student added successfully!' });
        setAddStudentModalOpen(false);
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to add student: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      setPopup({
        headline: 'Error',
        message: 'Failed to add student. Please try again.',
      });
    } finally {
      setIsAddingStudent(false);
    }
  };

  const removeStudentFromGroup = async (email: string) => {
    setConfirmAction({ type: 'removeStudent', data: email });
    setConfirmModalOpen(true);
  };

  const deleteStudent = async (email: string) => {
    setConfirmAction({ type: 'deleteStudent', data: email });
    setConfirmModalOpen(true);
  };

  const startAllGroups = async () => {
    setConfirmAction({ type: 'startAllGroups', data: null });
    setConfirmModalOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    setConfirmModalOpen(false);

    switch (confirmAction.type) {
      case 'removeStudent':
        await executeRemoveStudent(confirmAction.data);
        break;
      case 'deleteStudent':
        await executeDeleteStudent(confirmAction.data);
        break;
      case 'startAllGroups':
        await executeStartAllGroups();
        break;
    }

    setConfirmAction(null);
  };

  const executeRemoveStudent = async (email: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/groups/remove-from-group`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email,
          class_id: selectedClass,
        }),
      });

      if (response.ok) {
        await refreshGroupsAndStudents();

        setPopup({ headline: 'Success', message: 'Student removed from group successfully!' });
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to remove student: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('Error removing student:', error);
      setPopup({ headline: 'Error', message: 'Failed to remove student. Please try again.' });
    }
  };

  const executeDeleteStudent = async (email: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/groups/delete-student`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          class_id: selectedClass,
        }),
      });
      if (response.ok) {
        await refreshGroupsAndStudents();

        setPopup({ headline: 'Success', message: 'Student deleted successfully!' });
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to delete student: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      setPopup({ headline: 'Error', message: 'Failed to delete student. Please try again.' });
    }
  };

  const executeStartAllGroups = async () => {
    setIsStartingAll(true);

    try {
      const response = await fetch(`${API_BASE_URL}/groups/start-all-groups`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          class_id: selectedClass,
        }),
      });

      if (response.ok) {
        setGroups((prev) => prev.map((group) => ({ ...group, isStarted: true })));
        setPopup({ headline: 'Success', message: 'All groups started successfully!' });
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to start all groups: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('Error starting all groups:', error);
      setPopup({ headline: 'Error', message: 'Failed to start all groups. Please try again.' });
    } finally {
      setIsStartingAll(false);
    }
  };

  const startGroup = async (groupId: number) => {
    setStartingGroups((prev) => new Set(prev).add(groupId));

    try {
      const response = await fetch(`${API_BASE_URL}/groups/start-group`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          group_id: groupId,
          class_id: selectedClass,
        }),
      });

      if (response.ok) {
        setGroups((prev) =>
          prev.map((group) => (group.group_id === groupId ? { ...group, isStarted: true } : group))
        );
        setPopup({ headline: 'Success', message: `Group ${groupId} started successfully!` });
      } else {
        const errorData = await response.json();
        setPopup({
          headline: 'Error',
          message: `Failed to start group: ${errorData.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('Error starting group:', error);
      setPopup({ headline: 'Error', message: 'Failed to start group. Please try again.' });
    } finally {
      setStartingGroups((prev) => {
        const newSet = new Set(prev);
        newSet.delete(groupId);
        return newSet;
      });
    }
  };

  const openPopupModal = async (groupId: number) => {
    setSelectedGroupForPopup(groupId);
    setSendPopupModalOpen(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/candidates/by-groups/${selectedClass}/${groupId}`,
        {
          credentials: 'include',
        }
      );

      if (response.ok) {
        const candidatesData = await response.json();
        const formattedCandidates = candidatesData.map((candidate: any) => ({
          id: candidate.id || candidate.resume_id,
          name: `${candidate.f_name} ${candidate.l_name}`,
        }));
        setAvailableCandidates(formattedCandidates);
      }
    } catch (error) {
      console.error('Error fetching candidates:', error);
      setAvailableCandidates([]);
    }
  };

  const handlePresetSelection = (presetTitle: string) => {
    setSelectedPreset(presetTitle);
    const preset = presetPopups.find((p) => p.title === presetTitle);
    if (preset) {
      setPopupHeadline(preset.headline);
      setPopupMessage(preset.message);
    }
    setSelectedCandidateForPopup('');
  };

  const handleCandidateSelectionForPopup = (candidateId: string) => {
    setSelectedCandidateForPopup(candidateId);
    if (selectedPreset) {
      const preset = presetPopups.find((p) => p.title === selectedPreset);
      const candidate = availableCandidates.find((c) => c.id.toString() === candidateId);

      if (preset && candidate) {
        const messageWithName = preset.message.replace('{candidateName}', candidate.name);
        setPopupMessage(messageWithName);
      }
    }
  };

  const sendPopupToGroup = async () => {
    if (!popupHeadline || !popupMessage || !selectedGroupForPopup) {
      setPopup({ headline: 'Error', message: 'Please fill in all fields.' });
      return;
    }

    if (!socket) {
      setPopup({ headline: 'Error', message: 'Socket not connected. Please refresh the page.' });
      return;
    }

    const selectedPresetData = presetPopups.find((p) => p.title === selectedPreset);
    if (selectedPresetData && !selectedCandidateForPopup) {
      setPopup({ headline: 'Error', message: 'Please select a candidate for this preset popup.' });
      return;
    }

    setIsSendingPopup(true);

    try {
      if (selectedPresetData?.vote) {
        socket.emit('updateRatingsWithPresetBackend', {
          classId: selectedClass,
          groupId: selectedGroupForPopup,
          vote: selectedPresetData.vote,
          candidateId: selectedCandidateForPopup,
          isNoShow: selectedPresetData.title === 'No Show',
        });
      }

      const selectedCandidateData = availableCandidates.find(
        (c) => c.id.toString() === selectedCandidateForPopup
      );
      const candidateName = selectedCandidateData
        ? selectedCandidateData.name
        : `Candidate ${selectedCandidateForPopup}`;

      socket.emit('sendPopupToGroups', {
        groups: [selectedGroupForPopup.toString()],
        headline: popupHeadline,
        message: popupMessage,
        class: selectedClass,
        candidateId: selectedCandidateForPopup,
        candidateName: candidateName,
      });

      setPopup({
        headline: 'Success',
        message: selectedCandidateData
          ? `Popup sent successfully to Group ${selectedGroupForPopup} about ${candidateName}!`
          : `Popup sent successfully to Group ${selectedGroupForPopup}!`,
      });

      setSendPopupModalOpen(false);
      setPopupHeadline('');
      setPopupMessage('');
      setSelectedPreset('');
      setSelectedCandidateForPopup('');
    } catch (error) {
      console.error('Error sending popup:', error);
      setPopup({ headline: 'Error', message: 'Failed to send popup. Please try again.' });
    } finally {
      setIsSendingPopup(false);
    }
  };

  const respondToOffer = async (
    classId: number,
    groupId: number,
    candidateId: number,
    accepted: boolean,
    candidateName?: string,
    offerId?: number
  ) => {
    try {
      let actualOfferId = offerId;
      if (!actualOfferId) {
        const response = await fetch(`${API_BASE_URL}/offers/group/${groupId}/class/${classId}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const offers = await response.json();
          const pendingOffer = offers.find(
            (offer: any) => offer.candidate_id === candidateId && offer.status === 'pending'
          );
          if (pendingOffer) {
            actualOfferId = pendingOffer.id;
          }
        }
      }

      if (!actualOfferId) {
        throw new Error('Offer ID not found');
      }

      const updateResponse = await fetch(`${API_BASE_URL}/offers/${actualOfferId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          status: accepted ? 'accepted' : 'rejected',
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update offer status');
      }

      if (!socket) {
        throw new Error('Socket not connected');
      }

      socket.emit('makeOfferResponse', { classId, groupId, candidateId, accepted });

      setPendingOffers((prev) =>
        prev.filter(
          (o) => !(o.classId === classId && o.groupId === groupId && o.candidateId === candidateId)
        )
      );

      if (accepted && candidateName) {
        setAcceptedOffers((prev) => [...prev, { groupId, candidateName }]);
      }

      const candidateDisplayName = candidateName || `Candidate ${candidateId}`;
      setPopup({
        headline: 'Success',
        message: `Offer for ${candidateDisplayName} ${accepted ? 'accepted' : 'rejected'} successfully!`,
      });
    } catch (error) {
      console.error('Error responding to offer:', error);
      setPopup({
        headline: 'Error',
        message: 'Failed to respond to offer. Please try again.',
      });
    }
  };

  if (userloading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 font-sans">
        <div className="max-w-7xl mx-auto p-4">
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
      <div className="flex flex-col h-full overflow-auto bg-gray-50 font-sans">
        <div className="w-full p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Access Denied</h2>
            <p className="text-gray-600">You must be logged in to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isNotTeacher) {
    return (
      <div className="flex flex-col h-full overflow-auto bg-gray-50 font-sans">
        <div className="w-full p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Access Denied</h2>
            <p className="text-gray-600">
              You must be a teacher to access this page. Returning you to the home page...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 font-sans">
      <div className="w-full p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 w-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">📚 Manage Groups 📚</h1>
            {selectedClass && (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={createNewGroup}
                  disabled={isCreatingGroup}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${isCreatingGroup ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-white hover:text-red-600 border-2 border-red-600'}`}
                >
                  {isCreatingGroup ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                      Creating...
                    </div>
                  ) : (
                    '➕ New Group'
                  )}
                </button>
                {groups.length > 0 && (
                  <>
                    <button
                      onClick={startAllGroups}
                      disabled={isStartingAll || groups.every((g) => g.isStarted)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${isStartingAll || groups.every((g) => g.isStarted) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-white hover:text-red-600 border-2 border-red-600'}`}
                    >
                      {isStartingAll ? (
                        <div className="flex items-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                          Starting All...
                        </div>
                      ) : (
                        '🚀 Start All Groups'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedGroupForJob(null);
                        setAssignJobModalOpen(true);
                      }}
                      disabled={availableGroups.filter((g) => g !== -1).length === 0}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${availableGroups.filter((g) => g !== -1).length === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-white hover:text-red-600 border-2 border-red-600'}`}
                    >
                      💼 Assign Job to All Groups
                    </button>
                    <button
                      onClick={downloadCSV}
                      disabled={!selectedClass}
                      className="px-4 py-2 rounded-lg font-medium transition-colors bg-red-600 text-white hover:bg-white hover:text-red-600 border-2 border-red-600"
                    >
                      📥 Download CSV
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <ClassPicker
            classes={classes}
            selectedClass={selectedClass}
            onChange={handleClassChange}
          />

          {selectedClass && groups.length > 0 && !isLoadingGroups && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  Class Groups ({groups.length} groups, {students.length} students total)
                </h2>
              </div>
              <div className="flex justify-center">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 w-full gap-4">
                  {groups.map((group) => {
                    const groupOffer = pendingOffers.find(
                      (o) => o.groupId === group.group_id && o.classId === Number(selectedClass)
                    );
                    const acceptedOffer = acceptedOffers.find((o) => o.groupId === group.group_id);

                    return (
                      <GroupCard
                        key={group.group_id}
                        group={group}
                        groupOffer={groupOffer}
                        acceptedOffer={acceptedOffer}
                        isDismissed={dismissedOffers.has(group.group_id)}
                        scrollState={scrollStates[group.group_id]}
                        isStarting={startingGroups.has(group.group_id)}
                        respondToOffer={respondToOffer}
                        onScroll={(e) => handleScroll(e, group.group_id)}
                        onDismiss={() =>
                          setDismissedOffers((prev) => new Set(prev).add(group.group_id))
                        }
                        onToggleDismissed={() =>
                          setDismissedOffers((prev) => {
                            const newSet = new Set(prev);
                            if (newSet.has(group.group_id)) {
                              newSet.delete(group.group_id);
                            } else {
                              newSet.add(group.group_id);
                            }
                            return newSet;
                          })
                        }
                        onReassign={(student) => {
                          setSelectedStudent(student);
                          setNewGroupId(availableGroups.length > 0 ? availableGroups[0] : 1);
                          setReassignModalOpen(true);
                        }}
                        onRemove={removeStudentFromGroup}
                        onDelete={deleteStudent}
                        onAddStudent={() => {
                          setAddStudentGroupId(group.group_id);
                          setAddStudentEmail('');
                          setAddStudentModalOpen(true);
                        }}
                        onAssignJob={() => {
                          setSelectedGroupForJob(group.group_id);
                          setAssignJobModalOpen(true);
                        }}
                        onSendPopup={() => openPopupModal(group.group_id)}
                        onStart={() => startGroup(group.group_id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {selectedClass && isLoadingGroups && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-red-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading group information...</p>
              </div>
            </div>
          )}

          {selectedClass && groups.length === 0 && !isLoadingGroups && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-lg">No groups found for this class.</p>
              <p className="text-gray-400 text-sm mt-2">
                Students need to be imported via CSV first.
              </p>
            </div>
          )}

          {!selectedClass && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-lg">Select a class to manage groups.</p>
            </div>
          )}
        </div>
      </div>

      {assignJobModalOpen && (
        <AssignJobModal
          groupId={selectedGroupForJob}
          jobs={availableJobs}
          selectedJobId={selectedJobId}
          onSelectJob={setSelectedJobId}
          groupCount={availableGroups.filter((g) => g !== -1).length}
          isAssigning={isAssigningJob}
          onChangeJob={() =>
            selectedGroupForJob ? assignJobToGroup(false) : assignJobToAllGroups(false)
          }
          onReset={() => setConfirmResetOpen(true)}
          onCancel={() => {
            setAssignJobModalOpen(false);
            setSelectedGroupForJob(null);
            setSelectedJobId(null);
          }}
        />
      )}

      {assignJobModalOpen && confirmResetOpen && selectedJobId && (
        <ResetWorkConfirmModal
          classId={selectedClass}
          groupId={selectedGroupForJob}
          jobTitle={availableJobs.find((job) => job.id === selectedJobId)?.title ?? ''}
          isWorking={isAssigningJob}
          onConfirm={async () => {
            await (selectedGroupForJob ? assignJobToGroup(true) : assignJobToAllGroups(true));
            setConfirmResetOpen(false);
          }}
          onCancel={() => setConfirmResetOpen(false)}
        />
      )}

      {sendPopupModalOpen && (
        <SendPopupModal
          groupId={selectedGroupForPopup}
          presets={presetPopups}
          selectedPreset={selectedPreset}
          onSelectPreset={handlePresetSelection}
          candidates={availableCandidates}
          selectedCandidate={selectedCandidateForPopup}
          onSelectCandidate={handleCandidateSelectionForPopup}
          headline={popupHeadline}
          onHeadlineChange={setPopupHeadline}
          message={popupMessage}
          onMessageChange={setPopupMessage}
          isSending={isSendingPopup}
          onSend={sendPopupToGroup}
          onCancel={() => {
            setSendPopupModalOpen(false);
            setPopupHeadline('');
            setPopupMessage('');
            setSelectedPreset('');
            setSelectedCandidateForPopup('');
          }}
        />
      )}

      {/* Add Student Modal */}
      {addStudentModalOpen && (
        <AddStudentModal
          groupId={addStudentGroupId}
          email={addStudentEmail}
          onEmailChange={setAddStudentEmail}
          isAdding={isAddingStudent}
          onAdd={addStudentToGroup}
          onCancel={() => setAddStudentModalOpen(false)}
        />
      )}

      {/* Confirm Action Modal */}
      {confirmModalOpen && (
        <ConfirmActionModal
          actionType={confirmAction?.type}
          onConfirm={handleConfirmAction}
          onCancel={() => {
            setConfirmModalOpen(false);
            setConfirmAction(null);
          }}
        />
      )}

      {/* Reassign Student Modal */}
      {reassignModalOpen && selectedStudent && (
        <ReassignStudentModal
          student={selectedStudent}
          groups={groups}
          availableGroups={availableGroups}
          newGroupId={newGroupId}
          onSelectGroup={setNewGroupId}
          onReassign={() => reassignStudent(selectedStudent.email, newGroupId)}
          onCancel={() => {
            setReassignModalOpen(false);
            setSelectedStudent(null);
          }}
        />
      )}

      {/* Popup */}
      {popup && (
        <Popup headline={popup.headline} message={popup.message} onDismiss={() => setPopup(null)} />
      )}
    </div>
  );
}
