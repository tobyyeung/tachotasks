/**
 * browser-api.js
 * Main API bridge exporting window.api for storage, cloud-sync, gcal, and NLP.
 */

import { getCurrentUser, onAuthChange, signInWithGoogle, signOutUser, triggerSyncToCloud, performSyncToCloud, performSyncFromCloud, syncFromCloud, recordTombstone } from './api/cloud-sync.js?v=82';
import { ensureGsiClient, requestGsiToken, fetchCalendars, fetchEvents, reconnectGoogleCalendar, refreshAccessToken, fetchGoogleCalendars, fetchGoogleCalendarEvents } from './api/gcal-api.js?v=82';
import { parseNaturalLanguage } from './api/nlp-quickadd.js?v=82';

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

function ensureEntityTimestamps(items) {
  if (!Array.isArray(items)) return items;
  const now = new Date().toISOString();
  items.forEach(item => {
    if (item && typeof item === 'object') {
      if (!item.createdAt) item.createdAt = now;
      if (!item.updatedAt) item.updatedAt = item.createdAt || now;
    }
  });
  return items;
}

// ===== WINDOW.API INTERFACE =====
window.api = {
  // Tasks CRUD
  getTasks: async () => lsGet('tasks', []),
  saveTasks: async (tasks) => {
    const withTimestamps = ensureEntityTimestamps(tasks);
    lsSet('tasks', withTimestamps);
    triggerSyncToCloud();
    return true;
  },
  getArchivedTasks: async () => lsGet('archivedTasks', []),
  saveArchivedTasks: async (tasks) => {
    const withTimestamps = ensureEntityTimestamps(tasks);
    lsSet('archivedTasks', withTimestamps);
    triggerSyncToCloud();
    return true;
  },

  // Projects CRUD
  getProjects: async () => lsGet('projects', []),
  saveProjects: async (projects) => {
    const withTimestamps = ensureEntityTimestamps(projects);
    lsSet('projects', withTimestamps);
    triggerSyncToCloud();
    return true;
  },

  // Profiles CRUD
  getProfiles: async () => lsGet('profiles', []),
  saveProfiles: async (profiles) => {
    const withTimestamps = ensureEntityTimestamps(profiles);
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

  // Natural Language Parsing
  parseNaturalLanguage: async (text) => parseNaturalLanguage(text),

  // Authentication
  signIn: async () => {
    try {
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
    const user = getCurrentUser();
    if (user) return user;
    try {
      const stored = localStorage.getItem('auth.user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  },

  onAuthStateChanged: (callback) => {
    onAuthChange(callback);
  },

  // Cloud Synchronization
  syncPull: async () => {
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
      console.warn('Failed to fetch Google Calendars:', e.message || e);
      if (e.message.includes('401') || e.message.includes('No Google Access Token')) {
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
      console.warn('Failed to fetch Google Events:', e.message || e);
      if (e.message.includes('401') || e.message.includes('No Google Access Token')) {
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
