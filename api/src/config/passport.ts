// src/config/passport.ts

import passport from 'passport';
import { Pool } from 'mysql2';
const KeycloakStrategy = require('passport-keycloak-oauth2-oidc').Strategy;

interface KeycloakProfile {
  id?: string;
  username?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  firstName?: string;
  lastName?: string;
  keycloakId?: string;
  [key: string]: any;
}

export function configurePassport(db: Pool): void {
  const keycloak_url = process.env.KEYCLOAK_URL!;
  const keycloak_realm = process.env.KEYCLOAK_REALM!;

  passport.use(
    'keycloak',
    new KeycloakStrategy(
      {
        authServerURL: process.env.KEYCLOAK_URL,
        realm: process.env.KEYCLOAK_REALM,
        clientID: process.env.KEYCLOAK_CLIENT_ID,
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
        callbackURL: process.env.KEYCLOAK_CALLBACK_URL,
        scope: 'openid profile email',
        // The authorize URL carried no `state`, so /auth/keycloak/callback
        // accepted any code anyone sent it: an attacker could start a flow with
        // their own Keycloak account and land a student's browser in that
        // session, which in this app means their group (SEC-19).
        //
        // passport-oauth2 stores the nonce in req.session, so this only works
        // because the session middleware also runs on /auth. app.ts sets
        // saveUninitialized: false, and writing the nonce is what marks the
        // session modified, which is what gets the cookie onto the redirect;
        // without a `state` there is nothing to write and no cookie either.
        state: true,
        authorizationURL: `${keycloak_url}/realms/${keycloak_realm}/protocol/openid-connect/auth`,
        tokenURL: `${keycloak_url}/realms/${keycloak_realm}/protocol/openid-connect/token`,
        userInfoURL: `${keycloak_url}/realms/${keycloak_realm}/protocol/openid-connect/userinfo`,
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: KeycloakProfile,
        done: (error: any, user?: any) => void
      ) => {
        try {
          const userEmail = profile.email;
          const parts = profile.name.split(' ');
          const fname = parts[0];
          const lname = parts[1];

          if (!userEmail) {
            throw new Error('No email found in Keycloak profile');
          }

          const [rows] = await db
            .promise()
            .execute('SELECT * FROM Users WHERE email = ?', [userEmail]);

          const users = rows as any[];
          let dbUser;

          if (users.length === 0) {
            await db
              .promise()
              .execute(
                'INSERT INTO Users (email, f_name, l_name, affiliation) VALUES (?, ?, ?, ?)',
                [userEmail, fname, lname, 'none']
              );

            const [newUserRows] = await db
              .promise()
              .execute('SELECT * FROM Users WHERE email = ?', [userEmail]);
            dbUser = (newUserRows as any[])[0];
          } else {
            dbUser = users[0];
          }

          dbUser.keycloakProfile = profile;

          return done(null, dbUser);
        } catch (error) {
          console.error('Error in passport callback:', error);
          return done(error, null);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const [rows] = await db.promise().execute('SELECT * FROM Users WHERE id = ?', [id]);

      const users = rows as any[];
      if (users.length > 0) {
        done(null, users[0]);
      } else {
        done(null, false);
      }
    } catch (error) {
      done(error, null);
    }
  });
}
