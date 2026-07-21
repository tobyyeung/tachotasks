const { ipcRenderer } = require('electron');

// Because this runs in a Renderer with nodeIntegration, we can require Firebase directly,
// and it will resolve to the Browser SDK, which naturally supports indexedDBLocalPersistence!
const { signInWithCredential, GoogleAuthProvider, onAuthStateChanged, signOut } = require('firebase/auth');
const { collection, doc, setDoc, getDocs, writeBatch } = require('firebase/firestore');

const { app, auth, db } = require('./firebase-config');

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    ipcRenderer.send('cloudBg:authStateChanged', {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    });
  } else {
    currentUser = null;
    ipcRenderer.send('cloudBg:authStateChanged', null);
  }
});

// IPC listeners from main process
ipcRenderer.on('cloudBg:signIn', async (e, idToken, accessToken) => {
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    await ipcRenderer.invoke('store:setRaw', 'auth.googleAccessToken', accessToken);
    ipcRenderer.send('cloudBg:signInSuccess');
  } catch (err) {
    console.error('Sign in error in bg:', err);
    ipcRenderer.send('cloudBg:signInError', err.message);
  }
});

ipcRenderer.on('cloudBg:signOut', async () => {
  try {
    await signOut(auth);
    await ipcRenderer.invoke('store:deleteRaw', 'auth.googleAccessToken');
    await ipcRenderer.invoke('store:deleteRaw', 'auth.refreshToken'); // Cleanup old legacy store if it exists
    await ipcRenderer.invoke('store:clearRaw'); // Wipe local store on signout
    ipcRenderer.send('cloudBg:signOutSuccess');
  } catch (err) {
    console.error('Sign out error:', err);
  }
});

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

let isSyncing = false;
let isSyncQueued = false;

async function performSyncToCloud() {
  if (!currentUser) return;
  try {
    const collections = ['tasks', 'projects', 'profiles', 'reminders', 'archivedTasks'];
    for (const collName of collections) {
      const items = await ipcRenderer.invoke('store:getRaw', collName) || [];
      const itemIds = new Set(items.map(i => i.id).filter(Boolean));
      
      const collRef = collection(db, `users/${currentUser.uid}/${collName}`);
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
        const docRef = doc(db, `users/${currentUser.uid}/${collName}`, item.id);
        batch.set(docRef, cleanObjectForFirestore(item));
      }
      await batch.commit();
    }
    const settings = await ipcRenderer.invoke('store:getRaw', 'settings');
    if (settings) {
      await setDoc(doc(db, `users/${currentUser.uid}/settings`, 'preferences'), cleanObjectForFirestore(settings));
    }
    await ipcRenderer.invoke('store:setRaw', 'lastSyncTimestamp', Date.now());
  } catch (err) {
    console.error('syncToCloud error:', err);
    throw err;
  }
}

ipcRenderer.on('cloudBg:syncToCloud', async (e, id) => {
  if (isSyncing) {
    isSyncQueued = true;
    return ipcRenderer.send('cloudBg:reply', id, { success: true, queued: true });
  }
  
  isSyncing = true;
  try {
    await performSyncToCloud();
    const timestamp = await ipcRenderer.invoke('store:getRaw', 'lastSyncTimestamp');
    ipcRenderer.send('cloudBg:reply', id, { success: true, timestamp });
  } catch (err) {
    ipcRenderer.send('cloudBg:reply', id, { error: err.message });
  } finally {
    isSyncing = false;
    if (isSyncQueued) {
      isSyncQueued = false;
      // Trigger another sync if it was queued during the previous one
      ipcRenderer.emit('cloudBg:syncToCloud', {}, Date.now().toString() + Math.random());
    }
  }
});

ipcRenderer.on('cloudBg:syncFromCloud', async (e, id) => {
  if (!currentUser) return ipcRenderer.send('cloudBg:reply', id, { error: 'Not authenticated' });
  try {
    let needsCloudFix = false;
    const collections = ['tasks', 'projects', 'profiles', 'reminders', 'archivedTasks'];
    const newData = {};
    for (const collName of collections) {
      const collRef = collection(db, `users/${currentUser.uid}/${collName}`);
      const snapshot = await getDocs(collRef);
      const items = [];
      snapshot.forEach(docSnap => {
        let item = docSnap.data();
        if (!item.id) item.id = docSnap.id;
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
      await ipcRenderer.invoke('store:setRaw', collName, items);
      newData[collName] = items;
    }
    const settingsSnap = await getDocs(collection(db, `users/${currentUser.uid}/settings`));
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
            await ipcRenderer.invoke('store:setRaw', 'profiles', migrated);
            newData.profiles = migrated;
          }
          delete data.profiles;
        }
        await ipcRenderer.invoke('store:setRaw', 'settings', data);
        newData.settings = data;
      }
    }
    await ipcRenderer.invoke('store:setRaw', 'lastSyncTimestamp', Date.now());
    const timestamp = await ipcRenderer.invoke('store:getRaw', 'lastSyncTimestamp');
    ipcRenderer.send('cloudBg:reply', id, { success: true, timestamp, data: newData });
    
    if (needsCloudFix) {
      performSyncToCloud().catch(err => console.error('Cloud fix error:', err));
    }
  } catch (err) {
    console.error('syncFromCloud error:', err);
    ipcRenderer.send('cloudBg:reply', id, { error: err.message });
  }
});

