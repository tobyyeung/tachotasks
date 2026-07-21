/**
 * preload.js
 * Preload script exposing safe IPC bridges to the renderer process via window.api.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Tasks CRUD
  getTasks: () => ipcRenderer.invoke('store:getTasks'),
  saveTasks: (tasks) => ipcRenderer.invoke('store:saveTasks', tasks),
  getArchivedTasks: () => ipcRenderer.invoke('store:getArchivedTasks'),
  saveArchivedTasks: (tasks) => ipcRenderer.invoke('store:saveArchivedTasks', tasks),

  // Projects CRUD
  getProjects: () => ipcRenderer.invoke('store:getProjects'),
  saveProjects: (projects) => ipcRenderer.invoke('store:saveProjects', projects),

  // Profiles CRUD
  getProfiles: () => ipcRenderer.invoke('store:getProfiles'),
  saveProfiles: (profiles) => ipcRenderer.invoke('store:saveProfiles', profiles),

  // Reminders CRUD
  getReminders: () => ipcRenderer.invoke('store:getReminders'),
  saveReminders: (reminders) => ipcRenderer.invoke('store:saveReminders', reminders),

  // Settings CRUD
  getSettings: () => ipcRenderer.invoke('store:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('store:saveSettings', settings),

  // Natural Language Parsing
  parseNaturalLanguage: (text) => ipcRenderer.invoke('nlp:parse', text),

  // Authentication
  signIn: () => ipcRenderer.invoke('auth:signIn'),
  signOut: () => ipcRenderer.invoke('auth:signOut'),
  getUser: () => ipcRenderer.invoke('auth:getUser'),
  onAuthStateChanged: (callback) => ipcRenderer.on('auth:stateChanged', (_, user) => callback(user)),

  // Cloud Synchronization
  syncPull: () => ipcRenderer.invoke('sync:pull'),
  syncPush: () => ipcRenderer.invoke('sync:push'),

  // Google Calendar Integration
  getGCalCalendars: () => ipcRenderer.invoke('gcal:getCalendars'),
  getGCalEvents: (calendarIds, timeMin, timeMax) => ipcRenderer.invoke('gcal:getEvents', calendarIds, timeMin, timeMax),
  getGcalEventsCache: () => ipcRenderer.invoke('store:getGcalEventsCache'),
  saveGcalEventsCache: (cache) => ipcRenderer.invoke('store:saveGcalEventsCache', cache),
  getGcalCalendarsCache: () => ipcRenderer.invoke('store:getGcalCalendarsCache'),
  saveGcalCalendarsCache: (cache) => ipcRenderer.invoke('store:saveGcalCalendarsCache', cache),

  // Data Reset & System Utils
  resetData: () => ipcRenderer.invoke('store:reset'),
  hardReset: () => ipcRenderer.invoke('data:hard-reset'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
});
