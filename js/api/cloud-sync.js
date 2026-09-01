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
    'tachotasks.tombstones',
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


export function extractAndSaveClientId(result, credential) {
  try {
    const tokenResponse = (result && result._tokenResponse) || {};
    let clientId = tokenResponse.clientId || tokenResponse.oauthClientId || null;
    const idToken = (credential && credential.idToken) || tokenResponse.idToken || tokenResponse.oauthIdToken;
    if (!clientId && idToken && typeof idToken === 'string') {
      const parts = idToken.split('.');
      if (parts.length >= 2) {
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const jsonStr = decodeURIComponent(atob(base64).split('').map(c => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonStr);
        if (payload && payload.aud) {
          clientId = payload.aud;
        }
      }
    }
    if (clientId) {
      localStorage.setItem('auth.clientId', clientId);
      console.log('[auth] Saved Google OAuth clientId:', clientId);
      try { ensureGsiClient(); } catch (e) {}
    }
  } catch (e) {
    console.warn('[auth] Could not extract clientId:', e);
  }
}

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

  if (accessToken) {
    localStorage.setItem('auth.googleAccessToken', accessToken);
    const expiryMs = Date.now() + ((expiresIn || 3600) - 300) * 1000;
    localStorage.setItem('auth.accessTokenExpiresAt', String(expiryMs));
    localStorage.setItem('auth.gcalConnected', 'true');
  }
  extractAndSaveClientId(result, credential);
  return result.user;
}

export async function reauthenticateWithFirebasePopup() {
  if (!auth.currentUser) {
    console.warn('[auth] No current Firebase user for re-auth popup');
    return null;
  }
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
  provider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');
  provider.setCustomParameters({
    prompt: 'consent'
  });
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential ? credential.accessToken : null;
  const tokenResponse = result._tokenResponse || {};
  const expiresIn = tokenResponse.oauthExpireIn || 3600;

  if (accessToken) {
    localStorage.setItem('auth.googleAccessToken', accessToken);
    const expiryMs = Date.now() + ((expiresIn || 3600) - 300) * 1000;
    localStorage.setItem('auth.accessTokenExpiresAt', String(expiryMs));
    localStorage.setItem('auth.gcalConnected', 'true');
  }
  extractAndSaveClientId(result, credential);
  return accessToken;
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

// ===== TOMBSTONES & DIFFERENTIAL SYNC HELPERS =====

/**
 * Records a deletion tombstone for an item so other devices know it was deleted.
 * @param {string} id - Unique identifier of the deleted entity.
 * @param {string} type - 'task' | 'project' | 'profile'
 */
export function recordTombstone(id, type = 'task') {
  if (!id) return;
  const tombstones = lsGet('tombstones', {});
  tombstones[id] = {
    id,
    type,
    deletedAt: new Date().toISOString()
  };
  lsSet('tombstones', tombstones);
  triggerSyncToCloud();
}

/**
 * Prunes tombstones older than maxAgeDays (default 30 days) to prevent memory leak.
 */
function pruneTombstones(tombstones, maxAgeDays = 30) {
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  const result = {};
  for (const [id, t] of Object.entries(tombstones || {})) {
    if (!t || !t.deletedAt) continue;
    const time = new Date(t.deletedAt).getTime();
    if (!isNaN(time) && time >= cutoff) {
      result[id] = t;
    }
  }
  return result;
}

/**
 * Merges local and remote entity arrays using per-record timestamps (updatedAt / createdAt)
 * and resolves deletions via tombstones.
 */
function mergeEntitiesWithTimestamps(collName, localItems = [], remoteItems = [], tombstones = {}) {
  const localMap = new Map();
  (localItems || []).forEach(item => {
    if (item && item.id) localMap.set(item.id, item);
  });

  const remoteMap = new Map();
  (remoteItems || []).forEach(item => {
    if (item && item.id) remoteMap.set(item.id, item);
  });

  const allIds = new Set([...localMap.keys(), ...remoteMap.keys(), ...Object.keys(tombstones)]);
  const mergedItems = [];
  const itemsToPush = [];
  const idsToDeleteFromRemote = [];
  const tombstonesToClearFromRemote = [];

  for (const id of allIds) {
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);
    const tombstone = tombstones[id];

    if (tombstone && tombstone.deletedAt) {
      const tombstoneTime = new Date(tombstone.deletedAt).getTime();
      const localTime = new Date((localItem && (localItem.updatedAt || localItem.createdAt)) || 0).getTime();
      const remoteTime = new Date((remoteItem && (remoteItem.updatedAt || remoteItem.createdAt)) || 0).getTime();

      // If tombstone is newer than or equal to both local and remote modifications, item is deleted!
      if (tombstoneTime >= localTime && tombstoneTime >= remoteTime) {
        if (remoteItem) {
          idsToDeleteFromRemote.push(id);
        }
        continue;
      } else {
        // Item was created or modified AFTER tombstone (resurrected/re-added)
        delete tombstones[id];
        tombstonesToClearFromRemote.push(id);
      }
    }

    if (localItem && remoteItem) {
      const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
      const remoteTime = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();

      if (remoteTime > localTime) {
        // Remote is newer -> adopt remote version
        mergedItems.push(remoteItem);
      } else if (localTime > remoteTime) {
        // Local is newer -> keep local version and push to remote
        mergedItems.push(localItem);
        itemsToPush.push(localItem);
      } else {
        // Timestamps match -> identical version
        mergedItems.push(localItem);
      }
    } else if (localItem && !remoteItem) {
      // Item created locally on this device -> keep and push to remote
      mergedItems.push(localItem);
      itemsToPush.push(localItem);
    } else if (!localItem && remoteItem) {
      // Item created on another device -> keep in local storage
      mergedItems.push(remoteItem);
    }
  }

  return {
    mergedItems,
    itemsToPush,
    idsToDeleteFromRemote,
    tombstonesToClearFromRemote
  };
}

/**
 * Core bidirectional synchronization and conflict resolution engine.
 */
async function syncCollectionsBidirectional(uid) {
  const collections = ['tasks', 'projects', 'profiles', 'archivedTasks'];
  const newData = {};

  // 1. Fetch Remote Tombstones
  const remoteTombstonesSnap = await getDocs(collection(db, `users/${uid}/tombstones`));
  const remoteTombstones = {};
  remoteTombstonesSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data && data.id) remoteTombstones[data.id] = data;
  });

  // 2. Merge with Local Tombstones
  let localTombstones = lsGet('tombstones', {});
  const allTombstones = { ...localTombstones };
  for (const [id, rt] of Object.entries(remoteTombstones)) {
    if (!allTombstones[id]) {
      allTombstones[id] = rt;
    } else {
      const localTime = new Date(allTombstones[id].deletedAt || 0).getTime();
      const remoteTime = new Date(rt.deletedAt || 0).getTime();
      if (remoteTime > localTime) {
        allTombstones[id] = rt;
      }
    }
  }

  const batch = writeBatch(db);
  let opCount = 0;
  const allTombstonesToClear = [];

  // 3. Process and sanitize each entity collection
  const localCollections = {};
  const remoteCollections = {};

  for (const collName of collections) {
    let localItems = lsGet(collName, []) || [];
    if (collName === 'profiles') {
      localItems = ensureDefaultProfilesLocal(localItems);
    }
    localCollections[collName] = localItems;

    const collRef = collection(db, `users/${uid}/${collName}`);
    const snapshot = await getDocs(collRef);
    const remoteItems = [];

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
        }
      }
      if (collName === 'projects') {
        if (item.categoryId) {
          item.profileId = item.categoryId;
          delete item.categoryId;
        }
        if (item.profileId && item.profileId.startsWith('cat-')) {
          item.profileId = item.profileId.replace('cat-', 'profile-');
        }
        if ('parentProjectId' in item) {
          delete item.parentProjectId;
        }
      }
      if (collName === 'profiles' && item.id && item.id.startsWith('cat-')) {
        item.id = item.id.replace('cat-', 'profile-');
      }
      remoteItems.push(item);
    });

    remoteCollections[collName] = remoteItems;
  }

  // Cross-Collection Task & Archive Reconciliation
  // Reconcile 'tasks' and 'archivedTasks' to resolve completed/uncompleted state conflicts
  function getItemTime(item) {
    if (!item) return 0;
    const timeStr = item.updatedAt || item.completedAt || item.createdAt;
    if (!timeStr) return 0;
    const t = new Date(timeStr).getTime();
    return isNaN(t) ? 0 : t;
  }

  // Self-heal: Move any completed tasks mistakenly in 'tasks' to 'archivedTasks'
  const localCompletedInTasks = (localCollections.tasks || []).filter(t => t && t.completed === true);
  if (localCompletedInTasks.length > 0) {
    localCollections.tasks = (localCollections.tasks || []).filter(t => !t || t.completed !== true);
    localCompletedInTasks.forEach(t => {
      if (!localCollections.archivedTasks.some(a => a.id === t.id)) {
        localCollections.archivedTasks.push(t);
      }
    });
  }

  const remoteCompletedInTasks = (remoteCollections.tasks || []).filter(t => t && t.completed === true);
  if (remoteCompletedInTasks.length > 0) {
    remoteCompletedInTasks.forEach(t => {
      if (!remoteCollections.archivedTasks.some(a => a.id === t.id)) {
        remoteCollections.archivedTasks.push(t);
      }
      const docRef = doc(db, `users/${uid}/tasks`, t.id);
      batch.delete(docRef);
      opCount++;
    });
    remoteCollections.tasks = (remoteCollections.tasks || []).filter(t => !t || t.completed !== true);
  }

  // Reconcile non-recurring tasks present across active and archived collections
  const allTaskIds = new Set();
  (localCollections.tasks || []).forEach(t => t && t.id && allTaskIds.add(t.id));
  (remoteCollections.tasks || []).forEach(t => t && t.id && allTaskIds.add(t.id));
  (localCollections.archivedTasks || []).forEach(t => {
    if (t && t.id && !t.isRecurringInstance && !t.originalTaskId) allTaskIds.add(t.id);
  });
  (remoteCollections.archivedTasks || []).forEach(t => {
    if (t && t.id && !t.isRecurringInstance && !t.originalTaskId) allTaskIds.add(t.id);
  });

  for (const id of allTaskIds) {
    const localActive = (localCollections.tasks || []).find(t => t.id === id);
    const remoteActive = (remoteCollections.tasks || []).find(t => t.id === id);
    const localArchived = (localCollections.archivedTasks || []).find(t => t.id === id && !t.isRecurringInstance && !t.originalTaskId);
    const remoteArchived = (remoteCollections.archivedTasks || []).find(t => t.id === id && !t.isRecurringInstance && !t.originalTaskId);

    const latestActiveTime = Math.max(getItemTime(localActive), getItemTime(remoteActive));
    const latestArchivedTime = Math.max(getItemTime(localArchived), getItemTime(remoteArchived));

    if (latestArchivedTime > 0 && latestActiveTime > 0) {
      if (latestArchivedTime >= latestActiveTime) {
        // Task was completed -> remove from active tasks, delete active doc from Firestore
        localCollections.tasks = (localCollections.tasks || []).filter(t => t.id !== id);
        if (remoteActive) {
          const docRef = doc(db, `users/${uid}/tasks`, id);
          batch.delete(docRef);
          opCount++;
          remoteCollections.tasks = (remoteCollections.tasks || []).filter(t => t.id !== id);
        }
      } else {
        // Task was reopened/uncompleted -> remove from archived tasks, delete archived doc from Firestore
        localCollections.archivedTasks = (localCollections.archivedTasks || []).filter(t => t.id !== id);
        if (remoteArchived) {
          const docRef = doc(db, `users/${uid}/archivedTasks`, id);
          batch.delete(docRef);
          opCount++;
          remoteCollections.archivedTasks = (remoteCollections.archivedTasks || []).filter(t => t.id !== id);
        }
      }
    }
  }

  // Differential merge for each collection
  for (const collName of collections) {
    const localItems = localCollections[collName] || [];
    const remoteItems = remoteCollections[collName] || [];

    // Run differential merge
    const { mergedItems, itemsToPush, idsToDeleteFromRemote, tombstonesToClearFromRemote } =
      mergeEntitiesWithTimestamps(collName, localItems, remoteItems, allTombstones);

    tombstonesToClearFromRemote.forEach(id => allTombstonesToClear.push(id));

    let finalMerged = mergedItems;
    if (collName === 'profiles') {
      finalMerged = ensureDefaultProfilesLocal(finalMerged);
    }

    // Save clean merged state to local storage
    lsSet(collName, finalMerged);
    newData[collName] = finalMerged;

    // Queue cloud batch writes
    idsToDeleteFromRemote.forEach(id => {
      const docRef = doc(db, `users/${uid}/${collName}`, id);
      batch.delete(docRef);
      opCount++;
    });

    itemsToPush.forEach(item => {
      if (!item.id) return;
      const docRef = doc(db, `users/${uid}/${collName}`, item.id);
      batch.set(docRef, cleanObjectForFirestore(item));
      opCount++;
    });
  }

  // 4. Synchronize Tombstones in Cloud
  for (const [id, t] of Object.entries(allTombstones)) {
    if (!t || !t.id) continue;
    // If not in remote, push tombstone to cloud
    if (!remoteTombstones[id] || remoteTombstones[id].deletedAt !== t.deletedAt) {
      const tRef = doc(db, `users/${uid}/tombstones`, id);
      batch.set(tRef, cleanObjectForFirestore(t));
      opCount++;
    }
  }

  allTombstonesToClear.forEach(id => {
    if (remoteTombstones[id]) {
      const tRef = doc(db, `users/${uid}/tombstones`, id);
      batch.delete(tRef);
      opCount++;
    }
  });

  // Save pruned tombstones locally
  const prunedTombstones = pruneTombstones(allTombstones);
  lsSet('tombstones', prunedTombstones);

  // 5. Settings Synchronization
  const settingsSnap = await getDocs(collection(db, `users/${uid}/settings`));
  let remoteSettings = null;
  for (const docSnap of settingsSnap.docs) {
    if (docSnap.id === 'preferences') {
      const data = docSnap.data() || {};
      if (data.profiles) delete data.profiles;
      remoteSettings = data;
    }
  }

  let localSettings = lsGet('settings', {});
  if (!localSettings || typeof localSettings !== 'object') localSettings = {};

  let finalSettings = localSettings;
  let pushSettings = false;

  if (!remoteSettings) {
    if (!finalSettings.defaultProfileId) finalSettings.defaultProfileId = 'profile-personal';
    if (!finalSettings.taskSections || finalSettings.taskSections.length === 0) {
      finalSettings.taskSections = [
        { id: 'sec-todo', name: 'To Do' },
        { id: 'sec-in-progress', name: 'In Progress' },
        { id: 'sec-done', name: 'Done' }
      ];
    }
    pushSettings = true;
  } else {
    const localTime = new Date(localSettings.updatedAt || 0).getTime();
    const remoteTime = new Date(remoteSettings.updatedAt || 0).getTime();
    if (remoteTime > localTime) {
      finalSettings = remoteSettings;
    } else if (localTime > remoteTime) {
      finalSettings = localSettings;
      pushSettings = true;
    } else {
      finalSettings = { ...remoteSettings, ...localSettings };
    }
  }

  lsSet('settings', finalSettings);
  newData.settings = finalSettings;

  if (pushSettings) {
    const setRef = doc(db, `users/${uid}/settings`, 'preferences');
    batch.set(setRef, cleanObjectForFirestore(finalSettings));
    opCount++;
  }

  // Commit all queued cloud operations in Firestore
  if (opCount > 0) {
    await batch.commit();
  }

  lsSet('lastSyncTimestamp', Date.now());
  const timestamp = lsGet('lastSyncTimestamp');

  return { success: true, timestamp, data: newData };
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
    const result = await syncCollectionsBidirectional(uid);
    return result;
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
    try { localStorage.removeItem('tt_reminders'); } catch (e) {}
    const result = await syncCollectionsBidirectional(uid);
    _hasPulledForUid[uid] = true;
    return result;
  } catch (err) {
    console.error('syncFromCloud error:', err);
    if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
      return { error: 'Firestore Permission Denied (Check Firebase Security Rules)' };
    }
    return { error: err.message };
  }
}

export {
  triggerSyncToCloud,
  performSyncToCloud,
  performSyncFromCloud,
  performSyncFromCloud as syncFromCloud
};
