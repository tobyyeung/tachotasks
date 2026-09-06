/**
 * tests/sqlite-db.test.cjs
 * Verifies SQLite database initialization, CRUD operations, transactions,
 * and persistence using sql.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock electron app.getPath
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachotasks-test-'));
const mockElectron = {
  app: {
    getPath: (name) => {
      if (name === 'userData') return tempDir;
      return tempDir;
    }
  }
};

// Require proxy/mock
require.cache[require.resolve('electron')] = {
  exports: mockElectron
};

const { initDatabase, getDb } = require('../electron/db.js');

test('SQLite database initializes and executes CRUD operations', async () => {
  const db = await initDatabase();
  assert.ok(db, 'db should be initialized');
  assert.equal(db.open, true);

  // 1. Tasks CRUD
  const insertTask = db.prepare('INSERT OR REPLACE INTO tasks (id, data, updatedAt) VALUES (?, ?, ?)');
  const sampleTask = { id: 'task-1', title: 'Buy groceries', priority: 'p1', sectionId: 'sec-today' };
  const now = new Date().toISOString();
  insertTask.run(sampleTask.id, JSON.stringify(sampleTask), now);

  const selectTask = db.prepare('SELECT data FROM tasks WHERE id = ?');
  const fetchedRow = selectTask.get('task-1');
  assert.ok(fetchedRow, 'Row should exist');
  const fetchedTask = JSON.parse(fetchedRow.data);
  assert.equal(fetchedTask.title, 'Buy groceries');
  assert.equal(fetchedTask.priority, 'p1');

  // 2. Query All Tasks
  const selectAll = db.prepare('SELECT data FROM tasks');
  const allRows = selectAll.all();
  assert.equal(allRows.length, 1);
  assert.equal(JSON.parse(allRows[0].data).id, 'task-1');

  // 3. Settings Key-Value
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('activeProfileId', JSON.stringify('personal'));

  const selectSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const settingRow = selectSetting.get('activeProfileId');
  assert.equal(JSON.parse(settingRow.value), 'personal');

  // 4. Transaction execution
  const transaction = db.transaction(() => {
    insertTask.run('task-2', JSON.stringify({ id: 'task-2', title: 'Walk the dog' }), now);
    insertTask.run('task-3', JSON.stringify({ id: 'task-3', title: 'Study' }), now);
  });
  transaction();

  const countAfterTx = selectAll.all().length;
  assert.equal(countAfterTx, 3);

  // 5. Tombstones
  const insertTombstone = db.prepare('INSERT OR REPLACE INTO tombstones (id, type, deletedAt) VALUES (?, ?, ?)');
  insertTombstone.run('task-2', 'task', now);
  const selectTombstone = db.prepare('SELECT * FROM tombstones WHERE id = ?');
  const tombstone = selectTombstone.get('task-2');
  assert.ok(tombstone);
  assert.equal(tombstone.type, 'task');

  // 6. Persist to disk and verify file exists
  db.persistNow();
  const dbFile = path.join(tempDir, 'tachotasks.db');
  assert.ok(fs.existsSync(dbFile), 'tachotasks.db file should exist on disk');
  assert.ok(fs.statSync(dbFile).size > 0, 'tachotasks.db file size should be > 0');

  // 7. Cleanup
  db.close();
  assert.equal(db.open, false);

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
});
