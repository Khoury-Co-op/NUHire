'use client';
export const dynamic = 'force-dynamic';
import { API_BASE_URL } from '../../lib/api';
import React, { useEffect, useRef, useState } from 'react';
import NavbarAdmin from '../components/navbar-admin';
import Popup from '../components/popup';
import { useAuth } from '../components/AuthContext';
import { useSocket } from '../components/socketContext';
import { STEP_LABEL, STEP_ORDER } from '../components/useProgress';
import type { ClassInfo, LiveStudent, Step } from '../../types';

// The gates saved server-side. Offer confirmations live only in the browser.
const GATE_FIELD: Partial<Record<Step, 'review_completed_at' | 'confirmed_at'>> = {
  res_1: 'review_completed_at',
  res_2: 'confirmed_at',
};

// Only these pages listen for moveGroup. Anywhere else force-advance writes the
// rows but nobody's screen moves, so the button would report a fake success.
const UNSTICK_STEPS: Step[] = ['res_1', 'res_2', 'interview'];

const LiveClass = () => {
  const { user, loading: userloading } = useAuth();
  const socket = useSocket();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState<LiveStudent[]>([]);
  const [groupSteps, setGroupSteps] = useState<Record<number, Step>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  // The target is fixed when the dialog opens. Recomputing it on Confirm could
  // skip a step if the group moved on while the dialog was open.
  const [unstick, setUnstick] = useState<{
    classId: string;
    groupId: number;
    from: Step;
    to: Step;
  } | null>(null);
  // Set when a refresh fails, so a stale board doesn't look current.
  const [refreshError, setRefreshError] = useState(false);
  // Polls and socket refreshes overlap; only the newest response may land.
  const latestRequest = useRef(0);
  const [unsticking, setUnsticking] = useState(false);
  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);

  useEffect(() => {
    if (!user?.email) return;

    const fetchClasses = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/moderator/classes-full/${user.email}`, {
          credentials: 'include',
        });
        if (response.ok) {
          setClasses(await response.json());
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      }
    };

    fetchClasses();
  }, [user?.email]);

  // Polled as well as refreshed over the socket, so a dropped socket cannot leave the page stale.
  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;

    const fetchLiveClass = async () => {
      const requestId = ++latestRequest.current;
      try {
        const response = await fetch(`${API_BASE_URL}/groups/live/${selectedClass}`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`live ${response.status}`);
        const data: LiveStudent[] = await response.json();

        const groupIds = [...new Set(data.map((student) => student.group_id))];
        const steps = await Promise.all(
          groupIds.map(async (groupId) => {
            const progressResponse = await fetch(
              `${API_BASE_URL}/groups/getProgress/${selectedClass}/${groupId}`,
              { credentials: 'include' }
            );
            if (!progressResponse.ok) throw new Error(`getProgress ${progressResponse.status}`);
            const { progress }: { progress: Step } = await progressResponse.json();
            return [groupId, progress] as const;
          })
        );

        if (cancelled || requestId !== latestRequest.current) return;
        setStudents(data);
        setGroupSteps(Object.fromEntries(steps));
        setRefreshError(false);
      } catch (error) {
        console.error('Error fetching live class:', error);
        if (!cancelled && requestId === latestRequest.current) setRefreshError(true);
      }
    };

    fetchLiveClass();
    const timer = setInterval(fetchLiveClass, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedClass, refreshKey]);

  // Re-join on every connect; a reconnected socket is in no rooms.
  useEffect(() => {
    if (!socket || !user?.email) return;

    const joinAdminRoom = () => socket.emit('adminOnline', { adminEmail: user.email });

    // A class-wide step change sends ~30 events. Refresh once after they settle,
    // and only for the class on screen.
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const handleProgressUpdated = (data?: { crn?: number | string }) => {
      if (data?.crn !== undefined && String(data.crn) !== selectedClass) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => setRefreshKey((key) => key + 1), 1000);
    };

    if (socket.connected) joinAdminRoom();
    socket.on('connect', joinAdminRoom);
    socket.on('progressUpdated', handleProgressUpdated);

    return () => {
      clearTimeout(refreshTimer);
      socket.off('connect', joinAdminRoom);
      socket.off('progressUpdated', handleProgressUpdated);
    };
  }, [socket, user?.email, selectedClass]);

  const studentName = (student: LiveStudent) =>
    [student.f_name, student.l_name].filter(Boolean).join(' ') || student.email;

  const nextStep = (groupId: number) =>
    STEP_ORDER[STEP_ORDER.indexOf(groupSteps[groupId]) + 1] as Step | undefined;

  const waitingOn = (groupId: number) => {
    const gateField = GATE_FIELD[groupSteps[groupId]];
    return gateField
      ? students.filter(
          (student) =>
            student.group_id === groupId &&
            student.present_at !== null &&
            student[gateField] === null
        )
      : [];
  };

  const handleUnstick = async () => {
    if (!unstick) return;
    const { groupId, to: targetStep } = unstick;

    setUnsticking(true);
    try {
      const response = await fetch(`${API_BASE_URL}/groups/force-advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          class_id: unstick.classId,
          group_id: groupId,
          target_step: targetStep,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setPopup({
          headline: 'Success',
          message: `Group ${groupId} moved to ${STEP_LABEL[targetStep]}.`,
        });
      } else {
        setPopup({ headline: 'Error', message: data.error || 'Failed to unstick group.' });
      }
    } catch (error) {
      console.error('Error unsticking group:', error);
      setPopup({ headline: 'Error', message: 'Failed to unstick group.' });
    } finally {
      setUnsticking(false);
      setUnstick(null);
      setRefreshKey((key) => key + 1);
    }
  };

  if (userloading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sand">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Loading...</h2>
          <div className="w-16 h-16 border-t-4 border-navy border-solid rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!user || user.affiliation !== 'admin') {
    return <div>This account is not authorized for this page</div>;
  }

  const groupIds = [...new Set(students.map((student) => student.group_id))];

  return (
    <div className="flex flex-col min-h-screen bg-sand font-rubik">
      <NavbarAdmin />
      <div className="flex justify-center items-center py-6">
        <h1 className="text-4xl font-bold text-northeasternBlack text-center drop-shadow-lg">
          Live Class
        </h1>
      </div>

      <div className="flex-1 p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Class:</label>
          <select
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setStudents([]);
              setGroupSteps({});
            }}
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

        {refreshError && (
          <p className="mb-4 p-3 rounded-lg bg-red-100 text-red-800 text-sm">
            Could not refresh the board. What you see may be out of date; retrying every 10 seconds.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupIds.map((groupId) => {
            const members = students.filter((student) => student.group_id === groupId);
            const present = members.filter((member) => member.present_at !== null);
            const waiting = waitingOn(groupId);
            const next = nextStep(groupId);
            const step = groupSteps[groupId];
            const canUnstick = members[0].started === 1 && !!next && UNSTICK_STEPS.includes(step);
            // Only flag a group that is partly done; at the start of a step everyone is waiting.
            const stuck = waiting.length > 0 && waiting.length < present.length;

            return (
              <div
                key={groupId}
                className={`bg-white rounded-lg shadow-sm p-6 flex flex-col ${stuck ? 'border-4 border-yellow-500' : 'border border-gray-200'}`}
              >
                <h3 className="text-lg font-semibold text-gray-900">Group {groupId}</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {STEP_LABEL[groupSteps[groupId] ?? 'none']}
                </p>

                {stuck && (
                  <p className="text-sm text-yellow-800 mb-4">
                    {present.length - waiting.length} of {present.length} done. Waiting on:{' '}
                    {waiting.map(studentName).join(', ')}
                  </p>
                )}

                <ul className="flex-1 mb-4">
                  {members.map((member) => (
                    <li key={member.id} className="flex items-center gap-2 py-1 text-sm">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${member.online ? 'bg-green-500' : 'bg-gray-300'}`}
                        title={member.online ? 'Online' : 'Offline'}
                      />
                      <span>{studentName(member)}</span>
                      <span className="ml-auto text-gray-500">
                        {member.present_at === null
                          ? 'Not signed in'
                          : STEP_LABEL[member.step ?? 'none']}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() =>
                    next && setUnstick({ classId: selectedClass, groupId, from: step, to: next })
                  }
                  disabled={!canUnstick}
                  className="px-4 py-2 rounded-lg font-medium transition-colors bg-red-600 text-white hover:bg-white hover:text-red-600 border-2 border-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {next ? `Unstick → ${STEP_LABEL[next]}` : 'At the last step'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {unstick && (
        <Popup
          headline={`Unstick Group ${unstick.groupId}?`}
          message={`Everyone in the group is marked done with ${STEP_LABEL[unstick.from]} and moved on to ${STEP_LABEL[unstick.to]}. No work is deleted.${
            waitingOn(unstick.groupId).length > 0
              ? ` Not finished yet: ${waitingOn(unstick.groupId).map(studentName).join(', ')}.`
              : ''
          }`}
          onDismiss={() => setUnstick(null)}
          onConfirm={handleUnstick}
          confirmLabel={unsticking ? 'Moving...' : 'Unstick'}
          busy={unsticking}
        />
      )}

      {popup && (
        <Popup headline={popup.headline} message={popup.message} onDismiss={() => setPopup(null)} />
      )}
    </div>
  );
};

export default LiveClass;
