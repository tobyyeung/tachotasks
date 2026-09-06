'use strict';

const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

class CalendarError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

// The encryption key lives in Secret Manager, never in Firestore or the browser.
function tokenVault(base64Key) {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('CALENDAR_TOKEN_KEY must contain 32 random bytes in base64');
  return {
    seal(uid, value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(uid));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
    },
    open(uid, value) {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
      decipher.setAAD(Buffer.from(uid));
      decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8'));
    }
  };
}

function createCalendarService({ store, oauth, vault, now = Date.now }) {
  const pending = new Map();
  // Serializes connect/refresh/disconnect for one user within this instance.
  function exclusive(uid, action) {
    const previous = pending.get(uid) || Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    pending.set(uid, current);
    return current.finally(() => { if (pending.get(uid) === current) pending.delete(uid); });
  }
  function identity(user) {
    const googleId = user?.firebase?.identities?.['google.com']?.[0];
    if (!user?.uid || !googleId) throw new CalendarError('GOOGLE_SIGN_IN_REQUIRED', 401);
    return googleId;
  }
  const response = tokens => ({ accessToken: tokens.access_token, expiresAt: tokens.expiry_date });
  return {
    connect(user, code, origin) {
      const googleId = identity(user);
      if (typeof code !== 'string' || !code || code.length > 8192) throw new CalendarError('INVALID_CODE');
      return exclusive(user.uid, async () => {
        const tokens = await oauth.exchange(code, origin);
        const subject = await oauth.subject(tokens.id_token);
        if (subject !== googleId) throw new CalendarError('GOOGLE_ACCOUNT_MISMATCH', 403);
        if (!(tokens.scope || '').split(' ').includes(CALENDAR_SCOPE)) throw new CalendarError('CALENDAR_PERMISSION_REQUIRED', 403);
        const old = await store.get(user.uid);
        const previous = old ? vault.open(user.uid, old) : null;
        const refreshToken = tokens.refresh_token || (previous?.subject === subject ? previous.refresh_token : null);
        if (!refreshToken) throw new CalendarError('OFFLINE_ACCESS_REQUIRED', 409);
        if (!tokens.access_token || !(tokens.expiry_date > now())) throw new CalendarError('INVALID_GOOGLE_RESPONSE', 502);
        await store.set(user.uid, vault.seal(user.uid, { ...tokens, refresh_token: refreshToken, subject }));
        return response(tokens);
      });
    },
    token(user, rejectedToken) {
      const googleId = identity(user);
      return exclusive(user.uid, async () => {
        const encrypted = await store.get(user.uid);
        if (!encrypted) throw new CalendarError('RECONNECT_REQUIRED', 409);
        const saved = vault.open(user.uid, encrypted);
        if (saved.subject !== googleId) throw new CalendarError('GOOGLE_ACCOUNT_MISMATCH', 403);
        if (saved.access_token && saved.expiry_date > now() + 60000 && saved.access_token !== rejectedToken) return response(saved);
        let renewed;
        try {
          renewed = await oauth.refresh(saved.refresh_token);
        } catch (err) {
          if (err.response?.data?.error === 'invalid_grant') {
            // Compare-and-delete avoids removing a connection replaced by another instance.
            await store.removeIfUnchanged(user.uid, encrypted);
            throw new CalendarError('RECONNECT_REQUIRED', 409);
          }
          throw new CalendarError('GOOGLE_TEMPORARILY_UNAVAILABLE', 503);
        }
        if (!renewed.access_token || !(renewed.expiry_date > now())) throw new CalendarError('INVALID_GOOGLE_RESPONSE', 502);
        const updated = { ...saved, ...renewed, refresh_token: renewed.refresh_token || saved.refresh_token };
        const committed = await store.replaceIfUnchanged(user.uid, encrypted, vault.seal(user.uid, updated));
        if (!committed) throw new CalendarError('CONNECTION_CHANGED', 409);
        return response(updated);
      });
    },
    disconnect(user) {
      identity(user);
      return exclusive(user.uid, async () => {
        await store.remove(user.uid);
        return { success: true };
      });
    }
  };
}

module.exports = { CalendarError, tokenVault, createCalendarService };
