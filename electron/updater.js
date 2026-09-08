/** Own the updater lifecycle independently of whichever renderer view is open. */
function setupDesktopUpdater({ app, ipcMain, autoUpdater, getWindow, beforeInstall, setIntervalFn = setInterval }) {
  let state = { revision: 0, status: app.isPackaged ? 'idle' : 'unsupported', currentVersion: app.getVersion(), version: null, percent: 0, error: null };
  let checking = null;
  let installing = false;
  const publish = patch => {
    state = { ...state, ...patch, revision: state.revision + 1 };
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('updater:state', state);
  };
  const fail = error => {
    console.warn('[updater]', error);
    installing = false;
    publish({ status: 'error', error: 'Could not update right now. Check your connection and try again.' });
  };
  async function check() {
    if (!app.isPackaged || ['downloading', 'downloaded', 'installing'].includes(state.status)) return { ...state };
    if (checking) return checking;
    publish({ status: 'checking', error: null, percent: 0 });
    checking = Promise.resolve().then(async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        // Automatic downloads have a separate promise; handle rejection too.
        if (result?.downloadPromise) result.downloadPromise.catch(fail);
      } catch (error) { fail(error); }
      return { ...state };
    }).finally(() => { checking = null; });
    return checking;
  }
  const trusted = event => event.sender === getWindow()?.webContents;
  ipcMain.handle('updater:getState', event => {
    if (!trusted(event)) throw new Error('Invalid update request');
    return { ...state };
  });
  ipcMain.handle('updater:check', event => {
    if (!trusted(event)) throw new Error('Invalid update request');
    return check();
  });
  ipcMain.handle('updater:install', async event => {
    if (!trusted(event)) throw new Error('Invalid update request');
    if (state.status !== 'downloaded' || installing) return { success: false };
    installing = true;
    publish({ status: 'installing' });
    try {
      await beforeInstall();
      // Silent NSIS update; relaunch the app after installing.
      autoUpdater.quitAndInstall(true, true);
      return { success: true };
    } catch (error) {
      installing = false;
      publish({ status: 'downloaded', error: 'Could not restart. Please try again.' });
      return { success: false };
    }
  });
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on('checking-for-update', () => publish({ status: 'checking', error: null }));
    autoUpdater.on('update-available', info => publish({ status: 'downloading', version: info.version, percent: 0, error: null }));
    autoUpdater.on('update-not-available', () => publish({ status: 'current', version: null, error: null }));
    autoUpdater.on('download-progress', progress => {
      const percent = Math.max(0, Math.min(100, Math.floor(Number(progress.percent) || 0)));
      if (percent !== state.percent) publish({ status: 'downloading', percent });
    });
    autoUpdater.on('update-downloaded', info => publish({ status: 'downloaded', version: info.version, percent: 100, error: null }));
    autoUpdater.on('error', fail);
    check();
    const timer = setIntervalFn(check, 4 * 60 * 60 * 1000);
    timer.unref?.();
  }
  return { check, getState: () => ({ ...state }) };
}
module.exports = { setupDesktopUpdater };
