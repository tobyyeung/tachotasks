/**
 * gcal-service.js
 * Service for fetching calendars and events directly from the Google Calendar v3 API.
 */

const { store } = require('./store');

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

/**
 * Refreshes the Google Access Token using the stored refresh_token if available.
 * @returns {Promise<string|null>} New access token if successful, null otherwise.
 */
async function refreshAccessToken() {
  const refreshToken = store.get('auth.refreshToken');
  const clientId = store.get('auth.clientId') || process.env.GOOGLE_CLIENT_ID;

  if (refreshToken) {
    try {
      console.log('[gcal-service] Refreshing access token via refresh_token...');
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });
      if (clientId) {
        params.append('client_id', clientId);
      }

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          store.set('auth.googleAccessToken', data.access_token);
          const expiryMs = Date.now() + ((data.expires_in || 3600) - 300) * 1000;
          store.set('auth.accessTokenExpiresAt', expiryMs);
          console.log('[gcal-service] Successfully refreshed access token.');
          return data.access_token;
        }
      } else {
        const errText = await res.text();
        console.warn('[gcal-service] Refresh token request returned error:', res.status, errText);
      }
    } catch (e) {
      console.warn('[gcal-service] Failed to refresh access token using refresh_token:', e);
    }
  }
  return null;
}

/**
 * Gets a valid Google Access Token, attempting automatic refresh if expired.
 * @returns {Promise<string|null>} Valid access token or null.
 */
async function getValidAccessToken() {
  let token = store.get('auth.googleAccessToken');
  const expiresAt = store.get('auth.accessTokenExpiresAt');

  if (!token || (expiresAt && Date.now() >= expiresAt)) {
    console.log('[gcal-service] Token is missing or expired. Attempting token refresh...');
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
    }
  }
  return token;
}

/**
 * Performs an authenticated HTTP fetch request to the Google Calendar API.
 * @param {string} endpoint - API endpoint path.
 * @param {Object} [options={}] - Extra fetch options.
 * @returns {Promise<Object>} JSON response.
 */
async function fetchWithToken(endpoint, options = {}) {
  let token = await getValidAccessToken();
  if (!token) {
    throw new Error('No Google Access Token available. User must re-authenticate.');
  }

  let res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  if (res.status === 401) {
    console.warn('[gcal-service] 401 Unauthorized received. Retrying with token refresh...');
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${BASE_URL}${endpoint}`, {
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

/**
 * Fetches the user's primary and secondary Google Calendars.
 * @returns {Promise<Array>} List of calendar summary objects.
 */
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

/**
 * Fetches events for a specific calendar within an optional time range.
 * @param {string} calendarId - The Google Calendar ID.
 * @param {string} [timeMin] - ISO string for minimum time.
 * @param {string} [timeMax] - ISO string for maximum time.
 * @returns {Promise<Array>} Normalized event objects.
 */
async function fetchEvents(calendarId, timeMin, timeMax) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250'
  });

  if (timeMin) params.append('timeMin', timeMin);
  if (timeMax) params.append('timeMax', timeMax);

  const data = await fetchWithToken(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
  const items = data.items || [];
  return items.map(item => {
    let date = null;
    let startTime = null;
    let endTime = null;
    const isAllDay = !!item.start.date;

    if (isAllDay) {
      date = item.start.date;
    } else if (item.start.dateTime) {
      const startD = new Date(item.start.dateTime);
      const endD = new Date(item.end.dateTime);

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
      title: item.summary,
      description,
      date,
      startTime,
      endTime,
      htmlLink: item.htmlLink,
      hangoutLink: item.hangoutLink || '',
      location,
      isAllDay
    };
  });
}

module.exports = { fetchCalendars, fetchEvents };
