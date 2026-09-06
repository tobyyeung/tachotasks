/**
 * electron/db.js
 * SQLite database layer using sql.js (WebAssembly SQLite).
 * Provides cross-platform, zero-native-compilation local persistence
 * for the Electron desktop app.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let dbWrapper = null;

class PreparedStatement {
  constructor(sqlDb, sql, onMutate) {
    this.sqlDb = sqlDb;
    this.sql = sql;
    this.onMutate = onMutate;
    this.stmt = sqlDb.prepare(sql);
  }

  _bind(params) {
    let p = params;
    if (params.length === 1 && Array.isArray(params[0])) {
      p = params[0];
    }
    this.stmt.reset();
    if (p && p.length > 0) {
      this.stmt.bind(p);
    }
  }

  all(...params) {
    this._bind(params);
    const rows = [];
    while (this.stmt.step()) {
      rows.push(this.stmt.getAsObject());
    }
    this.stmt.reset();
    return rows;
  }

  get(...params) {
    this._bind(params);
    let row = undefined;
    if (this.stmt.step()) {
      row = this.stmt.getAsObject();
    }
    this.stmt.reset();
    return row;
  }

  run(...params) {
    this._bind(params);
    this.stmt.step();
    this.stmt.reset();
    if (this.onMutate) {
      this.onMutate();
    }
    return { changes: 1 };
  }
}

/**
 * Initializes the SQLite database in the app's user data directory.
 * Creates all necessary tables if they don't exist.
 */
async function initDatabase() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = path.join(userDataPath, 'tachotasks.db');
  console.log('[db] Opening SQLite database at:', dbPath);

  let rawDb;
  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      rawDb = new SQL.Database(fileBuffer);
    } catch (err) {
      console.error('[db] Corrupted or invalid DB file, creating fresh DB:', err);
      rawDb = new SQL.Database();
    }
  } else {
    rawDb = new SQL.Database();
  }

  let saveTimer = null;
  const persistToDisk = () => {
    try {
      const data = rawDb.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (err) {
      console.error('[db] Error persisting database to disk:', err);
    }
  };

  const schedulePersist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistToDisk, 150);
  };

  // Create tables
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archived_tasks (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'task',
      deletedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entityId TEXT NOT NULL,
      collection TEXT NOT NULL,
      operation TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_updatedAt ON tasks(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_archived_updatedAt ON archived_tasks(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);
  `);

  persistToDisk();

  dbWrapper = {
    open: true,
    prepare: (sql) => new PreparedStatement(rawDb, sql, schedulePersist),
    transaction: (fn) => {
      return (...args) => {
        rawDb.run('BEGIN TRANSACTION');
        try {
          const result = fn(...args);
          rawDb.run('COMMIT');
          schedulePersist();
          return result;
        } catch (err) {
          try { rawDb.run('ROLLBACK'); } catch (_) {}
          throw err;
        }
      };
    },
    exec: (sql) => {
      rawDb.exec(sql);
      schedulePersist();
    },
    close: () => {
      if (saveTimer) clearTimeout(saveTimer);
      persistToDisk();
      rawDb.close();
      dbWrapper.open = false;
    },
    persistNow: persistToDisk
  };

  console.log('[db] SQLite database initialized successfully');
  return dbWrapper;
}

/**
 * Returns the active database instance.
 */
function getDb() {
  if (!dbWrapper) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbWrapper;
}

module.exports = { initDatabase, getDb };
