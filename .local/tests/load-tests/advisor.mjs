// The teacher: starts the class, polls the live view like /live-class, accepts
// every offer, and force-advances only a group with a dormant member.

import { login } from '../lib/login.mjs';
import { ADVISOR, GROUP_IDS, SIM } from '../lib/roster.mjs';
import { nextStep } from './journey.mjs';
import { openSocket, timedCall } from './student.mjs';

const LIVE_POLL_MS = 10_000;

export class Advisor {
  constructor(h) {
    this.h = h;
  }

  call(method, template, path, body) {
    return timedCall(this.h, this.session, method, template, path, body);
  }

  async start() {
    this.session = await this.h.metrics.timed(
      'login (Keycloak + API callback)',
      login(this.h.config, { email: ADVISOR.email, password: SIM.password })
    );
    // live-class/page.tsx joins its room on every connect.
    this.socket = openSocket(this.h.config, this.session);
    this.h.sockets.add(this.socket);
    this.socket.on('connect', () => this.socket.emit('adminOnline', { adminEmail: ADVISOR.email }));
    this.socket.on('makeOfferRequest', (request) =>
      this.answer(request).catch((error) => this.h.problems.push(`advisor: ${error.message}`))
    );
    this.watch();
  }

  // ManageGroupsTab's respondToOffer: find the pending offer, accept it, tell the group.
  async answer({ classId, groupId, candidateId }) {
    const offers = await this.call(
      'GET',
      '/offers/group/:group_id/class/:class_id',
      `/offers/group/${groupId}/class/${classId}`
    );
    const pending = offers.find((o) => o.candidate_id === candidateId && o.status === 'pending');
    if (!pending)
      throw new Error(`no pending offer for group ${groupId}, candidate ${candidateId}`);
    await this.call('PUT', '/offers/:offer_id', `/offers/${pending.id}`, { status: 'accepted' });
    this.h.offerAnswered.set(groupId, performance.now());
    this.socket.emit('makeOfferResponse', { classId, groupId, candidateId, accepted: true });
  }

  startClass() {
    return this.call('PATCH', '/groups/start-all-groups', '/groups/start-all-groups', {
      class_id: SIM.crn,
    });
  }

  // Releases the barrier and moves the group, so both fan-outs time from here.
  forceAdvance(group, step) {
    this.h.barrierCause.set(group, performance.now());
    this.h.moveEmitted.set(group, performance.now());
    return this.call('POST', '/groups/force-advance', '/groups/force-advance', {
      class_id: SIM.crn,
      group_id: group,
      target_step: nextStep(step),
    });
  }

  // timedCall counts failures; a bad poll shouldn't stop the next.
  async watch() {
    while (!this.h.finished) {
      await Promise.allSettled([
        this.call('GET', '/groups/live/:classId', `/groups/live/${SIM.crn}`),
        ...GROUP_IDS.map((g) =>
          this.call(
            'GET',
            '/groups/getProgress/:classId/:groupId',
            `/groups/getProgress/${SIM.crn}/${g}`
          )
        ),
      ]);
      await new Promise((resolve) => setTimeout(resolve, LIVE_POLL_MS).unref());
    }
  }
}
