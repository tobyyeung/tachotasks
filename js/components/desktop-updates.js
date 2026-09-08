// Desktop-only update status lives outside app/cloud settings.
let desktopUpdateState = { revision: -1, status: 'idle', currentVersion: '', version: null, percent: 0 };
let desktopUpdatesStarted = false;
let dismissedDesktopUpdate = null;

function renderDesktopUpdateControls() {
  const update = desktopUpdateState;
  const messages = {
    idle: 'Updates download automatically in the background.',
    checking: 'Checking for updates…',
    current: 'You’re up to date.',
    downloading: `Downloading v${update.version || ''}… ${update.percent || 0}%`,
    downloaded: `v${update.version || ''} is ready. Restart now, or it will install when you quit.`,
    installing: 'Restarting to install the update…',
    unsupported: 'Automatic updates are available in the installed desktop app.',
    error: update.error || 'Could not update. Please try again.'
  };
  const ready = update.status === 'downloaded';
  const busy = ['checking', 'downloading', 'installing', 'unsupported'].includes(update.status);
  return `<div class="desktop-update-controls">
    <div style="flex:1;min-width:0;"><div role="status">${escHtml(update.error || messages[update.status] || messages.idle)}</div>
    ${update.status === 'downloading' ? `<progress aria-label="Update download" max="100" value="${Number(update.percent) || 0}" style="width:100%;margin-top:8px;"></progress>` : ''}</div>
    <button class="btn-secondary" data-desktop-update-action="${ready ? 'install' : 'check'}" ${busy ? 'disabled' : ''}>${ready ? 'Restart to update' : update.status === 'error' ? 'Retry update' : 'Check for updates'}</button>
  </div>`;
}

function paintDesktopUpdateState() {
  paintAppVersion(desktopUpdateState.currentVersion || window.TACHO_VERSION);
  const panel = document.getElementById('desktop-update-panel');
  if (panel) panel.innerHTML = renderDesktopUpdateControls();
  const version = document.getElementById('desktop-app-version');
  if (version && desktopUpdateState.currentVersion) version.textContent = `v${desktopUpdateState.currentVersion}`;
  let banner = document.getElementById('desktop-update-banner');
  const ready = desktopUpdateState.status === 'downloaded' && dismissedDesktopUpdate !== desktopUpdateState.version;
  if (!ready) { banner?.remove(); return; }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'desktop-update-banner';
    banner.className = 'desktop-update-banner';
    document.body.appendChild(banner);
  }
  banner.innerHTML = `<div role="status"><strong>Update ready</strong><div style="margin-top:4px;">Tacho Tasks v${escHtml(desktopUpdateState.version)} is ready to install.</div></div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn-primary" data-desktop-update-action="install">Restart to update</button>
      <button class="btn-secondary" data-desktop-update-action="later">Later</button>
    </div>`;
}

function acceptDesktopUpdateState(value) {
  if (!value || value.revision < desktopUpdateState.revision) return;
  desktopUpdateState = value;
  paintDesktopUpdateState();
}

function setupDesktopUpdates() {
  paintAppVersion(window.TACHO_VERSION);
  const api = window.electronAPI;
  if (!api?.isElectron || !api.getUpdateState || desktopUpdatesStarted) return;
  desktopUpdatesStarted = true;
  // Subscribe first; revisions prevent a late initial response replacing live progress.
  api.onUpdateState(acceptDesktopUpdateState);
  api.getUpdateState().then(acceptDesktopUpdateState).catch(() => {
    showToast('Could not read update status. Reopen the app to retry.', 'error');
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-desktop-update-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.desktopUpdateAction;
    if (action === 'later') {
      dismissedDesktopUpdate = desktopUpdateState.version;
      paintDesktopUpdateState();
      return;
    }
    button.disabled = true;
    try {
      if (action === 'install') {
        // Wait for queued task writes before asking the main process to restart.
        await window.api.getTaskCollections();
        const result = await api.installUpdate();
        if (!result.success) showToast('Could not restart for the update. Please try again.', 'error');
      } else {
        acceptDesktopUpdateState(await api.checkForUpdates());
      }
    } catch (error) {
      showToast('Could not update right now. Please try again.', 'error');
    } finally {
      paintDesktopUpdateState();
    }
  });
}

function paintAppVersion(version) {
  if (!version) return;
  let badge = document.getElementById('app-version-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'app-version-badge';
    badge.className = 'app-version-badge';
    badge.setAttribute('aria-label', 'App version');
    document.body.appendChild(badge);
  }
  badge.textContent = `v${version}`;
}
