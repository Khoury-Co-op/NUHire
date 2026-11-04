import { Server as SocketIOServer, Socket } from 'socket.io';
import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2';
import { SocketEvents } from '../models/SocketEvents';
import { isAdmin } from '../models/User';
import { BarrierStatus, PresentMember, StepCompletion } from '../models/Barrier';
import { dbNow } from './database';

// Advisors join a room named after their own email (see 'adminOnline' below),
// so notifying a class's teachers is one emit per Moderator row for that CRN.
// Use this where the advisor dashboard needs to hear about something; it is
// never in the group room, and io.emit would reach every client in every class.
export function emitToClassModerators(
  io: SocketIOServer,
  db: Pool,
  classId: number | string,
  event: string,
  payload?: unknown
): void {
  db.query('SELECT admin_email FROM Moderator WHERE crn = ?', [classId], (err, results) => {
    if (err) {
      console.error(`Could not look up moderators for class ${classId}:`, err);
      return;
    }
    (results as RowDataPacket[]).forEach(({ admin_email }) => {
      io.to(admin_email).emit(event, payload);
    });
  });
}

// The authenticated user behind a socket, populated by the io.use below from
// the session that app.ts runs over the handshake.
interface SocketUser {
  id: number;
  email: string;
  affiliation: 'student' | 'admin' | 'none';
  group_id?: number;
  class?: number;
}

// The student behind a socket and the group they are in right now, which is
// what every student event acts on.
interface SocketStudent {
  id: number;
  email: string;
  groupId: number;
  classId: number;
  room: string;
}

// The only barrier the class waits on today: every member of a group must
// finish their own resume review before res-review-group opens. Spelled with
// the `Progress`.`step` vocabulary because `Step_Completion`.`step` stores it,
// and a second spelling would record a completion nobody looks for.
export const RES_REVIEW_BARRIER_STEP = 'res_1';

// Who a group waits for: students on its roster who have had the app open since
// the group was started, so one absent student cannot hold everyone else. Every
// gate counts members through this, so they cannot disagree about the total.
export async function presentMembers(
  db: Pool,
  classId: number | string,
  groupId: number | string
): Promise<PresentMember[]> {
  const [rows] = await db.promise().query<(RowDataPacket & PresentMember)[]>(
    `SELECT id, email, present_at FROM Users
      WHERE group_id = ? AND class = ? AND affiliation = 'student' AND present_at IS NOT NULL`,
    [groupId, classId]
  );
  return rows;
}

// The members a frontend gate compares against: whoever is present, or the
// whole roster when nobody is stamped yet. Zero present happens when no stamp
// has landed since the group started (the socket may carry no session), and
// reporting 0 would open every `count >= size` gate on the client at 0 of 0.
export async function gateMemberIds(
  db: Pool,
  classId: number | string,
  groupId: number | string
): Promise<number[]> {
  const present = await presentMembers(db, classId, groupId);
  if (present.length > 0) return present.map((member) => member.id);

  const [roster] = await db
    .promise()
    .query<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM Users WHERE group_id = ? AND class = ? AND affiliation = 'student'",
      [groupId, classId]
    );
  return roster.map((row) => row.id);
}

// Count this user toward their group's gates from now on (see presentMembers).
// Keeping the first stamp is what lets the barrier tell a late arrival from
// someone who was there all along, so calling it again is a no-op.
//
// The first stamp changes the group's size, so tell the group: every gate page
// re-reads the size on studentAddedToGroup.
export async function markPresent(
  io: SocketIOServer,
  db: Pool,
  user: { id: number; group_id?: number | null; class?: number | null }
): Promise<void> {
  const [result] = await db
    .promise()
    .query<ResultSetHeader>('UPDATE Users SET present_at = ? WHERE id = ? AND present_at IS NULL', [
      dbNow(),
      user.id,
    ]);
  const { group_id: groupId, class: classId } = user;
  if (result.affectedRows === 0 || !groupId || !classId) return;
  io.to(`group_${groupId}_class_${classId}`).emit('studentAddedToGroup', { groupId, classId });
}

// Has every present member of (group_id, class) recorded `step`?
//
// Answered by query every time instead of from a cached count, so the answer
// survives an API restart and can be asked as often as anyone needs: on
// completion, on room join, on a roster change, and from the barrier-status
// poll.
export async function evaluateGroupBarrier(
  db: Pool,
  classId: number | string,
  groupId: number | string,
  step: string
): Promise<BarrierStatus> {
  const members = await presentMembers(db, classId, groupId);

  const [completions] = await db
    .promise()
    .query<(RowDataPacket & StepCompletion)[]>(
      'SELECT student_id, completed_at FROM Step_Completion WHERE group_id = ? AND class = ? AND step = ?',
      [groupId, classId, step]
    );

  return summarizeBarrier(step, members, completions);
}

export function summarizeBarrier(
  step: string,
  members: PresentMember[],
  completions: StepCompletion[]
): BarrierStatus {
  // Count only completions belonging to a CURRENT member. A student moved to
  // another group mid-class leaves their row behind, and counting it would
  // release a group that still has somebody unfinished.
  const memberIds = new Set(members.map((member) => member.id));
  const doneAt = new Map(
    completions
      .filter((completion) => memberIds.has(completion.student_id))
      .map((completion) => [completion.student_id, completion.completed_at.getTime()])
  );

  // The barrier opened at the first completion by which everyone present had
  // finished. Students who arrived after that are not waited for, so a late
  // login cannot close a barrier the rest of the group already went through.
  // An empty group is unknown, not finished: releasing on 0 of 0 would walk a
  // student through a barrier before anyone in their group had shown up.
  const presentBy = (time: number) =>
    members.filter((member) => member.present_at.getTime() <= time);
  const releasedAt = [...doneAt.values()]
    .sort((a, b) => a - b)
    .find((time) => {
      const present = presentBy(time);
      return (
        present.length > 0 && present.every((member) => (doneAt.get(member.id) ?? Infinity) <= time)
      );
    });

  const counted = releasedAt === undefined ? members : presentBy(releasedAt);
  return {
    step,
    completedCount: counted.filter((member) => doneAt.has(member.id)).length,
    totalCount: counted.length,
    released: releasedAt !== undefined,
  };
}

// Re-evaluate the barrier and, if it is open, tell the group.
//
// Emitted to the room rather than to cached socket ids, and nothing is deleted
// afterwards: the answer is re-derived from MySQL on every completion, room
// join and roster change, so a student who was offline picks it up when they
// rejoin, and GET /groups/barrier-status is the same answer over HTTP for a
// client whose socket never came back.
export function broadcastGroupBarrier(
  io: SocketIOServer,
  db: Pool,
  classId: number | string,
  groupId: number | string,
  step: string
): Promise<BarrierStatus> {
  return evaluateGroupBarrier(db, classId, groupId, step).then((status) => {
    // 'groupCompletedResReview' is the res-review page's release event. Other
    // steps are recorded and counted, but no client listens for them yet, and
    // emitting this name for one would unlock a page the group is not on.
    if (status.released && step === RES_REVIEW_BARRIER_STEP) {
      io.to(`group_${groupId}_class_${classId}`).emit('groupCompletedResReview', {
        groupId: Number(groupId),
        classId: Number(classId),
        completedCount: status.completedCount,
        totalCount: status.totalCount,
        message: 'All group members have completed their individual resume reviews!',
      });
    }
    return status;
  });
}

// Read live, not from `onlineStudents`, which misses anyone who reconnected.
export async function connectedEmails(io: SocketIOServer): Promise<Set<string>> {
  const sockets = await io.fetchSockets();
  return new Set(
    sockets.flatMap((socket) => {
      const user = socket.data.user as SocketUser | undefined;
      return user?.email ? [user.email] : [];
    })
  );
}

// A socket with no login is refused. Every event handler below decides what a
// socket may do from who is logged in, and a sessionless socket would otherwise
// be the one client none of those checks can see. On unless set to exactly
// 'false', so a deploy that never sets it is protected. Turning it off is not a
// rollback: student events still need a login (see api/.env.example).
const SOCKET_AUTH_REQUIRED = process.env.SOCKET_AUTH_REQUIRED !== 'false';

export function initializeSocketHandlers(io: SocketIOServer, db: Pool): Record<string, string> {
  const onlineStudents: Record<string, string> = {};

  io.use((socket, next) => {
    const user = (socket.request as { user?: SocketUser }).user;

    if (user) {
      socket.data.user = user;
      return next();
    }

    if (SOCKET_AUTH_REQUIRED) {
      return next(new Error('Unauthorized: no session on this socket'));
    }

    // Only reached with SOCKET_AUTH_REQUIRED=false. Loud on purpose: every one
    // of these is a socket the checks below cannot police.
    console.warn(
      `Socket ${socket.id} connected with no session. Room scoping is not enforced for it.`
    );
    next();
  });

  io.on('connection', (socket: Socket) => {
    // From here on this student counts toward their group's gates. A socket
    // with no session cannot be stamped here; POST /users/update-currentpage
    // covers it on the next page load.
    const connectedUser = socket.data.user as SocketUser | undefined;
    if (connectedUser) {
      markPresent(io, db, connectedUser).catch((err) => {
        console.error(`Could not mark ${connectedUser.email} present:`, err);
      });
    }

    // Register every handler through this instead of socket.on.
    //
    // socket.io does not catch a throw inside a handler. It escapes to the
    // process-level uncaughtException handler in server.ts, which exits. Every
    // handler below destructures its payload, so one client emitting an event
    // with no argument (`socket.emit('adminOnline')` from a browser console)
    // would take the API down for the whole class.
    //
    // Defaulting the payload stops the destructure from throwing, and the catch
    // contains anything else the handler does. A malformed message is dropped
    // and logged.
    const on = <T>(event: string, handler: (payload: T) => void): void => {
      socket.on(event, (payload: T) => {
        try {
          handler((payload ?? {}) as T);
        } catch (err) {
          console.error(`Socket handler "${event}" threw; dropping this message:`, err);
        }
      });
    };

    // Whether this socket is allowed into this room. socket.join() takes any
    // string, so without this a student could type another group's room name
    // into a console and receive that group's votes, popups and offers.
    //
    // A socket with no identity only exists with SOCKET_AUTH_REQUIRED=false,
    // the emergency setting, and is let through so that setting still works.
    const mayJoin = (room: string): boolean => {
      const user = socket.data.user as SocketUser | undefined;
      if (!user) return true;
      // Advisors move between groups to help them; that is the job.
      if (isAdmin(user)) return true;

      const ownRoom = `group_${user.group_id}_class_${user.class}`;
      if (room === ownRoom || room === String(user.group_id) || room === `class_${user.class}`) {
        return true;
      }

      console.warn(
        `Refusing to join socket ${socket.id} (${user.email}) to room "${room}". Their own room is "${ownRoom}".`
      );
      return false;
    };

    // Whether this socket's user teaches this class. Teacher events act on one
    // section, so being a teacher somewhere is not enough; the same rule as
    // requireClassModerator on HTTP. Read from the database rather than the
    // session cached at connect, so a mid-class promotion counts. A socket with
    // no session is refused, unlike mayJoin above: a student can open one on
    // purpose.
    const teachesClass = async (classId: unknown): Promise<boolean> => {
      const user = socket.data.user as SocketUser | undefined;
      const crn = Number(classId);
      if (!user || !Number.isInteger(crn)) return false;

      const [rows] = await db.promise().query<RowDataPacket[]>(
        `SELECT 1 FROM Moderator m
           JOIN Users u ON u.email = m.admin_email
          WHERE m.crn = ? AND m.admin_email = ? AND u.affiliation = 'admin'
          LIMIT 1`,
        [crn, user.email]
      );
      return rows.length > 0;
    };

    const onTeacher = <T>(
      event: string,
      classOf: (payload: T) => unknown,
      handler: (payload: T) => void
    ): void => {
      on<T>(event, (payload) => {
        const classId = classOf(payload);
        teachesClass(classId)
          .then((allowed) => {
            if (allowed) {
              handler(payload);
              return;
            }
            const user = socket.data.user as SocketUser | undefined;
            console.warn(
              `Refusing teacher-only "${event}" for class ${String(classId)} from socket ${socket.id} (${user?.email ?? 'no session'}).`
            );
          })
          .catch((err) => {
            console.error(`Socket handler "${event}" failed; dropping this message:`, err);
          });
      });
    };

    // The sender of a student event, or null if it is not a student in a group.
    const fromStudent = async (event: string): Promise<SocketStudent | null> => {
      const student = await identifyStudent();
      if (student?.group_id == null || student.class == null) {
        const user = socket.data.user as SocketUser | undefined;
        console.warn(
          `Refusing "${event}" from socket ${socket.id} (${user?.email ?? 'no session'}): not a student in a group.`
        );
        return null;
      }
      return {
        id: student.id,
        email: student.email,
        groupId: student.group_id,
        classId: student.class,
        room: `group_${student.group_id}_class_${student.class}`,
      };
    };

    // Student events act on the sender's own group, never on one the payload
    // names, so a student cannot tick another group's resumes, confirm an offer
    // as a teammate, or move a group in another section.
    //
    // One socket's events run one at a time, in arrival order. The lookup above
    // makes every handler async, and without the queue two quick checkbox
    // clicks could reach the database in the opposite order.
    let studentQueue: Promise<void> = Promise.resolve();
    const onStudent = <T>(
      event: string,
      handler: (payload: T, student: SocketStudent) => Promise<void> | void
    ): void => {
      on<T>(event, (payload) => {
        studentQueue = studentQueue
          .then(async () => {
            const student = await fromStudent(event);
            if (student) await handler(payload, student);
          })
          .catch((err) => {
            console.error(`Socket handler "${event}" failed; dropping this message:`, err);
          });
      });
    };

    on('adminOnline', ({ adminEmail }: { adminEmail: string }) => {
      const user = socket.data.user as SocketUser | undefined;

      // This room receives offer requests and every group's progress, so
      // joining it by sending someone else's address would be a way to watch a
      // whole class. Trust the session over the payload where there is one.
      if (user && (!isAdmin(user) || adminEmail !== user.email)) {
        console.warn(`Socket ${socket.id} (${user.email}) tried to join admin room ${adminEmail}.`);
        return;
      }

      socket.join(user?.email ?? adminEmail);
    });

    on('studentOnline', ({ studentId }: { studentId: string }) => {
      // Keyed by email: every reader of this map looks up an email, and the
      // client happens to send one under the name studentId. Prefer the session
      // so a client cannot register itself as somebody else and collect their
      // popups.
      const user = socket.data.user as SocketUser | undefined;
      onlineStudents[user?.email ?? studentId] = socket.id;
    });

    // Room names arrive as `group_<group_id>_class_<class>` from every page.
    const roomParts = (room: string): { groupId: string; classId: string } | null => {
      const match = /^group_(\d+)_class_(\d+)$/.exec(room);
      return match ? { groupId: match[1], classId: match[2] } : null;
    };

    on('joinGroup', (group_id: string) => {
      if (!mayJoin(group_id)) return;
      socket.join(group_id);

      // Re-evaluate on join, because a reconnected socket is in no rooms and
      // missed whatever was emitted while it was away.
      const parts = roomParts(group_id);
      if (parts) {
        broadcastGroupBarrier(io, db, parts.classId, parts.groupId, RES_REVIEW_BARRIER_STEP).catch(
          (err) => {
            console.error(`Could not re-evaluate the barrier for room ${group_id}:`, err);
          }
        );
      }
    });

    on('joinClass', ({ classId }: { classId: number }) => {
      if (!mayJoin(`class_${classId}`)) return;
      socket.join(`class_${classId}`);
    });

    onStudent<SocketEvents['check']>('check', async ({ resume_number, checked }, student) => {
      await db
        .promise()
        .query(
          'UPDATE Resume SET `checked` = ? WHERE group_id = ? AND class = ? AND resume_number = ?',
          [checked, student.groupId, student.classId, resume_number]
        );
      io.to(student.room).emit('checkboxUpdated', { resume_number, checked });
    });

    onStudent<SocketEvents['checkint']>('checkint', ({ interview_number, checked }, student) => {
      socket.to(student.room).emit('checkboxUpdated', { interview_number, checked });
    });

    onTeacher<SocketEvents['sendPopupToGroups']>(
      'sendPopupToGroups',
      (payload) => payload.class,
      ({
        groups,
        headline,
        message,
        class: classId,
        candidateId,
      }: SocketEvents['sendPopupToGroups']) => {
        if (!groups || groups.length === 0) return;

        const query =
          "SELECT email FROM Users WHERE group_id IN (?) AND class = ? AND affiliation = 'student'";
        const params: (number[] | number)[] = [groups, classId];

        db.query(query, params, (err, results: any[]) => {
          if (!err && results.length > 0) {
            results.forEach(({ email }) => {
              const studentSocketId = onlineStudents[email];
              if (studentSocketId) {
                io.to(studentSocketId).emit('receivePopup', { headline, message, candidateId });
              }
            });
          } else {
            console.info('No online students in the selected groups.');
          }
        });
      }
    );

    onTeacher<SocketEvents['updateRatingsWithPresetBackend']>(
      'updateRatingsWithPresetBackend',
      (payload) => payload.classId,
      ({
        classId,
        groupId,
        candidateId,
        vote,
        isNoShow,
      }: SocketEvents['updateRatingsWithPresetBackend']) => {
        const roomId = `group_${groupId}_class_${classId}`;

        io.to(roomId).emit('updateRatingsWithPresetFrontend', {
          classId,
          groupId,
          candidateId,
          vote,
          isNoShow,
        });
      }
    );

    onStudent<SocketEvents['makeOfferRequest']>(
      'makeOfferRequest',
      async ({ candidateId }, { groupId, classId, room }) => {
        const [candidates] = await db
          .promise()
          .query<(RowDataPacket & { f_name: string; l_name: string })[]>(
            'SELECT f_name, l_name FROM Candidates WHERE resume_id = ?',
            [candidateId]
          );

        const firstName = candidates[0]?.f_name ?? '';
        const lastName = candidates[0]?.l_name ?? '';
        const candidateName = candidates[0]
          ? `${firstName} ${lastName}`
          : `Candidate #${candidateId}`;

        emitToClassModerators(io, db, classId, 'makeOfferRequest', {
          classId,
          groupId,
          candidateId,
          candidateName,
          firstName,
          lastName,
        });
        io.to(room).emit('groupMemberOffer', { candidateId, candidateName, firstName, lastName });
      }
    );

    onTeacher<SocketEvents['makeOfferResponse']>(
      'makeOfferResponse',
      (payload) => payload.classId,
      ({ classId, groupId, candidateId, accepted }: SocketEvents['makeOfferResponse']) => {
        // The group hears the decision; the class's advisors hear it so their
        // own pending-offer views update. Nobody else.
        const payload = { classId, groupId, candidateId, accepted };
        io.to(`group_${groupId}_class_${classId}`).emit('makeOfferResponse', payload);
        emitToClassModerators(io, db, classId, 'makeOfferResponse', payload);
      }
    );

    // A student finishing a step moves their own group along. Teachers move a
    // group with POST /groups/force-advance, not with this.
    onStudent<SocketEvents['moveGroup']>(
      'moveGroup',
      ({ targetPage }, { groupId, classId, room }) => {
        io.to(room).emit('moveGroup', { classId, groupId, targetPage });
      }
    );

    // Who is on the other end of this socket, read fresh from the roster.
    //
    // Identity comes from the session only, never from `onlineStudents`. That
    // map is keyed by whatever email the client sent in 'studentOnline' when the
    // socket has no session, so trusting it would let a cookieless socket
    // register as a teammate and write a forged Step_Completion row in their
    // name. The session runs over the handshake and survives a reconnect, so a
    // real student is never the one without it.
    //
    // Group and class come from `Users`, not from the session or the payload: a
    // student reassigned mid-class carries a stale group in both, and filing
    // their completion under the old group leaves the new one short a member.
    const identifyStudent = async (): Promise<RowDataPacket | null> => {
      const user = socket.data.user as SocketUser | undefined;
      if (!user) return null;

      const [rows] = await db.promise().query<RowDataPacket[]>(
        `SELECT id, email, group_id, class
           FROM Users
          WHERE email = ? AND affiliation = 'student'`,
        [user.email]
      );
      return rows[0] ?? null;
    };

    onStudent('userCompletedResReview', async (_payload, student) => {
      // Keeping completed_at on a duplicate means a refresh or a reconnect
      // re-announcing does not rewrite the time the student actually finished,
      // which is what the professor reads when a group stalls.
      await db.promise().query(
        `INSERT INTO Step_Completion (student_id, class, group_id, step, completed_at)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE completed_at = completed_at`,
        [student.id, student.classId, student.groupId, RES_REVIEW_BARRIER_STEP, dbNow()]
      );
      await broadcastGroupBarrier(
        io,
        db,
        student.classId,
        student.groupId,
        RES_REVIEW_BARRIER_STEP
      );
    });

    // studentId is the sender's, so a student cannot confirm for a teammate and
    // walk the group past "all members must confirm".
    onStudent<SocketEvents['confirmOffer']>(
      'confirmOffer',
      ({ candidateId }, { id, groupId, classId, room }) => {
        io.to(room).emit('confirmOffer', { candidateId, studentId: id, groupId, classId });
      }
    );

    onStudent<SocketEvents['sentPresetVotes']>(
      'sentPresetVotes',
      async ({ question1, question2, question3, question4, candidate_id }, student) => {
        await db.promise().query(
          `INSERT INTO InterviewPopup
             (candidate_id, group_id, class, question1, question2, question3, question4)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             question1 = question1 + VALUES(question1),
             question2 = question2 + VALUES(question2),
             question3 = question3 + VALUES(question3),
             question4 = question4 + VALUES(question4)`,
          [
            candidate_id,
            student.groupId,
            student.classId,
            question1,
            question2,
            question3,
            question4,
          ]
        );
      }
    );

    on('disconnect', () => {
      Object.keys(onlineStudents).forEach((studentId) => {
        if (onlineStudents[studentId] === socket.id) {
          delete onlineStudents[studentId];
        }
      });
    });
  });

  return onlineStudents;
}
