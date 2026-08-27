/**
 * browser-api.js
 * Browser-native replacement for Electron's preload/main/store/cloud-bg/auth/gcal stack.
 * Provides the same `window.api` interface so all renderer code works without changes.
 *
 * Persistence: localStorage
 * Auth: Firebase Auth (browser SDK via CDN imports)
 * Cloud Sync: Firestore (browser SDK via CDN imports)
 * Google Calendar: REST API via fetch()
 * NLP: Lightweight regex-based parser (replaces chrono-node)
 */

// Firebase SDK imports (loaded from CDN in index.html)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, GoogleAuthProvider, signInWithCredential } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ===== FIREBASE INITIALIZATION =====
const firebaseConfig = {
  apiKey: "AIzaSyB0bIsPGQxlStHK2lCdVzJbzbszZ4EHQxs",
  authDomain: "tachotasks-d7c56.firebaseapp.com",
  projectId: "tachotasks-d7c56",
  storageBucket: "tachotasks-d7c56.firebasestorage.app",
  messagingSenderId: "179662622348",
  appId: "1:179662622348:web:a8e73c612777be7b9035a9"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

let _currentUser = null;
const _authCallbacks = [];

// Listen for Firebase auth state changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    _currentUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    };
    localStorage.setItem('auth.user', JSON.stringify(_currentUser));
    // Pre-initialize GSI client for silent token refresh
    setTimeout(() => { try { ensureGsiClient(); } catch (e) {} }, 1000);
  } else {
    // Check if we have stored credentials before wiping
    const storedUser = localStorage.getItem('auth.user');
    const storedToken = localStorage.getItem('auth.googleAccessToken');
    if (storedUser && storedToken) {
      _currentUser = JSON.parse(storedUser);
      // Pre-initialize GSI client even from stored credentials
      setTimeout(() => { try { ensureGsiClient(); } catch (e) {} }, 1000);
    } else {
      _currentUser = null;
      localStorage.removeItem('auth.user');
    }
  }
  _authCallbacks.forEach(cb => {
    try { cb(_currentUser); } catch (e) { console.error('Auth callback error:', e); }
  });
});

// ===== LOCAL STORAGE HELPERS =====
function lsGet(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(`tachotasks.${key}`);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(`tachotasks.${key}`, JSON.stringify(value));
  } catch (e) {
    console.error('localStorage write error:', e);
  }
}

function lsDelete(key) {
  localStorage.removeItem(`tachotasks.${key}`);
}

// ===== SYNC DEBOUNCE =====
let _syncTimeout = null;

function triggerSyncToCloud() {
  if (_syncTimeout) clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(() => {
    performSyncToCloud().catch(e => console.warn('Auto-sync error:', e));
  }, 500);
}

// ===== FIRESTORE SYNC =====
function cleanObjectForFirestore(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanObjectForFirestore);
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanObjectForFirestore(value);
    }
  }
  return cleaned;
}

let _isSyncing = false;
let _isSyncQueued = false;

/**
 * Wait for Firebase Auth to restore its session (up to maxWaitMs).
 * Returns true if a user session is available, false if timed out.
 */
function waitForFirebaseAuth(maxWaitMs = 5000) {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(true);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(true); }
    });
    setTimeout(() => { unsub(); resolve(!!auth.currentUser); }, maxWaitMs);
  });
}

async function performSyncToCloud() {
  if (!_currentUser) return;
  // Wait for Firebase to actually be authenticated before hitting Firestore
  if (!auth.currentUser) {
    const ready = await waitForFirebaseAuth(3000);
    if (!ready) { console.warn('[sync] Firebase not ready, skipping push'); return; }
  }

  if (_isSyncing) {
    _isSyncQueued = true;
    return;
  }
  _isSyncing = true;

  const uid = (auth.currentUser && auth.currentUser.uid) || (_currentUser && _currentUser.uid);
  if (!uid) return;

  try {
    const collections = ['tasks', 'projects', 'profiles', 'archivedTasks'];
    for (const collName of collections) {
      const items = lsGet(collName, []);
      const itemIds = new Set(items.map(i => i.id).filter(Boolean));

      const collRef = collection(db, `users/${uid}/${collName}`);
      const snapshot = await getDocs(collRef);

      const batch = writeBatch(db);

      // Delete docs in cloud that are not in local store
      snapshot.forEach(docSnap => {
        if (!itemIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });

      for (const item of items) {
        if (!item.id) continue;
        const docRef = doc(db, `users/${uid}/${collName}`, item.id);
        batch.set(docRef, cleanObjectForFirestore(item));
      }
      await batch.commit();
    }

    const settings = lsGet('settings', {});
    if (settings) {
      await setDoc(doc(db, `users/${uid}/settings`, 'preferences'), cleanObjectForFirestore(settings));
    }
    lsSet('lastSyncTimestamp', Date.now());
  } catch (err) {
    if (err.message && (err.message.includes('permission') || err.code === 'permission-denied')) {
      return;
    }
    console.error('syncToCloud error:', err);
    throw err;
  } finally {
    _isSyncing = false;
    if (_isSyncQueued) {
      _isSyncQueued = false;
      performSyncToCloud().catch(e => console.warn('Queued sync error:', e));
    }
  }
}

async function performSyncFromCloud() {
  if (!_currentUser) return { error: 'Not authenticated' };
  // Wait for Firebase to actually be authenticated before hitting Firestore
  if (!auth.currentUser) {
    const ready = await waitForFirebaseAuth(5000);
    if (!ready) return { error: 'Not authenticated' };
  }
  const uid = (auth.currentUser && auth.currentUser.uid) || (_currentUser && _currentUser.uid);
  if (!uid) return { error: 'Not authenticated' };

  try {
    let needsCloudFix = false;
    const collections = ['tasks', 'projects', 'profiles', 'archivedTasks'];
    const newData = {};
    try { localStorage.removeItem('tt_reminders'); } catch (e) {}

    for (const collName of collections) {
      const collRef = collection(db, `users/${uid}/${collName}`);
      const snapshot = await getDocs(collRef);
      const items = [];
      snapshot.forEach(docSnap => {
        let item = docSnap.data();
        if (!item.id) item.id = docSnap.id;

        // Sanitize deprecated fields from cloud documents (Persistence & Cloud Sync Verification Rule)
        if (collName === 'tasks' || collName === 'archivedTasks') {
          if ('scheduledStartTime' in item || 'scheduledEndTime' in item || 'scheduledDate' in item || 'isInbox' in item) {
            delete item.scheduledStartTime;
            delete item.scheduledEndTime;
            delete item.scheduledDate;
            delete item.isInbox;
            needsCloudFix = true;
          }
        }
        if (collName === 'projects') {
          if (item.categoryId) {
            item.profileId = item.categoryId;
            delete item.categoryId;
            needsCloudFix = true;
          }
          if (item.profileId && item.profileId.startsWith('cat-')) {
            item.profileId = item.profileId.replace('cat-', 'profile-');
            needsCloudFix = true;
          }
          if (item.parentProjectId && typeof item.parentProjectId === 'object') {
            item.parentProjectId = null;
            needsCloudFix = true;
          }
        }
        if (collName === 'profiles' && item.id && item.id.startsWith('cat-')) {
          item.id = item.id.replace('cat-', 'profile-');
          needsCloudFix = true;
        }
        items.push(item);
      });
      lsSet(collName, items);
      newData[collName] = items;
    }

    // Settings
    const settingsSnap = await getDocs(collection(db, `users/${uid}/settings`));
    for (const docSnap of settingsSnap.docs) {
      if (docSnap.id === 'preferences') {
        const data = docSnap.data();
        if (data.profiles) {
          needsCloudFix = true;
          if (!newData.profiles || newData.profiles.length === 0) {
            const migrated = data.profiles.map(p => {
              if (p.id.startsWith('cat-')) p.id = p.id.replace('cat-', 'profile-');
              return p;
            });
            lsSet('profiles', migrated);
            newData.profiles = migrated;
          }
          delete data.profiles;
        }
        lsSet('settings', data);
        newData.settings = data;
      }
    }

    lsSet('lastSyncTimestamp', Date.now());
    const timestamp = lsGet('lastSyncTimestamp');

    if (needsCloudFix) {
      performSyncToCloud().catch(err => console.error('Cloud fix error:', err));
    }

    return { success: true, timestamp, data: newData };
  } catch (err) {
    if (err.message && (err.message.includes('permission') || err.code === 'permission-denied')) {
      return { error: 'Permission denied' };
    }
    console.error('syncFromCloud error:', err);
    return { error: err.message };
  }
}

// ===== GOOGLE CALENDAR API =====
const GCAL_BASE_URL = 'https://www.googleapis.com/calendar/v3';

// Google Identity Services (GSI) Client-Side Token Management
let _gsiTokenClient = null;
let _gsiInitialized = false;
let _gsiPendingResolve = null;

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

  const user = _currentUser || JSON.parse(localStorage.getItem('auth.user') || 'null');
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

// ===== NLP PARSER (browser-compatible, replaces chrono-node) =====
function parseNaturalLanguage(text) {
  const result = { title: text, priority: null, tags: [], projectName: null, dueDate: null, dueTime: null, recurring: null };
  let cleaned = text;

  // Priority extraction
  const prioKeyword = cleaned.match(/\b(p[1-4])\b/i);
  if (prioKeyword) {
    result.priority = prioKeyword[1].toUpperCase();
    cleaned = cleaned.replace(prioKeyword[0], '');
  } else if (cleaned.includes('!!!')) {
    result.priority = 'P1'; cleaned = cleaned.replace('!!!', '');
  } else if (cleaned.includes('!!')) {
    result.priority = 'P2'; cleaned = cleaned.replace('!!', '');
  }

  // Tag extraction
  const tagRe = /@(\w+)/g;
  let tagMatch;
  while ((tagMatch = tagRe.exec(cleaned)) !== null) result.tags.push('@' + tagMatch[1]);
  cleaned = cleaned.replace(/@\w+/g, '');

  // Project extraction
  const projMatch = cleaned.match(/#(\w+)/);
  if (projMatch) { result.projectName = projMatch[1]; cleaned = cleaned.replace(/#\w+/g, ''); }

  // Recurring pattern extraction
  const recurMatch = cleaned.match(/\bevery\s+(day|daily|week|weekly|month|monthly|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (recurMatch) {
    const freq = recurMatch[1].toLowerCase();
    if (freq === 'day' || freq === 'daily') result.recurring = { frequency: 'daily' };
    else if (freq === 'week' || freq === 'weekly') result.recurring = { frequency: 'weekly' };
    else if (freq === 'month' || freq === 'monthly') result.recurring = { frequency: 'monthly' };
    else {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      result.recurring = { frequency: 'weekly', day: dayNames.indexOf(freq) };
    }
    cleaned = cleaned.replace(recurMatch[0], '');
  }

  // Date and time extraction (browser-compatible, replaces chrono-node)
  const today = new Date();
  const dayNamesFull = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // "today" / "tod"
  let dateMatch = cleaned.match(/\b(today|tod)\b/i);
  if (dateMatch) {
    result.dueDate = toISODate(today);
    cleaned = cleaned.replace(dateMatch[0], '');
  }

  // "tomorrow" / "tmr" / "tmrw"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\b(tomorrow|tmr|tmrw)\b/i);
    if (dateMatch) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      result.dueDate = toISODate(d);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // "yesterday"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\byesterday\b/i);
    if (dateMatch) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      result.dueDate = toISODate(d);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // "next monday", "next friday", etc.
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i);
    if (dateMatch) {
      const rawDay = dateMatch[1].toLowerCase();
      let targetDay = dayNamesFull.findIndex(d => d.startsWith(rawDay.slice(0, 3)));
      if (targetDay !== -1) {
        const d = new Date(today);
        let diff = targetDay - d.getDay();
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        result.dueDate = toISODate(d);
        cleaned = cleaned.replace(dateMatch[0], '');
      }
    }
  }

  // "on monday", "on friday", "fri", "monday", etc.
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i);
    if (dateMatch) {
      const rawDay = dateMatch[1].toLowerCase();
      let targetDay = dayNamesFull.findIndex(d => d.startsWith(rawDay.slice(0, 3)));
      if (targetDay !== -1) {
        const d = new Date(today);
        let diff = targetDay - d.getDay();
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        result.dueDate = toISODate(d);
        cleaned = cleaned.replace(dateMatch[0], '');
      }
    }
  }

  // "in X days"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\bin\s+(\d+)\s+days?\b/i);
    if (dateMatch) {
      const d = new Date(today);
      d.setDate(d.getDate() + parseInt(dateMatch[1], 10));
      result.dueDate = toISODate(d);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // "Jan 15", "December 3", etc.
  if (!result.dueDate) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const monthsShort = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    dateMatch = cleaned.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i);
    if (dateMatch) {
      const monthName = dateMatch[1].toLowerCase();
      let monthIdx = months.indexOf(monthName);
      if (monthIdx === -1) monthIdx = monthsShort.indexOf(monthName);
      const day = parseInt(dateMatch[2], 10);
      const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : today.getFullYear();
      const d = new Date(year, monthIdx, day);
      // If the date is in the past and no year was specified, push to next year
      if (!dateMatch[3] && d < today) d.setFullYear(d.getFullYear() + 1);
      result.dueDate = toISODate(d);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // "12/25", "12/25/2026", "2026-12-25"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (dateMatch) {
      const m = parseInt(dateMatch[1], 10) - 1;
      const d = parseInt(dateMatch[2], 10);
      let y = dateMatch[3] ? parseInt(dateMatch[3], 10) : today.getFullYear();
      if (y < 100) y += 2000;
      const dt = new Date(y, m, d);
      if (!dateMatch[3] && dt < today) dt.setFullYear(dt.getFullYear() + 1);
      result.dueDate = toISODate(dt);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // ISO date "2026-08-25"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (dateMatch) {
      result.dueDate = dateMatch[0];
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // Time extraction: "at 3pm", "at 14:30", "3:00 pm", "3pm"
  const timeMatch = cleaned.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : null;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    // Only treat as time if it looks like a real time (has am/pm or colon or preceded by "at")
    if (ampm || timeMatch[2] || cleaned.match(new RegExp('\\bat\\s+' + timeMatch[1]))) {
      result.dueTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      cleaned = cleaned.replace(timeMatch[0], '');
    }
  }

  result.title = cleaned.replace(/\s+/g, ' ').trim();
  return result;
}

function toISODate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ===== WINDOW.API INTERFACE =====
window.api = {
  // Tasks CRUD
  getTasks: async () => lsGet('tasks', []),
  saveTasks: async (tasks) => { lsSet('tasks', tasks); triggerSyncToCloud(); return true; },
  getArchivedTasks: async () => lsGet('archivedTasks', []),
  saveArchivedTasks: async (tasks) => { lsSet('archivedTasks', tasks); triggerSyncToCloud(); return true; },

  // Projects CRUD
  getProjects: async () => lsGet('projects', []),
  saveProjects: async (projects) => { lsSet('projects', projects); triggerSyncToCloud(); return true; },

  // Profiles CRUD
  getProfiles: async () => lsGet('profiles', []),
  saveProfiles: async (profiles) => { lsSet('profiles', profiles); triggerSyncToCloud(); return true; },

  // Reminders (Deprecated)
  getReminders: async () => [],
  saveReminders: async () => true,

  // Settings CRUD
  getSettings: async () => lsGet('settings', {}),
  saveSettings: async (settings) => { lsSet('settings', settings); triggerSyncToCloud(); return true; },

  // Natural Language Parsing
  parseNaturalLanguage: async (text) => parseNaturalLanguage(text),

  // Authentication
  signIn: async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      provider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');
      // Don't force consent on every sign-in — let Google handle it
      provider.setCustomParameters({
        access_type: 'offline',
        prompt: 'select_account'
      });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential ? credential.accessToken : null;
      const tokenResponse = result._tokenResponse || {};
      const expiresIn = tokenResponse.oauthExpireIn || 3600;
      const clientId = tokenResponse.clientId || tokenResponse.oauthClientId || null;

      if (accessToken) {
        localStorage.setItem('auth.googleAccessToken', accessToken);
        const expiryMs = Date.now() + ((expiresIn || 3600) - 300) * 1000;
        localStorage.setItem('auth.accessTokenExpiresAt', String(expiryMs));
        localStorage.setItem('auth.gcalConnected', 'true');
      }
      extractAndSaveClientId(result, credential);

      // Initialize GSI client immediately so silent refresh works later
      _gsiInitialized = false;
      ensureGsiClient();

      return { success: true };
    } catch (err) {
      console.error('Firebase signInWithPopup error:', err);
      return { error: err.code ? `${err.code}: ${err.message}` : (err.message || 'Sign in failed') };
    }
  },

  signOut: async () => {
    try {
      _currentUser = null;
      _gsiInitialized = false;
      _gsiTokenClient = null;
      localStorage.removeItem('auth.user');
      localStorage.removeItem('auth.googleAccessToken');
      localStorage.removeItem('auth.refreshToken');
      localStorage.removeItem('auth.clientId');
      localStorage.removeItem('auth.accessTokenExpiresAt');
      localStorage.removeItem('auth.gcalConnected');
      await firebaseSignOut(auth);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  },

  getUser: async () => {
    if (_currentUser) return _currentUser;
    try {
      const stored = localStorage.getItem('auth.user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  },

  onAuthStateChanged: (callback) => {
    _authCallbacks.push(callback);
  },

  // Cloud Synchronization
  syncPull: async () => {
    // If there are pending local changes, push first
    if (_syncTimeout) {
      clearTimeout(_syncTimeout);
      _syncTimeout = null;
      await performSyncToCloud();
    }
    return await performSyncFromCloud();
  },

  syncPush: async () => {
    try {
      await performSyncToCloud();
      const timestamp = lsGet('lastSyncTimestamp');
      return { success: true, timestamp };
    } catch (err) {
      return { error: err.message };
    }
  },

  // Google Calendar Integration
  reconnectGCal: async () => {
    try {
      console.log('[gcal] Reconnecting Google Calendar...');
      let token = await refreshAccessToken(true);
      if (token) return { success: true, token };
      return { error: 'Failed to reconnect Google Calendar' };
    } catch (e) {
      return { error: e.message };
    }
  },

  getGCalCalendars: async () => {
    try {
      return await fetchCalendars();
    } catch (e) {
      console.error('Failed to fetch Google Calendars:', e);
      if (e.message.includes('401') || e.message.includes('No Google Access Token')) {
        // Try one interactive refresh before giving up
        console.log('[gcal] Calendar fetch failed. Attempting interactive refresh...');
        const token = await refreshAccessToken(true);
        if (token) {
          try { return await fetchCalendars(); } catch (e2) {
            return { error: 'SESSION_EXPIRED' };
          }
        }
        return { error: 'SESSION_EXPIRED' };
      }
      return { error: e.message };
    }
  },

  getGCalEvents: async (calendarIds, timeMin, timeMax) => {
    try {
      let allEvents = [];
      for (const calId of calendarIds) {
        const evts = await fetchEvents(calId, timeMin, timeMax);
        allEvents = allEvents.concat(evts);
      }
      return allEvents;
    } catch (e) {
      console.error('Failed to fetch Google Events:', e);
      if (e.message.includes('401') || e.message.includes('No Google Access Token')) {
        // Try one interactive refresh before giving up
        console.log('[gcal] Events fetch failed. Attempting interactive refresh...');
        const token = await refreshAccessToken(true);
        if (token) {
          try {
            let allEvents = [];
            for (const calId of calendarIds) {
              const evts = await fetchEvents(calId, timeMin, timeMax);
              allEvents = allEvents.concat(evts);
            }
            return allEvents;
          } catch (e2) {
            return { error: 'SESSION_EXPIRED' };
          }
        }
        return { error: 'SESSION_EXPIRED' };
      }
      return { error: e.message };
    }
  },

  getGcalEventsCache: async () => lsGet('gcalEventsCache', []),
  saveGcalEventsCache: async (cache) => { lsSet('gcalEventsCache', cache); return true; },
  getGcalCalendarsCache: async () => lsGet('gcalCalendarsCache', []),
  saveGcalCalendarsCache: async (cache) => { lsSet('gcalCalendarsCache', cache); return true; },

  // Data Reset & System Utils
  resetData: async () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('tachotasks.'));
    keys.forEach(k => localStorage.removeItem(k));
    return true;
  },
  hardReset: async () => {
    localStorage.clear();
    return { success: true };
  },
  openExternal: (url) => { window.open(url, '_blank'); },

  // Stubs for legacy methods that may be called
  getEvents: async () => [],
  getFloatingGoals: async () => [],
  migrateLocalToCloud: async () => { /* no-op in web version */ }
};
