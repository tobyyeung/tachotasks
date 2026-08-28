/**
 * cloud-sync.js
 * Firebase Authentication & Firestore real-time cloud sync engine.
 */

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
  localStorage.removeItem('auth.user');
  localStorage.removeItem('auth.googleAccessToken');
  localStorage.removeItem('auth.refreshToken');
  localStorage.removeItem('auth.clientId');
  localStorage.removeItem('auth.accessTokenExpiresAt');
  localStorage.removeItem('auth.gcalConnected');
  _currentUser = null;
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

async function performSyncToCloud() {
  if (!_currentUser) throw new Error('Not signed in with Google');
  // Wait for Firebase to actually be authenticated before hitting Firestore
  if (!auth.currentUser) {
    const ready = await waitForFirebaseAuth(4000);
    if (!ready) throw new Error('Firebase authentication connecting... Please retry in a second');
  }

  if (_isSyncing) {
    _isSyncQueued = true;
    return;
  }
  _isSyncing = true;

  const uid = (auth.currentUser && auth.currentUser.uid) || (_currentUser && _currentUser.uid);
  if (!uid) throw new Error('User UID missing');

  try {
    const collections = ['tasks', 'projects', 'profiles', 'archivedTasks'];
    for (const collName of collections) {
      const items = lsGet(collName, []);
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

    const settings = lsGet('settings', {});
    if (settings) {
      await setDoc(doc(db, `users/${uid}/settings`, 'preferences'), cleanObjectForFirestore(settings));
    }
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
    console.error('syncFromCloud error:', err);
    if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
      return { error: 'Firestore Permission Denied (Check Firebase Security Rules)' };
    }
    return { error: err.message };
  }
}


export { triggerSyncToCloud, performSyncToCloud, performSyncFromCloud, performSyncFromCloud as syncFromCloud };
