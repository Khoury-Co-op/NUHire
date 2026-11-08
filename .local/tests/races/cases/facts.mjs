// facts.repository.ts: a professor's first save of a class's waiting-room
// facts, from several tabs at once.

import { WRITERS, expectCounts, inRaceRange } from '../harness.mjs';

export default {
  async cleanup(db) {
    await db.waitingFacts.deleteMany({ where: { class_id: inRaceRange } });
  },

  cases: [
    {
      name: 'facts.save',
      write: async ({ db, repository }, classId, i) => {
        await repository('facts')
          .createFactsRepository(db)
          .save(classId, { one: `one ${i}`, two: `two ${i}`, three: `three ${i}` });
        return 'ok';
      },
      check: async ({ db, repository }, classId, labels) => {
        const saved = await repository('facts').createFactsRepository(db).findByClass(classId);
        const writer = saved?.one?.replace('one ', '');
        // All three from one writer: a save replaces the facts, it never mixes two.
        const whole = saved?.two === `two ${writer}` && saved?.three === `three ${writer}`;
        return [
          ...expectCounts(labels, { ok: WRITERS }),
          ...(whole ? [] : [`saved facts are ${JSON.stringify(saved)}`]),
        ];
      },
    },
  ],
};
