const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  let verified = 0;
  let options;
  const modules = {
    'firebase-functions/v2/https': { onRequest: (config, handler) => { options = config; return handler; } },
    'firebase-functions/v1': { region: () => ({ auth: { user: () => ({ onDelete: handler => handler }) } }) },
    'firebase-functions/params': { defineString: (_, options) => ({ value: () => options?.default }), defineSecret: () => ({}) },
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async () => { verified++; throw new Error('invalid token'); } }) },
    'firebase-admin/firestore': {}, 'google-auth-library': {},
    './calendar-service': require('../functions/calendar-service')
  };
  const context = vm.createContext({ require: name => modules[name], exports: {} });
  vm.runInContext(fs.readFileSync('functions/index.js', 'utf8'), context);
  const res = { headers: {}, code: 200, set(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send() {} };
  return { handler: context.exports.calendarAuth, res, options, verified: () => verified };
}
const request = (headers = {}, method = 'POST') => ({ method, get: name => headers[name], is: () => true });

test('backend rejects untrusted origins before verifying credentials', async () => {
  const { handler, res, verified } = setup();
  await handler(request({ Origin: 'https://evil.example' }), res);
  assert.equal(res.code, 403);
  assert.equal(verified(), 0);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('preflight permits only the configured website', async () => {
  const { handler, res, options, verified } = setup();
  assert.equal(options.invoker, 'public');
  await handler(request({ Origin: 'https://tasks.tobyyeung.com' }, 'OPTIONS'), res);
  assert.equal(res.code, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://tasks.tobyyeung.com');
  assert.equal(verified(), 0);
});
test('missing CSRF header or Firebase authentication is rejected', async () => {
  const { handler, res, verified } = setup();
  await handler(request({ Origin: 'https://tasks.tobyyeung.com' }), res);
  assert.equal(res.code, 403);
  await handler(request({ Origin: 'https://tasks.tobyyeung.com', 'X-Requested-With': 'XmlHttpRequest', Authorization: 'Bearer invalid' }), res);
  assert.equal(res.code, 401);
  assert.equal(verified(), 1);
});
