import { SIM } from './roster.mjs';
import { SeedError, http } from './util.mjs';

// Keycloak admin REST API, via the admin-cli client in the master realm.
export function createKeycloakAdmin(config) {
  let token = null;
  let expiresAt = 0;

  // Admin tokens last about a minute, so refresh the cached one before it expires.
  async function getToken() {
    if (token && Date.now() < expiresAt) return token;
    const res = await http(`${config.keycloakUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'admin-cli',
        grant_type: 'password',
        username: config.keycloakAdmin.user,
        password: config.keycloakAdmin.password,
      }),
    });
    if (!res.ok) {
      throw new SeedError(
        `Keycloak admin login failed (HTTP ${res.status}). Check KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD.`
      );
    }
    const body = await res.json();
    token = body.access_token;
    expiresAt = Date.now() + (body.expires_in - 15) * 1000;
    return token;
  }

  async function admin(path, init = {}) {
    const headers = { authorization: `Bearer ${await getToken()}`, ...init.headers };
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json';
      init = { ...init, body: JSON.stringify(init.json) };
    }
    return http(`${config.keycloakUrl}/admin/realms/${config.realm}${path}`, { ...init, headers });
  }

  async function find(email) {
    const res = await admin(`/users?email=${encodeURIComponent(email)}&exact=true`);
    if (!res.ok) throw new SeedError(`Keycloak user lookup failed (HTTP ${res.status}).`);
    const users = await res.json();
    return users[0] ?? null;
  }

  return {
    find,

    // The login callback splits `name` on a space, so both names are required
    // single words. emailVerified and a permanent password stop Keycloak
    // interrupting the login with a required action.
    async ensureUser(account) {
      if (await find(account.email)) return 'existing';
      const res = await admin('/users', {
        method: 'POST',
        json: {
          username: account.email,
          email: account.email,
          firstName: account.firstName,
          lastName: account.lastName,
          enabled: true,
          emailVerified: true,
          credentials: [{ type: 'password', value: SIM.password, temporary: false }],
        },
      });
      if (res.status === 201) return 'created';
      const detail = await res.text();
      // Keycloak imports a realm once, so a container created before the realm
      // file allowed example.test still rejects it until recreated.
      if (res.status === 400 && detail.includes('"field":"email"')) {
        throw new SeedError(
          `Keycloak rejected ${account.email}: ${detail}\n` +
            `Your Keycloak imported its realm before example.test was allowed. Recreate it:\n` +
            `  docker compose -f compose.dev.yaml up -d --force-recreate keycloak api`
        );
      }
      throw new SeedError(
        `Could not create ${account.email} in Keycloak (HTTP ${res.status}): ${detail}`
      );
    },

    async deleteUser(email) {
      const user = await find(email);
      if (!user) return 'absent';
      const res = await admin(`/users/${user.id}`, { method: 'DELETE' });
      if (res.status !== 204) {
        throw new SeedError(`Could not delete ${email} from Keycloak (HTTP ${res.status}).`);
      }
      return 'deleted';
    },
  };
}
