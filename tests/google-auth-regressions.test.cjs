const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ expired = false, unauthorized = false, cancel = false } = {}) {
  const stored = new Map([
    ['auth.clientId', 'test-client'], ['auth.googleAccessToken', 'cached'],
    ['auth.accessTokenExpiresAt', String(Date.now() + (expired ? -1000 : 60000))]
  ]);
  const counts = { popup: 0, fallback: 0, network: 0, timer: 0, focus: 0 };
  let callbacks;
  const context = vm.createContext({
    calendarBackendEnabled: () => false, resetCalendarBackend() {},
    console, setTimeout, clearTimeout, URLSearchParams,
    setInterval() { counts.timer++; },
    document: { addEventListener() { counts.focus++; } },
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (k, v) => stored.set(k, v), removeItem: k => stored.delete(k) },
    window: { google: { accounts: { oauth2: { initTokenClient(options) {
      callbacks = options;
      return { requestAccessToken() {
        counts.popup++;
        queueMicrotask(() => cancel ? callbacks.error_callback({ type: 'popup_closed' }) : callbacks.callback({ access_token: 'fresh', expires_in: 3600 }));
      } };
    } } } } },
    reauthenticateWithFirebasePopup: async () => { counts.fallback++; return 'fallback'; },
    fetch: async () => { counts.network++; return { status: unauthorized ? 401 : 200, ok: !unauthorized, text: async () => 'Unauthorized', json: async () => ({ items: [] }) }; }
  });
  const source = fs.readFileSync('js/api/gcal-api.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export \{[\s\S]*?\};/g, '');
  vm.runInContext(source, context);
  return { context, counts };
}

test('expired background credentials never open auth or schedule automatic prompts', async () => {
  const { context, counts } = setup({ expired: true });
  assert.equal(await context.refreshAccessToken(false), null);
  await assert.rejects(context.fetchCalendars(), /No Google Access Token/);
  assert.deepEqual(counts, { popup: 0, fallback: 0, network: 0, timer: 0, focus: 0 });
});

test('valid cached credentials fetch calendars without authorization', async () => {
  const { context, counts } = setup();
  await context.fetchCalendars();
  assert.equal(counts.network, 1);
  assert.equal(counts.popup, 0);
});

test('401 invalidates credentials without a popup or retry', async () => {
  const { context, counts } = setup({ unauthorized: true });
  await assert.rejects(context.fetchCalendars(), /401/);
  assert.equal(await context.getValidAccessToken(), null);
  assert.equal(counts.network, 1);
  assert.equal(counts.popup, 0);
});

test('explicit reconnect opens one popup even for concurrent requests', async () => {
  const { context, counts } = setup({ expired: true });
  const tokens = await Promise.all([context.refreshAccessToken(true), context.refreshAccessToken(true)]);
  assert.deepEqual(tokens, ['fresh', 'fresh']);
  assert.equal(counts.popup, 1);
  assert.equal(await context.getValidAccessToken(), 'fresh');
});

test('closing reconnect does not launch a fallback popup', async () => {
  const { context, counts } = setup({ expired: true, cancel: true });
  assert.equal(await context.refreshAccessToken(true), null);
  assert.equal(counts.popup, 1);
  assert.equal(counts.fallback, 0);
});
