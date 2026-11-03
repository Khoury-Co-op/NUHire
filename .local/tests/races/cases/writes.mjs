// The helpers in api/src/repository/writes.ts, on tables with no foreign keys
// so a case needs no other rows. The two controls show the race each rule is
// there for; they report what happened and never fail the run.

import { WRITERS, expectCounts, inRaceRange } from '../harness.mjs';

const facts = (classId, i) => ({ class_id: classId, one: `writer ${i}` });

const upsertFacts = (db, classId, i) =>
  db.waitingFacts.upsert({
    where: { class_id: classId },
    create: facts(classId, i),
    update: { one: `writer ${i}` },
  });

// A group's offer, as offer.controller.ts writes it: the candidate moves only
// while the offer is pending or rejected, so an accepted offer stays put.
const submitOffer = (compareAndSet, db, classId, i) =>
  compareAndSet(db.offers, {
    where: { class_id: classId, group_id: 1 },
    when: { status: { in: ['pending', 'rejected'] } },
    create: { class_id: classId, group_id: 1, candidate_id: i },
    update: { candidate_id: i, status: 'pending' },
  });

async function oneRowFromAWriter(db, classId) {
  const rows = await db.waitingFacts.findMany({ where: { class_id: classId } });
  if (rows.length !== 1) return [`expected 1 row, found ${rows.length}`];
  const writer = Number(rows[0].one?.replace('writer ', ''));
  return writer >= 0 && writer < WRITERS ? [] : [`row holds "${rows[0].one}", from no writer`];
}

export default {
  async cleanup(db) {
    await db.waitingFacts.deleteMany({ where: { class_id: inRaceRange } });
    await db.offers.deleteMany({ where: { class_id: inRaceRange } });
    await db.interviewPopup.deleteMany({ where: { class: inRaceRange } });
  },

  cases: [
    {
      name: 'control: a bare upsert',
      control: 'a failed write here is the race withUniqueRetry exists for',
      write: async ({ db }, classId, i) => (await upsertFacts(db, classId, i), 'ok'),
    },
    {
      name: 'withUniqueRetry(upsert)',
      write: async ({ db, writes }, classId, i) => (
        await writes.withUniqueRetry(() => upsertFacts(db, classId, i)),
        'ok'
      ),
      check: async ({ db }, classId, labels) => [
        ...expectCounts(labels, { ok: WRITERS }),
        ...(await oneRowFromAWriter(db, classId)),
      ],
    },
    {
      name: 'withUniqueRetry(upsert) with an increment',
      write: async ({ db, writes }, classId) => {
        const key = { candidate_id: 1, group_id: 1, class: classId };
        await writes.withUniqueRetry(() =>
          db.interviewPopup.upsert({
            where: { candidate_id_group_id_class: key },
            create: { ...key, question1: 1, question2: 0, question3: 0, question4: 0 },
            update: { question1: { increment: 1 } },
          })
        );
        return 'ok';
      },
      check: async ({ db }, classId, labels) => {
        const row = await db.interviewPopup.findFirst({ where: { class: classId } });
        const total = row?.question1 ?? 0;
        return [
          ...expectCounts(labels, { ok: WRITERS }),
          ...(total === WRITERS ? [] : [`expected a total of ${WRITERS}, got ${total}`]),
        ];
      },
    },
    {
      name: 'insertIfAbsent',
      write: async ({ db, writes }, classId, i) =>
        (await writes.insertIfAbsent(db.waitingFacts, facts(classId, i))) ? 'inserted' : 'skipped',
      check: async ({ db }, classId, labels) => [
        ...expectCounts(labels, { inserted: 1, skipped: WRITERS - 1 }),
        ...(await oneRowFromAWriter(db, classId)),
      ],
    },
    {
      name: 'compareAndSet: a group submits its first offer',
      write: ({ db, writes }, classId, i) => submitOffer(writes.compareAndSet, db, classId, i),
      check: async ({ db }, classId, labels) => {
        const rows = await db.offers.count({ where: { class_id: classId } });
        return [
          ...expectCounts(labels, { created: 1, updated: WRITERS - 1 }),
          ...(rows === 1 ? [] : [`expected 1 offer, found ${rows}`]),
        ];
      },
    },
    {
      name: 'compareAndSet: an accepted offer stays put',
      setup: ({ db }, classId) =>
        db.offers.create({
          data: { class_id: classId, group_id: 1, candidate_id: 999, status: 'accepted' },
        }),
      write: ({ db, writes }, classId, i) => submitOffer(writes.compareAndSet, db, classId, i),
      check: async ({ db }, classId, labels) => {
        const offer = await db.offers.findFirst({ where: { class_id: classId } });
        const intact = offer?.candidate_id === 999 && offer?.status === 'accepted';
        return [
          ...expectCounts(labels, { unchanged: WRITERS }),
          ...(intact ? [] : [`the accepted offer changed to ${JSON.stringify(offer)}`]),
        ];
      },
    },
    {
      name: 'control: withUniqueRetry(upsert) inside a $transaction',
      control: 'why AGENTS.md says to wrap the whole transaction instead',
      write: async ({ db, writes }, classId, i) => {
        await db.$transaction((tx) => writes.withUniqueRetry(() => upsertFacts(tx, classId, i)));
        return 'ok';
      },
    },
    {
      name: 'withUniqueRetry($transaction: upsert, compareAndSet)',
      write: ({ db, writes }, classId, i) =>
        writes.withUniqueRetry(() =>
          db.$transaction(async (tx) => {
            await upsertFacts(tx, classId, i);
            return submitOffer(writes.compareAndSet, tx, classId, i);
          })
        ),
      check: async ({ db }, classId, labels) => [
        ...expectCounts(labels, { created: 1, updated: WRITERS - 1 }),
        ...(await oneRowFromAWriter(db, classId)),
      ],
    },
  ],
};
