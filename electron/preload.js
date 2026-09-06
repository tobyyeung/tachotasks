/**
 * electron/preload.js
 * Preload script that exposes `window.electronStorage` and `window.electronAPI`
 * to the renderer process via Electron's contextBridge.
 *
 * browser-api.js binds window.api to this storage layer when running in Electron,
 * while seamlessly augmenting it with auth, sync, and GCal capabilities.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronStorage', {
  // ---- Tasks CRUD ----
  getTasks: () => ipcRenderer.invoke('db:getTasks'),
  saveTasks: (tasks) => ipcRenderer.invoke('db:saveTasks', tasks),
  getArchivedTasks: () => ipcRenderer.invoke('db:getArchivedTasks'),
  saveArchivedTasks: (tasks) => ipcRenderer.invoke('db:saveArchivedTasks', tasks),

  // ---- Projects CRUD ----
  getProjects: () => ipcRenderer.invoke('db:getProjects'),
  saveProjects: (projects) => ipcRenderer.invoke('db:saveProjects', projects),

  // ---- Profiles CRUD ----
  getProfiles: () => ipcRenderer.invoke('db:getProfiles'),
  saveProfiles: (profiles) => ipcRenderer.invoke('db:saveProfiles', profiles),

  // ---- Tombstone Deletion Tracking ----
  recordTombstone: (id, type) => ipcRenderer.invoke('db:recordTombstone', id, type || 'task'),

  // ---- Settings CRUD ----
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('db:saveSettings', settings),

  // ---- GCal Cache (stored in SQLite) ----
  getGcalEventsCache: () => ipcRenderer.invoke('db:getGcalEventsCache'),
  saveGcalEventsCache: (cache) => ipcRenderer.invoke('db:saveGcalEventsCache', cache),
  getGcalCalendarsCache: () => ipcRenderer.invoke('db:getGcalCalendarsCache'),
  saveGcalCalendarsCache: (cache) => ipcRenderer.invoke('db:saveGcalCalendarsCache', cache),

  // ---- Data Reset & System Utils ----
  resetData: () => ipcRenderer.invoke('db:resetData'),
  hardReset: () => ipcRenderer.invoke('db:hardReset'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ---- Default Browser Auth Bridge ----
  startBrowserAuth: () => ipcRenderer.invoke('auth:startBrowserLogin'),
  onAuthSuccess: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('electron:auth-success', listener);
    return () => ipcRenderer.removeListener('electron:auth-success', listener);
  }
});

// Expose platform flag & version & notifications
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  showNotification: (options) => ipcRenderer.invoke('notifications:show', options || {})
});
