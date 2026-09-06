import { calendarBackendConfig } from './calendar-backend-config.js';
import { getCurrentUser, getFirebaseIdToken } from './cloud-sync.js';

let cached = null;
let pending = null;
let connecting = null;
let generation = 0;
let retryAfter = 0;
let retryError = null;

export function calendarBackendEnabled() { return calendarBackendConfig.enabled === true; }

export function resetCalendarBackend() {
  generation++;
  cached = null;
  pending = null;
  connecting = null;
  retryAfter = 0;
  retryError = null;
}

async function request(path, body, uid) {
  const idToken = await getFirebaseIdToken();
  if (getCurrentUser()?.uid !== uid) throw new Error('Google account changed. Please retry.');
  const res = await fetch(`${calendarBackendConfig.url.replace(/\/$/, '')}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'X-Requested-With': 'XmlHttpRequest' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json();
  if (getCurrentUser()?.uid !== uid) throw new Error('Google account changed. Please retry.');
  if (!res.ok) {
    const error = new Error(data.error || 'CALENDAR_CONNECTION_FAILED');
    error.code = data.error;
    throw error;
  }
  return data;
}

function cacheToken(result, uid, started) {
  if (generation !== started || getCurrentUser()?.uid !== uid) return null;
  if (!result.accessToken || !(result.expiresAt > Date.now())) throw new Error('INVALID_GOOGLE_RESPONSE');
  cached = { ...result, uid };
  retryAfter = 0;
  retryError = null;
  localStorage.setItem('auth.gcalConnected', 'true');
  return result.accessToken;
}

// Only short-lived access tokens live in memory. Refresh tokens never reach the browser.
export async function getBackendCalendarToken(rejectedToken = null) {
  const uid = getCurrentUser()?.uid;
  if (!uid) return null;
  if (cached?.uid === uid && cached.expiresAt > Date.now() + 60000 && cached.accessToken !== rejectedToken) return cached.accessToken;
  if (pending) return pending;
  if (Date.now() < retryAfter) {
    if (retryError) throw retryError;
    return null;
  }
  const started = generation;
  const work = request('token', { rejectedToken }, uid)
    .then(result => cacheToken(result, uid, started))
    .catch(error => {
      if (generation === started) {
        retryAfter = Date.now() + 30000;
        retryError = error;
        if (error.code === 'RECONNECT_REQUIRED') {
          cached = null;
          retryError = null;
          return null;
        }
      }
      throw error;
    })
    .finally(() => { if (pending === work) pending = null; });
  pending = work;
  return work;
}

// Called synchronously from the existing Reconnect button to preserve user activation.
export function connectCalendarBackend() {
  if (connecting) return connecting;
  const uid = getCurrentUser()?.uid;
  if (!uid) return Promise.reject(new Error('Sign in before connecting Google Calendar.'));
  const oauth = window.google?.accounts?.oauth2;
  if (!calendarBackendConfig.clientId || !oauth?.initCodeClient) {
    return Promise.reject(new Error('Google Calendar connection is not configured or Google is still loading.'));
  }
  const started = generation;
  const work = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(token);
    };
    const timer = setTimeout(() => finish(new Error('Google connection timed out. Click Reconnect to retry.')), 120000);
    try {
      const client = oauth.initCodeClient({
        client_id: calendarBackendConfig.clientId,
        scope: 'openid email https://www.googleapis.com/auth/calendar.readonly',
        ux_mode: 'popup',
        hint: getCurrentUser()?.email,
        callback: async response => {
          if (settled) return;
          if (response.error || !response.code) return finish(new Error('Google Calendar permission was not granted.'));
          try {
            if (generation !== started) throw new Error('Google account changed. Please retry.');
            const result = await request('connect', { code: response.code }, uid);
            finish(null, cacheToken(result, uid, started));
          } catch (error) { finish(error); }
        },
        error_callback: () => finish(new Error('Google connection was closed or blocked. Click Reconnect to retry.'))
      });
      client.requestCode();
    } catch (error) { finish(error); }
  }).finally(() => { if (connecting === work) connecting = null; });
  connecting = work;
  return work;
}

export async function disconnectCalendarBackend() {
  const uid = getCurrentUser()?.uid;
  if (!uid) throw new Error('Sign in before disconnecting Google Calendar.');
  await request('disconnect', {}, uid);
  resetCalendarBackend();
  localStorage.removeItem('auth.gcalConnected');
}
