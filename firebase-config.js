const { initializeApp } = require('firebase/app');
const { getAuth } = require('firebase/auth');
const { getFirestore } = require('firebase/firestore');
const path = require('path');
const fs = require('fs');

function getFirebaseConfig() {
  let localConfig = {};
  const configPath = path.join(__dirname, 'user_data', 'firebase-config.json');
  if (fs.existsSync(configPath)) {
    try {
      localConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.warn('Could not parse user_data/firebase-config.json:', e);
    }
  }

  return {
    apiKey: process.env.FIREBASE_API_KEY || localConfig.apiKey || "YOUR_FIREBASE_API_KEY",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || localConfig.authDomain || "tachotasks-d7c56.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || localConfig.projectId || "tachotasks-d7c56",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || localConfig.storageBucket || "tachotasks-d7c56.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || localConfig.messagingSenderId || "179662622348",
    appId: process.env.FIREBASE_APP_ID || localConfig.appId || "1:179662622348:web:a8e73c612777be7b9035a9"
  };
}

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

module.exports = { app, auth, db, firebaseConfig, getFirebaseConfig };
