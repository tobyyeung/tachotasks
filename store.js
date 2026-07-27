/**
 * store.js
 * Local data persistence layer using electron-store.
 * Manages separate stores for tasks, archived tasks, projects, profiles, reminders, settings, and calendars.
 */

const Store = require('electron-store');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ===== PATH SETUP =====
const userDataPath = path.join(__dirname, 'user_data');
const calendarDataPath = path.join(userDataPath, 'calendar_data');

// Ensure storage directories exist
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}
if (!fs.existsSync(calendarDataPath)) {
  fs.mkdirSync(calendarDataPath, { recursive: true });
}

// ===== INDIVIDUAL STORES =====
const tasksStore = new Store({ name: 'tasks', cwd: userDataPath, defaults: { items: [] }, watch: true });
const archivedTasksStore = new Store({ name: 'archived_tasks', cwd: userDataPath, defaults: { items: [] }, watch: true });
const projectsStore = new Store({ name: 'projects', cwd: userDataPath, defaults: { items: [] }, watch: true });
const profilesStore = new Store({ name: 'profiles', cwd: userDataPath, defaults: { items: [] }, watch: true });
const remindersStore = new Store({ name: 'reminders', cwd: userDataPath, defaults: { items: [] }, watch: true });
const settingsStore = new Store({ name: 'settings', cwd: userDataPath, defaults: {
  theme: 'dark',
  userName: 'Toby',
  activeMode: 'all',
  googleCalendarConnected: false,
  collapsedCategories: [],
  lastSyncTimestamp: null
}, watch: true });
const calendarsStore = new Store({ name: 'calendars', cwd: userDataPath, defaults: { items: [] }, watch: true });

// ===== CALENDAR DATA HELPERS =====

/**
 * Generates a hashed filename for storing Google Calendar event caches.
 * @param {string} calendarId - The Google Calendar ID.
 * @returns {string} The hashed JSON filename.
 */
function calendarIdToFilename(calendarId) {
  const hash = crypto.createHash('sha256').update(calendarId).digest('hex').slice(0, 12);
  return hash + '.json';
}

/**
 * Reads Google Calendar events from local disk cache for a specific calendar.
 * @param {string} calendarId - The calendar ID.
 * @returns {Array} List of cached event objects.
 */
function readCalendarEvents(calendarId) {
  const filePath = path.join(calendarDataPath, calendarIdToFilename(calendarId));
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Writes Google Calendar events to local disk cache for a specific calendar.
 * @param {string} calendarId - The calendar ID.
 * @param {Array} events - Event objects to write.
 */
function writeCalendarEvents(calendarId, events) {
  const filePath = path.join(calendarDataPath, calendarIdToFilename(calendarId));
  fs.writeFileSync(filePath, JSON.stringify(events, null, '\t'), 'utf-8');
}

/**
 * Reads all cached Google Calendar events across all calendar files.
 * @returns {Array} Merged array of all cached events.
 */
function readAllCalendarEvents() {
  const allEvents = [];
  if (!fs.existsSync(calendarDataPath)) return allEvents;
  const files = fs.readdirSync(calendarDataPath).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const events = JSON.parse(fs.readFileSync(path.join(calendarDataPath, file), 'utf-8'));
      if (Array.isArray(events)) {
        allEvents.push(...events);
      }
    } catch (e) {
      // skip corrupt files
    }
  }
  return allEvents;
}

/**
 * Groups and writes events into individual calendar cache files under calendar_data/.
 * @param {Array} allEvents - List of event objects.
 */
function writeAllCalendarEvents(allEvents) {
  const grouped = {};
  for (const event of allEvents) {
    const calId = event.calendarId || '_unknown';
    if (!grouped[calId]) grouped[calId] = [];
    grouped[calId].push(event);
  }

  if (fs.existsSync(calendarDataPath)) {
    const existingFiles = fs.readdirSync(calendarDataPath).filter(f => f.endsWith('.json'));
    for (const file of existingFiles) {
      fs.unlinkSync(path.join(calendarDataPath, file));
    }
  }

  for (const [calId, events] of Object.entries(grouped)) {
    writeCalendarEvents(calId, events);
  }
}

const TASK_KEY_ORDER = [
  'id',
  'title',
  'description',
  'completed',
  'priority',
  'dueDate',
  'dueTime',
  'plannedDate',
  'projectId',
  'sectionId',
  'parentTaskId',
  'profileId',
  'tags',
  'recurring',
  'createdAt',
  'completedAt'
];

const PROJECT_KEY_ORDER = ['id', 'name', 'color', 'parentProjectId', 'profileId'];
const PROFILE_KEY_ORDER = ['id', 'name', 'image'];
const REMINDER_KEY_ORDER = ['id', 'personName', 'date', 'type', 'profileId'];
const CALENDAR_KEY_ORDER = ['id', 'summary', 'color', 'primary'];
const SECTION_KEY_ORDER = ['id', 'name', 'profileId'];

function sortObjectKeys(obj, predefinedOrder) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const sorted = {};
  if (predefinedOrder) {
    for (const key of predefinedOrder) {
      if (key in obj) {
        sorted[key] = obj[key];
      }
    }
  }
  for (const key of Object.keys(obj)) {
    if (!(key in sorted)) {
      sorted[key] = obj[key];
    }
  }
  return sorted;
}

function sortItem(item, keyName) {
  if (!item || typeof item !== 'object') return item;
  if (keyName === 'tasks' || keyName === 'archivedTasks') {
    delete item.scheduledStartTime;
    delete item.scheduledEndTime;
    delete item.scheduledDate;
    delete item.isInbox;
    delete item.completionTimeout;
    delete item.isCompleting;
    delete item.timeoutId;
    return sortObjectKeys(item, TASK_KEY_ORDER);
  }
  if (keyName === 'projects') return sortObjectKeys(item, PROJECT_KEY_ORDER);
  if (keyName === 'profiles') return sortObjectKeys(item, PROFILE_KEY_ORDER);
  if (keyName === 'reminders') return sortObjectKeys(item, REMINDER_KEY_ORDER);
  if (keyName === 'gcalCalendarsCache') return sortObjectKeys(item, CALENDAR_KEY_ORDER);
  return item;
}

function sortSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  if (Array.isArray(settings.taskSections)) {
    settings.taskSections = settings.taskSections.map(s => sortObjectKeys(s, SECTION_KEY_ORDER));
  }
  return settings;
}

// ===== STORE MAP =====
const storeMap = {
  tasks:              { store: tasksStore,         key: 'items' },
  archivedTasks:      { store: archivedTasksStore, key: 'items' },
  projects:           { store: projectsStore,      key: 'items' },
  profiles:           { store: profilesStore,      key: 'items' },
  reminders:          { store: remindersStore,     key: 'items' },
  gcalCalendarsCache: { store: calendarsStore,     key: 'items' },
};

// ===== UNIFIED STORE FACADE =====
const store = {
  /**
   * Reads a key from the appropriate underlying store.
   * @param {string} key - Collection name or settings key.
   * @returns {*} Stored value.
   */
  get(key) {
    if (key === 'auth' || key.startsWith('auth.')) {
      return settingsStore.get(key);
    }
    if (key === 'gcalEventsCache') {
      return readAllCalendarEvents();
    }
    if (key === 'settings') {
      return sortSettings(settingsStore.store);
    }
    if (key.startsWith('settings.')) {
      const subKey = key.slice(9);
      return settingsStore.get(subKey);
    }
    if (key === 'lastSyncTimestamp') {
      return settingsStore.get('lastSyncTimestamp');
    }
    if (storeMap[key]) {
      const val = storeMap[key].store.get(storeMap[key].key);
      if (Array.isArray(val)) {
        return val.map(i => sortItem(i, key));
      }
      return val;
    }
    return settingsStore.get(key);
  },

  /**
   * Sets a key in the appropriate underlying store.
   * @param {string} key - Collection name or settings key.
   * @param {*} value - Value to write.
   */
  set(key, value) {
    if (key === 'auth' || key.startsWith('auth.')) {
      settingsStore.set(key, value);
      return;
    }
    if (key === 'gcalEventsCache') {
      writeAllCalendarEvents(value || []);
      return;
    }
    if (key === 'settings') {
      const currentAuth = settingsStore.get('auth');
      settingsStore.clear();
      if (currentAuth) {
        settingsStore.set('auth', currentAuth);
      }
      if (value && typeof value === 'object') {
        const valToSave = sortSettings({ ...value });
        delete valToSave.profiles;
        delete valToSave.auth;
        for (const [k, v] of Object.entries(valToSave)) {
          settingsStore.set(k, v);
        }
      }
      return;
    }
    if (key.startsWith('settings.')) {
      const subKey = key.slice(9);
      settingsStore.set(subKey, value);
      return;
    }
    if (key === 'lastSyncTimestamp') {
      settingsStore.set('lastSyncTimestamp', value);
      return;
    }
    if (storeMap[key]) {
      if (Array.isArray(value)) {
        value = value.map(i => sortItem(i, key));
      }
      storeMap[key].store.set(storeMap[key].key, value);
      return;
    }
    settingsStore.set(key, value);
  },

  /**
   * Deletes a key from the appropriate underlying store.
   * @param {string} key - Key to remove.
   */
  delete(key) {
    if (key === 'auth' || key.startsWith('auth.')) {
      settingsStore.delete(key);
      return;
    }
    if (storeMap[key]) {
      storeMap[key].store.delete(storeMap[key].key);
      return;
    }
    if (key === 'settings') {
      settingsStore.clear();
      return;
    }
    settingsStore.delete(key);
  },

  /**
   * Clears all local data stores and Google Calendar event caches.
   */
  clear() {
    for (const entry of Object.values(storeMap)) {
      entry.store.clear();
    }
    settingsStore.clear();

    if (fs.existsSync(calendarDataPath)) {
      const files = fs.readdirSync(calendarDataPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        fs.unlinkSync(path.join(calendarDataPath, file));
      }
    }
  }
};

module.exports = { store };
