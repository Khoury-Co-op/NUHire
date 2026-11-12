import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SeedError } from './util.mjs';

// .local/tests/lib -> repo root
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function need(name) {
  const value = process.env[name];
  if (!value) {
    throw new SeedError(
      `${name} is not set. It is read from api/.env.example, so that file has lost it.`
    );
  }
  return value;
}

// No override flag, on purpose: these scripts create and delete users and rows,
// so they must never be pointed at a shared database.
function assertLocal(label, urlString) {
  const { hostname } = new URL(urlString);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new SeedError(
      `${label} points at "${hostname}". These scripts only run against localhost.`
    );
  }
}

export function loadConfig() {
  // Same file the dev compose stack reads, so nothing needs copying.
  // loadEnvFile never overrides an already-set variable, so an export still wins.
  process.loadEnvFile(path.join(ROOT, 'api/.env.example'));

  const config = {
    databaseUrl: need('DATABASE_URL'),
    apiUrl: process.env.SEED_API_URL ?? `http://localhost:${need('BACKEND_PORT')}`,
    frontUrl: need('REACT_APP_FRONT_URL'),
    keycloakUrl: need('KEYCLOAK_URL'),
    realm: need('KEYCLOAK_REALM'),
    // Not in api/.env.example; these are the values .local/compose.yaml sets.
    keycloakAdmin: {
      user: process.env.KEYCLOAK_ADMIN ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    },
  };

  assertLocal('DATABASE_URL', config.databaseUrl);
  assertLocal('The API URL', config.apiUrl);
  assertLocal('KEYCLOAK_URL', config.keycloakUrl);
  return config;
}
