/**
 * gcal-api.js
 * Google Calendar REST API & Google Identity Services (GSI) OAuth token manager.
 */

import { reauthenticateWithFirebasePopup, extractAndSaveClientId } from './cloud-sync.js?v=82';

// ===== GOOGLE CALENDAR API =====
const GCAL_BASE_URL = 'https://www.googleapis.com/calendar/v3';

// Google Identity Services (GSI) Client-Side Token Management
let _gsiTokenClient = null;
let _gsiInitialized = false;
let _gsiPendingResolve = null;
let _refreshPromise = null;

/**
 * Reset GSI client instance when switching or signing out accounts.
 */
function resetGsiClient() {
  _gsiTokenClient = null;
  _gsiInitialized = false;
  if (_gsiPendingResolve) {
    const cb = _gsiPendingResolve;
    _gsiPendingResolve = null;
    cb(null);
  }
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
          if (_gsiPendingResolve) {
            const cb = _gsiPendingResolve;
            _gsiPendingResolve = null;
            cb(resp.access_token);
          }
        } else {
          console.warn('[gcal] GSI response missing access_token:', resp);
          if (_gsiPendingResolve) {
            const cb = _gsiPendingResolve;
            _gsiPendingResolve = null;
            cb(null);
          }
        }
      },
      error_callback: (err) => {
        if (err && err.type !== 'popup_closed') {
          console.warn('[gcal] GSI error:', err);
        }
        if (_gsiPendingResolve) {
          const cb = _gsiPendingResolve;
          _gsiPendingResolve = null;
          cb(null);
        }
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

/** Calendar consent is interactive; background work must never open OAuth windows. */
async function refreshAccessToken(interactive = false) {
  if (!interactive) return getValidAccessToken();
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      return await requestGsiToken('consent');
    } catch (err) {
      console.warn('[gcal] Token refresh failed:', err);
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

async function getValidAccessToken() {
  const token = localStorage.getItem('auth.googleAccessToken');
  // The stored deadline already includes a five-minute safety margin.
  const expiresAt = Number(localStorage.getItem('auth.accessTokenExpiresAt') || 0);
  return token && Date.now() < expiresAt ? token : null;
}
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
    localStorage.removeItem('auth.googleAccessToken');
    localStorage.removeItem('auth.accessTokenExpiresAt');
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
      let endDate = null;
      let startTime = null;
      let endTime = null;
      const isAllDay = !!item.start.date;

      if (isAllDay) {
        date = item.start.date;
        if (item.end && item.end.date) {
          // Google Calendar end.date for all-day events is exclusive. Convert to inclusive endDate:
          try {
            const endParts = item.end.date.split('-').map(Number);
            const endD = new Date(endParts[0], endParts[1] - 1, endParts[2]);
            endD.setDate(endD.getDate() - 1);
            const y = endD.getFullYear();
            const m = String(endD.getMonth() + 1).padStart(2, '0');
            const d = String(endD.getDate()).padStart(2, '0');
            endDate = `${y}-${m}-${d}`;
            if (endDate < date) endDate = date;
          } catch (e) {
            endDate = date;
          }
        } else {
          endDate = date;
        }
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

        if (endD > startD && endD.getHours() === 0 && endD.getMinutes() === 0 && endD.getSeconds() === 0) {
          // Event ends at exactly midnight (12:00 AM) at the day boundary.
          // Google Calendar places end.dateTime at 00:00:00 of the following day.
          // The event has 0 duration on the following day, so adjust endDate back to the day of endD - 1 second.
          const adjEnd = new Date(endD.getTime() - 1000);
          const endY = adjEnd.getFullYear();
          const endM = String(adjEnd.getMonth() + 1).padStart(2, '0');
          const endDay = String(adjEnd.getDate()).padStart(2, '0');
          endDate = `${endY}-${endM}-${endDay}`;
          if (endDate < date) endDate = date;
          endTime = '24:00';
        } else {
          const endY = endD.getFullYear();
          const endM = String(endD.getMonth() + 1).padStart(2, '0');
          const endDay = String(endD.getDate()).padStart(2, '0');
          endDate = `${endY}-${endM}-${endDay}`;
          if (endDate < date) endDate = date;

          const etH = String(endD.getHours()).padStart(2, '0');
          const etM = String(endD.getMinutes()).padStart(2, '0');
          endTime = `${etH}:${etM}`;
        }
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
        endDate: endDate || date,
        isMultiDay: Boolean(endDate && endDate > date),
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
