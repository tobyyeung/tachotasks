/**
 * electron/main.js
 * Electron main process — creates the BrowserWindow, system tray,
 * wires IPC handlers to the SQLite database and sync engine.
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, Notification } = require('electron');
const path = require('path');
const { initDatabase, getDb } = require('./db');

// Keep a global reference to prevent garbage collection
let mainWindow = null;
let tray = null;

// Determine if running in development (Vite dev server) or production (built files)
const isDev = !app.isPackaged;
const VITE_DEV_URL = 'http://localhost:5173';

function createWindow() {
  // Restore previous window bounds if saved
  const db = getDb();
  let bounds = { width: 1280, height: 820 };
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'windowBounds'").get();
    if (row) {
      bounds = { ...bounds, ...JSON.parse(row.value) };
    }
  } catch (e) { /* use defaults */ }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 600,
    title: 'Tacho Tasks',
    icon: path.join(__dirname, '..', 'assets', 'brand', 'logo.png'),
    backgroundColor: '#0e0e10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // needed for better-sqlite3 in preload
    },
    show: false, // Show after ready-to-show to avoid white flash
    titleBarStyle: 'default'
  });

  // Show window when content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app — either from Vite dev server (if explicitly requested) or local build
  const distIndexPath = path.join(__dirname, '..', 'dist', 'index.html');
  const rootIndexPath = path.join(__dirname, '..', 'index.html');

  if (process.env.VITE_DEV_SERVER === 'true') {
    mainWindow.loadURL(VITE_DEV_URL);
  } else if (require('fs').existsSync(distIndexPath)) {
    mainWindow.loadFile(distIndexPath);
  } else {
    mainWindow.loadFile(rootIndexPath);
  }

  // Allow toggling DevTools via F12 or Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Log renderer errors to terminal for clean debugging
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 3) {
      console.error('[renderer-error]', message);
    }
  });

  // Save window bounds on resize/move
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const currentBounds = mainWindow.getBounds();
      try {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('windowBounds', ?)").run(JSON.stringify(currentBounds));
      } catch (e) { /* ignore */ }
    }
  };
  mainWindow.on('resized', saveBounds);
  mainWindow.on('moved', saveBounds);

  // Handle external links — open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'brand', 'logo.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch (e) {
    return; // Skip tray if icon is missing
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Tacho Tasks');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Tacho Tasks',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

// ===== IPC HANDLERS =====
// These mirror the window.api interface from browser-api.js

function setupIpcHandlers() {
  const db = getDb();

  // ---- Tasks ----
  ipcMain.handle('db:getTasks', () => {
    const rows = db.prepare('SELECT data FROM tasks').all();
    return rows.map(r => JSON.parse(r.data));
  });

  ipcMain.handle('db:saveTasks', (_, tasks) => {
    const insertOrReplace = db.prepare('INSERT OR REPLACE INTO tasks (id, data, updatedAt) VALUES (?, ?, ?)');
    const deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');
    
    const existingIds = new Set(db.prepare('SELECT id FROM tasks').all().map(r => r.id));
    const incomingIds = new Set(tasks.map(t => t.id));

    const transaction = db.transaction(() => {
      // Upsert incoming tasks
      for (const task of tasks) {
        if (!task.id) continue;
        const now = task.updatedAt || new Date().toISOString();
        if (!task.createdAt) task.createdAt = now;
        if (!task.updatedAt) task.updatedAt = now;
        insertOrReplace.run(task.id, JSON.stringify(task), now);
      }
      // Remove tasks no longer in the array
      for (const id of existingIds) {
        if (!incomingIds.has(id)) {
          deleteTask.run(id);
        }
      }
    });
    transaction();
    return true;
  });

  // ---- Archived Tasks ----
  ipcMain.handle('db:getArchivedTasks', () => {
    const rows = db.prepare('SELECT data FROM archived_tasks').all();
    return rows.map(r => JSON.parse(r.data));
  });

  ipcMain.handle('db:saveArchivedTasks', (_, tasks) => {
    const insertOrReplace = db.prepare('INSERT OR REPLACE INTO archived_tasks (id, data, updatedAt) VALUES (?, ?, ?)');
    const deleteTask = db.prepare('DELETE FROM archived_tasks WHERE id = ?');
    
    const existingIds = new Set(db.prepare('SELECT id FROM archived_tasks').all().map(r => r.id));
    const incomingIds = new Set(tasks.map(t => t.id));

    const transaction = db.transaction(() => {
      for (const task of tasks) {
        if (!task.id) continue;
        const now = task.updatedAt || new Date().toISOString();
        insertOrReplace.run(task.id, JSON.stringify(task), now);
      }
      for (const id of existingIds) {
        if (!incomingIds.has(id)) {
          deleteTask.run(id);
        }
      }
    });
    transaction();
    return true;
  });

  // ---- Projects ----
  ipcMain.handle('db:getProjects', () => {
    const rows = db.prepare('SELECT data FROM projects').all();
    return rows.map(r => JSON.parse(r.data));
  });

  ipcMain.handle('db:saveProjects', (_, projects) => {
    const insertOrReplace = db.prepare('INSERT OR REPLACE INTO projects (id, data, updatedAt) VALUES (?, ?, ?)');
    const deleteProject = db.prepare('DELETE FROM projects WHERE id = ?');
    
    const existingIds = new Set(db.prepare('SELECT id FROM projects').all().map(r => r.id));
    const incomingIds = new Set(projects.map(p => p.id));

    const transaction = db.transaction(() => {
      for (const project of projects) {
        if (!project.id) continue;
        const now = project.updatedAt || new Date().toISOString();
        insertOrReplace.run(project.id, JSON.stringify(project), now);
      }
      for (const id of existingIds) {
        if (!incomingIds.has(id)) {
          deleteProject.run(id);
        }
      }
    });
    transaction();
    return true;
  });

  // ---- Profiles ----
  ipcMain.handle('db:getProfiles', () => {
    const rows = db.prepare('SELECT data FROM profiles').all();
    return rows.map(r => JSON.parse(r.data));
  });

  ipcMain.handle('db:saveProfiles', (_, profiles) => {
    const insertOrReplace = db.prepare('INSERT OR REPLACE INTO profiles (id, data, updatedAt) VALUES (?, ?, ?)');
    const deleteProfile = db.prepare('DELETE FROM profiles WHERE id = ?');
    
    const existingIds = new Set(db.prepare('SELECT id FROM profiles').all().map(r => r.id));
    const incomingIds = new Set(profiles.map(p => p.id));

    const transaction = db.transaction(() => {
      for (const profile of profiles) {
        if (!profile.id) continue;
        const now = profile.updatedAt || new Date().toISOString();
        insertOrReplace.run(profile.id, JSON.stringify(profile), now);
      }
      for (const id of existingIds) {
        if (!incomingIds.has(id)) {
          deleteProfile.run(id);
        }
      }
    });
    transaction();
    return true;
  });

  // ---- Settings ----
  ipcMain.handle('db:getSettings', () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'userPreferences'").get();
    return row ? JSON.parse(row.value) : {};
  });

  ipcMain.handle('db:saveSettings', (_, settings) => {
    if (settings && typeof settings === 'object') {
      settings.updatedAt = new Date().toISOString();
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('userPreferences', ?)").run(JSON.stringify(settings));
    return true;
  });

  // ---- Tombstones ----
  ipcMain.handle('db:recordTombstone', (_, id, type) => {
    const now = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO tombstones (id, type, deletedAt) VALUES (?, ?, ?)').run(id, type || 'task', now);
    return true;
  });

  // ---- GCal Cache ----
  ipcMain.handle('db:getGcalEventsCache', () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'gcalEventsCache'").get();
    return row ? JSON.parse(row.value) : [];
  });

  ipcMain.handle('db:saveGcalEventsCache', (_, cache) => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gcalEventsCache', ?)").run(JSON.stringify(cache));
    return true;
  });

  ipcMain.handle('db:getGcalCalendarsCache', () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'gcalCalendarsCache'").get();
    return row ? JSON.parse(row.value) : [];
  });

  ipcMain.handle('db:saveGcalCalendarsCache', (_, cache) => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gcalCalendarsCache', ?)").run(JSON.stringify(cache));
    return true;
  });

  // ---- Data Reset ----
  ipcMain.handle('db:resetData', () => {
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM archived_tasks').run();
    db.prepare('DELETE FROM projects').run();
    db.prepare('DELETE FROM profiles').run();
    db.prepare('DELETE FROM tombstones').run();
    db.prepare('DELETE FROM settings').run();
    db.prepare('DELETE FROM sync_queue').run();
    return true;
  });

  ipcMain.handle('db:hardReset', () => {
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM archived_tasks').run();
    db.prepare('DELETE FROM projects').run();
    db.prepare('DELETE FROM profiles').run();
    db.prepare('DELETE FROM tombstones').run();
    db.prepare('DELETE FROM settings').run();
    db.prepare('DELETE FROM sync_queue').run();
    return { success: true };
  });

  // ---- Misc ----
  ipcMain.handle('shell:openExternal', (_, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('notifications:show', (_, { title, body }) => {
    if (Notification && Notification.isSupported()) {
      new Notification({
        title: title || 'Tacho Tasks',
        body: body || '',
        icon: path.join(__dirname, '..', 'assets', 'brand', 'logo.png')
      }).show();
      return true;
    }
    return false;
  });
}

function setupAutoUpdater() {
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.log('[updater] Check error:', err);
      });
    } catch (e) {
      console.warn('[updater] Init error:', e);
    }
  }
}

// ===== APP LIFECYCLE =====

app.whenReady().then(async () => {
  await initDatabase();
  setupIpcHandlers();
  createWindow();
  createTray();
  setupAutoUpdater();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Close database connection cleanly
  try {
    const db = getDb();
    if (db && db.open) db.close();
  } catch (e) { /* ignore */ }
});
