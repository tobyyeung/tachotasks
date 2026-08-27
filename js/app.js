// ===== INITIALIZATION =====
async function init() {
  // Load all data from store
  state.tasks = ensureTaskSchema(await window.api.getTasks());
  state.projects = await window.api.getProjects();
  state.events = [];
  state.floatingGoals = [];
  state.archivedTasks = await window.api.getArchivedTasks() || [];
  state.settings = await window.api.getSettings() || {};
  if (state.settings.tasksViewMode) {
    state.tasksViewMode = state.settings.tasksViewMode;
  } else {
    state.tasksViewMode = 'section';
  }
  state.profiles = await window.api.getProfiles() || [];
  state.gcalCalendars = await window.api.getGcalCalendarsCache() || [];
  state.gcalEvents = await window.api.getGcalEventsCache() || [];
  // Since we loaded from cache, we assume they are already fetched for UI purposes temporarily
  if (Array.isArray(state.settings.activeGcalIds)) {
    state.activeGcalIds = [...state.settings.activeGcalIds];
    state.settings.activeGcalIds.forEach(id => state.fetchedGcalIds.add(id));
  }

  const defaultProfileImages = {
    'all': 'assets/brand/logo.png',
    'profile-personal': 'assets/profiles/personal.png',
    'profile-work': 'assets/profiles/work.png',
    'profile-school': 'assets/profiles/school.png'
  };

  if (!state.profiles || state.profiles.length === 0) {
    state.profiles = [
      { id: 'all', name: 'All', icon: '', image: 'assets/brand/logo.png' },
      { id: 'profile-personal', name: 'Personal', icon: '', image: 'assets/profiles/personal.png' },
      { id: 'profile-work', name: 'Work', icon: '', image: 'assets/profiles/work.png' },
      { id: 'profile-school', name: 'School', icon: '', image: 'assets/profiles/school.png' }
    ];
    await window.api.saveProfiles(state.profiles);
  } else {
    let profilesChanged = false;
    state.profiles.forEach(p => {
      if (!p.image && defaultProfileImages[p.id]) {
        p.image = defaultProfileImages[p.id];
        profilesChanged = true;
      }
    });
    if (profilesChanged) {
      await window.api.saveProfiles(state.profiles);
    }
  }

  // Ensure defaultProfileId is set and migrate any unprofiled items
  if (!state.settings.defaultProfileId) {
    state.settings.defaultProfileId = 'profile-personal';
    await window.api.saveSettings(state.settings);
  }
  await migrateItemsToProfiles();

  // Set up navigation
  setupNavigation();

  // Set up quick-add
  setupQuickAdd();

  // Set up mode switcher (Work/Personal/School profiles)
  setupModeSwitcher();

  // Set up Auth & Sync
  setupAuth();

  // Set up add-project button
  const addProjBtnSidebar = document.getElementById('add-project-btn');
  if (addProjBtnSidebar) addProjBtnSidebar.addEventListener('click', () => showProjectModal());

  // Render sidebar extras
  renderSidebarProjects();
  renderSidebarTags();
  renderSidebarGcals();

  // Render initial view
  renderView();

  // Load Google Calendars
  setupRefreshButton();
  loadGoogleCalendars();

  // Auto-refresh calendars and cloud sync every 10 minutes (600,000 ms)
  setInterval(async () => {
    if (state.settings.devMode) return;
    if (state.activeGcalIds.length > 0) {
      await reloadGoogleEvents(true);
    }
    // Also perform background cloud sync if the user is authenticated
    const user = await window.api.getUser();
    if (user) {
      const pushRes = await window.api.syncPush();
      const pullRes = await window.api.syncPull();
      if ((pushRes && pushRes.error) || (pullRes && pullRes.error)) {
        const err = (pushRes && pushRes.error) || (pullRes && pullRes.error);
        if (!isAuthOrInitError(err)) setSyncStatus('offline');
      } else {
        setSyncStatus('synced');
      }
      renderView();
    }
  }, 600000);
}




// ===== NAVIGATION =====
function setupNavigation() {
  if (state.settings.currentView) {
    state.currentView = state.settings.currentView;
  }
  
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.currentView);
    
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view;
      if (view !== 'project') {
        state.filterProject = null;
      }
      if (view === state.currentView && view !== 'project') return;
      state.currentView = view;
      state.settings.currentView = view;
      window.api.saveSettings(state.settings);
      
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSidebarProjects();
      renderView();
    });
  });

  const headerSettingsBtn = document.getElementById('header-settings-btn');
  if (headerSettingsBtn) {
    headerSettingsBtn.addEventListener('click', () => {
      if (state.currentView === 'settings') return;
      state.filterProject = null;
      state.currentView = 'settings';
      state.settings.currentView = 'settings';
      window.api.saveSettings(state.settings);
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      renderView();
    });
  }
}


// ===== TASKS PROFILE SWITCHER SETUP =====
function setupModeSwitcher() {
  state.activeProfileId = state.settings.activeProfileId || 'all';
}


// ===== AUTH & SYNC =====
function setupAuth() {
  const signInBtn = document.getElementById('sign-in-btn');
  const signOutBtn = document.getElementById('sign-out-btn');
  const userProfile = document.getElementById('user-profile');
  
  if (!signInBtn || !signOutBtn) return;

  if (state.settings.devMode) {
    hideLoginOverlay();
  }

  // Listen for auth state changes from main process
  window.api.onAuthStateChanged(async (user) => {
    if (user) {
      // User is signed in
      signInBtn.classList.add('hidden');
      userProfile.classList.remove('hidden');
      document.getElementById('user-name').textContent = user.displayName || user.email.split('@')[0];
      document.getElementById('user-email').textContent = user.email || '';
      if (user.photoURL) document.getElementById('user-avatar').src = user.photoURL;
      
      const gcalSection = document.getElementById('gcal-sidebar-section');
      if (gcalSection) gcalSection.classList.remove('hidden');
      hideLoginOverlay();
      
      // Attempt to pull cloud data if we have an active user
      setSyncStatus('syncing');
      try {
        const res = await window.api.syncPull();
        if (res && res.error) {
          if (isAuthOrInitError(res.error)) {
            setSyncStatus('');
          } else {
            console.warn('Sync pull result:', res.error);
            setSyncStatus('offline');
          }
        } else {
          setSyncStatus('synced');
        }
      } catch (e) {
        console.error('Sync failed', e);
        setSyncStatus('offline');
      }

      try {
        await refreshDataFromStore();
      } catch (e) {
        console.error('refreshDataFromStore failed', e);
      }
    } else {
      // User is signed out
      signInBtn.classList.remove('hidden');
      userProfile.classList.add('hidden');
      setSyncStatus('');
      
      const gcalSection = document.getElementById('gcal-sidebar-section');
      if (gcalSection) gcalSection.classList.add('hidden');
      state.gcalEvents = [];
      showLoginOverlay();
      renderView();
    }
  });

  // Get initial user state — only set up UI, don't sync (let onAuthStateChanged handle sync when Firebase is ready)
  window.api.getUser().then(async user => {
    if (user) {
      signInBtn.classList.add('hidden');
      userProfile.classList.remove('hidden');
      document.getElementById('user-name').textContent = user.displayName || user.email.split('@')[0];
      document.getElementById('user-email').textContent = user.email || '';
      if (user.photoURL) document.getElementById('user-avatar').src = user.photoURL;
      
      const gcalSection = document.getElementById('gcal-sidebar-section');
      if (gcalSection) gcalSection.classList.remove('hidden');
      hideLoginOverlay();

      // Load from local storage immediately (no cloud sync yet — Firebase auth may not be ready)
      try {
        await refreshDataFromStore();
      } catch (e) {
        console.error('refreshDataFromStore failed', e);
      }
    } else {
      // Not authenticated — show login overlay
      signInBtn.classList.remove('hidden');
      userProfile.classList.add('hidden');
      showLoginOverlay();
    }
  });

  // Login overlay button
  const loginOverlayBtn = document.getElementById('login-overlay-btn');
  if (loginOverlayBtn) {
    loginOverlayBtn.addEventListener('click', async () => {
      loginOverlayBtn.textContent = 'Connecting...';
      try {
        const result = await window.api.signIn();
        if (result && result.success) {
          hideLoginOverlay();
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

function showLoginOverlay() {
  if (state.settings.devMode) {
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
  
  // Attempt to load Google Calendars if signed in
  const user = await window.api.getUser();
  if (user) {
    await loadGoogleCalendars();
  } else {
    renderView();
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
  
  if (state.settings.devMode) {
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
    
    if (state.settings.activeGcalIds === undefined && state.gcalCalendars.length > 0) {
      state.activeGcalIds = state.gcalCalendars.map(c => c.id);
      state.settings.activeGcalIds = [...state.activeGcalIds];
      await window.api.saveSettings(state.settings);
    } else if (Array.isArray(state.settings.activeGcalIds)) {
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

function renderView() {
  const container = document.getElementById('view-container');
  switch (state.currentView) {
    case 'dashboard': container.innerHTML = renderDashboard(); break;
    case 'tasks': container.innerHTML = renderTasks(); break;
    case 'project': container.innerHTML = renderProject(); break;
    case 'calendar': container.innerHTML = renderCalendar(); break;
    case 'planner': container.innerHTML = renderPlanner(); break;
    case 'settings': container.innerHTML = renderSettings(); break;
    case 'archive': container.innerHTML = renderArchive(); break;
  }
  attachViewListeners();

  const addBtn = document.getElementById('add-task-btn');
  if (addBtn) {
    if (state.currentView === 'archive' || state.currentView === 'settings') {
      addBtn.style.display = 'none';
    } else {
      addBtn.style.display = ''; // Reset to default (e.g. flex)
    }
  }
}

function renderSidebarGcals() {
  const listContainer = document.getElementById('gcal-list');
  if (!listContainer) return;
  
  listContainer.innerHTML = '';
  const visibleIds = Array.isArray(state.settings.visibleGcalIds)
    ? state.settings.visibleGcalIds
    : state.gcalCalendars.map(c => c.id);
  
  state.gcalCalendars.forEach(cal => {
    if (!visibleIds.includes(cal.id)) return; // Skip hidden calendars
    
    const isChecked = state.activeGcalIds.includes(cal.id);
    
    const div = document.createElement('div');
    div.className = 'gcal-item';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'gcal-checkbox';
    cb.checked = isChecked;
    cb.style.setProperty('--cal-color', cal.color);
    
    cb.addEventListener('change', async (e) => {
      if (e.target.checked) {
        if (!state.activeGcalIds.includes(cal.id)) state.activeGcalIds.push(cal.id);
      } else {
        state.activeGcalIds = state.activeGcalIds.filter(id => id !== cal.id);
      }
      
      state.settings.activeGcalIds = [...state.activeGcalIds];
      await window.api.saveSettings(state.settings);
      await reloadGoogleEvents();
      updateCalendarEventsUI();
    });
    
    const span = document.createElement('span');
    span.className = 'gcal-name';
    span.textContent = cal.summary;
    
    div.appendChild(cb);
    div.appendChild(span);
    div.addEventListener('click', (e) => {
      if (e.target !== cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    });
    
    listContainer.appendChild(div);
  });
}

function updateCalendarEventsUI() {
  if (state.currentView === 'calendar') {
    renderCalendarEvents();
  } else if (state.currentView === 'planner') {
    if (!updatePlannerCalendarEvents()) renderView();
  } else if (state.currentView === 'dashboard') {
    if (!updateDashboardItinerary()) renderView();
  }
  // For other views like 'settings', 'inbox', or 'tasks (list/kanban)', 
  // there are no calendar events displayed, so we do nothing to avoid full page blink.
}

function updateDashboardItinerary() {
  const list = document.querySelector('.itinerary-list');
  if (!list) return false;
  
  const today = getTodayStr();
  const modeFilteredTasks = getFilteredByMode(state.tasks);
  const modeFilteredEvents = getFilteredByMode(state.events);
  const localToday = modeFilteredEvents.filter(e => e.date === today).map(e => ({ ...e, type: 'event', sortTime: e.startTime }));
  const gcalToday = getActiveGcalEvents().filter(e => e.date === today).map(e => ({ ...e, type: 'gcal_event', sortTime: e.startTime || '00:00' }));
  const todayEvents = [...localToday, ...gcalToday];
  const todayTasks = modeFilteredTasks.filter(t => t.dueDate === today && t.dueTime).map(t => {
    const [h, m] = t.dueTime.split(':').map(Number);
    const startMins = h * 60 + m;
    const endMins = Math.min(startMins + 15, 1439);
    const endH = Math.floor(endMins / 60);
    const endM = endMins % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    return { ...t, type: 'task', sortTime: t.dueTime, endTime };
  });
  const itinerary = [...todayEvents, ...todayTasks].sort((a, b) => a.sortTime.localeCompare(b.sortTime));
  
  list.innerHTML = itinerary.length > 0
    ? itinerary.map(item => {
        if (item.type === 'event' || item.type === 'gcal_event') {
          const isGcal = item.type === 'gcal_event';
          const color = isGcal ? 'var(--accent)' : item.color;
          const source = isGcal ? 'Google Calendar' : item.source;
          return `
            <div class="itinerary-item" data-event-id="${item.id}">
              <span class="itinerary-time">${item.startTime ? formatTime12(item.startTime) : 'All Day'}</span>
              <div class="itinerary-bar" style="background: ${color}"></div>
              <div class="itinerary-content">
                <div class="itinerary-title">${escHtml(item.title)}</div>
                <div class="itinerary-meta">
                  <span>${item.startTime ? formatTime12(item.startTime) + ' – ' : ''}${item.endTime ? formatTime12(item.endTime) : ''}</span>
                  <span class="source-badge">${source}</span>
                </div>
              </div>
            </div>
          `;
        } else {
          const pColor = getPriorityColor(item.priority);
          return `
            <div class="itinerary-item ${item.completed ? 'completed' : ''}" data-task-id="${item.id}">
              <span class="itinerary-time">${formatTime12(item.dueTime)}</span>
              <div class="itinerary-bar" style="background: ${pColor || 'var(--accent)'}"></div>
              <div class="itinerary-content">
                <div class="itinerary-title">${escHtml(item.title)}</div>
                <div class="itinerary-meta">
                  <span>Due ${formatTime12(item.dueTime)}${item.endTime && item.endTime !== item.dueTime ? ' – ' + formatTime12(item.endTime) : ''}</span>
                  ${item.priority ? `<span class="priority-badge ${item.priority.toLowerCase()}">${item.priority}</span>` : ''}
                </div>
              </div>
            </div>
          `;
        }
      }).join('')
    : '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No items scheduled for today</div></div>';
    
  const headerCount = document.querySelector('.itinerary-card .card-count');
  if (headerCount) {
    const unscheduledToday = modeFilteredTasks.filter(t => t.dueDate === today && !t.dueTime && !t.completed);
    headerCount.textContent = `${itinerary.length} items${unscheduledToday.length > 0 ? ` · ${unscheduledToday.length} unscheduled` : ''}`;
  }
  
  document.querySelectorAll('.itinerary-list .itinerary-item[data-task-id]').forEach(el => {
    el.addEventListener('click', () => showTaskModal(el.dataset.taskId));
  });
  
  return true;
}

function updatePlannerCalendarEvents() {
  const rows = document.querySelectorAll('.planner-day-row');
  if (rows.length === 0) return false;
  
  const today = getTodayStr();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  rows.forEach((row, i) => {
    const dateStr = row.dataset.plannerDate;
    if (!dateStr) return;
    
    const dStr = dateStr + 'T12:00:00';
    const d = new Date(dStr);
    const isToday = dateStr === today;
    
    const localDayEvents = state.events.filter(e => e.date === dateStr);
    const gcalDayEvents = getActiveGcalEvents().filter(e => e.date === dateStr);
    const dayEvents = [...localDayEvents, ...gcalDayEvents];
    const dayTasks = state.tasks.filter(t => t.dueDate === dateStr);
    
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-weight:600;font-size:13px;color:${isToday ? 'var(--accent)' : 'var(--text-primary)'}">${dayNames[i]} ${d.getDate()}</span>
        <span style="font-size:11px;color:var(--text-tertiary)">${dayEvents.length + dayTasks.length} items</span>
      </div>
      ${[...dayEvents.map(e => {
          const activeIds = Array.isArray(state.activeGcalIds) ? state.activeGcalIds : (state.settings.activeGcalIds || []);
          const isGcal = activeIds.includes(e.calendarId);
          let calColor = e.color;
          if (isGcal && state.gcalCalendars) {
            const calData = state.gcalCalendars.find(c => c.id === e.calendarId);
            if (calData) calColor = calData.color;
            else calColor = 'var(--accent)';
          }
          return `<div style="font-size:12px;color:${isGcal ? 'var(--text-primary)' : e.color};padding:2px 0;">${e.startTime ? formatTime12(e.startTime) : 'All Day'} ${isGcal ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${calColor};margin-right:4px;"></span>` : ''}${escHtml(e.title)}</div>`;
        }),
        ...dayTasks.filter(t => !t.completed).map(t => `<div style="font-size:12px;color:var(--text-secondary);padding:2px 0;">• ${escHtml(t.title)}</div>`)
      ].join('')}
    `;
  });
  
  return true;
}




/**
 * Migrates any tasks or sections missing a valid profileId to the default profile.
 */
async function migrateItemsToProfiles() {
  const defaultProf = (state.settings && state.settings.defaultProfileId) || 'profile-personal';
  let tasksChanged = false;
  let archivedChanged = false;
  let settingsChanged = false;

  (state.tasks || []).forEach(t => {
    if (!t.profileId || t.profileId === 'all') {
      t.profileId = defaultProf;
      tasksChanged = true;
    }
  });

  (state.archivedTasks || []).forEach(t => {
    if (!t.profileId || t.profileId === 'all') {
      t.profileId = defaultProf;
      archivedChanged = true;
    }
  });

  if (state.settings && state.settings.taskSections) {
    state.settings.taskSections.forEach(s => {
      if (!s.profileId || s.profileId === 'all') {
        s.profileId = defaultProf;
        settingsChanged = true;
      }
    });
  }

  if (tasksChanged) await window.api.saveTasks(state.tasks);
  if (archivedChanged) await window.api.saveArchivedTasks(state.archivedTasks);
  if (settingsChanged) await window.api.saveSettings(state.settings);
}


// ===== EVENT LISTENERS (per-view) =====
function attachViewListeners() {
  // Dashboard listeners
  document.querySelectorAll('.floating-reminder').forEach(el => {
    el.addEventListener('click', () => toggleFloatingGoal(el.dataset.goalId));
  });

  document.querySelectorAll('.dashboard-collapse-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.collapseId;
      if (!state.settings.dashboardCollapsed) state.settings.dashboardCollapsed = {};
      const isCollapsed = !state.settings.dashboardCollapsed[id];
      state.settings.dashboardCollapsed[id] = isCollapsed;
      
      const svg = btn.querySelector('svg');
      if (svg) svg.style.transform = isCollapsed ? 'rotate(-90deg)' : 'none';
      const content = document.getElementById(`collapse-content-${id}`);
      if (content) content.style.display = isCollapsed ? 'none' : 'block';
      
      await window.api.saveSettings(state.settings);
    });
  });

  document.querySelectorAll('.do-soon-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const taskId = e.target.dataset.taskId;
      toggleTask(taskId);
    });
  });

  const dashCalBtn = document.getElementById('dash-cal-btn');
  if (dashCalBtn) {
    dashCalBtn.addEventListener('click', () => {
      document.querySelector('.nav-item[data-view="calendar"]').click();
    });
  }

  // Tasks view listeners
  const sortBtn = document.getElementById('tasks-sort-btn');
  const sortPanel = document.getElementById('tasks-sort-panel');
  if (sortBtn && sortPanel) {
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sortPanel.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      sortPanel.classList.add('hidden');
    }, { once: true });
  }

  document.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', () => {
      state.tasksSortMode = opt.dataset.sort;
      renderView();
    });
  });

  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.tasksViewMode = btn.dataset.tasksView;
      state.settings.tasksViewMode = state.tasksViewMode;
      await window.api.saveSettings(state.settings);
      renderView();
    });
  });

  document.querySelectorAll('[data-filter-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.filterTag;
      state.filterTag = state.filterTag === tag ? null : tag;
      renderView();
    });
  });

  // Task checkboxes
  document.querySelectorAll('[data-task-toggle]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTask(el.dataset.taskToggle);
    });
  });

  // Task edit
  document.querySelectorAll('[data-task-edit]').forEach(el => {
    el.addEventListener('click', () => showTaskModal(el.dataset.taskEdit));
  });

  // Task card dragstart & dragend
  document.querySelectorAll('.task-item-card[data-task-id]').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.taskId);
      e.dataTransfer.effectAllowed = 'move';
      card.style.opacity = '0.4';
    });

    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
      document.querySelectorAll('.task-section').forEach(s => s.classList.remove('drag-over'));
    });
  });

  // Section drop zones
  document.querySelectorAll('.task-section[data-section-drop]').forEach(sectionEl => {
    sectionEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      sectionEl.classList.add('drag-over');
    });

    sectionEl.addEventListener('dragleave', () => {
      sectionEl.classList.remove('drag-over');
    });

    sectionEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      sectionEl.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const targetSectionId = sectionEl.dataset.sectionDrop;

      if (!taskId) return;
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      const newSectionId = targetSectionId === 'unsectioned' ? null : targetSectionId;
      if (task.sectionId !== newSectionId) {
        task.sectionId = newSectionId;
        await saveTasks();
        renderView();
        showToast('Task moved to section', 'success');
      }
    });
  });

  // Itinerary item click
  document.querySelectorAll('.itinerary-item[data-task-id]').forEach(el => {
    el.addEventListener('click', () => showTaskModal(el.dataset.taskId));
  });

  // New task button
  const addBtn = document.getElementById('add-task-btn');
  if (addBtn) addBtn.addEventListener('click', () => showTaskModal(null));

  // Add project list button
  const addProjectListBtn = document.getElementById('add-project-list-btn');
  if (addProjectListBtn && state.filterProject) {
    addProjectListBtn.addEventListener('click', () => showProjectModal(state.filterProject));
  }

  // Calendar navigation
  const calPrev = document.getElementById('cal-prev') || document.getElementById('planner-prev');
  const calNext = document.getElementById('cal-next') || document.getElementById('planner-next');
  const calToday = document.getElementById('cal-today') || document.getElementById('planner-today');

  // Tasks page profile switcher
  document.querySelectorAll('.tasks-mode-switcher [data-tasks-profile]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pId = btn.dataset.tasksProfile;
      state.activeProfileId = pId;
      state.settings.activeProfileId = pId;
      await window.api.saveSettings(state.settings);
      renderView();
    });
  });

  if (calPrev) calPrev.addEventListener('click', () => {
    const mode = state.calendarViewMode || 'weekly';
    if (mode === 'daily') state.calendarDate.setDate(state.calendarDate.getDate() - 1);
    else if (mode === 'monthly') state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    else state.calendarDate.setDate(state.calendarDate.getDate() - 7);
    renderView();
  });
  if (calNext) calNext.addEventListener('click', () => {
    const mode = state.calendarViewMode || 'weekly';
    if (mode === 'daily') state.calendarDate.setDate(state.calendarDate.getDate() + 1);
    else if (mode === 'monthly') state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    else state.calendarDate.setDate(state.calendarDate.getDate() + 7);
    renderView();
  });
  if (calToday) calToday.addEventListener('click', () => {
    state.calendarDate = new Date();
    renderView();
  });

  // Calendar View Mode Selector
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.calendarViewMode = btn.dataset.calView;
      renderView();
    });
  });

  // Inline Add Task for Section
  document.querySelectorAll('.add-task-inline-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const secId = btn.dataset.addTaskSection;
      openInlineTaskCreate(btn, {
        sectionId: secId !== 'unsectioned' ? secId : null,
        projectId: state.filterProject || null
      });
    });
  });

  // Add Section
  document.querySelectorAll('.add-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const html = `
        <div style="padding:var(--sp-md);">
          <h2 style="font-size:16px;margin-bottom:12px;">Add Section</h2>
          <input type="text" id="modal-section-name" class="inbox-input" placeholder="Section name..." style="width:100%;margin-bottom:16px;" autofocus />
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="modal-cancel-section" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;">Cancel</button>
            <button id="modal-confirm-section" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--accent);color:white;border:none;cursor:pointer;">Add</button>
          </div>
        </div>
      `;
      openModal(html);
      
      const submit = async () => {
        const name = document.getElementById('modal-section-name').value.trim();
        if (name) {
          if (!state.settings.taskSections) state.settings.taskSections = [];
          state.settings.taskSections.push({
            id: 'sec-' + generateId(),
            name,
            profileId: getActiveProfileId()
          });
          await window.api.saveSettings(state.settings);
          renderView();
          closeModal();
        }
      };

      document.getElementById('modal-cancel-section').addEventListener('click', closeModal);
      document.getElementById('modal-confirm-section').addEventListener('click', submit);
      document.getElementById('modal-section-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });
  });

  // Add Project Section
  document.querySelectorAll('.add-project-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const html = `
        <div style="padding:var(--sp-md);">
          <h2 style="font-size:16px;margin-bottom:12px;">Add Project Section</h2>
          <input type="text" id="modal-section-name" class="inbox-input" placeholder="Section name..." style="width:100%;margin-bottom:16px;" autofocus />
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="modal-cancel-section" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;">Cancel</button>
            <button id="modal-confirm-section" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--accent);color:white;border:none;cursor:pointer;">Add</button>
          </div>
        </div>
      `;
      openModal(html);
      
      const submit = async () => {
        const name = document.getElementById('modal-section-name').value.trim();
        if (name && state.filterProject) {
          if (!state.settings.projectSections) state.settings.projectSections = [];
          state.settings.projectSections.push({
            id: 'psec-' + generateId(),
            projectId: state.filterProject,
            name
          });
          await window.api.saveSettings(state.settings);
          renderView();
          closeModal();
        }
      };

      document.getElementById('modal-cancel-section').addEventListener('click', closeModal);
      document.getElementById('modal-confirm-section').addEventListener('click', submit);
      document.getElementById('modal-section-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });
  });

  // Delete project section
  document.querySelectorAll('.delete-project-section-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const secId = btn.dataset.projectSectionId;
      if (!confirm('Delete this section? Tasks in it will be unsectioned.')) return;
      state.settings.projectSections = (state.settings.projectSections || []).filter(s => s.id !== secId);
      state.tasks.forEach(t => {
        if (t.sectionId === secId) t.sectionId = null;
      });
      await saveTasks();
      await window.api.saveSettings(state.settings);
      renderView();
    });
  });

  // Delete Section
  document.querySelectorAll('.delete-section-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const secId = btn.dataset.sectionId;
      if (confirm('Delete this section? Tasks will become uncategorized.')) {
        state.settings.taskSections = state.settings.taskSections.filter(s => s.id !== secId);
        state.tasks.forEach(t => {
          if (t.sectionId === secId) t.sectionId = null;
        });
        window.api.saveSettings(state.settings);
        saveTasks().then(() => renderView());
      }
    });
  });



  // Drag and drop
  setupDragAndDrop();

  // Section drag and drop reordering
  document.querySelectorAll('.task-section[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      // Prevent drag if we're dragging a task inside it
      if (e.target.closest('[data-task-id]')) {
        e.preventDefault();
        return;
      }
      state.dragSectionId = el.dataset.sectionDrag;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/section', el.dataset.sectionDrag);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      state.dragSectionId = null;
      document.querySelectorAll('.drag-over-section').forEach(d => d.classList.remove('drag-over-section'));
    });
    
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!state.dragSectionId || state.dragSectionId === el.dataset.sectionDrag) return;
      el.classList.add('drag-over-section');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-section');
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over-section');
      const dragSectionId = e.dataTransfer.getData('text/section');
      if (!dragSectionId) return; // Dropped a task here
      
      const targetSectionId = el.dataset.sectionDrag;
      if (dragSectionId === targetSectionId) return;
      
      const sections = state.settings.taskSections;
      const fromIdx = sections.findIndex(s => s.id === dragSectionId);
      const toIdx = sections.findIndex(s => s.id === targetSectionId);
      
      if (fromIdx > -1 && toIdx > -1) {
        const [movedSection] = sections.splice(fromIdx, 1);
        sections.splice(toIdx, 0, movedSection);
        await window.api.saveSettings(state.settings);
        renderView();
      }
    });
  });

  // Settings view listeners
  document.querySelectorAll('.setting-visible-cb').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const calId = cb.dataset.calId;
      let visibleIds = Array.isArray(state.settings.visibleGcalIds)
        ? [...state.settings.visibleGcalIds]
        : state.gcalCalendars.map(c => c.id);
      
      if (e.target.checked) {
        if (!visibleIds.includes(calId)) visibleIds.push(calId);
      } else {
        visibleIds = visibleIds.filter(id => id !== calId);
        // Also remove from activeGcalIds if hiding
        state.activeGcalIds = state.activeGcalIds.filter(id => id !== calId);
        state.settings.activeGcalIds = [...state.activeGcalIds];
      }
      
      state.settings.visibleGcalIds = visibleIds;
      await window.api.saveSettings(state.settings);
      
      showToast('Calendar visibility updated', 'success');
      renderSidebarGcals();
      await reloadGoogleEvents();
      updateCalendarEventsUI();
    });
  });

  // Settings: Default Creation Profile
  const defaultProfSelect = document.getElementById('settings-default-profile-select');
  if (defaultProfSelect) {
    defaultProfSelect.addEventListener('change', async (e) => {
      state.settings.defaultProfileId = e.target.value;
      await window.api.saveSettings(state.settings);
      showToast('Default creation profile updated', 'success');
    });
  }

  // Settings: Profiles Add
  const addProfileBtn = document.getElementById('add-profile-btn');
  if (addProfileBtn) {
    addProfileBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('new-profile-name');
      const name = nameInput.value.trim();
      if (!name) return showToast('Profile name required', 'error');
      
      const newProfile = { id: 'profile-' + generateId(), name, image: 'assets/profiles/personal.png' };
      state.profiles.push(newProfile);
      await window.api.saveProfiles(state.profiles);
      showToast('Profile added', 'success');
      renderView();
    });
  }

  // Settings: Profiles Edit
  document.querySelectorAll('.edit-profile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pId = btn.dataset.profileId;
      const profile = state.profiles.find(p => p.id === pId);
      if (!profile) return;
      
      const html = `
        <div style="padding:var(--sp-md);">
          <h2 style="font-size:16px;margin-bottom:16px;">Edit Profile</h2>
          <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-secondary);">Name</label>
          <input type="text" id="edit-profile-name" class="inbox-input" value="${escAttr(profile.name)}" style="width:100%;margin-bottom:12px;" />
          
          <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-secondary);">Upload Profile Image</label>
          <input type="file" id="edit-profile-image" accept="image/*" style="margin-bottom:16px;width:100%;font-size:12px;" />
          ${profile.image ? `<img src="${profile.image}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;margin-bottom:16px;display:block;">` : ''}

          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="modal-cancel-profile" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;">Cancel</button>
            <button id="modal-save-profile" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--accent);color:white;border:none;cursor:pointer;">Save</button>
          </div>
        </div>
      `;
      openModal(html);
      
      let newImageBase64 = profile.image || null;
      document.getElementById('edit-profile-image').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            newImageBase64 = event.target.result;
          };
          reader.readAsDataURL(file);
        }
      });

      document.getElementById('modal-cancel-profile').addEventListener('click', closeModal);
      document.getElementById('modal-save-profile').addEventListener('click', async () => {
        profile.name = document.getElementById('edit-profile-name').value.trim() || profile.name;
        delete profile.icon;
        profile.image = newImageBase64;
        
        await window.api.saveProfiles(state.profiles);
        renderView();
        closeModal();
      });
    });
  });

  // Settings: Profiles Delete
  document.querySelectorAll('.delete-profile-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pId = btn.dataset.profileId;
      if (confirm('Delete this profile? (Tasks in this profile will become uncategorized in All)')) {
        state.profiles = state.profiles.filter(p => p.id !== pId);
        if (state.activeProfileId === pId) state.activeProfileId = 'all';
        state.settings.activeProfileId = state.activeProfileId;
        
        // Remove categories from projects that used this profile
        state.projects.forEach(p => {
          if (p.profileId === pId) p.profileId = null;
        });
        await window.api.saveProjects(state.projects);
        await window.api.saveSettings(state.settings);
        await window.api.saveProfiles(state.profiles);
        
        showToast('Profile deleted', 'success');
        setupModeSwitcher();
        renderSidebarProjects();
        renderView();
      }
    });
  });

  // Settings: Priority Flag Colors
  document.querySelectorAll('.setting-prio-color-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const p = e.target.dataset.priority;
      const color = e.target.value;
      if (!state.settings.priorityColors) state.settings.priorityColors = {};
      state.settings.priorityColors[p] = color;
      await window.api.saveSettings(state.settings);
      showToast(`Priority ${p} flag color updated to ${color}`, 'info');
      renderView();
    });
  });

  // Settings: Export Backup
  const exportBtn = document.getElementById('export-backup-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tachotasks_backup_${getTodayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Settings: Import Backup
  const importFile = document.getElementById('import-backup-file');
  if (importFile) {
    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedState = JSON.parse(event.target.result);
          if (importedState && typeof importedState === 'object') {
            if (confirm('Are you sure you want to overwrite all local data with this backup?')) {
              state.tasks = importedState.tasks || [];
              state.projects = importedState.projects || [];
              state.settings = importedState.settings || {};
              state.profiles = importedState.profiles || [];
              state.archivedTasks = importedState.archivedTasks || [];
              
              await saveTasks();
              await window.api.saveProjects(state.projects);
              await window.api.saveSettings(state.settings);
              await window.api.saveProfiles(state.profiles);
              await saveArchivedTasks();
              
              showToast('Backup imported successfully');
              setTimeout(() => location.reload(), 1000);
            }
          } else {
            showToast('Invalid backup file', 'error');
          }
        } catch (err) {
          showToast('Error parsing backup', 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  // Render calendar events overlay after DOM paint
  if (state.currentView === 'calendar') {
    requestAnimationFrame(() => {
      // Double requestAnimationFrame ensures all layout/paint is done
      requestAnimationFrame(() => renderCalendarEvents());
    });
  }
}





// Initialize app when DOM is ready AND browser-api.js module has loaded
// ES modules (type="module") are deferred — they execute after regular scripts.
// We poll briefly for window.api to be set by browser-api.js before bootstrapping.
document.addEventListener('DOMContentLoaded', () => {
  if (window.api) { init(); return; }
  const waitForApi = setInterval(() => {
    if (window.api) { clearInterval(waitForApi); init(); }
  }, 50);
});

// Global click listener for external links
document.body.addEventListener('click', (e) => {
  const target = e.target.closest('a.external-link');
  if (target && target.href) {
    e.preventDefault();
    window.open(target.href, '_blank');
  }
});

// Re-render calendar events on window resize
let _calResizeTimeout = null;
window.addEventListener('resize', () => {
  if (state.currentView === 'calendar') {
    if (_calResizeTimeout) clearTimeout(_calResizeTimeout);
    _calResizeTimeout = setTimeout(() => {
      renderCalendarEvents();
    }, 100);
  }
});
