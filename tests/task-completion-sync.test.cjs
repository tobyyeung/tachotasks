const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(path, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const strip = source => source.replace(/^import .*;\r?\n/gm, '').replace(/export \{[\s\S]*?\};/g, '').replace(/export /g, '');
const initialTask = { id: 'task-1', title: 'Ordinary task', completed: false, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' };

function cloudStore() {
  const records = new Map([['users/user/tasks/task-1', clone(initialTask)]]);
  let writes = 0;
  let transactionQueue = Promise.resolve();
  let beforeTransaction = null;
  const apply = operations => {
    for (const [key, value] of operations) {
      if (value === undefined) records.delete(key); else records.set(key, clone(value));
      writes++;
    }
  };
  const snapshot = (key, value) => ({ id: key.split('/').pop(), exists: () => value !== undefined, data: () => clone(value) });
  return {
    records, get writes() { return writes; }, set beforeTransaction(callback) { beforeTransaction = callback; },
    collection: (_, key) => key, doc: (_, path, id) => `${path}/${id}`,
    getDocs: async path => {
      const docs = [...records].filter(([key]) => key.startsWith(`${path}/`)).map(([key, value]) => snapshot(key, value));
      return { docs, forEach: cb => docs.forEach(cb) };
    },
    writeBatch: () => {
      const operations = [];
      return { set: (key, value) => operations.push([key, value]), delete: key => operations.push([key]), commit: async () => apply(operations) };
    },
    runTransaction: (_, callback) => {
      const result = transactionQueue.then(async () => {
        if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = null; await hook(); }
        const operations = [];
        const result = await callback({ get: async key => snapshot(key, records.get(key)), set: (key, value) => operations.push([key, value]), delete: key => operations.push([key]) });
        apply(operations);
        return result;
      });
      transactionQueue = result.catch(() => {});
      return result;
    }
  };
}

function device(cloud, electron = false, cached) {
  const store = cached || new Map();
  let sqlite = { tasks: [], archivedTasks: [] };
  let atomicSaves = 0;
  const storage = {
    getTaskCollections: async () => clone(sqlite),
    saveTaskCollections: async data => { atomicSaves++; sqlite = clone(data); },
    getTasks: async () => clone(sqlite.tasks), getArchivedTasks: async () => clone(sqlite.archivedTasks),
    getProjects: async () => JSON.parse(store.get('tachotasks.projects') || '[]'),
    saveProjects: async () => {}, getProfiles: async () => JSON.parse(store.get('tachotasks.profiles') || '[]'),
    saveProfiles: async () => {}, getSettings: async () => JSON.parse(store.get('tachotasks.settings') || '{}'), saveSettings: async () => {}
  };
  const context = vm.createContext({
    console, Promise, Date, Map, Set, JSON,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    window: { addEventListener() {}, ...(electron ? { electronAPI: { isElectron: true }, electronStorage: storage } : {}) },
    initializeApp: () => ({}), getAuth: () => ({ currentUser: { uid: 'user' }, authStateReady: async () => {} }),
    getFirestore: () => ({}), setPersistence: async () => {}, browserLocalPersistence: {},
    onAuthStateChanged: () => () => {}, onSnapshot: () => () => {},
    collection: cloud.collection, doc: cloud.doc, getDocs: cloud.getDocs, writeBatch: cloud.writeBatch, runTransaction: cloud.runTransaction,
    setTimeout: () => 1, clearTimeout() {}, ensureGsiClient() {}, resetGsiClient() {},
    state: { tasks: [], archivedTasks: [] }, getTodayStr: () => '2026-09-08', isTaskRecurring: () => false,
    renderView() {}, showToast() {}
  });
  vm.runInContext(strip(read('js/api/task-state.js')), context);
  vm.runInContext(strip(read('js/api/cloud-sync.js')), context);
  vm.runInContext(strip(read('js/browser-api.js')), context);
  vm.runInContext(read('js/data.js'), context);
  vm.runInContext("_currentUser = { uid: 'user' }; showUndoToast = () => {};", context);
  const load = async () => Object.assign(context.state, clone(await context.window.api.getTaskCollections()));
  return { context, store, load, get atomicSaves() { return atomicSaves; },
    sync: async () => { const result = await context.performSyncFromCloud(); assert.equal(result.error, undefined); await load(); },
    data: () => clone(context.state) };
}

for (const completingOnElectron of [false, true]) {
  test(`ordinary completion and undo converge across web and Electron (completion on ${completingOnElectron ? 'Electron' : 'web'})`, async () => {
    const cloud = cloudStore();
    const first = device(cloud, completingOnElectron);
    const second = device(cloud, !completingOnElectron);
    await first.sync(); await second.sync();
    await first.context.toggleTask('task-1');
    assert.equal(first.data().tasks.length, 0);
    assert.equal(first.data().archivedTasks.length, 1);
    await first.sync();
    // The other device still has its old active copy, then pushes/pulls repeatedly.
    for (let i = 0; i < 3; i++) { await second.sync(); await first.sync(); }
    for (const client of [first, second]) {
      assert.equal(client.data().tasks.length, 0);
      assert.equal(client.data().archivedTasks.length, 1);
    }
    assert.equal(cloud.records.has('users/user/tasks/task-1'), false);
    const writes = cloud.writes;
    await first.sync(); await second.sync();
    assert.equal(cloud.writes, writes, 'settled sync must not loop with more cloud writes');
    await second.context.undoTaskCompletion('task-1');
    await second.sync(); await first.sync();
    assert.equal(first.data().tasks.length, 1);
    assert.equal(first.data().archivedTasks.length, 0);
    assert.equal(cloud.records.has('users/user/archivedTasks/task-1'), false);
    assert.ok((completingOnElectron ? first : second).atomicSaves > 0);
  });
}

test('reload repairs duplicate IDs and transient cloud fields without restoring them on the next pull', async () => {
  const cloud = cloudStore();
  cloud.records.set('users/user/tasks/task-1', { ...initialTask, isCompleting: true, completionTimeout: 42 });
  cloud.records.set('users/user/archivedTasks/task-1', { ...initialTask, completed: true, updatedAt: '2026-09-08T12:00:00Z', isCompleting: false, completionTimeout: 42 });
  const web = device(cloud);
  await web.sync();
  const reopened = device(cloud, false, web.store);
  await reopened.sync();
  assert.equal(reopened.data().tasks.length, 0);
  assert.equal(reopened.data().archivedTasks.length, 1);
  const archived = cloud.records.get('users/user/archivedTasks/task-1');
  assert.equal('isCompleting' in archived, false);
  assert.equal('completionTimeout' in archived, false);
});

test('transaction rechecks a newer completion that arrived after the initial cloud read', async () => {
  const cloud = cloudStore();
  const web = device(cloud);
  await web.sync();
  web.context.state.tasks[0].title = 'Local edit';
  await web.context.window.api.saveTasks(web.context.state.tasks);
  cloud.beforeTransaction = () => {
    cloud.records.delete('users/user/tasks/task-1');
    cloud.records.set('users/user/archivedTasks/task-1', { ...initialTask, completed: true, updatedAt: '2099-01-01T00:00:00Z' });
  };
  await web.sync();
  assert.equal(web.data().tasks.length, 0);
  assert.equal(web.data().archivedTasks.length, 1);
  assert.equal(cloud.records.has('users/user/tasks/task-1'), false);
});

test('completion during a network read survives application of the remote snapshot', async () => {
  const cloud = cloudStore();
  const web = device(cloud);
  await web.sync();
  const original = web.context.getDocs;
  let completed = false;
  web.context.getDocs = async path => {
    const result = await original(path);
    if (!completed && path.endsWith('/tasks')) { completed = true; await web.context.toggleTask('task-1'); }
    return result;
  };
  await web.sync();
  assert.equal(web.data().tasks.length, 0);
  assert.equal(web.data().archivedTasks.length, 1);
});

test('an immediate undo has a newer timestamp and is saved as one task-state change', async () => {
  const cloud = cloudStore();
  const electron = device(cloud, true);
  await electron.sync();
  await electron.context.toggleTask('task-1');
  const completedAt = electron.data().archivedTasks[0].updatedAt;
  await electron.context.undoTaskCompletion('task-1');
  const data = await electron.context.window.api.getTaskCollections();
  assert.equal(data.tasks.length, 1);
  assert.equal(data.archivedTasks.length, 0);
  assert.ok(Date.parse(data.tasks[0].updatedAt) > Date.parse(completedAt));
});
