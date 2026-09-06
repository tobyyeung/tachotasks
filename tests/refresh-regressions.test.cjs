const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(path, 'utf8');

function storageContext() {
  const store = new Map();
  const context = vm.createContext({
    window: {}, console,
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    triggerSyncToCloud() {}
  });
  vm.runInContext(read('js/browser-api.js').replace(/^import .*;\r?\n/gm, ''), context);
  return context;
}

for (const [save, get] of [['saveTasks', 'getTasks'], ['saveArchivedTasks', 'getArchivedTasks'], ['saveProjects', 'getProjects'], ['saveProfiles', 'getProfiles']]) {
  test(`${save}: changed records get newer timestamps and survive a storage reload`, async () => {
    const { window: { api } } = storageContext();
    await api[save]([{ id: 'a', title: 'Before', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }, { id: 'b', title: 'Unchanged' }]);
    const items = await api[get]();
    const original = items[0].updatedAt;
    const untouched = items[1].updatedAt;
    items[0].title = 'After';
    await api[save](items);
    const restored = await api[get]();
    assert.equal(restored[0].title, 'After');
    assert.ok(Date.parse(restored[0].updatedAt) > Date.parse(original));
    assert.equal(restored[1].updatedAt, untouched);
    await api[save](restored);
    assert.equal((await api[get]())[0].updatedAt, restored[0].updatedAt);
  });
}

class Element extends EventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.classList = { add: () => { this.hidden = true; }, remove: () => { this.hidden = false; }, toggle: () => { this.hidden = !this.hidden; } };
  }
  querySelectorAll() { return []; }
}

test('50 redraws keep one Add Task handler and outside-click works repeatedly', () => {
  const add = new Element();
  const doc = new EventTarget();
  let elements = {};
  doc.getElementById = id => elements[id] || null;
  doc.querySelectorAll = () => [];
  let opens = 0;
  const context = vm.createContext({ document: doc, window: new EventTarget(), AbortController,
    state: { currentView: 'tasks' }, setupDragAndDrop() {}, showTaskModal() { opens++; } });
  vm.runInContext(read('js/components/view-listeners.js'), context);
  let stalePanel;
  for (let i = 0; i < 50; i++) {
    stalePanel = elements['tasks-sort-panel'];
    elements = { 'add-task-btn': add, 'tasks-sort-btn': new Element(), 'tasks-sort-panel': new Element() };
    context.attachViewListeners();
  }
  add.dispatchEvent(new Event('click'));
  assert.equal(opens, 1);
  const panel = elements['tasks-sort-panel'];
  doc.dispatchEvent(new Event('click'));
  assert.equal(panel.hidden, true);
  assert.equal(stalePanel.hidden, false);
  panel.hidden = false;
  doc.dispatchEvent(new Event('click'));
  assert.equal(panel.hidden, true);
});

test('failed sign out keeps visible tasks and reports the error', async () => {
  let handler;
  const task = { id: 'keep' };
  const messages = [];
  const context = vm.createContext({ window: { api: { signOut: async () => ({ error: 'Network failed' }) } },
    document: { getElementById: id => id === 'sign-out-btn' ? { addEventListener: (_, cb) => { handler = cb; } } : null },
    state: { tasks: [task] }, console: { error() {} }, showToast: text => messages.push(text) });
  vm.runInContext(read('js/components/auth-sync.js'), context);
  context.initAuthUI();
  await handler();
  assert.equal(context.state.tasks[0], task);
  assert.match(messages[0], /Sign out failed: Network failed/);
});

test('background refresh reads synced tasks into the UI with one sync pass', async () => {
  const app = read('js/app.js');
  const start = app.indexOf('  let backgroundRefreshRunning = false;');
  const end = app.indexOf('  // Live Dashboard clock', start);
  let tick;
  let pulls = 0;
  let reloads = 0;
  const context = vm.createContext({ state: { settings: {}, activeGcalIds: [] }, document: { hidden: false },
    window: { api: { getUser: async () => ({}), syncPull: async () => { pulls++; return { success: true }; } } },
    setInterval: cb => { tick = cb; }, refreshDataFromStore: async options => { assert.equal(options.reloadCalendars, false); reloads++; },
    setSyncStatus() {}, console });
  vm.runInContext(app.slice(start, end), context);
  await Promise.all([tick(), tick()]);
  assert.equal(pulls, 1);
  assert.equal(reloads, 1);
});
