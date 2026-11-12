// One simulated student, doing what the browser does page by page. Each method
// names the page it copies; change it when the page changes.

import { io } from 'socket.io-client';
import { callApi, login } from '../lib/login.mjs';
import { SIM, activeMembersOf } from '../lib/roster.mjs';
import { LOGIN_SPREAD_MS, NEEDS_TEACHER, STUCK_MS, THINK, pick, sleep, think } from './journey.mjs';

// socketContext.tsx's options that differ from the defaults. In Node the
// cookie goes in extraHeaders; withCredentials only works in a browser.
export function openSocket(config, session) {
  return io(config.apiUrl, {
    extraHeaders: { cookie: session.cookie },
    reconnectionDelayMax: 10000,
    transports: ['websocket', 'polling'],
  });
}

const read = (res) =>
  res.headers.get('content-type')?.includes('json') ? res.json() : res.arrayBuffer();

// Timed under `METHOD template` so the report groups by route. A call the
// restart broke is made again once the API is back, as a student clicks again.
export async function timedCall(h, session, method, template, path, body, retried = false) {
  try {
    return await h.metrics.timed(
      `${method} ${template}`,
      callApi(h.config, session, method, path, body).then(read)
    );
  } catch (error) {
    if (retried || !h.metrics.restartFallout(error)) throw error;
    await h.apiUp;
    return timedCall(h, session, method, template, path, body, true);
  }
}

export class Student {
  constructor(h, account) {
    this.h = h;
    this.account = account;
    this.at = 'login';
    // The member who makes the group's shared clicks (shortlist, Next, the offer).
    this.drives = activeMembersOf(account.group)[0]?.email === account.email;
  }

  get room() {
    return `group_${this.user.group_id}_class_${this.user.class}`;
  }

  call(method, template, path, body) {
    return timedCall(this.h, this.session, method, template, path, body);
  }

  progress(step) {
    const { class: crn, group_id, email } = this.user;
    return this.call('POST', '/progress', '/progress', { crn, group_id, step, email });
  }

  currentPage(page) {
    return this.call('POST', '/users/update-currentpage', '/users/update-currentpage', {
      page,
      user_email: this.user.email,
    });
  }

  pdf(filePath) {
    return this.call('GET', '/uploads/* (PDF)', `/${filePath}`);
  }

  groupSize() {
    const { group_id, class: classId } = this.user;
    return this.call(
      'GET',
      '/interview/group-size/:group_id/:class_id',
      `/interview/group-size/${group_id}/${classId}`
    ).then(({ count }) => count);
  }

  // A hard navigation reloads the page, so the old socket goes and a new one
  // connects. `announce(socket, reconnected)` is what the page emits on connect;
  // `rejoin: false` is for the page that emits it on mount only.
  open(announce, { rejoin = true } = {}) {
    this.socket?.close();
    const socket = openSocket(this.h.config, this.session);
    this.h.sockets.add(socket);
    let reconnected = false;
    socket.on('connect', () => {
      if (reconnected) this.h.metrics.since('socket: reconnect after kill', this.h.killedAt);
      if (!reconnected || rejoin) announce(socket, reconnected);
      reconnected = true;
    });
    this.socket = socket;
    return socket;
  }

  // What every page does on load: AuthContext, the progress guard, the notes panel.
  async loadPage(step) {
    this.at = step;
    const email = encodeURIComponent(this.user.email);
    await this.call('GET', '/auth/user', '/auth/user');
    await this.call('GET', '/progress/user/:email', `/progress/user/${email}`);
    await this.call('GET', '/notes', `/notes?user_email=${email}`);
  }

  // Resolves once check() holds, re-checked on every socket event and every
  // 250ms. Past STUCK_MS the student is stuck.
  until(check, what) {
    const socket = this.socket;
    return new Promise((resolve, reject) => {
      const finish = (settle) => {
        clearInterval(poll);
        clearTimeout(deadline);
        socket.offAny(onAny);
        settle();
      };
      const test = () => check() && finish(resolve);
      // onAny runs before the event's own handler, so test after it has run.
      const onAny = () => setImmediate(test);
      const poll = setInterval(test, 250);
      const deadline = setTimeout(
        () => finish(() => reject(new Error(`waited ${STUCK_MS / 1000}s for ${what}`))),
        STUCK_MS
      );
      socket.onAny(onAny);
      test();
    });
  }

  // Think, cut short by check(): pages navigate the moment moveGroup arrives.
  thinkUnless(range, check) {
    const until = Date.now() + pick(range);
    return this.until(() => check() || Date.now() >= until, 'a click');
  }

  async run() {
    await sleep(Math.random() * LOGIN_SPREAD_MS);
    this.session = await this.h.metrics.timed(
      'login (Keycloak + API callback)',
      login(this.h.config, { email: this.account.email, password: SIM.password })
    );
    this.user = this.session.user;

    await this.waitingRoom();
    // The student with no group stays here: the status lookup for a null group
    // answers 404 and the page does nothing, as it does in class today.
    if (this.account.group === null) return;

    await this.classStarts();
    await this.jobDescription();
    await this.resumeReview();
    while ((await this.groupReview()) === '/res-review-group') {
      this.h.metrics.record('stray moveGroup reloads /res-review-group', 0);
    }
    await this.interviews();
    if (await this.makeOffer()) await this.dashboard({ reload: true });
  }

  // waitingGroup/page.tsx, plus the Facts panel.
  async waitingRoom() {
    this.at = 'waitingGroup';
    const { class: classId } = this.user;
    this.started = false;
    const socket = this.open((s) => {
      s.emit('joinClass', { classId });
      s.emit('joinGroup', this.room);
      s.emit('joinGroup', `class_${classId}`);
    });
    socket.on('groupStartedClass', () => {
      this.started = true;
    });
    await this.call('GET', '/auth/user', '/auth/user');
    await this.call('GET', '/facts/get/:class', `/facts/get/${classId}`);
    await this.until(() => socket.connected, 'the first socket connect');
    this.h.ready(this);
  }

  // The waiting room reacting to the start, then /about and /instructions on a
  // first visit. Those are client-side navigations, so the socket stays.
  async classStarts() {
    const { class: classId, group_id, email } = this.user;
    await this.until(() => this.started, 'the class to start');
    await this.call(
      'GET',
      '/groups/status/:classId/:groupId',
      `/groups/status/${classId}/${group_id}`
    );
    const { seen } = await this.call(
      'GET',
      '/groups/seen',
      `/groups/seen?email=${encodeURIComponent(email)}`
    );
    if (!seen) {
      await this.call('GET', '/auth/user', '/auth/user');
      await this.call('POST', '/users/update-seen', '/users/update-seen', { email });
    }
    await this.dashboard({ reload: false });
    this.h.landed();
  }

  // dashboard/page.tsx. Reached by router.push from the waiting room (same
  // socket) and by a hard navigation after the offer (a new one).
  async dashboard({ reload }) {
    const { group_id, class: classId, email } = this.user;
    const announce = (s) => {
      s.emit('joinGroup', this.room);
      s.emit('studentOnline', { studentId: email });
      s.emit('studentPageChanged', { studentId: email, currentPage: '/dashboard' });
    };
    if (reload) this.open(announce);
    else announce(this.socket);
    await this.loadPage('dashboard');
    await this.call(
      'GET',
      '/jobs/assignment/:groupId/:classId',
      `/jobs/assignment/${group_id}/${classId}`
    );
    await this.currentPage('dashboard');
  }

  // The job description PDF, as jobdes, res-review and res-review-group load it.
  async jobFile() {
    const { group_id, class: classId } = this.user;
    const { job } = await this.call(
      'GET',
      '/jobs/assignment/:groupId/:classId',
      `/jobs/assignment/${group_id}/${classId}`
    );
    const { file_path } = await this.call(
      'GET',
      '/jobs/title',
      `/jobs/title?title=${encodeURIComponent(job)}&class_id=${classId}`
    );
    await this.pdf(file_path);
  }

  // jobdes/page.tsx. It joins no room.
  async jobDescription() {
    const { email } = this.user;
    this.open((s) => {
      s.emit('studentOnline', { studentId: email });
      s.emit('studentPageChanged', { studentId: email, currentPage: '/jobdes' });
    });
    await this.loadPage('job_description');
    await this.progress('job_description');
    await this.currentPage('jobdes');
    await this.jobFile();
    await think(THINK.click);
    await this.progress('res_1');
  }

  // res-review/page.tsx: decide on every resume, announce completion, wait at
  // the group barrier, then Next (or be moved by whoever clicked it first).
  async resumeReview() {
    const { id, email, group_id, class: classId } = this.user;
    const { metrics } = this.h;
    let released = false;
    let moved = false;
    const socket = this.open((s) => {
      s.emit('studentOnline', { studentId: email });
      s.emit('joinGroup', this.room);
      s.emit('studentPageChanged', { studentId: email, currentPage: '/res-review' });
    });
    socket.on('groupCompletedResReview', () => {
      if (!released) {
        metrics.since('socket: barrier release', this.h.barrierCause.get(group_id));
      }
      released = true;
    });
    socket.on('moveGroup', ({ groupId, classId: movedClass, targetPage }) => {
      if (groupId === group_id && movedClass === classId && targetPage === '/res-review-group') {
        if (!moved) metrics.since('socket: moveGroup', this.h.moveEmitted.get(group_id));
        moved = true;
      }
    });

    await this.loadPage('res_1');
    const resumes = await this.call('GET', '/resume_pdf', `/resume_pdf?class_id=${classId}`);
    const size = await this.groupSize();
    const finishedCount = () =>
      this.call(
        'GET',
        '/resume/finished-count/:group_id/:class_id',
        `/resume/finished-count/${group_id}/${classId}`
      ).then((r) => r.finishedCount);
    await finishedCount();
    await this.jobFile();
    await this.call('GET', '/resume/student/:student_id', `/resume/student/${id}`);
    await this.currentPage('resumepage');

    for (const resume of resumes) {
      await this.pdf(resume.file_path);
      const shownAt = Date.now();
      await think(THINK.resume);
      await this.call('POST', '/resume/vote', '/resume/vote', {
        student_id: String(id),
        group_id,
        class: classId,
        timespent: Math.round((Date.now() - shownAt) / 1000),
        resume_number: resume.id,
        vote: Math.random() < 0.5 ? 'yes' : 'no',
      });
    }

    await this.call('GET', '/resume/student/:student_id', `/resume/student/${id}`);
    this.h.barrierCause.set(group_id, performance.now());
    socket.emit('userCompletedResReview', { groupId: group_id });
    this.h.completedResReview();
    // The page also unlocks Next when this count reaches the group size.
    if ((await finishedCount()) >= size) released = true;
    if (NEEDS_TEACHER.has(group_id)) this.h.waiting(this, 'res_1');

    await this.until(() => released || moved, 'the resume-review barrier');
    await this.thinkUnless(THINK.click, () => moved);
    await this.progress('res_2');
    if (!moved) {
      this.h.moveEmitted.set(group_id, performance.now());
      socket.emit('moveGroup', { groupId: group_id, classId, targetPage: '/res-review-group' });
    }
  }

  // res-review-group/page.tsx: shortlist four, everyone confirms, the driver
  // clicks Next and moveGroup takes the group on. Returns where moveGroup sent
  // the page, because this handler does not check targetPage.
  async groupReview() {
    const { email, group_id, class: classId } = this.user;
    const confirmations = new Set();
    let target = null;
    const readConfirmations = () =>
      this.call('GET', '/progress/confirmations', '/progress/confirmations').then((r) =>
        r.confirmations.forEach((c) => confirmations.add(c))
      );
    const socket = this.open((s, reconnected) => {
      s.emit('joinGroup', this.room);
      // The page re-reads the confirmations it missed. A failure is already
      // counted by timedCall.
      if (reconnected) readConfirmations().catch(() => {});
      s.emit('studentOnline', { studentId: email });
      s.emit('studentPageChanged', { studentId: email, currentPage: '/res-review-group' });
    });
    socket.on('teamConfirmSelection', ({ studentId }) => confirmations.add(studentId));
    socket.on('teamUnconfirmSelection', ({ studentId }) => confirmations.delete(studentId));
    socket.on('moveGroup', ({ groupId, classId: movedClass, targetPage }) => {
      if (groupId == group_id && movedClass == classId && target === null) {
        this.h.metrics.since('socket: moveGroup', this.h.moveEmitted.get(group_id));
        target = targetPage;
      }
    });

    await this.loadPage('res_2');
    await this.jobFile();
    const size = await this.groupSize();
    const resumes = await this.call('GET', '/resume_pdf', `/resume_pdf?class_id=${classId}`);
    await this.call('GET', '/resume/group/:group_id', `/resume/group/${group_id}?class=${classId}`);
    await readConfirmations();
    await this.currentPage('resumepage2');

    if (this.drives) {
      for (const resume of resumes.slice(0, 4)) {
        await think(THINK.click);
        socket.emit('check', { resume_number: resume.id, checked: 1, group_id: this.room });
      }
    }
    await think(THINK.click);
    const { confirmations: saved } = await this.call(
      'POST',
      '/progress/confirmations',
      '/progress/confirmations'
    );
    saved.forEach((c) => confirmations.add(c));
    if (NEEDS_TEACHER.has(group_id)) this.h.waiting(this, 'res_2');

    if (this.drives) {
      await this.until(
        () => confirmations.size >= size || target !== null,
        'every member to confirm the shortlist'
      );
      if (target === null) {
        await this.progress('interview');
        this.h.moveEmitted.set(group_id, performance.now());
        socket.emit('moveGroup', { groupId: group_id, classId, targetPage: '/interview-stage' });
      }
    }
    await this.until(() => target !== null, 'moveGroup to the interview stage');
    await this.progress('interview');
    return target;
  }

  // interview-stage/page.tsx: rate the four shortlisted candidates, wait for
  // the whole group, Next. This page joins its room on mount only, not on
  // reconnect.
  async interviews() {
    const { id, email, group_id, class: classId } = this.user;
    let finished = false;
    let moved = false;
    const socket = this.open(
      (s) => {
        s.emit('joinGroup', this.room);
        s.emit('studentOnline', { studentId: email });
        s.emit('studentPageChanged', { studentId: email, currentPage: '/interview-stage' });
      },
      { rejoin: false }
    );
    socket.on('interviewStatusUpdated', ({ count, total }) => {
      finished = count === total;
    });
    socket.on('moveGroup', ({ groupId, classId: movedClass, targetPage }) => {
      if (groupId === group_id && movedClass === classId && targetPage === '/makeOffer') {
        if (!moved) this.h.metrics.since('socket: moveGroup', this.h.moveEmitted.get(group_id));
        moved = true;
      }
    });

    await this.loadPage('interview');
    await this.jobFile();
    const resumes = await this.call(
      'GET',
      '/resume/group/:group_id',
      `/resume/group/${group_id}?class=${classId}`
    );
    this.candidates = [
      ...new Set(resumes.filter((r) => r.checked === 1).map((r) => r.resume_number)),
    ];
    for (const candidate of this.candidates) {
      await this.call(
        'GET',
        '/candidates/resume-with-file/:id',
        `/candidates/resume-with-file/${candidate}`
      );
    }
    const size = await this.groupSize();
    const { finishedCount } = await this.call(
      'GET',
      '/interview/status/finished-count',
      `/interview/status/finished-count?group_id=${group_id}&class_id=${classId}`
    );
    finished = finishedCount >= size;
    await this.currentPage('interviewpage');

    const rating = () => 1 + Math.floor(Math.random() * 10);
    for (const candidate of this.candidates) {
      await think(THINK.interview);
      const vote = {
        question1: rating(),
        question2: rating(),
        question3: rating(),
        question4: rating(),
        candidate_id: candidate,
      };
      await this.call('POST', '/interview/batch-vote', '/interview/batch-vote', { votes: [vote] });
    }
    await this.call('POST', '/interview/status/finished', '/interview/status/finished', {
      finished: 1,
    });
    socket.emit('interviewStageFinished', { group_id, class_id: classId, student_id: id });
    if (NEEDS_TEACHER.has(group_id)) this.h.waiting(this, 'interview');

    await this.until(() => finished || moved, 'the rest of the group to finish interviews');
    await this.thinkUnless(THINK.click, () => moved);
    await this.progress('offer');
    if (!moved) {
      this.h.moveEmitted.set(group_id, performance.now());
      socket.emit('moveGroup', { groupId: group_id, classId, targetPage: '/makeOffer' });
    }
  }

  // makeOffer/page.tsx: everyone confirms one candidate, the driver makes the
  // offer, the advisor answers. Returns whether the group got an answer.
  async makeOffer() {
    const { id, email, group_id, class: classId } = this.user;
    const tally = new Set();
    let answer = null;
    const socket = this.open((s) => s.emit('joinGroup', this.room));
    socket.emit('studentOnline', { studentId: email });
    socket.emit('studentPageChanged', { studentId: email, currentPage: '/makeOffer' });
    const candidateId = Math.min(...this.candidates);
    socket.on('confirmOffer', ({ candidateId: confirmed, studentId }) => {
      if (confirmed === candidateId) tally.add(studentId);
    });
    socket.on('makeOfferResponse', (payload) => {
      if (payload.classId === classId && payload.groupId === group_id) {
        if (!answer)
          this.h.metrics.since('socket: offer decision', this.h.offerAnswered.get(group_id));
        answer = payload;
      }
    });

    await this.loadPage('offer');
    await this.call(
      'GET',
      '/offers/group/:group_id/class/:class_id',
      `/offers/group/${group_id}/class/${classId}`
    );
    await this.call(
      'GET',
      '/interview/group/:group_id',
      `/interview/group/${group_id}?class=${classId}`
    );
    const size = await this.groupSize();
    for (const candidate of this.candidates) {
      await this.call('GET', '/candidates/resume/:id', `/candidates/resume/${candidate}`);
      await this.call('GET', '/resume_pdf/id/:id', `/resume_pdf/id/${candidate}`);
      await this.call(
        'GET',
        '/interview/popup/:resId/:groupId/:classId',
        `/interview/popup/${candidate}/${group_id}/${classId}`
      );
    }
    await this.currentPage('makeofferpage');

    await think(THINK.click);
    socket.emit('checkint', { group_id: this.room, interview_number: candidateId, checked: true });
    socket.emit('confirmOffer', {
      groupId: group_id,
      classId,
      candidateId,
      studentId: id,
      roomId: this.room,
    });
    // The tally counts the dormant member, so this group stops here (journey.mjs).
    if (NEEDS_TEACHER.has(group_id)) return false;

    if (this.drives) {
      await this.until(() => tally.size >= size, 'every member to confirm the offer');
      await this.call('POST', '/offers', '/offers', {
        group_id,
        class_id: classId,
        candidate_id: candidateId,
        status: 'pending',
      });
      socket.emit('makeOfferRequest', { classId, groupId: group_id, candidateId });
    }
    await this.until(() => answer !== null, "the advisor's answer to the offer");
    await think(THINK.click);
    await this.progress('employer');
    return true;
  }
}
