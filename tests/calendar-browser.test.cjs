const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  let user = { uid: 'user-a', email: 'user@example.com' };
  let respond = async () => ({ ok: true, json: async () => ({ accessToken: 'access', expiresAt: Date.now() + 3600000 }) });
  const counts = { requests: 0, popups: 0 };
  const local = new Map();
  const context = vm.createContext({
    calendarBackendConfig: { enabled: true, clientId: 'test-client', url: 'https://backend.example' },
    getCurrentUser: () => user, getFirebaseIdToken: async () => 'firebase-token',
    AbortSignal, setTimeout, clearTimeout,
    localStorage: { setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) },
    fetch: async (...args) => { counts.requests++; return respond(...args); },
    window: { google: { accounts: { oauth2: { initCodeClient(options) {
      return { requestCode() { counts.popups++; queueMicrotask(() => options.callback({ code: 'one-time-code' })); } };
    } } } } }
  });
  vm.runInContext(fs.readFileSync('js/api/calendar-backend.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  return { context, counts, local, setUser: value => { user = value; }, setResponse: value => { respond = value; } };
}

test('automatic renewal uses Firebase-authenticated backend requests without popups', async () => {
  const { context, counts, local, setResponse } = setup();
  setResponse(async (url, options) => {
    assert.equal(url, 'https://backend.example/token');
    assert.equal(options.headers.Authorization, 'Bearer firebase-token');
    assert.equal(options.headers['X-Requested-With'], 'XmlHttpRequest');
    return { ok: true, json: async () => ({ accessToken: 'access', expiresAt: Date.now() + 3600000 }) };
  });
  const tokens = await Promise.all([context.getBackendCalendarToken(), context.getBackendCalendarToken()]);
  assert.deepEqual(tokens, ['access', 'access']);
  assert.equal(counts.requests, 1);
  assert.equal(counts.popups, 0);
  assert.equal(await context.getBackendCalendarToken(), 'access');
  assert.equal(counts.requests, 1);
  assert.deepEqual([...local.keys()], ['auth.gcalConnected']);
});

test('page reload recovers a connection from the backend without authorization', async () => {
  const { context, counts } = setup();
  await context.getBackendCalendarToken();
  context.resetCalendarBackend();
  assert.equal(await context.getBackendCalendarToken(), 'access');
  assert.equal(counts.requests, 2);
  assert.equal(counts.popups, 0);
});

test('explicit connect opens one code popup and caches the resulting access token', async () => {
  const { context, counts, setResponse } = setup();
  setResponse(async (url, options) => {
    assert.equal(url, 'https://backend.example/connect');
    assert.deepEqual(JSON.parse(options.body), { code: 'one-time-code' });
    return { ok: true, json: async () => ({ accessToken: 'connected', expiresAt: Date.now() + 3600000 }) };
  });
  assert.equal(await context.connectCalendarBackend(), 'connected');
  assert.equal(await context.getBackendCalendarToken(), 'connected');
  assert.equal(counts.popups, 1);
  assert.equal(counts.requests, 1);
});

test('revocation returns reconnect-needed without opening a popup', async () => {
  const { context, counts, setResponse } = setup();
  setResponse(async () => ({ ok: false, json: async () => ({ error: 'RECONNECT_REQUIRED' }) }));
  assert.equal(await context.getBackendCalendarToken(), null);
  assert.equal(await context.getBackendCalendarToken(), null);
  assert.equal(counts.requests, 1);
  assert.equal(counts.popups, 0);
});

test('temporary outage remains an outage during backoff, not an expired session', async () => {
  const { context, counts, setResponse } = setup();
  setResponse(async () => ({ ok: false, json: async () => ({ error: 'GOOGLE_TEMPORARILY_UNAVAILABLE' }) }));
  await assert.rejects(context.getBackendCalendarToken(), /GOOGLE_TEMPORARILY_UNAVAILABLE/);
  await assert.rejects(context.getBackendCalendarToken(), /GOOGLE_TEMPORARILY_UNAVAILABLE/);
  assert.equal(counts.requests, 1);
});

test('account switch discards an in-flight token from the previous user', async () => {
  const { context, counts, setUser, setResponse } = setup();
  setResponse(async () => {
    setUser({ uid: 'user-b' });
    context.resetCalendarBackend();
    return { ok: true, json: async () => ({ accessToken: 'wrong-user-token', expiresAt: Date.now() + 3600000 }) };
  });
  await assert.rejects(context.getBackendCalendarToken(), /account changed/);
  setResponse(async () => ({ ok: true, json: async () => ({ accessToken: 'right-token', expiresAt: Date.now() + 3600000 }) }));
  assert.equal(await context.getBackendCalendarToken(), 'right-token');
  assert.equal(counts.requests, 2);
});
