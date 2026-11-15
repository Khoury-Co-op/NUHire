'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { ClassInfo, Group, Student, User } from '../../../types';
import { API_BASE_URL } from '../../../lib/api';

// The teacher panel's class, roster and group data: what the class picker
// selects and what the group cards are drawn from.
export function useClassGroups(
  socket: Socket | null,
  user: User | null,
  setPopup: (popup: { headline: string; message: string } | null) => void
) {
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [availableGroups, setAvailableGroups] = useState<number[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);

  const fetchGroupJobAndProgress = useCallback(async (groupId: number, classId: string) => {
    try {
      const jobResponse = await fetch(`${API_BASE_URL}/jobs/assignment/${groupId}/${classId}`, {
        credentials: 'include',
      });

      let jobAssignment = 'No job assigned';
      if (jobResponse.ok) {
        const jobData = await jobResponse.json();
        jobAssignment = jobData.job || 'No job assigned';
      }

      const progressResponse = await fetch(
        `${API_BASE_URL}/groups/getProgress/${classId}/${groupId}`,
        {
          credentials: 'include',
        }
      );

      let progress = 'none';
      if (progressResponse.ok) {
        const progressData = await progressResponse.json();
        progress = progressData.progress || 'none';
      }

      return { jobAssignment, progress };
    } catch (error) {
      console.error(`Error fetching job/progress for group ${groupId}:`, error);
      return { jobAssignment: 'No job assigned', progress: 'none' };
    }
  }, []);

  const fetchGroupStartStatuses = useCallback(async (classId: string, groupIds: number[]) => {
    const statusPromises = groupIds.map(async (groupId) => {
      try {
        const response = await fetch(`${API_BASE_URL}/groups/started/${classId}/${groupId}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          return { groupId, started: data.started };
        } else {
          console.error(`Failed to fetch status for group ${groupId}`);
          return { groupId, started: false };
        }
      } catch (error) {
        console.error(`Error fetching status for group ${groupId}:`, error);
        return { groupId, started: false };
      }
    });

    const statuses = await Promise.all(statusPromises);
    return statuses;
  }, []);

  const organizeStudentsIntoGroups = useCallback(
    async (studentList: Student[], groupIds: number[]) => {
      setIsLoadingGroups(true);

      const groupMap = new Map<number | null, Student[]>();

      groupIds.forEach((groupId) => {
        groupMap.set(groupId, []);
      });

      studentList.forEach((student) => {
        const groupKey = student.group_id;
        if (groupKey !== null && groupIds.includes(groupKey)) {
          groupMap.get(groupKey)!.push(student);
        } else if (groupKey === null) {
          if (!groupMap.has(null)) {
            groupMap.set(null, []);
          }
          groupMap.get(null)!.push(student);
        }
      });

      const groupsArray: Group[] = [];

      const startStatuses = selectedClass
        ? await fetchGroupStartStatuses(selectedClass, groupIds)
        : [];
      const jobProgressPromises = groupIds.map((groupId) =>
        fetchGroupJobAndProgress(groupId, selectedClass)
      );
      const jobProgressData = await Promise.all(jobProgressPromises);

      groupIds.forEach((groupId, index) => {
        const students = groupMap.get(groupId) || [];
        const statusInfo = startStatuses.find((s) => s.groupId === groupId);
        const { jobAssignment, progress } = jobProgressData[index];

        groupsArray.push({
          group_id: groupId,
          students: students.sort((a, b) => {
            const aName = a.f_name || '';
            const bName = b.f_name || '';
            return aName.localeCompare(bName);
          }),
          isStarted: statusInfo ? statusInfo.started : false,
          jobAssignment,
          progress,
        });
      });

      const ungroupedStudents = groupMap.get(null) || [];
      if (ungroupedStudents.length > 0) {
        groupsArray.push({
          group_id: -1,
          students: ungroupedStudents.sort((a, b) => {
            const aName = a.f_name || '';
            const bName = b.f_name || '';
            return aName.localeCompare(bName);
          }),
          isStarted: false,
          jobAssignment: 'N/A',
          progress: 'N/A',
        });
      }

      groupsArray.sort((a, b) => {
        if (a.group_id === -1) return 1;
        if (b.group_id === -1) return -1;
        return a.group_id - b.group_id;
      });

      setGroups(groupsArray);
      setIsLoadingGroups(false);
    },
    [selectedClass, fetchGroupStartStatuses, fetchGroupJobAndProgress]
  );

  const refreshGroupsAndStudents = useCallback(async () => {
    if (!selectedClass) return;

    try {
      const [studentResponse, groupsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/groups/students-by-class/${selectedClass}`, {
          credentials: 'include',
        }),
        fetch(`${API_BASE_URL}/groups?class=${selectedClass}`, {
          credentials: 'include',
        }),
      ]);

      if (studentResponse.ok && groupsResponse.ok) {
        const studentData = await studentResponse.json();
        const groupData = await groupsResponse.json();

        const groupNumbers = Array.isArray(groupData)
          ? groupData.map(Number).sort((a, b) => a - b)
          : [];

        setStudents(studentData);
        setAvailableGroups(groupNumbers);

        if (groupNumbers.length > 0) {
          await organizeStudentsIntoGroups(studentData, groupNumbers);
        }
      }
    } catch (error) {
      console.error('Error refreshing groups and students:', error);
    }
  }, [selectedClass, organizeStudentsIntoGroups]);

  useEffect(() => {
    if (!socket) return;

    // A socket that dropped missed every roster change while it was down, so
    // reload the roster when it reconnects as well as when a student joins.
    const handleRosterChanged = () => {
      refreshGroupsAndStudents();
    };

    socket.on('userAdded', handleRosterChanged);
    socket.on('connect', handleRosterChanged);

    return () => {
      socket.off('userAdded', handleRosterChanged);
      socket.off('connect', handleRosterChanged);
    };
  }, [socket, refreshGroupsAndStudents]);

  useEffect(() => {
    if (!socket || !selectedClass) return;

    const handleProgressUpdated = async (data: {
      crn: string;
      group_id: number;
      step: string;
      email: string;
    }) => {
      if (data.crn.toString() === selectedClass) {
        try {
          const progress = data.step;

          const jobResponse = await fetch(
            `${API_BASE_URL}/jobs/assignment/${data.group_id}/${selectedClass}`,
            {
              credentials: 'include',
            }
          );

          let jobAssignment = 'No job assigned';
          if (jobResponse.ok) {
            const jobData = await jobResponse.json();
            jobAssignment = jobData.job || 'No job assigned';
          }

          setGroups((prevGroups) =>
            prevGroups.map((group) =>
              group.group_id === data.group_id ? { ...group, progress, jobAssignment } : group
            )
          );
        } catch (error) {
          console.error('Error refreshing progress:', error);
        }
      }
    };

    socket.on('progressUpdated', handleProgressUpdated);

    return () => {
      socket.off('progressUpdated', handleProgressUpdated);
    };
  }, [socket, selectedClass]);

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

  useEffect(() => {
    const fetchAvailableGroups = async () => {
      if (!selectedClass) {
        setAvailableGroups([]);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/groups?class=${selectedClass}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const groupData = await response.json();
          const groupNumbers = Array.isArray(groupData)
            ? groupData.map(Number).sort((a, b) => a - b)
            : [];
          setAvailableGroups(groupNumbers);
        }
      } catch (error) {
        console.error('Error fetching available groups:', error);
        setAvailableGroups([]);
      }
    };

    fetchAvailableGroups();
  }, [selectedClass]);

  useEffect(() => {
    const fetchStudentsAndOrganize = async () => {
      if (!selectedClass) {
        setStudents([]);
        setGroups([]);
        setIsLoadingGroups(false);
        return;
      }

      if (availableGroups.length === 0) {
        setIsLoadingGroups(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/groups/students-by-class/${selectedClass}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const studentData = await response.json();
          setStudents(studentData);
          await organizeStudentsIntoGroups(studentData, availableGroups);
        } else {
          setIsLoadingGroups(false);
        }
      } catch (error) {
        console.error('Error fetching students:', error);
        setIsLoadingGroups(false);
      }
    };

    fetchStudentsAndOrganize();
  }, [selectedClass, availableGroups, organizeStudentsIntoGroups]);

  const handleClassChange = (classId: string) => {
    const hasAccess = classes.some((cls) => cls.crn.toString() === classId);

    if (!hasAccess && classId !== '') {
      setPopup({
        headline: 'Access Denied',
        message: 'You do not have permission to manage this class.',
      });
      return;
    }

    if (classId !== '') {
      setIsLoadingGroups(true);
    }
    setAvailableGroups([]);
    setGroups([]);
    setStudents([]);
    setSelectedClass(classId);
  };

  return {
    selectedClass,
    classes,
    groups,
    setGroups,
    students,
    availableGroups,
    isLoadingGroups,
    refreshGroupsAndStudents,
    handleClassChange,
  };
}
