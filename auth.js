const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let authWindow = null;
let authServer = null;

function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    if (authServer) {
      return reject(new Error('Auth process already running'));
    }

    authServer = http.createServer((req, res) => {
      // Allow CORS for the fetch request from the browser
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/auth-callback' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            let finalAccessToken = data.accessToken;
            let finalRefreshToken = data.refreshToken;
            let finalExpiresIn = data.expiresIn || 3600;
            let finalIdToken = data.idToken;

            // If an authorization code was obtained from Google, exchange it for persistent Google OAuth tokens
            if (data.authCode && data.clientId) {
              try {
                const params = new URLSearchParams({
                  code: data.authCode,
                  client_id: data.clientId,
                  grant_type: 'authorization_code',
                  redirect_uri: 'postmessage'
                });
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: params
                });
                if (tokenRes.ok) {
                  const tokenData = await tokenRes.json();
                  if (tokenData.access_token) finalAccessToken = tokenData.access_token;
                  if (tokenData.refresh_token) finalRefreshToken = tokenData.refresh_token;
                  if (tokenData.id_token) finalIdToken = tokenData.id_token;
                  if (tokenData.expires_in) finalExpiresIn = tokenData.expires_in;
                  console.log('[auth] Successfully exchanged Google authorization code for persistent refresh token.');
                } else {
                  console.warn('[auth] Authorization code exchange returned status:', tokenRes.status, await tokenRes.text());
                }
              } catch (e) {
                console.warn('[auth] Failed to exchange authCode for refresh token:', e);
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            
            cleanup();
            
            if (data.error) {
              reject(new Error(data.error));
            } else if (finalIdToken && finalAccessToken) {
              resolve({
                idToken: finalIdToken,
                accessToken: finalAccessToken,
                refreshToken: finalRefreshToken || null,
                expiresIn: finalExpiresIn,
                clientId: data.clientId || null
              });
            } else {
              reject(new Error('Invalid token payload'));
            }
          } catch (e) {
            res.writeHead(400);
            res.end('Bad Request');
            cleanup();
            reject(e);
          }
        });
      } else {
        // Serve auth.html with injected config
        fs.readFile(path.join(__dirname, 'auth.html'), 'utf8', (err, htmlContent) => {
          if (err) {
            res.writeHead(500);
            res.end('Error loading auth.html');
            return;
          }
          const { getFirebaseConfig } = require('./firebase-config');
          const configScript = `<script>window.__FIREBASE_CONFIG__ = ${JSON.stringify(getFirebaseConfig())};</script>`;
          const injectedHtml = htmlContent.replace('</head>', `${configScript}</head>`);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(injectedHtml);
        });
      }
    });

    authServer.listen(0, 'localhost', () => {
      const port = authServer.address().port;
      const url = `http://localhost:${port}`;
      require('electron').shell.openExternal(url);
      
      // Auto timeout after 5 minutes
      setTimeout(() => {
        if (authServer) {
          cleanup();
          reject(new Error('Sign in timed out'));
        }
      }, 5 * 60 * 1000);
    });

    function cleanup() {
      if (authServer) {
        authServer.close();
        authServer = null;
      }
    }
  });
}

module.exports = { signInWithGoogle };
