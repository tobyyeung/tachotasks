// ===== INITIALIZATION =====
async function init() {
  // Load all data from store
  const taskData = await window.api.getTaskCollections();
  state.archivedTasks = taskData.archivedTasks || [];
  state.tasks = ensureTaskSchema(taskData.tasks);
  state.projects = await window.api.getProjects();
  state.events = [];
  state.floatingGoals = [];
  state.settings = await window.api.getSettings() || {};
  if (state.settings.currentView) {
    state.currentView = state.settings.currentView;
  }
  if (state.settings.activeProfileId) {
    state.activeProfileId = state.settings.activeProfileId;
  }
  if (state.settings.tasksViewMode) {
    state.tasksViewMode = state.settings.tasksViewMode === 'section' ? 'board' : state.settings.tasksViewMode;
  } else {
    state.tasksViewMode = 'board';
  }
  if (state.settings.tasksSortMode) {
    state.tasksSortMode = state.settings.tasksSortMode;
  }
  if (state.settings.filterTag !== undefined) {
    state.filterTag = state.settings.filterTag;
  }
  if (state.settings.activeProjectId && state.currentView === 'project') {
    state.filterProject = state.settings.activeProjectId;
  }
  if (state.settings.calendarViewMode) {
    state.calendarViewMode = state.settings.calendarViewMode;
  }
  if (state.settings.calendarDate) {
    state.calendarDate = parseDateLocal(state.settings.calendarDate);
  }
  if (state.settings.plannerDate) {
    state.plannerDate = parseDateLocal(state.settings.plannerDate);
  }
  if (state.settings.dashboardUpcomingRange) {
    state.dashboardUpcomingRange = state.settings.dashboardUpcomingRange;
  }
  if (!state.settings.dashboardLayout) {
    state.settings.dashboardLayout = {
      left: ['upcoming-tasks', 'daily-tasks'],
      right: ['todays-schedule', 'birthdays']
    };
  }
  if (state.settings.dashboardSplitRatio === undefined) {
    state.settings.dashboardSplitRatio = 50;
  }
  state.profiles = await window.api.getProfiles() || [];
  state.gcalCalendars = await window.api.getGcalCalendarsCache() || [];
  state.gcalEvents = await window.api.getGcalEventsCache() || [];
  // Since we loaded from cache, we assume they are already fetched for UI purposes temporarily
  if (Array.isArray(state.settings.activeGcalIds)) {
    state.activeGcalIds = [...state.settings.activeGcalIds];
    state.settings.activeGcalIds.forEach(id => state.fetchedGcalIds.add(id));
  }

  state.profiles = ensureDefaultProfiles(state.profiles || []);
  await window.api.saveProfiles(state.profiles);

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

  // An empty workspace is not proof of a new account. Only cloud-marked first runs may open setup.
  if (!window.electronAPI?.isElectron && state.settings.onboardingEligible === true && !state.settings.accountSetupComplete) {
    setTimeout(() => {
      if (typeof showOnboardingModal === 'function') {
        showOnboardingModal();
      }
    }, 450);
  }

  // Load Google Calendars
  setupRefreshButton();
  loadGoogleCalendars();

  // Auto-refresh calendars and cloud sync every 10 minutes (600,000 ms)
  let backgroundRefreshRunning = false;
  setInterval(async () => {
    if (state.settings.devMode || backgroundRefreshRunning || document.hidden) return;
    backgroundRefreshRunning = true;
    try {
      const user = await window.api.getUser();
      if (user) {
        const result = await window.api.syncPull();
        if (result && result.error) {
          setSyncStatus(isAuthOrInitError(result.error) ? '' : 'offline');
        } else {
          await refreshDataFromStore({ reloadCalendars: false });
          setSyncStatus('synced');
        }
      }
      if (state.activeGcalIds.length > 0) await reloadGoogleEvents(true);
    } catch (err) {
      console.warn('Background refresh failed:', err);
      setSyncStatus('offline');
    } finally {
      backgroundRefreshRunning = false;
    }
  }, 600000);

  // Real-time remote cloud sync listener
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('tachotasks:remotesync', async (e) => {
      console.log('[app] Real-time sync update received for:', e.detail && e.detail.collection);
      setSyncStatus('syncing');
      try {
        await refreshDataFromStore({ reloadCalendars: false });
        setSyncStatus('synced');
      } catch (err) {
        console.warn('[app] Error refreshing UI from real-time sync:', err);
      }
    });
  }

  // Live Dashboard clock ticker (updates every 10 seconds)
  setInterval(() => {
    if (state.currentView === 'dashboard') {
      const dtBadge = document.getElementById('dashboard-datetime-badge');
      if (dtBadge && typeof getFormattedCurrentDateTime === 'function') {
        dtBadge.textContent = getFormattedCurrentDateTime();
      }
    }
  }, 10000);
}




// ===== NAVIGATION =====
function setupNavigation() {
  if (state.settings.currentView) {
    state.currentView = state.settings.currentView;
  }
  if (state.settings.activeProjectId && state.currentView === 'project') {
    state.filterProject = state.settings.activeProjectId;
  }
  
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.currentView && state.currentView !== 'project');
    
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view;
      if (view !== 'project') {
        state.filterProject = null;
      }
      if (view === state.currentView && view !== 'project') return;
      state.currentView = view;
      persistUIState();
      
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSidebarProjects();
      renderView();
    });
  });


  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebar = document.getElementById('sidebar');
  if (sidebarToggleBtn && sidebar) {
    if (state.settings && state.settings.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
      sidebarToggleBtn.title = 'Expand sidebar';
    }
    sidebarToggleBtn.addEventListener('click', async () => {
      sidebar.classList.toggle('collapsed');
      const isCollapsed = sidebar.classList.contains('collapsed');
      sidebarToggleBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
      state.settings.sidebarCollapsed = isCollapsed;
      await window.api.saveSettings(state.settings);
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

      // Do not alter returning empty workspaces; automatic setup is for brand-new cloud accounts only.
      if (!window.electronAPI?.isElectron && state.settings.onboardingEligible === true && !state.settings.accountSetupComplete) {
        setTimeout(() => {
          if (typeof showOnboardingModal === 'function') {
            showOnboardingModal();
          }
        }, 350);
      }
    } else {
      // User is signed out
      signInBtn.classList.remove('hidden');
      userProfile.classList.add('hidden');
      setSyncStatus('');
      
      const gcalSection = document.getElementById('gcal-sidebar-section');
      if (gcalSection) gcalSection.classList.add('hidden');
      
      state.tasks = [];
      state.projects = [];
      state.archivedTasks = [];
      state.events = [];
      state.floatingGoals = [];
      state.gcalEvents = [];
      state.gcalCalendars = [];
      state.activeGcalIds = [];
      state.fetchedGcalIds.clear();
      state.filterProject = null;
      state.filterTag = null;
      state.profiles = getDefaultProfiles();
      state.settings = {
        defaultProfileId: 'profile-personal',
        activeProfileId: 'all',
        taskSections: [
          { id: 'sec-todo', name: 'To Do' },
          { id: 'sec-in-progress', name: 'In Progress' },
          { id: 'sec-done', name: 'Done' }
        ],
        projectSections: [
          { id: 'psec-todo', name: 'To Do' },
          { id: 'psec-in-progress', name: 'In Progress' },
          { id: 'psec-done', name: 'Done' }
        ]
      };
      
      renderSidebarProjects();
      renderSidebarTags();
      renderSidebarGcals();
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

  initAuthUI();
}

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
    renderView();
  }
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
    : '<div class="empty-state"><div class="empty-icon"><img src="assets/icons/Mailbox.png" alt="Empty" style="width:30px;height:30px;object-fit:contain;opacity:0.6;" /></div><div class="empty-text">No items scheduled for today</div></div>';
    
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
