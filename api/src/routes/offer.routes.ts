import { Router } from 'express';
import { Pool } from 'mysql2';
import { OfferController } from '../controller/offer.controller';
import { requireAuth, requireAdmin, requireClassModerator } from '../middleware/auth.middleware';
import { requireStep } from '../middleware/step.middleware';

export default (db: Pool): Router => {
  const router = Router();
  const offerController = new OfferController(db);

  router.post('/', requireAuth, requireStep(db, 'offer'), offerController.createOffer);
  router.get(
    '/group/:group_id/class/:class_id',
    requireAuth,
    offerController.getOffersByGroupAndClass
  );
  router.get('/class/:class_id', requireAuth, offerController.getOffersByClass);
  router.get(
    '/group/:group_id/class/:class_id/candidate/:candidate_id',
    requireClassModerator(db),
    offerController.getOfferVotes
  );
  // Accept or reject: teachers only, so a student cannot accept their own group's offer.
  router.put('/:offer_id', requireAdmin, offerController.updateOffer);

  return router;
};
