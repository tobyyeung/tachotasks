const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setupDesktopUpdater } = require('../electron/updater');

function fixture(packaged = true) {
  const updater = new EventEmitter();
  let checks = 0, installs = 0, flushed = 0, interval;
  const handlers = {}, messages = [];
  const window = { isDestroyed: () => false, webContents: { send: (_, value) => messages.push(value) } };
  updater.checkForUpdates = async () => { checks++; updater.emit('update-not-available'); return {}; };
  updater.quitAndInstall = (silent, relaunch) => { assert.equal(silent, true); assert.equal(relaunch, true); installs++; };
  const controller = setupDesktopUpdater({ app: { isPackaged: packaged, getVersion: () => '1.20.0' }, ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    autoUpdater: updater, getWindow: () => window, beforeInstall: async () => { flushed++; }, setIntervalFn: callback => { interval = callback; return { unref() {} }; } });
  return { updater, controller, handlers, event: { sender: window.webContents }, get checks() { return checks; }, get installs() { return installs; }, get flushed() { return flushed; }, get interval() { return interval; } };
}

test('background updates check automatically and coalesce concurrent checks', async () => {
  const f = fixture(); await f.controller.check();
  assert.equal(f.checks, 1); assert.equal(f.updater.autoDownload, true); assert.equal(f.updater.autoInstallOnAppQuit, true);
  await Promise.all([f.controller.check(), f.controller.check()]); assert.equal(f.checks, 2);
  await f.interval(); assert.equal(f.checks, 3);
});
test('download state survives reads and installs only once after data is flushed', async () => {
  const f = fixture(); await f.controller.check();
  assert.equal((await f.handlers['updater:install'](f.event)).success, false);
  f.updater.emit('update-available', { version: '1.21.0' });
  f.updater.emit('download-progress', { percent: 51.6 });
  assert.equal(f.handlers['updater:getState'](f.event).percent, 51);
  await f.controller.check(); assert.equal(f.checks, 1);
  f.updater.emit('update-downloaded', { version: '1.21.0' });
  assert.equal(f.handlers['updater:getState'](f.event).status, 'downloaded');
  await Promise.all([f.handlers['updater:install'](f.event), f.handlers['updater:install'](f.event)]);
  assert.equal(f.installs, 1); assert.equal(f.flushed, 1);
});
test('untrusted windows cannot check or install updates', async () => {
  const f = fixture(); await f.controller.check();
  assert.throws(() => f.handlers['updater:check']({ sender: {} }), /Invalid/);
  await assert.rejects(f.handlers['updater:install']({ sender: {} }), /Invalid/);
});
test('development builds never contact updater servers', async () => {
  const f = fixture(false); await f.controller.check();
  assert.equal(f.checks, 0); assert.equal(f.controller.getState().status, 'unsupported');
});
test('failed checks report an error and can retry', async () => {
  const f = fixture(); await f.controller.check();
  f.updater.checkForUpdates = async () => { throw new Error('offline'); };
  await f.controller.check(); assert.equal(f.controller.getState().status, 'error');
  f.updater.checkForUpdates = async () => f.updater.emit('update-not-available');
  await f.controller.check(); assert.equal(f.controller.getState().status, 'current');
});
