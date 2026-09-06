'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const functionsV1 = require('firebase-functions/v1');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { OAuth2Client } = require('google-auth-library');
const { CalendarError, tokenVault, createCalendarService } = require('./calendar-service');

initializeApp();
const clientId = defineString('CALENDAR_CLIENT_ID');
const allowedOrigins = defineString('CALENDAR_ALLOWED_ORIGINS', { default: 'https://tasks.tobyyeung.com' });
const clientSecret = defineSecret('CALENDAR_CLIENT_SECRET');
const tokenKey = defineSecret('CALENDAR_TOKEN_KEY');
let service;

// Firebase Auth deletion events currently use the first-generation trigger.
exports.cleanupCalendarConnection = functionsV1.region('us-central1').auth.user().onDelete(user =>
  getFirestore().collection('_calendarCredentials').doc(user.uid).delete()
);

function getService() {
  if (service) return service;
  const db = getFirestore();
  const ref = uid => db.collection('_calendarCredentials').doc(uid);
  const compare = async (uid, expected, replacement) => db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref(uid));
    if (!snapshot.exists || snapshot.data().data !== expected.data) return false;
    if (replacement) transaction.set(ref(uid), replacement);
    else transaction.delete(ref(uid));
    return true;
  });
  const client = () => new OAuth2Client(clientId.value(), clientSecret.value());
  service = createCalendarService({
    vault: tokenVault(tokenKey.value()),
    store: {
      get: async uid => (await ref(uid).get()).data() || null,
      set: (uid, data) => ref(uid).set(data),
      remove: uid => ref(uid).delete(),
      replaceIfUnchanged: compare,
      removeIfUnchanged: (uid, expected) => compare(uid, expected, null)
    },
    oauth: {
      exchange: async (code, origin) => {
        const { tokens } = await client().getToken({ code, redirect_uri: origin });
        return tokens;
      },
      subject: async idToken => {
        if (!idToken) throw new CalendarError('GOOGLE_IDENTITY_REQUIRED', 403);
        const ticket = await client().verifyIdToken({ idToken, audience: clientId.value() });
        return ticket.getPayload().sub;
      },
      refresh: async refreshToken => {
        const auth = client();
        auth.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await auth.refreshAccessToken();
        return credentials;
      }
    }
  });
  return service;
}

exports.calendarAuth = onRequest({
  region: 'us-central1', timeoutSeconds: 30, maxInstances: 3,
  secrets: [clientSecret, tokenKey], cors: false
}, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Vary', 'Origin');
  const origin = req.get('Origin');
  const origins = allowedOrigins.value().split(',').map(value => value.trim());
  if (!origin || !origins.includes(origin)) return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (req.get('X-Requested-With') !== 'XmlHttpRequest' || !req.is('application/json')) {
    return res.status(403).json({ error: 'INVALID_REQUEST' });
  }
  let user;
  try {
    const match = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
    if (!match) throw new Error('Missing auth');
    user = await getAuth().verifyIdToken(match[1], true);
  } catch {
    return res.status(401).json({ error: 'SIGN_IN_REQUIRED' });
  }
  try {
    const api = getService();
    if (req.path === '/connect') return res.json(await api.connect(user, req.body?.code, origin));
    if (req.path === '/token') return res.json(await api.token(user, req.body?.rejectedToken));
    if (req.path === '/disconnect') return res.json(await api.disconnect(user));
    return res.status(404).json({ error: 'NOT_FOUND' });
  } catch (err) {
    // OAuth library exceptions may contain credentials. Never log or serialize them.
    if (err instanceof CalendarError) return res.status(err.status).json({ error: err.code });
    return res.status(503).json({ error: 'CALENDAR_CONNECTION_FAILED' });
  }
});
