/**
 * cloud-sync.js
 * Firebase Authentication & Firestore real-time cloud sync engine.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, GoogleAuthProvider, signInWithCredential } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ensureGsiClient, resetGsiClient } from './gcal-api.js';

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
let _lastUid = localStorage.getItem('auth.lastKnownUid') || null;
let _hasPulledForUid = {};

/**
 * Clears all cached local user data and authentication tokens.
 */
export function clearLocalUserCache() {
  const keys = [
    'tachotasks.tasks',
    'tachotasks.projects',
    'tachotasks.profiles',
    'tachotasks.archivedTasks',
    'tachotasks.settings',
    'tachotasks.gcalEventsCache',
    'tachotasks.gcalCalendarsCache',
    'tachotasks.lastSyncTimestamp',
    'auth.googleAccessToken',
    'auth.refreshToken',
    'auth.clientId',
    'auth.accessTokenExpiresAt',
    'auth.gcalConnected'
  ];
  keys.forEach(k => localStorage.removeItem(k));
}

// Listen for Firebase auth state changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    const isAccountSwitch = _lastUid && _lastUid !== user.uid;
    if (isAccountSwitch) {
      console.log(`[cloud-sync] Account switch detected from ${_lastUid} to ${user.uid}. Clearing cached local data.`);
      clearLocalUserCache();
      try { resetGsiClient(); } catch (e) {}
    }
    _lastUid = user.uid;
    localStorage.setItem('auth.lastKnownUid', user.uid);

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
    if (_lastUid) {
      clearLocalUserCache();
      try { resetGsiClient(); } catch (e) {}
    }
    _lastUid = null;
    localStorage.removeItem('auth.lastKnownUid');
    _currentUser = null;
    localStorage.removeItem('auth.user');
  }
  _authCallbacks.forEach(cb => {
    try { cb(_currentUser); } catch (e) { console.error('Auth callback error:', e); }
  });
});


export function getCurrentUser() { return _currentUser; }
export function onAuthChange(cb) { _authCallbacks.push(cb); if (_currentUser) cb(_currentUser); }
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
  provider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');
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
  if (clientId) {
    localStorage.setItem('auth.clientId', clientId);
  }
  return result.user;
}
export async function signOutUser() {
  await firebaseSignOut(auth);
  clearLocalUserCache();
  try { resetGsiClient(); } catch (e) {}
  _lastUid = null;
  localStorage.removeItem('auth.lastKnownUid');
  localStorage.removeItem('auth.user');
  _currentUser = null;
  _hasPulledForUid = {};
}

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

function getDefaultProfilesLocal() {
  return [
    { id: 'all', name: 'All', icon: '', image: 'assets/brand/logo.png' },
    { id: 'profile-personal', name: 'Personal', icon: '', image: 'assets/profiles/personal.png' },
    { id: 'profile-work', name: 'Work', icon: '', image: 'assets/profiles/work.png' },
    { id: 'profile-school', name: 'School', icon: '', image: 'assets/profiles/school.png' }
  ];
}

function ensureDefaultProfilesLocal(profiles = []) {
  const defaults = getDefaultProfilesLocal();
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return defaults;
  }
  const result = [...profiles];
  const defaultImages = {
    'all': 'assets/brand/logo.png',
    'profile-personal': 'assets/profiles/personal.png',
    'profile-work': 'assets/profiles/work.png',
    'profile-school': 'assets/profiles/school.png'
  };
  for (const def of defaults) {
    const existing = result.find(p => p.id === def.id || (p.name && p.name.toLowerCase() === def.name.toLowerCase()));
    if (!existing) {
      result.push(def);
    } else {
      if (!existing.image && defaultImages[existing.id]) {
        existing.image = defaultImages[existing.id];
      }
    }
  }
  return result;
}

async function performSyncToCloud() {
  if (!_currentUser) throw new Error('Not signed in with Google');
  // Wait for Firebase to actually be authenticated before hitting Firestore
  if (!auth.currentUser) {
    const ready = await waitForFirebaseAuth(4000);
    if (!ready) throw new Error('Firebase authentication connecting... Please retry in a second');
  }

  const uid = (auth.currentUser && auth.currentUser.uid) || (_currentUser && _currentUser.uid);
  if (!uid) throw new Error('User UID missing');

  // CRITICAL SAFETY GUARD: Never push local state before initial pull for this user's UID!
  if (!_hasPulledForUid[uid]) {
    console.log('[cloud-sync] Initial pull required before push for UID:', uid);
    const pullRes = await performSyncFromCloud();
    if (pullRes && pullRes.error) {
      throw new Error('Initial sync pull failed before push: ' + pullRes.error);
    }
  }

  if (_isSyncing) {
    _isSyncQueued = true;
    return;
  }
  _isSyncing = true;

  try {
    const collections = ['tasks', 'projects', 'profiles', 'archivedTasks'];
    for (const collName of collections) {
      let items = lsGet(collName, []);
      if (collName === 'profiles') {
        items = ensureDefaultProfilesLocal(items);
      }
      const itemIds = new Set(items.map(i => i.id).filter(Boolean));

      const collRef = collection(db, `users/${uid}/${collName}`);
      const snapshot = await getDocs(collRef);

      const batch = writeBatch(db);
      let opCount = 0;

      // Delete docs in cloud that are not in local store
      snapshot.forEach(docSnap => {
        if (!itemIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
          opCount++;
        }
      });

      for (const item of items) {
        if (!item.id) continue;
        const docRef = doc(db, `users/${uid}/${collName}`, item.id);
        batch.set(docRef, cleanObjectForFirestore(item));
        opCount++;
      }
      if (opCount > 0) {
        await batch.commit();
      }
    }

    let settings = lsGet('settings', {});
    if (!settings || typeof settings !== 'object') settings = {};
    if (!settings.defaultProfileId) settings.defaultProfileId = 'profile-personal';
    if (!settings.taskSections || settings.taskSections.length === 0) {
      settings.taskSections = [
        { id: 'sec-todo', name: 'To Do' },
        { id: 'sec-in-progress', name: 'In Progress' },
        { id: 'sec-done', name: 'Done' }
      ];
    }
    await setDoc(doc(db, `users/${uid}/settings`, 'preferences'), cleanObjectForFirestore(settings));
    lsSet('lastSyncTimestamp', Date.now());
  } catch (err) {
    console.error('syncToCloud error:', err);
    if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
      throw new Error('Firestore Permission Denied (Check Firebase Security Rules)');
    }
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
  if (_syncTimeout) {
    clearTimeout(_syncTimeout);
    _syncTimeout = null;
  }
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
          if ('parentProjectId' in item) {
            delete item.parentProjectId;
            needsCloudFix = true;
          }
        }
        if (collName === 'profiles' && item.id && item.id.startsWith('cat-')) {
          item.id = item.id.replace('cat-', 'profile-');
          needsCloudFix = true;
        }
        items.push(item);
      });

      if (collName === 'profiles') {
        const ensured = ensureDefaultProfilesLocal(items);
        lsSet('profiles', ensured);
        newData.profiles = ensured;
        if (ensured.length !== items.length) {
          needsCloudFix = true;
        }
      } else {
        lsSet(collName, items);
        newData[collName] = items;
      }
    }

    // Settings
    const settingsSnap = await getDocs(collection(db, `users/${uid}/settings`));
    let settingsData = null;
    for (const docSnap of settingsSnap.docs) {
      if (docSnap.id === 'preferences') {
        const data = docSnap.data() || {};
        if (data.profiles) {
          needsCloudFix = true;
          delete data.profiles;
        }
        settingsData = data;
      }
    }

    if (!settingsData) {
      settingsData = {
        defaultProfileId: 'profile-personal',
        activeProfileId: 'all',
        tasksViewMode: 'board',
        tasksSortMode: 'manual',
        dashboardUpcomingRange: '7',
        taskSections: [
          { id: 'sec-todo', name: 'To Do' },
          { id: 'sec-in-progress', name: 'In Progress' },
          { id: 'sec-done', name: 'Done' }
        ],
        projectSections: [
          { id: 'psec-todo', name: 'To Do' },
          { id: 'psec-in-progress', name: 'In Progress' },
          { id: 'psec-done', name: 'Done' }
        ]
      };
      needsCloudFix = true;
    } else {
      if (!settingsData.defaultProfileId) {
        settingsData.defaultProfileId = 'profile-personal';
        needsCloudFix = true;
      }
      if (!settingsData.taskSections || settingsData.taskSections.length === 0) {
        settingsData.taskSections = [
          { id: 'sec-todo', name: 'To Do' },
          { id: 'sec-in-progress', name: 'In Progress' },
          { id: 'sec-done', name: 'Done' }
        ];
        needsCloudFix = true;
      }
    }

    lsSet('settings', settingsData);
    newData.settings = settingsData;

    lsSet('lastSyncTimestamp', Date.now());
    const timestamp = lsGet('lastSyncTimestamp');

    _hasPulledForUid[uid] = true;

    if (needsCloudFix) {
      performSyncToCloud().catch(err => console.error('Cloud fix error:', err));
    }

    return { success: true, timestamp, data: newData };
  } catch (err) {
    console.error('syncFromCloud error:', err);
    if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
      return { error: 'Firestore Permission Denied (Check Firebase Security Rules)' };
    }
    return { error: err.message };
  }
}


export { triggerSyncToCloud, performSyncToCloud, performSyncFromCloud, performSyncFromCloud as syncFromCloud };
