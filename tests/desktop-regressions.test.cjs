const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(file, 'utf8');

test('startup waits for Firebase restoration instead of trusting a cached profile', async () => {
  let restore;
  let user = null;
  const ready = new Promise(resolve => { restore = resolve; });
  const context = vm.createContext({
    window: {}, console,
    localStorage: { getItem: () => JSON.stringify({ uid: 'stale' }) },
    waitForAuthReady: () => ready,
    getCurrentUser: () => user
  });
  vm.runInContext(read('js/browser-api.js').replace(/^import .*;\r?\n/gm, ''), context);
  let settled = false;
  const result = context.window.api.getUser().then(value => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  user = { uid: 'restored' };
  restore();
  assert.equal((await result).uid, 'restored');
  user = null;
  assert.equal(await context.window.api.getUser(), null);
});

test('desktop tutorial stays closed after startup, cloud refresh and manual invocation', () => {
  const context = vm.createContext({ window: { electronAPI: { isElectron: true } } });
  vm.runInContext(read('js/components/onboarding-modal.js'), context);
  // No DOM or settings are available: any attempt to open the wizard would throw.
  context.showOnboardingModal();
  context.showOnboardingModal();
  context.showOnboardingModal(true);
});

test('website downloads match the packaged release artifact names', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(read('downloads.js'), context);
  const config = context.window.TACHO_DOWNLOADS;
  const { build } = JSON.parse(read('package.json'));
  for (const [platform, target, ext] of [['windows', 'win', 'exe'], ['mac', 'mac', 'dmg'], ['linux', 'linux', 'AppImage']]) {
    assert.equal(config.files[platform], build[target].artifactName.replace('${ext}', ext));
  }
  assert.equal(config.baseUrl, `https://github.com/${build.publish.owner}/${build.publish.repo}/releases/latest/download/`);
});
