/**
 * gcal-api.js
 * Google Calendar REST API & Google Identity Services (GSI) OAuth token manager.
 */

// ===== GOOGLE CALENDAR API =====
const GCAL_BASE_URL = 'https://www.googleapis.com/calendar/v3';

// Google Identity Services (GSI) Client-Side Token Management
let _gsiTokenClient = null;
let _gsiInitialized = false;
let _gsiPendingResolve = null;

/**
 * Reset GSI client instance when switching or signing out accounts.
 */
function resetGsiClient() {
  _gsiTokenClient = null;
  _gsiInitialized = false;
  _gsiPendingResolve = null;
}

/**
 * Initialize the GSI token client once and reuse it.
 * Returns true if client is ready, false otherwise.
 */
function ensureGsiClient() {
  if (_gsiInitialized && _gsiTokenClient) return true;

  const clientId = localStorage.getItem('auth.clientId');
  if (!clientId) {
    return false;
  }
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    return false;
  }

  let user = null;
  try { user = JSON.parse(localStorage.getItem('auth.user') || 'null'); } catch (e) { }
  const userEmail = user ? user.email : '';

  try {
    _gsiTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly',
      hint: userEmail || undefined,
      callback: (resp) => {
        if (resp && resp.access_token) {
          localStorage.setItem('auth.googleAccessToken', resp.access_token);
          const expiryMs = Date.now() + ((resp.expires_in || 3600) - 300) * 1000;
          localStorage.setItem('auth.accessTokenExpiresAt', String(expiryMs));
          localStorage.setItem('auth.gcalConnected', 'true');
          console.log(`[gcal] Fresh access token obtained (expires in ${resp.expires_in}s)`);
          if (_gsiPendingResolve) { _gsiPendingResolve(resp.access_token); _gsiPendingResolve = null; }
        } else {
          console.warn('[gcal] GSI response missing access_token:', resp);
          if (_gsiPendingResolve) { _gsiPendingResolve(null); _gsiPendingResolve = null; }
        }
      },
      error_callback: (err) => {
        if (err && err.type !== 'popup_closed') {
          console.warn('[gcal] GSI error:', err);
        }
        if (_gsiPendingResolve) { _gsiPendingResolve(null); _gsiPendingResolve = null; }
      }
    });
    _gsiInitialized = true;
    return true;
  } catch (e) {
    console.warn('[gcal] Failed to init GSI token client:', e);
    return false;
  }
}

/**
 * Request an access token via GSI.
 * @param {'none'|'consent'|''} prompt - 'none' for silent, 'consent' for interactive, '' for auto
 */
function requestGsiToken(prompt = '') {
  return new Promise((resolve) => {
    if (!ensureGsiClient()) return resolve(null);

    // Set a timeout so we don't hang forever on silent requests
    const timeoutMs = prompt === 'none' || prompt === '' ? 5000 : 120000;
    const timeout = setTimeout(() => {
      console.warn(`[gcal] GSI token request timed out (prompt=${prompt})`);
      _gsiPendingResolve = null;
      resolve(null);
    }, timeoutMs);

    _gsiPendingResolve = (token) => {
      clearTimeout(timeout);
      resolve(token);
    };

    try {
      _gsiTokenClient.requestAccessToken({ prompt: prompt || '' });
    } catch (e) {
      clearTimeout(timeout);
      console.warn('[gcal] requestAccessToken failed:', e);
      _gsiPendingResolve = null;
      resolve(null);
    }
  });
}

/**
 * Refresh the Google access token with escalating strategies:
 * 1. Silent GSI refresh (no popup)
 * 2. If interactive=true: GSI consent popup
 * 3. If interactive=true: Firebase popup fallback
 */
async function refreshAccessToken(interactive = false) {
  // 1. Try silent GSI refresh first
  console.log('[gcal] Attempting silent token refresh...');
  let token = await requestGsiToken('');
  if (token) return token;

  if (!interactive) return null;

  // 2. Interactive: GSI consent popup
  console.log('[gcal] Attempting interactive GSI token request...');
  token = await requestGsiToken('consent');
  if (token) return token;

  // 3. Fallback: Firebase popup
  if (auth.currentUser) {
    try {
      console.log('[gcal] Attempting Firebase popup re-auth...');
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      provider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        localStorage.setItem('auth.googleAccessToken', credential.accessToken);
        const expiryMs = Date.now() + 3300 * 1000;
        localStorage.setItem('auth.accessTokenExpiresAt', String(expiryMs));
        localStorage.setItem('auth.gcalConnected', 'true');
        
        // Extract clientId from JWT idToken if available
        extractAndSaveClientId(result, credential);
        return credential.accessToken;
      }
    } catch (err) {
      console.warn('[gcal] Firebase popup refresh failed:', err);
    }
  }

  return null;
}

function extractAndSaveClientId(result, credential) {
  try {
    const tokenResponse = (result && result._tokenResponse) || {};
    let clientId = tokenResponse.clientId || tokenResponse.oauthClientId || null;
    const idToken = (credential && credential.idToken) || tokenResponse.idToken || tokenResponse.oauthIdToken;
    if (!clientId && idToken) {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload && payload.aud) {
          clientId = payload.aud;
        }
      }
    }
    if (clientId) {
      localStorage.setItem('auth.clientId', clientId);
      console.log('[auth] Saved Google OAuth clientId:', clientId);
    }
  } catch (e) {
    console.warn('[auth] Could not extract clientId:', e);
  }
}

/**
 * Get a valid access token, refreshing proactively if near expiry.
 */
async function getValidAccessToken() {
  let token = localStorage.getItem('auth.googleAccessToken');
  const expiresAt = parseInt(localStorage.getItem('auth.accessTokenExpiresAt') || '0', 10);

  // If token exists and is not close to expiry, use it directly
  if (token && expiresAt && Date.now() < expiresAt - 300000) {
    return token;
  }

  // Token is missing or within 5 minutes of expiry — try silent refresh
  console.log('[gcal] Token expired or near expiry. Attempting silent refresh...');
  const newToken = await refreshAccessToken(false);
  if (newToken) return newToken;

  // If we still have the old token and it hasn't fully expired yet, use it anyway
  if (token && expiresAt && Date.now() < expiresAt + 60000) {
    console.log('[gcal] Using existing token (recently expired, may still work)');
    return token;
  }

  return token; // May be null — caller handles the error
}

// Proactively refresh Google Calendar access token every 45 minutes in background
setInterval(async () => {
  const isConnected = localStorage.getItem('auth.gcalConnected') === 'true';
  const user = localStorage.getItem('auth.user');
  if (user && isConnected) {
    console.log('[gcal] Proactive background token refresh...');
    const token = await refreshAccessToken(false);
    if (token) {
      console.log('[gcal] Background refresh successful');
    } else {
      console.warn('[gcal] Background refresh failed — token will expire soon');
    }
  }
}, 45 * 60 * 1000);

// Also refresh immediately when the page regains focus (user switches back to tab)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const isConnected = localStorage.getItem('auth.gcalConnected') === 'true';
  const user = localStorage.getItem('auth.user');
  const expiresAt = parseInt(localStorage.getItem('auth.accessTokenExpiresAt') || '0', 10);
  // Only refresh if token is within 10 minutes of expiry or already expired
  if (user && isConnected && expiresAt && Date.now() >= expiresAt - 600000) {
    console.log('[gcal] Tab refocused with near-expiry token. Refreshing...');
    await refreshAccessToken(false);
  }
});

async function fetchWithToken(endpoint, options = {}) {
  let token = await getValidAccessToken();
  if (!token) throw new Error('No Google Access Token available. User must re-authenticate.');

  let res = await fetch(`${GCAL_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  if (res.status === 401) {
    console.warn('[gcal] 401 received. Attempting silent refresh and retry...');
    // Clear the expired token
    localStorage.removeItem('auth.googleAccessToken');
    localStorage.removeItem('auth.accessTokenExpiresAt');

    const newToken = await refreshAccessToken(false);
    if (newToken) {
      res = await fetch(`${GCAL_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newToken}`,
          'Accept': 'application/json'
        }
      });
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar API Error: ${res.status} - ${errText}`);
  }

  return await res.json();
}

async function fetchCalendars() {
  const data = await fetchWithToken('/users/me/calendarList');
  const items = data.items || [];
  return items.map(cal => ({
    id: cal.id,
    summary: cal.summary,
    color: cal.backgroundColor,
    primary: cal.primary || false
  }));
}

async function fetchEvents(calendarId, timeMin, timeMax) {
  let allItems = [];
  let pageToken = null;
  let pageCount = 0;
  const maxPages = 20; // safety limit (up to 50,000 events)

  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500'
    });
    if (timeMin) params.append('timeMin', timeMin);
    if (timeMax) params.append('timeMax', timeMax);
    if (pageToken) params.append('pageToken', pageToken);

    const data = await fetchWithToken(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
    const items = data.items || [];
    allItems = allItems.concat(items);
    pageToken = data.nextPageToken || null;
    pageCount++;
  } while (pageToken && pageCount < maxPages);

  return allItems
    .filter(item => item && item.status !== 'cancelled' && item.start && (item.start.date || item.start.dateTime))
    .map(item => {
      let date = null;
      let startTime = null;
      let endTime = null;
      const isAllDay = !!item.start.date;

      if (isAllDay) {
        date = item.start.date;
      } else if (item.start.dateTime) {
        const startD = new Date(item.start.dateTime);
        const endD = new Date(item.end && item.end.dateTime ? item.end.dateTime : item.start.dateTime);

        const yyyy = startD.getFullYear();
        const mm = String(startD.getMonth() + 1).padStart(2, '0');
        const dd = String(startD.getDate()).padStart(2, '0');
        date = `${yyyy}-${mm}-${dd}`;

        const stH = String(startD.getHours()).padStart(2, '0');
        const stM = String(startD.getMinutes()).padStart(2, '0');
        startTime = `${stH}:${stM}`;

        const etH = String(endD.getHours()).padStart(2, '0');
        const etM = String(endD.getMinutes()).padStart(2, '0');
        endTime = `${etH}:${etM}`;
      }

      let location = item.location || '';
      let description = item.description || '';

      // Fallback location extraction from description
      if (!location && description) {
        const firstLine = description.split(/<br\s*[\/]?>|\n/i)[0].trim();
        if (firstLine && firstLine.length < 60 && !firstLine.includes('<a ') && !firstLine.includes('http')) {
          location = firstLine;
        }
      }

      return {
        id: `gcal-${item.id}`,
        gcalId: item.id,
        calendarId: calendarId,
        title: item.summary || '(No title)',
        description,
        date,
        startTime,
        endTime,
        htmlLink: item.htmlLink,
        hangoutLink: item.hangoutLink || '',
        location,
        isAllDay
      };
    })
    .filter(evt => !!evt.date);
}

async function reconnectGoogleCalendar() {
  const token = await refreshAccessToken(true);
  return token ? { success: true, token } : { error: 'Failed to reconnect Google Calendar' };
}

export {
  ensureGsiClient,
  resetGsiClient,
  requestGsiToken,
  refreshAccessToken,
  reconnectGoogleCalendar,
  getValidAccessToken,
  fetchCalendars,
  fetchEvents,
  fetchCalendars as fetchGoogleCalendars,
  fetchEvents as fetchGoogleCalendarEvents
};
