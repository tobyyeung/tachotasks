const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const stored = new Map([['auth.gcalConnected', 'true']]);
  const label = { textContent: '' };
  const status = { style: {}, classList: { add() {}, remove() {} }, querySelector: () => label };
  let renders = 0;
  const context = vm.createContext({
    console, Date, Set, setTimeout,
    state: { sessionExpired: true, activeGcalIds: ['calendar'], fetchedGcalIds: new Set(), gcalEvents: [], settings: {} },
    document: { getElementById: id => id === 'gcal-status' ? status : null },
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    renderView: () => { renders++; }, updateCalendarEventsUI() {}, showToast() {},
    window: { api: { getGCalEvents: async () => [], saveGcalEventsCache: async () => {}, getGcalEventsCache: async () => [] } }
  });
  vm.runInContext(fs.readFileSync('js/components/auth-sync.js', 'utf8'), context);
  return { context, label, stored, status, renders: () => renders };
}

test('successful event refresh clears the banner and updates sidebar even with no returned events', async () => {
  const f = setup();
  await f.context.reloadGoogleEvents(true);
  assert.equal(f.context.state.sessionExpired, false);
  assert.equal(f.label.textContent, 'Google Calendar connected');
  assert.equal(f.renders(), 1);
});

test('expired credentials update sidebar, banner, and persisted connection flag together', async () => {
  const f = setup();
  f.context.setGcalConnectionStatus('connected');
  f.context.window.api.getGCalEvents = async () => ({ error: 'SESSION_EXPIRED' });
  await f.context.reloadGoogleEvents(true);
  assert.equal(f.context.state.sessionExpired, true);
  assert.equal(f.label.textContent, 'GCal session expired');
  assert.equal(f.stored.has('auth.gcalConnected'), false);
});

test('temporary failures do not claim the Google grant expired', async () => {
  const f = setup();
  f.context.window.api.getGCalEvents = async () => ({ error: 'GOOGLE_TEMPORARILY_UNAVAILABLE' });
  await f.context.reloadGoogleEvents(true);
  assert.equal(f.context.state.sessionExpired, false);
  assert.equal(f.label.textContent, 'Google Calendar sync unavailable');
});

test('late expired response cannot undo a successful reconnect', async () => {
  const f = setup();
  let resolve;
  f.context.window.api.getGCalEvents = () => new Promise(done => { resolve = done; });
  const pending = f.context.reloadGoogleEvents(true);
  f.context.window.api.reconnectGCal = async () => ({ success: true });
  await f.context.window.reconnectGoogleCalendar();
  resolve({ error: 'SESSION_EXPIRED' });
  await pending;
  assert.equal(f.context.state.sessionExpired, false);
  assert.equal(f.label.textContent, 'Google Calendar connected');
});

test('cached connection flag alone does not claim a verified connection', () => {
  const f = setup();
  f.context.setGcalConnectionStatus('unknown');
  assert.equal(f.status.style.display, 'none');
  f.context.setGcalConnectionStatus('disconnected');
  assert.equal(f.context.state.sessionExpired, false);
  assert.equal(f.stored.has('auth.gcalConnected'), false);
});
