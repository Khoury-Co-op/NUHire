import { SeedError, http } from './util.mjs';

// Logs in the way a browser does, through the real Keycloak login page, and
// returns the session cookie the API issues. Why this and not a test-only login
// route is written down in .local/tests/README.md.

// Cookies are kept per origin, as in a browser. Each login() gets its own jar:
// it holds Keycloak's SSO cookie, so a shared one would log everyone in as
// whoever went first.
class CookieJar {
  #origins = new Map();

  header(url) {
    const jar = this.#origins.get(new URL(url).origin);
    return jar ? [...jar].map(([name, value]) => `${name}=${value}`).join('; ') : '';
  }

  store(url, res) {
    const origin = new URL(url).origin;
    const jar = this.#origins.get(origin) ?? new Map();
    this.#origins.set(origin, jar);
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const deleted = value === '' || attributes.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a));
      if (deleted) jar.delete(name);
      else jar.set(name, value);
    }
  }
}

const isRedirect = (res) => res.status >= 300 && res.status < 400;

async function hop(jar, url, init = {}) {
  const headers = { ...init.headers };
  const cookie = jar.header(url);
  if (cookie) headers.cookie = cookie;
  const res = await http(url, { ...init, headers, redirect: 'manual' });
  jar.store(url, res);
  return res;
}

// Follows redirects by hand so cookies apply at every hop. Stops at the first
// redirect into the frontend without requesting it: the login is done by then.
async function follow(jar, res, url, frontOrigin) {
  for (let hops = 0; hops < 12; hops++) {
    if (!isRedirect(res)) return { res, url };
    const location = res.headers.get('location');
    if (!location) throw new SeedError(`Redirect from ${url} had no Location header.`);
    const next = new URL(location, url);
    if (next.origin === frontOrigin) return { landing: next };
    url = next.href;
    res = await hop(jar, url);
  }
  throw new SeedError('Gave up after too many redirects during login.');
}

const decodeHtml = (text) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

function loginFormAction(html) {
  const form = html.match(/<form[^>]*id="kc-form-login"[^>]*>/);
  const action = form?.[0].match(/action="([^"]*)"/);
  return action ? decodeHtml(action[1]) : null;
}

function keycloakFeedback(html) {
  const text = html.match(/kc-feedback-text[^>]*>\s*([^<]+?)\s*</);
  return text ? decodeHtml(text[1]) : null;
}

export async function login(config, { email, password }) {
  const jar = new CookieJar();
  const frontOrigin = new URL(config.frontUrl).origin;

  // 1. The API starts the OIDC flow and redirects to Keycloak's login page.
  const startUrl = `${config.apiUrl}/auth/keycloak`;
  const first = await follow(jar, await hop(jar, startUrl), startUrl, frontOrigin);
  if (first.landing) {
    throw new SeedError(`Login for ${email} went to ${first.landing.pathname} before Keycloak.`);
  }

  // 2. Submit the real login form.
  const page = await first.res.text();
  const action = loginFormAction(page);
  if (!action) {
    throw new SeedError(
      `Login for ${email}: no Keycloak login form at ${first.url}. Did the Keycloak theme or version change?`
    );
  }
  const submitted = await hop(jar, action, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', referer: first.url },
    body: new URLSearchParams({ username: email, password, credentialId: '' }),
  });

  // 3. Keycloak redirects to the API callback, which sets the session cookie and
  //    redirects into the frontend.
  const done = await follow(jar, submitted, action, frontOrigin);
  if (!done.landing) {
    const feedback = keycloakFeedback(await done.res.text());
    throw new SeedError(
      `Keycloak did not log ${email} in${feedback ? `: ${feedback}` : ' (it showed a page instead of redirecting)'}.`
    );
  }
  const failure = done.landing.searchParams.get('error');
  if (failure) throw new SeedError(`Login for ${email} failed in the API: ?error=${failure}`);

  // 4. Confirm the session really is this person's.
  const meRes = await hop(jar, `${config.apiUrl}/auth/user`);
  if (!meRes.ok) {
    throw new SeedError(`Logged in as ${email}, but /auth/user answered ${meRes.status}.`);
  }
  const user = await meRes.json();
  if (user.email !== email) {
    throw new SeedError(`Logged in as ${email} but the session belongs to ${user.email}.`);
  }

  return {
    email,
    user,
    landing: done.landing.pathname,
    cookie: jar.header(config.apiUrl),
  };
}

// An authenticated JSON call to the API using a session from login().
export async function callApi(config, session, method, path, body) {
  const res = await http(`${config.apiUrl}${path}`, {
    method,
    headers: {
      cookie: session.cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new SeedError(`${method} ${path} answered ${res.status}: ${await res.text()}`);
  }
  return res;
}
