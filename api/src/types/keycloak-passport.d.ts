// Create: api/src/types/keycloak-passport.d.ts
declare module '@exlinc/keycloak-passport' {
  import { Strategy as PassportStrategy } from 'passport-strategy';

  export interface KeycloakStrategyOptions {
    host: string;
    realm: string;
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    authorizationURL?: string;
    tokenURL?: string;
    userInfoURL?: string;
    issuer?: string;
    scope?: string[];
  }

  export interface KeycloakProfile {
    id?: string;
    username?: string;
    email: string;
    firstName?: string;
    lastName?: string;
    [key: string]: any;
  }

  export type VerifyCallback = (err?: Error | null, user?: any, info?: any) => void;

  export type VerifyFunction = (profile: KeycloakProfile, done: VerifyCallback) => void;

  export class Strategy extends PassportStrategy {
    constructor(options: KeycloakStrategyOptions, verify: VerifyFunction);
    name: string;
  }
}
