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
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            
            cleanup();
            
            if (data.error) {
              reject(new Error(data.error));
            } else if (data.idToken && data.accessToken) {
              resolve({ idToken: data.idToken, accessToken: data.accessToken });
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
