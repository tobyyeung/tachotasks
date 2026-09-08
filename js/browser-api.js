/**
 * browser-api.js
 * Main API bridge exporting window.api for storage, cloud-sync, gcal, and NLP.
 */

import { getCurrentUser, waitForAuthReady, onAuthChange, signInWithGoogle, signOutUser, triggerSyncToCloud, performSyncToCloud, performSyncFromCloud, syncFromCloud, recordTombstone, completeBrowserSignIn } from './api/cloud-sync.js';
import { ensureGsiClient, requestGsiToken, fetchCalendars, fetchEvents, reconnectGoogleCalendar, refreshAccessToken, fetchGoogleCalendars, fetchGoogleCalendarEvents } from './api/gcal-api.js';
import { parseNaturalLanguage } from './api/nlp-quickadd.js';
import { calendarBackendEnabled, disconnectCalendarBackend } from './api/calendar-backend.js';

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

function ensureEntityTimestamps(items, key) {
  if (!Array.isArray(items)) return items;
  const stored = lsGet(key, []);
  const previous = new Map((Array.isArray(stored) ? stored : []).filter(Boolean).map(item => [item.id, item]));
  const content = ({ updatedAt, ...fields }) => JSON.stringify(fields);
  const now = new Date().toISOString();
  items.forEach(item => {
    if (item && typeof item === 'object') {
      if (!item.createdAt) item.createdAt = now;
      const old = previous.get(item.id);
      if (old && content(old) !== content(item)) {
        const previousTime = Date.parse(old.updatedAt) || 0;
        item.updatedAt = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
      } else if (!item.updatedAt) {
        item.updatedAt = item.createdAt || now;
      }
    }
  });
  return items;
}

// ===== PLATFORM DETECTION =====
// In Electron, preload.js has already set window.api with SQLite-backed storage.
// We augment it with auth, sync, GCal, and NLP that require the browser Firebase SDK.
// In a regular browser, we provide the full localStorage-based implementation.
const _isElectronEnv = !!(window.electronAPI && window.electronAPI.isElectron);

function _buildAuthSyncGCalMethods() {
  return {
    // Authentication
    signIn: async () => {
      try {
        if (_isElectronEnv && window.electronStorage && typeof window.electronStorage.startBrowserAuth === 'function') {
          return new Promise((resolve) => {
            let unsub = null;
            let timeout = null;

            unsub = window.electronStorage.onAuthSuccess(async (authData) => {
              if (timeout) clearTimeout(timeout);
              if (typeof unsub === 'function') unsub();
              try {
                const user = await completeBrowserSignIn(authData);
                resolve({ success: true, user });
              } catch (err) {
                console.error('completeBrowserSignIn error:', err);
                resolve({ error: err.message || 'Sign in credential exchange failed' });
              }
            });

            timeout = setTimeout(() => {
              if (typeof unsub === 'function') unsub();
              resolve({ error: 'Browser sign-in timed out. Please click Sign In again.' });
            }, 5 * 60 * 1000);

            window.electronStorage.startBrowserAuth().catch(err => {
              if (timeout) clearTimeout(timeout);
              if (typeof unsub === 'function') unsub();
              resolve({ error: err.message || 'Could not open system browser' });
            });
          });
        }

        const user = await signInWithGoogle();
        return { success: true, user };
      } catch (err) {
        console.error('Firebase signIn error:', err);
        return { error: err.code ? `${err.code}: ${err.message}` : (err.message || 'Sign in failed') };
      }
    },
    signOut: async () => {
      try {
        await signOutUser();
        return { success: true };
      } catch (err) {
        return { error: err.message };
      }
    },
    getUser: async () => {
      await waitForAuthReady();
      return getCurrentUser();
    },
    onAuthStateChanged: (callback) => { onAuthChange(callback); },
    syncPull: async () => { return await performSyncFromCloud(); },
    syncPush: async () => {
      try {
        await performSyncToCloud();
        const timestamp = lsGet('lastSyncTimestamp');
        return { success: true, timestamp };
      } catch (err) {
        return { error: err.message };
      }
    },
    parseNaturalLanguage: async (text) => parseNaturalLanguage(text),
    calendarAutoRenewalEnabled: () => calendarBackendEnabled(),
    disconnectGCal: async () => {
      try { await disconnectCalendarBackend(); return { success: true }; }
      catch (error) { return { error: error.message }; }
    },
    reconnectGCal: async () => {
      try {
        let token = await refreshAccessToken(true);
        if (token) return { success: true, token };
        return { error: 'Failed to reconnect Google Calendar' };
      } catch (e) { return { error: e.message }; }
    },
    getGCalCalendars: async () => {
      try { return await fetchCalendars(); }
      catch (e) {
        if (e.message.includes('401') || e.message.includes('No Google Access Token')) return { error: 'SESSION_EXPIRED' };
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
        if (e.message.includes('401') || e.message.includes('No Google Access Token')) return { error: 'SESSION_EXPIRED' };
        return { error: e.message };
      }
    },
    recordTombstone: (id, type = 'task') => { recordTombstone(id, type); return true; }
  };
}

if (_isElectronEnv && window.electronStorage) {
  // Electron: bind window.api to SQLite via electronStorage IPC bridge + shared auth/sync
  window.api = {
    getTasks: () => window.electronStorage.getTasks(),
    saveTasks: async (tasks) => {
      const withTimestamps = ensureEntityTimestamps(tasks, 'tasks');
      await window.electronStorage.saveTasks(withTimestamps);
      lsSet('tasks', withTimestamps);
      triggerSyncToCloud();
      return true;
    },
    getArchivedTasks: () => window.electronStorage.getArchivedTasks(),
    saveArchivedTasks: async (tasks) => {
      const withTimestamps = ensureEntityTimestamps(tasks, 'archivedTasks');
      await window.electronStorage.saveArchivedTasks(withTimestamps);
      lsSet('archivedTasks', withTimestamps);
      triggerSyncToCloud();
      return true;
    },
    getProjects: () => window.electronStorage.getProjects(),
    saveProjects: async (projects) => {
      const withTimestamps = ensureEntityTimestamps(projects, 'projects');
      await window.electronStorage.saveProjects(withTimestamps);
      lsSet('projects', withTimestamps);
      triggerSyncToCloud();
      return true;
    },
    getProfiles: () => window.electronStorage.getProfiles(),
    saveProfiles: async (profiles) => {
      const withTimestamps = ensureEntityTimestamps(profiles, 'profiles');
      await window.electronStorage.saveProfiles(withTimestamps);
      lsSet('profiles', withTimestamps);
      triggerSyncToCloud();
      return true;
    },
    recordTombstone: (id, type) => {
      window.electronStorage.recordTombstone(id, type || 'task');
      recordTombstone(id, type || 'task');
      return true;
    },
    getSettings: () => window.electronStorage.getSettings(),
    saveSettings: async (settings) => {
      if (settings && typeof settings === 'object') {
        settings.updatedAt = new Date().toISOString();
      }
      await window.electronStorage.saveSettings(settings);
      lsSet('settings', settings);
      triggerSyncToCloud();
      return true;
    },
    getGcalEventsCache: () => window.electronStorage.getGcalEventsCache(),
    saveGcalEventsCache: async (cache) => {
      await window.electronStorage.saveGcalEventsCache(cache);
      lsSet('gcalEventsCache', cache);
      return true;
    },
    getGcalCalendarsCache: () => window.electronStorage.getGcalCalendarsCache(),
    saveGcalCalendarsCache: async (cache) => {
      await window.electronStorage.saveGcalCalendarsCache(cache);
      lsSet('gcalCalendarsCache', cache);
      return true;
    },
    resetData: async () => {
      await window.electronStorage.resetData();
      const keys = Object.keys(localStorage).filter(k => k.startsWith('tachotasks.'));
      keys.forEach(k => localStorage.removeItem(k));
      return true;
    },
    hardReset: async () => {
      await window.electronStorage.hardReset();
      localStorage.clear();
      return { success: true };
    },
    openExternal: (url) => window.electronStorage.openExternal(url),
    getReminders: async () => [],
    saveReminders: async () => true,
    getEvents: async () => [],
    saveEvents: async () => true,
    getFloatingGoals: async () => [],
    migrateLocalToCloud: async () => {},
    ..._buildAuthSyncGCalMethods()
  };
} else {
  // Browser: provide full localStorage-based implementation
  window.api = {
  // Tasks CRUD
  getTasks: async () => lsGet('tasks', []),
  saveTasks: async (tasks) => {
    const withTimestamps = ensureEntityTimestamps(tasks, 'tasks');
    lsSet('tasks', withTimestamps);
    triggerSyncToCloud();
    return true;
  },
  getArchivedTasks: async () => lsGet('archivedTasks', []),
  saveArchivedTasks: async (tasks) => {
    const withTimestamps = ensureEntityTimestamps(tasks, 'archivedTasks');
    lsSet('archivedTasks', withTimestamps);
    triggerSyncToCloud();
    return true;
  },

  // Projects CRUD
  getProjects: async () => lsGet('projects', []),
  saveProjects: async (projects) => {
    const withTimestamps = ensureEntityTimestamps(projects, 'projects');
    lsSet('projects', withTimestamps);
    triggerSyncToCloud();
    return true;
  },

  // Profiles CRUD
  getProfiles: async () => lsGet('profiles', []),
  saveProfiles: async (profiles) => {
    const withTimestamps = ensureEntityTimestamps(profiles, 'profiles');
    lsSet('profiles', withTimestamps);
    triggerSyncToCloud();
    return true;
  },

  // Tombstones Deletion Tracking
  recordTombstone: (id, type = 'task') => {
    recordTombstone(id, type);
    return true;
  },

  // Reminders (Deprecated)
  getReminders: async () => [],
  saveReminders: async () => true,

  // Settings CRUD
  getSettings: async () => lsGet('settings', {}),
  saveSettings: async (settings) => {
    if (settings && typeof settings === 'object') {
      settings.updatedAt = new Date().toISOString();
    }
    lsSet('settings', settings);
    triggerSyncToCloud();
    return true;
  },

  // GCal Cache (browser localStorage)
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
  migrateLocalToCloud: async () => { /* no-op in web version */ },
  ..._buildAuthSyncGCalMethods()
  };
}
