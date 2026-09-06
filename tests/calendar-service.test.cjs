const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { tokenVault, createCalendarService } = require('../functions/calendar-service');
const user = { uid: 'firebase-user', firebase: { identities: { 'google.com': ['google-user'] } } };
const now = 2000000000000;

function setup() {
  const records = new Map();
  const counts = { renew: 0 };
  const vault = tokenVault(randomBytes(32).toString('base64'));
  const oauth = {
    exchange: async () => ({ access_token: 'access', refresh_token: 'private-refresh', expiry_date: now + 3600000, id_token: 'identity', scope: 'openid https://www.googleapis.com/auth/calendar.readonly' }),
    subject: async () => 'google-user',
    refresh: async () => { counts.renew++; return { access_token: 'renewed', expiry_date: now + 3600000 }; }
  };
  const store = {
    get: async uid => records.get(uid),
    set: async (uid, data) => records.set(uid, data),
    remove: async uid => records.delete(uid),
    removeIfUnchanged: async (uid, expected) => { if (records.get(uid) === expected) records.delete(uid); },
    replaceIfUnchanged: async (uid, expected, next) => {
      if (records.get(uid) !== expected) return false;
      records.set(uid, next); return true;
    }
  };
  return { records, counts, vault, oauth, store, api: createCalendarService({ store, oauth, vault, now: () => now }) };
}

test('vault encrypts tokens and rejects tampering or another UID', () => {
  const { vault } = setup();
  const data = vault.seal(user.uid, { refresh_token: 'secret' });
  assert.ok(!JSON.stringify(data).includes('secret'));
  assert.equal(vault.open(user.uid, data).refresh_token, 'secret');
  assert.throws(() => vault.open('other-user', data));
  assert.throws(() => vault.open(user.uid, { ...data, data: Buffer.from('tampered').toString('base64') }));
});

test('connect persists encrypted credentials and returns no refresh token', async () => {
  const { api, records, vault } = setup();
  const result = await api.connect(user, 'one-time-code', 'https://tasks.tobyyeung.com');
  assert.deepEqual(result, { accessToken: 'access', expiresAt: now + 3600000 });
  assert.equal(vault.open(user.uid, records.get(user.uid)).refresh_token, 'private-refresh');
});

test('wrong Google account, missing permission, and missing login are rejected', async () => {
  const { api, oauth, records } = setup();
  assert.throws(() => api.connect(null, 'code', 'origin'), /GOOGLE_SIGN_IN_REQUIRED/);
  oauth.subject = async () => 'someone-else';
  await assert.rejects(api.connect(user, 'code', 'origin'), /GOOGLE_ACCOUNT_MISMATCH/);
  oauth.subject = async () => 'google-user';
  oauth.exchange = async () => ({ id_token: 'id', scope: 'openid' });
  await assert.rejects(api.connect(user, 'code', 'origin'), /CALENDAR_PERMISSION_REQUIRED/);
  assert.equal(records.size, 0);
});

test('expiry renews once for concurrent requests and retains refresh token', async () => {
  const { api, records, vault, counts } = setup();
  records.set(user.uid, vault.seal(user.uid, { subject: 'google-user', access_token: 'old', refresh_token: 'private-refresh', expiry_date: now - 1 }));
  const results = await Promise.all([api.token(user), api.token(user), api.token(user)]);
  assert.ok(results.every(result => result.accessToken === 'renewed'));
  assert.equal(counts.renew, 1);
  assert.equal(vault.open(user.uid, records.get(user.uid)).refresh_token, 'private-refresh');
});

test('a rejected access token renews even before recorded expiry', async () => {
  const { api, counts } = setup();
  await api.connect(user, 'code', 'origin');
  assert.equal((await api.token(user, 'access')).accessToken, 'renewed');
  assert.equal(counts.renew, 1);
});

test('revocation removes credentials and asks for reconnect', async () => {
  const { api, oauth, records } = setup();
  await api.connect(user, 'code', 'origin');
  oauth.refresh = async () => { throw { response: { data: { error: 'invalid_grant' } } }; };
  await assert.rejects(api.token(user, 'access'), /RECONNECT_REQUIRED/);
  assert.equal(records.size, 0);
});

test('temporary Google outage preserves credentials', async () => {
  const { api, oauth, records } = setup();
  await api.connect(user, 'code', 'origin');
  oauth.refresh = async () => { throw new Error('network'); };
  await assert.rejects(api.token(user, 'access'), /GOOGLE_TEMPORARILY_UNAVAILABLE/);
  assert.equal(records.size, 1);
});

test('disconnect prevents future renewal; another user cannot read credentials', async () => {
  const { api } = setup();
  await api.connect(user, 'code', 'origin');
  await assert.rejects(api.token({ ...user, uid: 'different-user' }), /RECONNECT_REQUIRED/);
  await api.disconnect(user);
  await assert.rejects(api.token(user), /RECONNECT_REQUIRED/);
});

test('concurrent disconnect on another instance cannot be undone by refresh', async () => {
  const { api, oauth, records } = setup();
  await api.connect(user, 'code', 'origin');
  oauth.refresh = async () => {
    records.delete(user.uid);
    return { access_token: 'new', expiry_date: now + 3600000 };
  };
  await assert.rejects(api.token(user, 'access'), /CONNECTION_CHANGED/);
  assert.equal(records.size, 0);
});
