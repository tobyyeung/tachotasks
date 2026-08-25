/**
 * main.js
 * Main Process for TachoTasks Electron Application.
 * Handles window creation, background cloud sync window, IPC data CRUD, Google Auth & Calendar IPC.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ===== DATA PATH SETUP =====
const dataPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}
app.setPath('userData', dataPath);
app.setPath('sessionData', path.join(dataPath, 'session'));
app.setPath('logs', path.join(dataPath, 'logs'));
app.setPath('crashDumps', path.join(dataPath, 'crashDumps'));

const { store } = require('./store');
const chrono = require('chrono-node');
const { signInWithGoogle } = require('./auth');
const gcalService = require('./gcal-service');

let cloudBgWindow = null;
let currentBgUser = store.get('auth.user') || null;

/**
 * Creates the hidden background window (`cloud-bg.html`) dedicated to Firebase Firestore synchronization.
 */
function createCloudBgWindow() {
  cloudBgWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  cloudBgWindow.loadFile('cloud-bg.html');

  cloudBgWindow.webContents.on('console-message', (e, level, msg) => {
    console.log('[cloud-bg]', msg);
  });

  ipcMain.on('cloudBg:authStateChanged', (e, user) => {
    if (user) {
      currentBgUser = user;
      // Persist user to disk for session recovery on next launch
      store.set('auth.user', user);
    } else {
      // Only clear if we don't have stored credentials
      const storedUser = store.get('auth.user');
      const storedToken = store.get('auth.googleAccessToken');
      if (storedUser && storedToken) {
        // Keep the stored session alive
        currentBgUser = storedUser;
        user = storedUser;
      } else {
        currentBgUser = null;
      }
    }
    BrowserWindow.getAllWindows().forEach(win => {
      if (win !== cloudBgWindow && !win.isDestroyed()) {
        win.webContents.send('auth:stateChanged', currentBgUser);
      }
    });
  });
}

/**
 * Sends an IPC message to the hidden cloud background window and awaits a response.
 * @param {string} channel - Target IPC channel.
 * @param {...*} args - Arguments to pass.
 * @returns {Promise<*>} Response from background window.
 */
function sendToCloudBg(channel, ...args) {
  return new Promise((resolve) => {
    if (!cloudBgWindow || cloudBgWindow.isDestroyed()) return resolve({ error: 'Cloud background not ready' });

    const executeSend = () => {
      if (!cloudBgWindow || cloudBgWindow.isDestroyed()) return resolve({ error: 'Cloud background not ready' });
      const id = Date.now().toString() + Math.random();
      const timeout = setTimeout(() => {
        ipcMain.removeListener('cloudBg:reply', handler);
        resolve({ error: 'Background sync timeout' });
      }, 10000);

      const handler = (e, replyId, res) => {
        if (replyId === id) {
          clearTimeout(timeout);
          ipcMain.removeListener('cloudBg:reply', handler);
          resolve(res);
        }
      };
      ipcMain.on('cloudBg:reply', handler);
      cloudBgWindow.webContents.send(channel, id, ...args);
    };

    if (cloudBgWindow.webContents.isLoading()) {
      cloudBgWindow.webContents.once('did-finish-load', executeSend);
    } else {
      executeSend();
    }
  });
}

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let syncTimeout = null;

/**
 * Schedules a debounced sync to the cloud (500ms delay).
 */
function triggerSyncToCloud() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    sendToCloudBg('cloudBg:syncToCloud');
  }, 500);
}

// ===== WINDOW CREATION =====

/**
 * Creates the primary application window.
 * @returns {BrowserWindow} Created window instance.
 */
let mainWindow = null;

/**
 * Creates the primary application window.
 * @returns {BrowserWindow} Created window instance.
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0f1117',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow = win;

  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());

  // Intercept links opening in new tab and route to OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept HTTP/HTTPS navigations
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      e.preventDefault();
      require('electron').shell.openExternal(url);
    }
  });

  if (!cloudBgWindow) createCloudBgWindow();

  return win;
}

// ===== IPC HANDLERS — DATA CRUD =====

ipcMain.handle('store:getTasks', () => store.get('tasks'));
ipcMain.handle('store:saveTasks', async (_, tasks) => {
  store.set('tasks', tasks);
  triggerSyncToCloud();
  return true;
});

ipcMain.handle('store:getArchivedTasks', () => store.get('archivedTasks'));
ipcMain.handle('store:saveArchivedTasks', async (_, tasks) => {
  store.set('archivedTasks', tasks);
  triggerSyncToCloud();
  return true;
});

ipcMain.handle('store:getProjects', () => store.get('projects'));
ipcMain.handle('store:saveProjects', async (_, projects) => {
  store.set('projects', projects);
  triggerSyncToCloud();
  return true;
});

ipcMain.handle('store:getProfiles', () => store.get('profiles'));
ipcMain.handle('store:saveProfiles', async (_, profiles) => {
  store.set('profiles', profiles);
  triggerSyncToCloud();
  return true;
});

ipcMain.handle('store:getReminders', () => store.get('reminders'));
ipcMain.handle('store:saveReminders', async (_, reminders) => {
  store.set('reminders', reminders);
  triggerSyncToCloud();
  return true;
});

ipcMain.handle('store:getSettings', () => store.get('settings'));
ipcMain.handle('store:saveSettings', async (_, settings) => {
  store.set('settings', settings);
  triggerSyncToCloud();
  return true;
});

ipcMain.handle('store:getGcalEventsCache', () => store.get('gcalEventsCache'));
ipcMain.handle('store:saveGcalEventsCache', async (_, cache) => {
  store.set('gcalEventsCache', cache);
  return true;
});

ipcMain.handle('store:getGcalCalendarsCache', () => store.get('gcalCalendarsCache'));
ipcMain.handle('store:saveGcalCalendarsCache', async (_, cache) => {
  store.set('gcalCalendarsCache', cache);
  return true;
});

ipcMain.handle('store:reset', () => { store.clear(); return true; });

// Raw handlers for cloud background window to access store without caching loops
ipcMain.handle('store:getRaw', (_, key) => store.get(key));
ipcMain.handle('store:setRaw', (_, key, value) => {
  store.set(key, value);
  return true;
});
ipcMain.handle('store:deleteRaw', (_, key) => { store.delete(key); return true; });
ipcMain.handle('store:clearRaw', () => { store.clear(); return true; });

// ===== AUTH & CLOUD SYNC IPC =====

ipcMain.handle('auth:signIn', async () => {
  try {
    const { idToken, accessToken, refreshToken, expiresIn, clientId } = await signInWithGoogle();
    if (clientId) {
      store.set('auth.clientId', clientId);
    }
    if (refreshToken) {
      store.set('auth.refreshToken', refreshToken);
    }
    if (cloudBgWindow && !cloudBgWindow.isDestroyed()) {
      cloudBgWindow.webContents.send('cloudBg:signIn', idToken, accessToken, refreshToken, expiresIn, clientId);
    }
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('auth:signOut', async () => {
  // Clear stored auth immediately so the authStateChanged guard doesn't resurrect the session
  currentBgUser = null;
  store.delete('auth.user');
  store.delete('auth.googleAccessToken');
  store.delete('auth.refreshToken');
  store.delete('auth.clientId');
  store.delete('auth.accessTokenExpiresAt');
  if (cloudBgWindow && !cloudBgWindow.isDestroyed()) {
    cloudBgWindow.webContents.send('cloudBg:signOut');
  }
  return { success: true };
});

ipcMain.handle('auth:getUser', () => currentBgUser || store.get('auth.user') || null);

ipcMain.handle('sync:pull', async () => {
  // If there are unsynced pending local changes, push them before pulling to prevent data loss
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
    await sendToCloudBg('cloudBg:syncToCloud');
  }
  return await sendToCloudBg('cloudBg:syncFromCloud');
});

ipcMain.handle('sync:push', async () => {
  return await sendToCloudBg('cloudBg:syncToCloud');
});

ipcMain.handle('data:hard-reset', async () => {
  store.clear();
  return { success: true };
});

// ===== GOOGLE CALENDAR IPC =====

ipcMain.handle('gcal:getCalendars', async () => {
  try {
    return await gcalService.fetchCalendars();
  } catch (e) {
    console.error('Failed to fetch Google Calendars:', e);
    if (e.message.includes('401')) {
      return { error: 'SESSION_EXPIRED' };
    }
    return { error: e.message };
  }
});

ipcMain.handle('gcal:getEvents', async (_, calendarIds, timeMin, timeMax) => {
  try {
    let allEvents = [];
    for (const calId of calendarIds) {
      const evts = await gcalService.fetchEvents(calId, timeMin, timeMax);
      allEvents = allEvents.concat(evts);
    }
    return allEvents;
  } catch (e) {
    console.error('Failed to fetch Google Events:', e);
    if (e.message.includes('401')) {
      return { error: 'SESSION_EXPIRED' };
    }
    return { error: e.message };
  }
});

// ===== SYSTEM UTILS =====
ipcMain.handle('app:openExternal', (_, url) => {
  require('electron').shell.openExternal(url);
});

// ===== NATURAL LANGUAGE PARSING =====
ipcMain.handle('nlp:parse', (_, text) => {
  const result = { title: text, priority: null, tags: [], projectName: null, dueDate: null, dueTime: null, recurring: null };
  let cleaned = text;

  // Priority extraction
  const prioKeyword = cleaned.match(/\b(p[1-3])\b/i);
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

  // Date and time extraction with chrono-node
  try {
    const chronoResults = chrono.parse(cleaned, new Date(), { forwardDate: true });
    if (chronoResults.length > 0) {
      const parsed = chronoResults[0];
      result.dueDate = parsed.start.date().toISOString().split('T')[0];
      if (parsed.start.isCertain('hour')) {
        const h = parsed.start.get('hour');
        const m = parsed.start.get('minute') || 0;
        result.dueTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      cleaned = cleaned.replace(parsed.text, '');
    }
  } catch (e) { /* skip */ }

  result.title = cleaned.replace(/\s+/g, ' ').trim();
  return result;
});

// ===== APP LIFECYCLE & SINGLE INSTANCE LOCK =====
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[main] Another instance is already running. Terminating duplicate instance.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to launch a second instance, focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});