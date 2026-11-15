// src/routes/auth.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { AuthController } from '../controller/auth.controller';

export default (db: Pool): Router => {
  const router = Router();
  const authController = new AuthController(db);

  router.get('/keycloak', authController.initiateKeycloakAuth);
  router.get('/keycloak/callback', ...authController.handleKeycloakCallback);
  router.get('/user', authController.getAuthenticatedUser);
  router.post('/logout', authController.logout);
  router.post('/moderator-login', authController.moderatorLogin);
  router.get('/verify-moderator', authController.verifyModerator);
  router.get('/post-signup-redirect', authController.handlePostSignupRedirect);

  return router;
};
