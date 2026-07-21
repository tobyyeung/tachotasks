/**
 * gcal-service.js
 * Service for fetching calendars and events directly from the Google Calendar v3 API.
 */

const { store } = require('./store');

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

/**
 * Performs an authenticated HTTP fetch request to the Google Calendar API.
 * @param {string} endpoint - API endpoint path.
 * @param {Object} [options={}] - Extra fetch options.
 * @returns {Promise<Object>} JSON response.
 */
async function fetchWithToken(endpoint, options = {}) {
  const token = store.get('auth.googleAccessToken');
  if (!token) {
    throw new Error('No Google Access Token available. User must re-authenticate.');
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

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
