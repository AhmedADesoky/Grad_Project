// ─── Token helpers ────────────────────────────────────────────────────────────
// Token is stored inside the currentUser object in localStorage.
// These helpers keep Client.js decoupled from React state.

function getStoredToken() {
  try {
    const raw = localStorage.getItem('currentUser');
    if (!raw) return null;
    return JSON.parse(raw)?.token ?? null;
  } catch {
    return null;
  }
}

function setStoredToken(token) {
  try {
    const raw = localStorage.getItem('currentUser');
    if (!raw) return;
    const user = JSON.parse(raw);
    user.token = token;
    localStorage.setItem('currentUser', JSON.stringify(user));
  } catch { /* ignore */ }
}

// Broadcast to AuthContext so React state stays in sync without importing it
function broadcastAuthEvent(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

// ─── Refresh queue ────────────────────────────────────────────────────────────
// If several requests get 401 at the same time, only one refresh runs;
// the others wait in this queue and are retried once refresh resolves.

let isRefreshing = false;
let refreshQueue = [];   // Array of { resolve, reject }

function drainQueue(newToken, error) {
  refreshQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(newToken)
  );
  refreshQueue = [];
}

function waitForRefresh() {
  return new Promise((resolve, reject) => {
    refreshQueue.push({ resolve, reject });
  });
}

// ─── Token refresh ────────────────────────────────────────────────────────────
// Calls the Refresh_Access_Token mutation directly (no interceptor — the
// _skipRefresh flag stops infinite loops).

const USER_URL = import.meta.env.VITE_USER_GRAPHQL_URL;

const REFRESH_QUERY = `
  mutation {
    Refresh_Access_Token {
      token
      id
      username
      email
      level
      preferredPlanMode
      profileImage
      progress { completed total }
      examScores { date score level }
    }
  }
`;

async function doRefresh() {
  const res  = await fetch(USER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',          // send the httpOnly refresh cookie
    body: JSON.stringify({ query: REFRESH_QUERY }),
  });

  const json = await res.json();

  if (!res.ok || json.errors?.length) {
    throw new Error('Refresh failed');
  }

  const freshUser = json.data?.Refresh_Access_Token;
  if (!freshUser?.token) throw new Error('No token in refresh response');

  // Persist full updated user and notify React
  localStorage.setItem('currentUser', JSON.stringify(freshUser));
  broadcastAuthEvent('auth:refreshed', { user: freshUser });

  return freshUser.token;
}

// ─── Auth error detection ─────────────────────────────────────────────────────
// The Django backend sometimes returns token errors as GraphQL errors (HTTP 200)
// instead of HTTP 401. We detect those patterns here so we can refresh+retry.

const AUTH_ERROR_PATTERNS = [
  'token expired',
  'token invalid',
  'not authenticated',
  'authentication required',
  'please log in',
  'unauthorized',
  'signature has expired',
  'invalid token',
  'jwt',
];

function isAuthError(message = '') {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some(p => lower.includes(p));
}

// ─── Refresh helper ───────────────────────────────────────────────────────────
async function _attemptRefreshAndRetry(url, query, variables, skipRefresh) {
  if (skipRefresh) return null; // already retrying — don't loop

  if (!isRefreshing) {
    isRefreshing = true;
    try {
      const newToken = await doRefresh();
      setStoredToken(newToken);
      isRefreshing = false;
      drainQueue(newToken, null);
      return _fetch(url, query, variables, newToken, true);
    } catch (err) {
      isRefreshing = false;
      drainQueue(null, err);
      localStorage.removeItem('currentUser');
      broadcastAuthEvent('auth:logout');
      return null; // caller will throw a user-friendly error
    }
  } else {
    const newToken = await waitForRefresh();
    return _fetch(url, query, variables, newToken, true);
  }
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function _fetch(url, query, variables, token, skipRefresh = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ query, variables }),
  });

  // HTTP 401 → refresh + retry
  if (response.status === 401 && !skipRefresh) {
    const retried = await _attemptRefreshAndRetry(url, query, variables, skipRefresh);
    if (retried !== null) return retried;
    throw new Error('Your session has expired. Signing you out…');
  }

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Non-JSON response: ${raw.slice(0, 180)}`);
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }

  // GraphQL error body — check for auth errors even on HTTP 200
  if (payload.errors?.length) {
    const firstMsg = payload.errors[0].message || '';

    if (isAuthError(firstMsg) && !skipRefresh) {
      const retried = await _attemptRefreshAndRetry(url, query, variables, skipRefresh);
      if (retried !== null) return retried;
      // Refresh failed — user is being logged out, don't surface a scary message
      throw new Error('Session refreshed. Please try again.');
    }

    throw new Error(firstMsg || 'GraphQL request failed');
  }

  return payload.data;
}

// ─── Public API ───────────────────────────────────────────────────────────────
// Keeps the same { url, query, variables, token } signature so all existing
// callers in UserServer.js and AIService.js work without changes.
// If a token is explicitly passed it takes priority; otherwise we read from
// localStorage so callers don't have to thread the token through manually.

export async function graphQLRequest({ url, query, variables = {}, token }) {
  const resolvedToken = token ?? getStoredToken();
  return _fetch(url, query, variables, resolvedToken);
}
