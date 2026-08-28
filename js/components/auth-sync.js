// ===== AUTH & GOOGLE SYNC COMPONENT =====

/**
 * Initializes Authentication UI listeners (sign in, sign out, manual sync).
 */
function initAuthUI() {
  const signInBtn = document.getElementById('sign-in-btn');
  const signOutBtn = document.getElementById('sign-out-btn');
  const loginOverlayBtn = document.getElementById('login-overlay-btn');

  if (loginOverlayBtn) {
    loginOverlayBtn.addEventListener('click', async () => {
      loginOverlayBtn.textContent = 'Connecting...';
      try {
        const result = await window.api.signIn();
        if (result && result.success) {
          showToast('Signed in successfully', 'success');
        } else {
          const errMsg = (result && result.error) || 'Unknown sign in error';
          console.error('Sign in error:', errMsg);
          showToast(errMsg, 'error');
          loginOverlayBtn.innerHTML = '<img src="assets/icons/Add.png" alt="Sign in" style="width:16px;height:16px;object-fit:contain;margin-right:6px;" /> Sign in with Google';
        }
      } catch (err) {
        console.error(err);
        showToast('Sign in failed: ' + err.message, 'error');
        loginOverlayBtn.innerHTML = '<img src="assets/icons/Add.png" alt="Sign in" style="width:16px;height:16px;object-fit:contain;margin-right:6px;" /> Sign in with Google';
      }
    });
  }

  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      signInBtn.textContent = 'Connecting...';
      try {
        const result = await window.api.signIn();
        if (result && result.success) {
          showToast('Signed in successfully', 'success');
        } else {
          const errMsg = (result && result.error) || 'Unknown sign in error';
          console.error('Sign in error:', errMsg);
          showToast(errMsg, 'error');
          signInBtn.innerHTML = '<img src="assets/icons/Add.png" alt="Sign in" style="width:16px;height:16px;object-fit:contain;margin-right:6px;" /> Sign in with Google';
        }
      } catch (err) {
        console.error(err);
        showToast('Sign in failed: ' + err.message, 'error');
        signInBtn.innerHTML = '<img src="assets/icons/Add.png" alt="Sign in" style="width:16px;height:16px;object-fit:contain;margin-right:6px;" /> Sign in with Google';
      }
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await window.api.signOut();
        showLoginOverlay();
        showToast('Signed out', 'success');
      } catch (err) {
        console.error(err);
      }
    });
  }

  const manualSyncBtn = document.getElementById('manual-sync-btn');
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      manualSyncBtn.classList.add('sync-btn-spinning');
      setSyncStatus('syncing');
      try {
        if (state.tasks) await window.api.saveTasks(state.tasks);
        if (state.projects) await window.api.saveProjects(state.projects);
        if (state.profiles) await window.api.saveProfiles(state.profiles);
        if (state.settings) await window.api.saveSettings(state.settings);
        const pushRes = await window.api.syncPush();
        if (pushRes && pushRes.error) throw new Error(pushRes.error);
        const pullRes = await window.api.syncPull();
        if (pullRes && pullRes.error) throw new Error(pullRes.error);
        await refreshDataFromStore();
        setSyncStatus('synced');
        showToast('Cloud Sync Complete', 'success');
      } catch (err) {
        console.error('Manual sync failed:', err);
        showToast('Sync failed: ' + err.message, 'error');
        setSyncStatus('offline');
      } finally {
        manualSyncBtn.classList.remove('sync-btn-spinning');
      }
    });
  }
}

function showLoginOverlay() {
  if (state.settings && state.settings.devMode) {
    hideLoginOverlay();
    return;
  }
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoginOverlay() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function isAuthOrInitError(err) {
  if (!err) return false;
  const lower = String(err).toLowerCase();
  return lower.includes('not authenticated') || 
         lower.includes('unauthenticated') || 
         lower.includes('not ready') || 
         lower.includes('permission');
}

function setSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = 'sync-status';
  if (status === 'syncing') {
    el.classList.add('syncing');
    el.textContent = 'Syncing...';
  } else if (status === 'synced') {
    el.classList.add('synced');
    el.textContent = 'Synced just now';
  } else if (status === 'offline') {
    el.textContent = 'Offline';
  } else {
    el.textContent = '';
  }
}

function ensureTaskSchema(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map(t => ({
    ...t,
    plannedTime: t.plannedTime !== undefined ? t.plannedTime : null
  }));
}

async function refreshDataFromStore() {
  state.tasks = ensureTaskSchema(await window.api.getTasks() || []);
  state.projects = await window.api.getProjects() || [];
  state.events = [];
  state.floatingGoals = [];
  state.archivedTasks = await window.api.getArchivedTasks() || [];
  state.settings = await window.api.getSettings() || {};
  state.profiles = await window.api.getProfiles() || [];

  if (Array.isArray(state.settings.activeGcalIds)) {
    state.activeGcalIds = [...state.settings.activeGcalIds];
  }
  
  renderSidebarProjects();
  renderSidebarTags();
  renderView();
  
  // Attempt to load Google Calendars in background if signed in
  const user = await window.api.getUser();
  if (user) {
    loadGoogleCalendars().catch(e => console.warn('GCal load in background:', e));
  }
}

function setupRefreshButton() {
  const refreshBtn = document.getElementById('refresh-gcals-btn');
  if (!refreshBtn || refreshBtn.dataset.listener) return;
  refreshBtn.dataset.listener = 'true';
  refreshBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    refreshBtn.classList.remove('refreshing');
    void refreshBtn.offsetWidth; // Force CSS reflow to restart animation on consecutive clicks
    refreshBtn.classList.add('refreshing');

    try {
      await reloadGoogleEvents(true);
    } catch (err) {
      console.warn('Calendar refresh error:', err);
    } finally {
      setTimeout(() => {
        refreshBtn.classList.remove('refreshing');
      }, 1200);
    }
  });
}

async function loadGoogleCalendars() {
  const listContainer = document.getElementById('gcal-list');
  if (!listContainer) return;
  
  if (state.settings && state.settings.devMode) {
    console.log('[Dev Mode] Skipping Google Calendar network sync');
    renderSidebarGcals();
    return;
  }
  
  try {
    const calendars = await window.api.getGCalCalendars();
    if (calendars && calendars.error) {
      if (calendars.error === 'SESSION_EXPIRED') {
        state.sessionExpired = true;
        updateGcalStatus();
        renderView();
      }
      // Fallback to cached calendars so UI doesn't break
      const cachedCals = await window.api.getGcalCalendarsCache();
      if (cachedCals && cachedCals.length > 0) {
        state.gcalCalendars = cachedCals;
        renderSidebarGcals();
      }
      return;
    }
    
    state.sessionExpired = false;
    state.gcalCalendars = Array.isArray(calendars) ? calendars : [];
    await window.api.saveGcalCalendarsCache(state.gcalCalendars);
    
    if (state.settings && state.settings.activeGcalIds === undefined && state.gcalCalendars.length > 0) {
      state.activeGcalIds = state.gcalCalendars.map(c => c.id);
      state.settings.activeGcalIds = [...state.activeGcalIds];
      await window.api.saveSettings(state.settings);
    } else if (state.settings && Array.isArray(state.settings.activeGcalIds)) {
      state.activeGcalIds = [...state.settings.activeGcalIds];
    }
    
    renderSidebarGcals();
    setupRefreshButton();
    updateGcalStatus();

    await reloadGoogleEvents(true);
    
  } catch (err) {
    console.error('Failed to load Google Calendars', err);
    const cachedCals = await window.api.getGcalCalendarsCache();
    if (cachedCals && cachedCals.length > 0) {
      state.gcalCalendars = cachedCals;
      renderSidebarGcals();
    } else {
      listContainer.innerHTML = `<div style="padding:5px;color:var(--danger);font-size:11px;">Error loading calendars</div>`;
    }
    updateGcalStatus();
  }
}

/**
 * Updates the Google Calendar connection status indicator in the sidebar.
 */
function updateGcalStatus() {
  const statusEl = document.getElementById('gcal-status');
  if (!statusEl) return;
  
  const isConnected = localStorage.getItem('auth.gcalConnected') === 'true';
  const hasToken = !!localStorage.getItem('auth.googleAccessToken');
  
  if (state.sessionExpired) {
    statusEl.style.display = 'flex';
    statusEl.classList.add('disconnected');
    statusEl.querySelector('.gcal-status-text').textContent = 'GCal session expired';
  } else if (isConnected && hasToken) {
    statusEl.style.display = 'flex';
    statusEl.classList.remove('disconnected');
    statusEl.querySelector('.gcal-status-text').textContent = 'Google Calendar connected';
  } else {
    statusEl.style.display = 'none';
  }
}

async function reloadGoogleEvents(force = false) {
  if (state.activeGcalIds.length === 0 && !force) {
    updateCalendarEventsUI();
    return;
  }
  
  const toFetch = force ? state.activeGcalIds : state.activeGcalIds.filter(id => !state.fetchedGcalIds.has(id));
  
  if (toFetch.length === 0) {
    updateCalendarEventsUI();
    return;
  }
  
  const today = new Date();
  const timeMin = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
  const timeMax = new Date(today.getFullYear(), today.getMonth() + 2, 1).toISOString();
  
  try {
    const newEvents = await window.api.getGCalEvents(toFetch, timeMin, timeMax);
    if (newEvents && newEvents.error) {
      if (newEvents.error === 'SESSION_EXPIRED') {
        state.sessionExpired = true;
        renderView();
      }
      // Fallback to cached events
      const cachedEvents = await window.api.getGcalEventsCache();
      if (cachedEvents && cachedEvents.length > 0) {
        state.gcalEvents = cachedEvents;
      }
      updateCalendarEventsUI();
      return;
    }
    
    state.sessionExpired = false;
    state.gcalEvents = state.gcalEvents.filter(e => !toFetch.includes(e.calendarId));
    state.gcalEvents.push(...newEvents);
    
    toFetch.forEach(id => state.fetchedGcalIds.add(id));
    await window.api.saveGcalEventsCache(state.gcalEvents);
  } catch (err) {
    console.error('Failed to load Google Events', err);
    const cachedEvents = await window.api.getGcalEventsCache();
    if (cachedEvents && cachedEvents.length > 0) {
      state.gcalEvents = cachedEvents;
    }
  }
  
  updateCalendarEventsUI();
}

window.reconnectGoogleCalendar = async () => {
  showToast('Reconnecting Google Calendar...', 'info');
  const res = await window.api.reconnectGCal();
  if (res && res.success) {
    state.sessionExpired = false;
    updateGcalStatus();
    showToast('Google Calendar reconnected!', 'success');
    await loadGoogleCalendars();
    renderView();
  } else {
    showToast('Failed to reconnect. Please click Sign In in Settings.', 'danger');
  }
};
