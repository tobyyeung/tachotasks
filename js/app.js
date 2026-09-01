// ===== INITIALIZATION =====
async function init() {
  // Load all data from store
  state.archivedTasks = await window.api.getArchivedTasks() || [];
  state.tasks = ensureTaskSchema(await window.api.getTasks());
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

  const defaultProfileImages = {
    'all': 'assets/brand/logo.png',
    'profile-personal': 'assets/profiles/personal.png',
    'profile-work': 'assets/profiles/work.png',
    'profile-school': 'assets/profiles/school.png'
  };

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

  const headerSettingsBtn = document.getElementById('header-settings-btn');
  if (headerSettingsBtn) {
    headerSettingsBtn.addEventListener('click', () => {
      if (state.currentView === 'settings') return;
      state.filterProject = null;
      state.currentView = 'settings';
      persistUIState();
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      renderView();
    });
  }

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


// ===== EVENT LISTENERS (per-view) =====
function attachViewListeners() {
  // Dashboard listeners
  document.querySelectorAll('.floating-reminder').forEach(el => {
    el.addEventListener('click', () => toggleFloatingGoal(el.dataset.goalId));
  });

  document.querySelectorAll('.dashboard-collapse-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.collapseId;
      if (!state.settings.dashboardCollapsed) state.settings.dashboardCollapsed = {};
      const isCollapsed = !state.settings.dashboardCollapsed[id];
      state.settings.dashboardCollapsed[id] = isCollapsed;
      
      const icon = btn.querySelector('img') || btn.querySelector('svg');
      if (icon) icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'none';
      const content = document.getElementById(`collapse-content-${id}`);
      if (content) content.style.display = isCollapsed ? 'none' : '';
      
      const card = btn.closest('.dashboard-card');
      if (card) card.classList.toggle('is-collapsed', isCollapsed);
      
      await window.api.saveSettings(state.settings);
    });
  });

  const upcomingRangeBtn = document.getElementById('dash-upcoming-range-btn');
  const upcomingRangePanel = document.getElementById('dash-upcoming-range-panel');
  if (upcomingRangeBtn && upcomingRangePanel) {
    upcomingRangeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      upcomingRangePanel.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!upcomingRangePanel.contains(e.target) && e.target !== upcomingRangeBtn) {
        upcomingRangePanel.classList.add('hidden');
      }
    });

    upcomingRangePanel.querySelectorAll('[data-dash-range]').forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        state.dashboardUpcomingRange = opt.dataset.dashRange;
        if (!state.settings) state.settings = {};
        state.settings.dashboardUpcomingRange = state.dashboardUpcomingRange;
        await window.api.saveSettings(state.settings);
        persistUIState();
        renderView();
      });
    });
  }

  // Dashboard Splitter Drag Resizing
  const dashSplitter = document.getElementById('dashboard-splitter');
  const dashGrid = document.getElementById('dashboard-grid');
  if (dashSplitter && dashGrid) {
    let isDragging = false;
    let startX = 0;
    const minColumnPx = 280;

    const calculateClampedPercent = (clientX) => {
      const rect = dashGrid.getBoundingClientRect();
      if (rect.width <= 0) return 50;
      const minP = Math.max(25, (minColumnPx / rect.width) * 100);
      const maxP = Math.min(75, 100 - (minColumnPx / rect.width) * 100);
      const effectiveMin = Math.min(minP, maxP);
      const effectiveMax = Math.max(minP, maxP);

      const offsetX = clientX - rect.left;
      let percent = Math.round((offsetX / rect.width) * 100);
      return Math.max(effectiveMin, Math.min(effectiveMax, percent));
    };

    const startDrag = (clientX) => {
      isDragging = true;
      startX = clientX;
      dashSplitter.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const moveDrag = (clientX) => {
      if (!isDragging) return;
      const percent = calculateClampedPercent(clientX);
      dashGrid.style.setProperty('--dash-split-left', `${percent}%`);
      dashGrid.style.setProperty('--dash-split-right', `${100 - percent}%`);
    };

    const stopDrag = async (clientX) => {
      if (!isDragging) return;
      isDragging = false;
      dashSplitter.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const percent = calculateClampedPercent(clientX);
      if (!state.settings) state.settings = {};
      state.settings.dashboardSplitRatio = percent;
      await window.api.saveSettings(state.settings);
    };

    dashSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientX);
    });

    dashSplitter.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        startDrag(e.touches[0].clientX);
      }
    }, { passive: true });

    const handleMouseMove = (e) => {
      if (isDragging) moveDrag(e.clientX);
    };

    const handleTouchMove = (e) => {
      if (isDragging && e.touches && e.touches.length > 0) {
        moveDrag(e.touches[0].clientX);
      }
    };

    const handleMouseUp = (e) => {
      if (isDragging) stopDrag(e.clientX);
    };

    const handleTouchEnd = (e) => {
      if (isDragging) {
        const clientX = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientX : startX;
        stopDrag(clientX);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);
  }

  // Dashboard Widget Drag & Drop Reordering
  const dashCards = document.querySelectorAll('.dashboard-card[data-widget-id]');
  const dashColumns = document.querySelectorAll('.dashboard-widget-column');
  if (dashCards.length > 0) {
    let draggedWidgetId = null;

    dashCards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        if (e.target.closest('button, select, input, a, .itinerary-item, .sort-dropdown-panel, .sort-dropdown-btn')) {
          e.preventDefault();
          return;
        }
        draggedWidgetId = card.dataset.widgetId;
        card.classList.add('widget-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/dash-widget', draggedWidgetId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('widget-dragging');
        draggedWidgetId = null;
        document.querySelectorAll('.dashboard-card').forEach(c => {
          c.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        document.querySelectorAll('.dashboard-widget-column').forEach(col => {
          col.classList.remove('drag-over-column');
        });
      });

      card.addEventListener('dragover', (e) => {
        if (!draggedWidgetId || draggedWidgetId === card.dataset.widgetId) return;
        e.preventDefault();
        e.stopPropagation();

        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          card.classList.add('drag-over-top');
          card.classList.remove('drag-over-bottom');
        } else {
          card.classList.add('drag-over-bottom');
          card.classList.remove('drag-over-top');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      card.addEventListener('drop', async (e) => {
        if (!draggedWidgetId || draggedWidgetId === card.dataset.widgetId) return;
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over-top', 'drag-over-bottom');

        const targetWidgetId = card.dataset.widgetId;
        const rect = card.getBoundingClientRect();
        const insertBefore = e.clientY < (rect.top + rect.height / 2);

        const knownWidgets = ['upcoming-tasks', 'daily-tasks', 'todays-schedule', 'birthdays'];
        let layout = state.settings.dashboardLayout || {};
        let left = Array.isArray(layout.left) ? [...layout.left].filter(id => knownWidgets.includes(id)) : ['upcoming-tasks', 'daily-tasks'];
        let right = Array.isArray(layout.right) ? [...layout.right].filter(id => knownWidgets.includes(id)) : ['todays-schedule', 'birthdays'];

        const placed = new Set([...left, ...right]);
        knownWidgets.forEach(id => {
          if (!placed.has(id)) {
            if (id === 'upcoming-tasks' || id === 'daily-tasks') left.push(id);
            else right.push(id);
          }
        });

        const sourceCol = left.includes(draggedWidgetId) ? 'left' : 'right';
        const targetCol = left.includes(targetWidgetId) ? 'left' : 'right';

        if (sourceCol === targetCol) {
          // Within same column: Swap / Switch positions
          const list = sourceCol === 'left' ? left : right;
          const fromIdx = list.indexOf(draggedWidgetId);
          const toIdx = list.indexOf(targetWidgetId);
          if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
            const [moved] = list.splice(fromIdx, 1);
            list.splice(toIdx, 0, moved);
          }
        } else {
          // Across columns
          const srcList = sourceCol === 'left' ? left : right;
          const destList = targetCol === 'left' ? left : right;
          const fromIdx = srcList.indexOf(draggedWidgetId);
          const toIdx = destList.indexOf(targetWidgetId);
          if (fromIdx !== -1) {
            const [moved] = srcList.splice(fromIdx, 1);
            if (toIdx !== -1) {
              const destIdx = insertBefore ? toIdx : toIdx + 1;
              destList.splice(destIdx, 0, moved);
            } else {
              destList.push(moved);
            }
          }
        }

        if (!state.settings) state.settings = {};
        state.settings.dashboardLayout = { left, right };
        await window.api.saveSettings(state.settings);
        renderView();
      });
    });

    dashColumns.forEach(col => {
      col.addEventListener('dragover', (e) => {
        if (!draggedWidgetId) return;
        e.preventDefault();
        col.classList.add('drag-over-column');
      });

      col.addEventListener('dragleave', (e) => {
        if (!col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over-column');
        }
      });

      col.addEventListener('drop', async (e) => {
        if (!draggedWidgetId) return;
        if (e.defaultPrevented) return;
        e.preventDefault();
        col.classList.remove('drag-over-column');

        const targetColumn = col.dataset.dashColumn || 'left';
        const knownWidgets = ['upcoming-tasks', 'daily-tasks', 'todays-schedule', 'birthdays'];
        let layout = state.settings.dashboardLayout || {};
        let left = Array.isArray(layout.left) ? [...layout.left].filter(id => knownWidgets.includes(id)) : ['upcoming-tasks', 'daily-tasks'];
        let right = Array.isArray(layout.right) ? [...layout.right].filter(id => knownWidgets.includes(id)) : ['todays-schedule', 'birthdays'];

        const placed = new Set([...left, ...right]);
        knownWidgets.forEach(id => {
          if (!placed.has(id)) {
            if (id === 'upcoming-tasks' || id === 'daily-tasks') left.push(id);
            else right.push(id);
          }
        });

        const sourceCol = left.includes(draggedWidgetId) ? 'left' : 'right';
        const srcList = sourceCol === 'left' ? left : right;
        const destList = targetColumn === 'left' ? left : right;

        const fromIdx = srcList.indexOf(draggedWidgetId);
        if (fromIdx !== -1) {
          const [moved] = srcList.splice(fromIdx, 1);
          destList.push(moved);
        }

        if (!state.settings) state.settings = {};
        state.settings.dashboardLayout = { left, right };
        await window.api.saveSettings(state.settings);
        renderView();
      });
    });
  }

  // Dashboard Quick Sticky Note
  const quickNoteBtn = document.getElementById('dash-quick-note-btn');
  const stickyPopover = document.getElementById('dashboard-sticky-popover');
  const stickyTextarea = document.getElementById('dashboard-sticky-textarea');
  const stickyCloseBtn = document.getElementById('sticky-close-btn');
  const stickySaveIndicator = document.getElementById('sticky-save-indicator');
  const stickyHeader = stickyPopover ? stickyPopover.querySelector('.sticky-header') : null;

  if (quickNoteBtn && stickyPopover) {
    let saveTimeout = null;

    const setStickyPosition = (x, y) => {
      const popoverWidth = stickyPopover.offsetWidth || 320;
      const popoverHeight = stickyPopover.offsetHeight || 250;
      const clampedX = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, x));
      const clampedY = Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, y));
      stickyPopover.style.position = 'fixed';
      stickyPopover.style.left = clampedX + 'px';
      stickyPopover.style.top = clampedY + 'px';
      stickyPopover.style.right = 'auto';
      stickyPopover.style.bottom = 'auto';
      return { x: clampedX, y: clampedY };
    };

    const showSticky = () => {
      stickyPopover.classList.remove('hidden');
      const savedPos = state.settings && state.settings.quickNotePos;
      if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
        setStickyPosition(savedPos.x, savedPos.y);
      } else {
        const rect = quickNoteBtn.getBoundingClientRect();
        setStickyPosition(rect.left, rect.bottom + 8);
      }
      if (stickyTextarea) {
        stickyTextarea.focus();
        stickyTextarea.setSelectionRange(stickyTextarea.value.length, stickyTextarea.value.length);
      }
    };

    const hideSticky = () => {
      stickyPopover.classList.add('hidden');
    };

    quickNoteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (stickyPopover.classList.contains('hidden')) {
        showSticky();
      } else {
        hideSticky();
      }
    });

    if (stickyCloseBtn) {
      stickyCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideSticky();
      });
    }

    stickyPopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Make Sticky Note Draggable via Header
    if (stickyHeader) {
      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      const onDragStart = (clientX, clientY) => {
        isDragging = true;
        stickyHeader.classList.add('is-dragging');
        const rect = stickyPopover.getBoundingClientRect();
        startX = clientX;
        startY = clientY;
        initialLeft = rect.left;
        initialTop = rect.top;
      };

      const onDragMove = (clientX, clientY) => {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        setStickyPosition(initialLeft + dx, initialTop + dy);
      };

      const onDragEnd = async () => {
        if (!isDragging) return;
        isDragging = false;
        stickyHeader.classList.remove('is-dragging');
        const rect = stickyPopover.getBoundingClientRect();
        if (!state.settings) state.settings = {};
        state.settings.quickNotePos = { x: rect.left, y: rect.top };
        await window.api.saveSettings(state.settings);
      };

      stickyHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, select, textarea')) return;
        onDragStart(e.clientX, e.clientY);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDragging) {
          e.preventDefault();
          onDragMove(e.clientX, e.clientY);
        }
      });

      window.addEventListener('mouseup', onDragEnd);

      stickyHeader.addEventListener('touchstart', (e) => {
        if (e.target.closest('button, input, select, textarea')) return;
        if (e.touches && e.touches.length > 0) {
          onDragStart(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches && e.touches.length > 0) {
          onDragMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      window.addEventListener('touchend', onDragEnd);
    }

    if (stickyTextarea) {
      stickyTextarea.addEventListener('input', () => {
        if (stickySaveIndicator) stickySaveIndicator.textContent = 'Saving...';
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          if (!state.settings) state.settings = {};
          if (!state.settings.quickNote || typeof state.settings.quickNote !== 'object') {
            state.settings.quickNote = { text: '', color: 'yellow' };
          }
          state.settings.quickNote.text = stickyTextarea.value;
          state.settings.quickNote.updatedAt = new Date().toISOString();
          await window.api.saveSettings(state.settings);
          if (stickySaveIndicator) stickySaveIndicator.textContent = 'Saved ✓';
        }, 300);
      });
    }

    document.querySelectorAll('.sticky-color-dot').forEach(dot => {
      dot.addEventListener('click', async (e) => {
        e.stopPropagation();
        const color = dot.dataset.noteColor;
        if (!color) return;

        document.querySelectorAll('.sticky-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');

        ['yellow', 'blue', 'green', 'dark'].forEach(c => {
          stickyPopover.classList.remove('theme-' + c);
        });
        stickyPopover.classList.add('theme-' + color);

        if (!state.settings) state.settings = {};
        if (!state.settings.quickNote || typeof state.settings.quickNote !== 'object') {
          state.settings.quickNote = { text: '', color: 'yellow' };
        }
        state.settings.quickNote.color = color;
        await window.api.saveSettings(state.settings);
      });
    });
  }

  document.querySelectorAll('.itinerary-item[data-event-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = el.dataset.eventId;
      const eventType = el.dataset.eventType || (state.gcalEvents.some(g => g.id === eventId) ? 'gcal_event' : 'event');
      if (typeof showEventPopover === 'function') {
        showEventPopover(eventId, eventType, el);
      }
    });
  });

  document.querySelectorAll('.itinerary-item[data-task-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof showTaskModal === 'function') {
        showTaskModal(el.dataset.taskId);
      }
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
      persistUIState();
      renderView();
    });
  });

  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.tasksViewMode = btn.dataset.tasksView;
      persistUIState();
      renderView();
    });
  });

  document.querySelectorAll('[data-filter-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.filterTag;
      state.filterTag = state.filterTag === tag ? null : tag;
      persistUIState();
      renderView();
    });
  });

  // Completed tasks collapsible accordions (Per-section in Tasks view & Project view)
  document.querySelectorAll('[data-toggle-section-completed]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const secId = btn.dataset.toggleSectionCompleted;
      if (!state.settings) state.settings = {};
      if (!state.settings.completedSectionsOpen) state.settings.completedSectionsOpen = {};
      state.settings.completedSectionsOpen[secId] = !state.settings.completedSectionsOpen[secId];
      await window.api.saveSettings(state.settings);
      renderView();
    });
  });

  const toggleProjCompletedBtn = document.getElementById('toggle-project-completed-btn');
  if (toggleProjCompletedBtn) {
    toggleProjCompletedBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!state.settings) state.settings = {};
      state.settings.projectCompletedOpen = !state.settings.projectCompletedOpen;
      await window.api.saveSettings(state.settings);
      renderView();
    });
  }

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
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (state.currentView === 'project' && state.filterProject) {
        showTaskModal(null, { projectId: state.filterProject });
      } else {
        showTaskModal(null);
      }
    });
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
      persistUIState();
      renderView();
    });
  });

  if (calPrev) calPrev.addEventListener('click', () => {
    const mode = state.calendarViewMode || 'weekly';
    if (mode === 'daily') state.calendarDate.setDate(state.calendarDate.getDate() - 1);
    else if (mode === 'monthly' || mode === 'schedule') state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    else state.calendarDate.setDate(state.calendarDate.getDate() - 7);
    persistUIState();
    renderView();
  });
  if (calNext) calNext.addEventListener('click', () => {
    const mode = state.calendarViewMode || 'weekly';
    if (mode === 'daily') state.calendarDate.setDate(state.calendarDate.getDate() + 1);
    else if (mode === 'monthly' || mode === 'schedule') state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    else state.calendarDate.setDate(state.calendarDate.getDate() + 7);
    persistUIState();
    renderView();
  });
  if (calToday) calToday.addEventListener('click', () => {
    state.calendarDate = new Date();
    persistUIState();
    renderView();
  });

  // Calendar View Mode Selector
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.calendarViewMode = btn.dataset.calView;
      persistUIState();
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
          <h2 style="font-size:16px;margin-bottom:14px;font-weight:600;">Add Section</h2>
          <div style="margin-bottom:12px;">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;font-weight:500;">Section Name</label>
            <input type="text" id="modal-section-name" placeholder="e.g. CS374" style="width:100%;padding:8px 12px;background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);outline:none;font-size:13px;" />
          </div>
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;font-weight:500;">Website / Link (optional)</label>
            <input type="text" id="modal-section-link" placeholder="e.g. https://canvas.illinois.edu" style="width:100%;padding:8px 12px;background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);outline:none;font-size:13px;" />
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="modal-cancel-section" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;font-size:13px;">Cancel</button>
            <button id="modal-confirm-section" class="btn-primary" style="padding:6px 16px;border-radius:var(--radius-sm);cursor:pointer;font-size:13px;">Add</button>
          </div>
        </div>
      `;
      openModal(html);
      
      const submit = async () => {
        const name = document.getElementById('modal-section-name').value.trim();
        let link = (document.getElementById('modal-section-link')?.value || '').trim();
        if (link && !link.startsWith('http://') && !link.startsWith('https://')) {
          link = 'https://' + link;
        }
        if (name) {
          if (!state.settings.taskSections) state.settings.taskSections = [];
          state.settings.taskSections.push({
            id: 'sec-' + generateId(),
            name,
            link: link || null,
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
      document.getElementById('modal-section-link')?.addEventListener('keydown', (e) => {
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

  // Section Options Menu (Edit, Duplicate, Archive, Delete)
  document.querySelectorAll('.delete-section-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSectionMenu(btn.dataset.sectionId, btn);
    });
  });

  // Project Options Menu (Header button and right-click)
  document.querySelectorAll('.project-options-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      openProjectContextMenu(rect.left, rect.bottom + 4, btn.dataset.projectId);
    });
  });

  document.querySelectorAll('.project-header-bar').forEach(header => {
    header.addEventListener('contextmenu', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      e.preventDefault();
      openProjectContextMenu(e.clientX, e.clientY, header.dataset.projectId);
    });
  });

  // Restore archived project
  document.querySelectorAll('.unarchive-proj-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const projId = btn.dataset.projectId;
      const proj = state.projects.find(p => p.id === projId);
      if (proj) {
        proj.archived = false;
        delete proj.archivedAt;
        proj.updatedAt = new Date().toISOString();
        await window.api.saveProjects(state.projects);
        showToast(`Project "${proj.name}" restored`, 'success');
        renderSidebarProjects();
        renderView();
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

  // Settings: Quick Links Add
  const addQuickLinkSettingsBtn = document.getElementById('add-quick-link-settings-btn');
  if (addQuickLinkSettingsBtn) {
    addQuickLinkSettingsBtn.addEventListener('click', async () => {
      const titleInput = document.getElementById('new-quick-link-title');
      const urlInput = document.getElementById('new-quick-link-url');
      const title = titleInput.value.trim();
      let url = urlInput.value.trim();
      if (!title || !url) return showToast('Title and URL required', 'error');

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      if (!state.settings.dashboardQuickLinks) {
        state.settings.dashboardQuickLinks = [
          { title: 'Gmail', url: 'https://mail.google.com' },
          { title: 'Google Calendar', url: 'https://calendar.google.com' },
          { title: 'Canvas', url: 'https://canvas.instructure.com' },
          { title: 'GitHub', url: 'https://github.com' }
        ];
      }
      state.settings.dashboardQuickLinks.push({ title, url });
      await window.api.saveSettings(state.settings);
      showToast('Quick link added', 'success');
      renderView();
    });
  }

  // Settings: Quick Links Edit In-Place
  document.querySelectorAll('.quick-link-edit-title, .quick-link-edit-url').forEach(input => {
    input.addEventListener('change', async (e) => {
      const idx = parseInt(e.target.dataset.linkIdx, 10);
      if (!state.settings.dashboardQuickLinks || !state.settings.dashboardQuickLinks[idx]) return;
      const row = e.target.closest('.settings-quick-link-row');
      if (!row) return;
      const title = row.querySelector('.quick-link-edit-title')?.value.trim() || 'Link';
      let url = row.querySelector('.quick-link-edit-url')?.value.trim() || 'https://';
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      state.settings.dashboardQuickLinks[idx] = { title, url };
      await window.api.saveSettings(state.settings);
      showToast('Quick link updated', 'success');
    });
  });

  // Settings: Quick Links Delete
  document.querySelectorAll('.delete-quick-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.linkIdx, 10);
      if (!state.settings.dashboardQuickLinks) {
        state.settings.dashboardQuickLinks = [
          { title: 'Gmail', url: 'https://mail.google.com' },
          { title: 'Google Calendar', url: 'https://calendar.google.com' },
          { title: 'Canvas', url: 'https://canvas.instructure.com' },
          { title: 'GitHub', url: 'https://github.com' }
        ];
      }
      state.settings.dashboardQuickLinks.splice(idx, 1);
      await window.api.saveSettings(state.settings);
      showToast('Quick link removed', 'success');
      renderView();
    });
  });

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
        if (window.api && window.api.recordTombstone) {
          window.api.recordTombstone(pId, 'profile');
        }
        state.profiles = state.profiles.filter(p => p.id !== pId);
        if (state.activeProfileId === pId) state.activeProfileId = 'all';
        state.settings.activeProfileId = state.activeProfileId;
        
        // Remove categories from projects that used this profile
        state.projects.forEach(p => {
          if (p.profileId === pId) {
            p.profileId = null;
            p.updatedAt = new Date().toISOString();
          }
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

  // Settings: Sync with Cloud Now
  const settingsSyncBtn = document.getElementById('settings-sync-cloud-btn');
  if (settingsSyncBtn) {
    settingsSyncBtn.addEventListener('click', async () => {
      const originalHtml = settingsSyncBtn.innerHTML;
      settingsSyncBtn.innerHTML = '<img src="assets/icons/Refresh.png" alt="Sync" style="width:16px;height:16px;object-fit:contain;filter:brightness(10);animation:spin 0.8s linear infinite;" /> Syncing...';
      settingsSyncBtn.disabled = true;
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
        showToast('Synced with Firebase Cloud!', 'success');
        renderView();
      } catch (err) {
        console.error('Settings cloud sync failed:', err);
        showToast('Sync failed: ' + err.message, 'error');
        setSyncStatus('offline');
      } finally {
        settingsSyncBtn.innerHTML = originalHtml;
        settingsSyncBtn.disabled = false;
      }
    });
  }

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
