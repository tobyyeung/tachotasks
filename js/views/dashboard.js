/**
 * dashboard.js
 * Completely revamped Dashboard view featuring:
 * 1. Top Header with Dashboard title, live current Date & Time, and Quick Links row.
 * 2. Left Column:
 *    - Upcoming Tasks with Date Range Selector (Today, Next 7 Days, Next 30 Days) and 3-tier sorting (Date -> Priority -> Alphabetical).
 *    - Daily Tasks (only tasks that repeat daily).
 * 3. Right Column:
 *    - Today's Schedule (Google Calendar events + local events + today's tasks in chronological order).
 *    - Birthdays (intelligent detection of Google Calendar named "birthday" for the next 30 days).
 */

/**
 * Checks if a task repeats daily.
 * @param {Object} task 
 * @returns {boolean}
 */
function isDailyRecurring(task) {
  if (!task) return false;
  const r = task.recurring || task.repeat || task.recurrence;
  if (!r) return false;
  if (typeof r === 'string') {
    const s = r.toLowerCase().trim();
    return s === 'daily' || s === 'day' || s === 'every day' || s === 'everyday';
  }
  if (typeof r === 'object') {
    return r.frequency === 'daily' || r.freq === 'daily' || r.type === 'daily';
  }
  return false;
}

/**
 * Priority sort rank helper (P1: 1, P2: 2, P3: 3, P4: 4, none: 5).
 * @param {string} priority 
 * @returns {number}
 */
function getPrioritySortOrder(priority) {
  if (!priority) return 5;
  const p = String(priority).toUpperCase().trim();
  if (p === 'P1') return 1;
  if (p === 'P2') return 2;
  if (p === 'P3') return 3;
  if (p === 'P4') return 4;
  return 5;
}

/**
 * Formats current date and time (e.g. Thursday, Aug 27 · 5:45 PM).
 * @returns {string}
 */
function getFormattedCurrentDateTime() {
  const now = new Date();
  const dateOptions = { weekday: 'long', month: 'short', day: 'numeric' };
  const datePart = now.toLocaleDateString('en-US', dateOptions);
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${datePart} · ${hours}:${minutes} ${ampm}`;
}

/**
 * Main render function for Dashboard.
 * @returns {string} HTML string
 */
function renderDashboard() {
  const now = new Date();
  const today = getTodayStr();
  const collapsed = (state.settings && state.settings.dashboardCollapsed) || {};

  // Quick helper for collapse buttons
  const getCollapseIcon = (id) => `
    <button class="icon-btn dashboard-collapse-btn" data-collapse-id="${id}" title="Toggle collapse" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);cursor:pointer;color:var(--text-secondary);background:none;border:none;padding:0;">
      <img src="assets/icons/Down.png" alt="Toggle" style="width:14px;height:14px;object-fit:contain;transition:transform 0.2s;transform:${collapsed[id] ? 'rotate(-90deg)' : 'none'};opacity:0.75;" />
    </button>
  `;

  // Global tasks across workspace
  const allTasks = state.tasks || [];
  const incompleteTasks = allTasks.filter(t => !t.completed && !t.isCompleting);

  // Active Upcoming range: 'today', '7' (default), '30'
  const upcomingRange = state.dashboardUpcomingRange || (state.settings && state.settings.dashboardUpcomingRange) || '7';

  // Calculate target range dates
  const maxDateObj = new Date();
  if (upcomingRange === 'today') {
    maxDateObj.setDate(now.getDate());
  } else if (upcomingRange === '30') {
    maxDateObj.setDate(now.getDate() + 30);
  } else {
    // default 7 days
    maxDateObj.setDate(now.getDate() + 7);
  }
  const maxDateStr = toDateStr(maxDateObj);

  // 1. Filter Upcoming Tasks within range
  const upcomingTasks = incompleteTasks.filter(t => {
    const taskDate = t.dueDate || t.plannedDate;
    if (!taskDate) return false;
    if (upcomingRange === 'today') {
      return taskDate <= today;
    }
    // Include overdue tasks and tasks up to maxDateStr
    return taskDate <= maxDateStr;
  });

  // Sort upcoming tasks: 1) Date ASC, 2) Priority (P1 > P2 > P3 > P4 > none), 3) Alphabetical ASC
  upcomingTasks.sort((a, b) => {
    const dateA = a.dueDate || a.plannedDate || '9999-12-31';
    const dateB = b.dueDate || b.plannedDate || '9999-12-31';
    const dateCompare = dateA.localeCompare(dateB);
    if (dateCompare !== 0) return dateCompare;

    const prioCompare = getPrioritySortOrder(a.priority) - getPrioritySortOrder(b.priority);
    if (prioCompare !== 0) return prioCompare;

    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    return titleA.localeCompare(titleB);
  });

  const upcomingHtml = upcomingTasks.length > 0
    ? upcomingTasks.map(t => {
      const pColor = getPriorityColor(t.priority);
      const dueLabel = getDueLabel(t);
      let plannedLabel = '';
      if (t.plannedDate) {
        const timeStr = t.plannedTime ? ' ' + formatTime12(t.plannedTime) : '';
        plannedLabel = `<span class="task-date-pill planned" style="font-size:11px;color:var(--text-secondary);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;" title="Planned Date">📅 ${formatDateShort(t.plannedDate)}${timeStr}</span>`;
      }

      let dueHtml = '';
      if (dueLabel) {
        const dueTimeStr = t.dueTime ? ' ' + formatTime12(t.dueTime) : '';
        dueHtml = `<span class="task-date-pill ${dueLabel.class}" style="font-size:11px;padding:2px 8px;border-radius:4px;" title="Due Date">⏰ ${dueLabel.text}${dueTimeStr}</span>`;
      }

      const locHtml = getTaskLocationHtml(t);

      return `
        <div class="task-item-card list-row ${t.completed ? 'completed' : ''}" data-task-id="${t.id}">
          <div class="task-circle-check" data-task-toggle="${t.id}" style="width:18px;height:18px;border-radius:50%;border:1.5px solid ${pColor || 'rgba(255,255,255,0.35)'};color:${pColor || 'var(--text-primary)'};${t.completed ? 'background:' + (pColor || 'var(--accent)') + '33;' : ''}display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;cursor:pointer;" title="Priority ${t.priority ? t.priority.replace('P', '') : 'Default'}">
            ${t.completed ? '✓' : ''}
          </div>
          <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;" data-task-edit="${t.id}">
            <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
              <div style="font-size:14px;font-weight:400;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escHtml(t.title)}
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);display:flex;align-items:center;gap:6px;">
                ${locHtml}
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${plannedLabel}
              ${dueHtml}
            </div>
          </div>
        </div>
      `;
    }).join('')
    : '<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-text">No upcoming tasks in this timeframe</div></div>';

  // 2. Daily Tasks (Tasks that repeat daily)
  const dailyTasks = allTasks.filter(t => isDailyRecurring(t));
  const dailyIncomplete = dailyTasks.filter(t => !t.completed && !t.isCompleting);
  const dailyCompleted = dailyTasks.filter(t => t.completed || t.isCompleting);

  const dailyHtml = dailyTasks.length > 0
    ? dailyTasks.map(t => {
      const pColor = getPriorityColor(t.priority);
      const isDone = t.completed || t.isCompleting;
      const locHtml = getTaskLocationHtml(t);

      return `
        <div class="task-item-card list-row ${isDone ? 'completed' : ''}" data-task-id="${t.id}">
          <div class="task-circle-check" data-task-toggle="${t.id}" style="width:18px;height:18px;border-radius:50%;border:1.5px solid ${pColor || 'rgba(255,255,255,0.35)'};color:${pColor || 'var(--text-primary)'};${isDone ? 'background:' + (pColor || 'var(--accent)') + '33;' : ''}display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;cursor:pointer;" title="Priority ${t.priority ? t.priority.replace('P', '') : 'Default'}">
            ${isDone ? '✓' : ''}
          </div>
          <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;" data-task-edit="${t.id}">
            <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
              <div style="font-size:14px;font-weight:400;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isDone ? 'text-decoration:line-through;opacity:0.6;' : ''}">
                ${escHtml(t.title)}
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);display:flex;align-items:center;gap:6px;">
                ${locHtml}
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${t.dueTime ? `<span style="font-size:11px;color:var(--text-secondary);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;">⏰ ${formatTime12(t.dueTime)}</span>` : ''}
              <span style="font-size:11px;color:var(--accent);background:rgba(72,219,251,0.08);padding:2px 6px;border-radius:4px;">Daily</span>
            </div>
          </div>
        </div>
      `;
    }).join('')
    : '<div class="empty-state"><div class="empty-icon">🔁</div><div class="empty-text">No daily repeating tasks. Set a task repeat to "Every day" to see it here.</div></div>';

  // 3. Today's Schedule: Google Calendar events + local events + today's tasks
  const gcalToday = getActiveGcalEvents()
    .filter(e => e.date === today)
    .map(e => ({ ...e, type: 'gcal_event', sortTime: e.startTime || '00:00' }));

  const localEventsToday = (state.events || [])
    .filter(e => e.date === today)
    .map(e => ({ ...e, type: 'event', sortTime: e.startTime || '00:00' }));

  const todayTasks = allTasks
    .filter(t => (t.dueDate === today || t.plannedDate === today))
    .map(t => {
      const timeStr = t.dueTime || t.plannedTime || '';
      return { ...t, type: 'task', sortTime: timeStr || '23:59', displayTime: timeStr };
    });

  const scheduleItems = [...gcalToday, ...localEventsToday, ...todayTasks].sort((a, b) => {
    return a.sortTime.localeCompare(b.sortTime);
  });

  const scheduleHtml = scheduleItems.length > 0
    ? scheduleItems.map(item => {
      if (item.type === 'gcal_event' || item.type === 'event') {
        const isGcal = item.type === 'gcal_event';
        const cal = (state.gcalCalendars || []).find(c => c.id === item.calendarId);
        const color = cal ? (cal.backgroundColor || cal.color) : 'var(--accent)';
        const timeDisplay = item.startTime ? formatTime12(item.startTime) : 'All Day';
        const durationDisplay = item.startTime
          ? `${formatTime12(item.startTime)}${item.endTime ? ' – ' + formatTime12(item.endTime) : ''}`
          : 'All Day Event';

        return `
          <div class="itinerary-item" data-event-id="${item.id}" style="cursor:pointer;">
            <span class="itinerary-time">${timeDisplay}</span>
            <div class="itinerary-bar" style="background: ${color || 'var(--accent)'};"></div>
            <div class="itinerary-content">
              <div class="itinerary-title">${escHtml(item.title || item.summary || 'Event')}</div>
              <div class="itinerary-meta">
                <span>${durationDisplay}</span>
                <span class="source-badge" style="border-color:${color ? color + '40' : 'var(--border)'};color:${color || 'var(--text-secondary)'};">
                  ${isGcal ? (cal ? escHtml(cal.summary) : 'Google Calendar') : 'Local Event'}
                </span>
              </div>
            </div>
          </div>
        `;
      } else {
        const pColor = getPriorityColor(item.priority);
        const proj = item.projectId ? state.projects.find(p => p.id === item.projectId) : null;
        const timeDisplay = item.displayTime ? formatTime12(item.displayTime) : 'Today';

        return `
          <div class="itinerary-item ${item.completed ? 'completed' : ''}" data-task-id="${item.id}" style="cursor:pointer;">
            <span class="itinerary-time">${timeDisplay}</span>
            <div class="itinerary-bar" style="background: ${pColor || 'var(--accent)'};"></div>
            <div class="itinerary-content">
              <div class="itinerary-title">${escHtml(item.title)}</div>
              <div class="itinerary-meta">
                <span>${item.dueTime ? 'Due ' + formatTime12(item.dueTime) : (item.plannedTime ? 'Planned ' + formatTime12(item.plannedTime) : 'Due Today')}</span>
                ${proj ? `<span class="source-badge" style="color:${proj.color || 'var(--accent)'};border-color:${proj.color}40;">● ${escHtml(proj.name)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      }
    }).join('')
    : '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No schedule items for today</div></div>';

  // 4. Birthday Calendar Detection for Next 30 Days
  const birthdayCal = (state.gcalCalendars || []).find(cal =>
    cal.summary && cal.summary.toLowerCase().includes('birthday')
  );

  let birthdaysHtml = '';
  let birthdayCount = 0;

  if (!birthdayCal) {
    birthdaysHtml = `
      <div class="dashboard-birthday-fallback" style="padding:var(--sp-md);background:var(--bg-glass);border-radius:var(--radius-md);border:1px dashed var(--border);display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;flex-shrink:0;">🎂</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">No Birthday Calendar Found</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.4;">Connect a Google Calendar with "Birthday" in the name to automatically track upcoming celebrations here.</div>
        </div>
      </div>
    `;
  } else {
    // Find all events belonging to the Birthday calendar
    const birthdayEvents = (state.gcalEvents || []).filter(e => e.calendarId === birthdayCal.id);

    // Calculate dates within next 30 days
    const next30Date = new Date();
    next30Date.setDate(now.getDate() + 30);
    const next30Str = toDateStr(next30Date);

    // Match upcoming birthdays in next 30 days
    const upcomingBirthdays = birthdayEvents.filter(e => {
      if (!e.date) return false;
      return e.date >= today && e.date <= next30Str;
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    birthdayCount = upcomingBirthdays.length;

    if (upcomingBirthdays.length === 0) {
      birthdaysHtml = `
        <div class="empty-state">
          <div class="empty-icon">🎂</div>
          <div class="empty-text">No birthdays in the next 30 days</div>
        </div>
      `;
    } else {
      birthdaysHtml = upcomingBirthdays.map(b => {
        let relativeStr = '';
        if (b.date === today) {
          relativeStr = '<span style="color:#ff6b81;font-weight:700;font-size:11px;background:rgba(255,107,129,0.15);padding:2px 8px;border-radius:var(--radius-full);">Today! 🎉</span>';
        } else {
          const bDate = parseDateLocal(b.date);
          const diffDays = Math.round((bDate - parseDateLocal(today)) / (1000 * 60 * 60 * 24));
          relativeStr = `<span style="color:var(--text-secondary);font-size:11px;background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:var(--radius-full);">${formatDateShort(b.date)} (${diffDays === 1 ? 'Tomorrow' : 'In ' + diffDays + ' days'})</span>`;
        }

        return `
          <div class="itinerary-item birthday-item" data-event-id="${b.id}" style="align-items:center;padding:10px 12px;cursor:pointer;">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg, rgba(255,107,129,0.2), rgba(255,165,2,0.2));display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;margin-right:4px;">
              🎁
            </div>
            <div class="itinerary-content" style="min-width:0;">
              <div class="itinerary-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escHtml(b.title || b.summary || 'Birthday')}
              </div>
              <div class="itinerary-meta" style="font-size:11px;color:var(--text-tertiary);">
                ${birthdayCal.summary ? escHtml(birthdayCal.summary) : 'Birthdays'}
              </div>
            </div>
            <div style="margin-left:auto;flex-shrink:0;">
              ${relativeStr}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Quick links configured in settings or fallback defaults
  const customQuickLinks = (state.settings && state.settings.dashboardQuickLinks) || [
    { title: 'Gmail', url: 'https://mail.google.com' },
    { title: 'Google Calendar', url: 'https://calendar.google.com' },
    { title: 'Canvas', url: 'https://canvas.instructure.com' },
    { title: 'GitHub', url: 'https://github.com' }
  ];

  const quickLinksHtml = `
    <div class="dashboard-quick-links" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
      ${customQuickLinks.map(link => `
        <a href="${escAttr(link.url)}" target="_blank" rel="noopener noreferrer" class="quick-link-pill" title="${escAttr(link.url)}">
          <span>${escHtml(link.title)}</span>
          <span style="font-size:10px;opacity:0.6;">↗</span>
        </a>
      `).join('')}
    </div>
  `;

  const sessionBanner = state.sessionExpired
    ? `<div onclick="window.reconnectGoogleCalendar()" style="background:rgba(255,100,100,0.1);color:var(--danger);padding:10px;text-align:center;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);cursor:pointer;margin-bottom:var(--sp-md);border-radius:var(--radius-md);" title="Click to reconnect Google Calendar">⚠️ Google Calendar session expired. <span style="text-decoration:underline;font-weight:700;">Click to reconnect</span></div>`
    : '';

  return `
    <div class="dashboard-view">
      ${sessionBanner}

      <!-- Top Header Row -->
      <div class="dashboard-header-row" style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-md);margin-bottom:var(--sp-lg);flex-wrap:wrap;">
        <div class="dashboard-header-left" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <h1 class="dashboard-title" style="font-size:26px;font-weight:700;letter-spacing:-0.5px;margin:0;color:var(--text-primary);">Dashboard</h1>
          <div class="dashboard-datetime-badge" id="dashboard-datetime-badge" style="font-size:var(--fs-sm);font-weight:500;color:var(--text-secondary);background:var(--bg-glass);padding:4px 12px;border-radius:var(--radius-full);border:1px solid var(--border);">
            ${getFormattedCurrentDateTime()}
          </div>
        </div>
        <div class="dashboard-header-right">
          ${quickLinksHtml}
        </div>
      </div>

      <!-- 2-Column Main Dashboard Grid -->
      <div class="dashboard-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);align-items:start;">
        
        <!-- Left Column: Upcoming Tasks & Daily Tasks -->
        <div class="dashboard-left" style="display:flex;flex-direction:column;gap:var(--sp-lg);">
          
          <!-- Card 1: Upcoming Tasks -->
          <div class="itinerary-card dashboard-card" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);backdrop-filter:blur(20px);">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-md);gap:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                ${getCollapseIcon('upcoming-tasks')}
                <h2 style="font-size:var(--fs-lg);font-weight:600;margin:0;">Upcoming Tasks</h2>
                <span class="card-count" style="font-size:var(--fs-xs);color:var(--text-tertiary);background:var(--bg-glass);padding:2px 8px;border-radius:var(--radius-full);border:1px solid var(--border);">${upcomingTasks.length}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <select class="dashboard-range-select" id="dash-upcoming-range" style="background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 8px;font-size:12px;cursor:pointer;outline:none;">
                  <option value="today" ${upcomingRange === 'today' ? 'selected' : ''}>Today</option>
                  <option value="7" ${upcomingRange === '7' ? 'selected' : ''}>Next 7 Days</option>
                  <option value="30" ${upcomingRange === '30' ? 'selected' : ''}>Next 30 Days</option>
                </select>
              </div>
            </div>
            <div id="collapse-content-upcoming-tasks" class="dashboard-card-content" style="${collapsed['upcoming-tasks'] ? 'display:none;' : ''}">
              <div class="task-section-list" style="display:flex;flex-direction:column;gap:4px;">
                ${upcomingHtml}
              </div>
            </div>
          </div>

          <!-- Card 2: Daily Tasks -->
          <div class="itinerary-card dashboard-card" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);backdrop-filter:blur(20px);">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-md);gap:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                ${getCollapseIcon('daily-tasks')}
                <h2 style="font-size:var(--fs-lg);font-weight:600;margin:0;">Daily Tasks</h2>
                <span class="card-count" style="font-size:var(--fs-xs);color:var(--text-tertiary);background:var(--bg-glass);padding:2px 8px;border-radius:var(--radius-full);border:1px solid var(--border);">${dailyCompleted.length}/${dailyTasks.length}</span>
              </div>
            </div>
            <div id="collapse-content-daily-tasks" class="dashboard-card-content" style="${collapsed['daily-tasks'] ? 'display:none;' : ''}">
              ${dailyTasks.length > 0 ? `
                <div class="daily-progress" style="height:4px;background:var(--bg-glass-strong);border-radius:2px;margin-bottom:var(--sp-md);overflow:hidden;">
                  <div class="daily-progress-bar" style="height:100%;width:${dailyTasks.length > 0 ? Math.round((dailyCompleted.length / dailyTasks.length) * 100) : 0}%;background:var(--accent-gradient);border-radius:2px;transition:width var(--t-slow);"></div>
                </div>
              ` : ''}
              <div class="task-section-list" style="display:flex;flex-direction:column;gap:4px;">
                ${dailyHtml}
              </div>
            </div>
          </div>

        </div>

        <!-- Right Column: Today's Schedule & Birthdays -->
        <div class="dashboard-right" style="display:flex;flex-direction:column;gap:var(--sp-lg);">
          
          <!-- Card 3: Today's Schedule -->
          <div class="itinerary-card dashboard-card" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);backdrop-filter:blur(20px);">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-md);gap:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                ${getCollapseIcon('todays-schedule')}
                <h2 style="font-size:var(--fs-lg);font-weight:600;margin:0;">Today's Schedule</h2>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="card-count" style="font-size:var(--fs-xs);color:var(--text-tertiary);background:var(--bg-glass);padding:2px 8px;border-radius:var(--radius-full);border:1px solid var(--border);">${scheduleItems.length} items</span>
                <button class="icon-btn" id="dash-cal-btn" style="color:var(--text-secondary);width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);cursor:pointer;background:none;border:none;padding:0;" title="Go to Calendar">
                  <img src="assets/icons/Calendar.png" alt="Calendar" style="width:16px;height:16px;object-fit:contain;opacity:0.75;" />
                </button>
              </div>
            </div>
            <div id="collapse-content-todays-schedule" class="dashboard-card-content itinerary-list" style="${collapsed['todays-schedule'] ? 'display:none;' : ''}">
              ${scheduleHtml}
            </div>
          </div>

          <!-- Card 4: Birthdays -->
          <div class="itinerary-card dashboard-card" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);backdrop-filter:blur(20px);">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-md);gap:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                ${getCollapseIcon('birthdays')}
                <h2 style="font-size:var(--fs-lg);font-weight:600;margin:0;">Birthdays</h2>
              </div>
              <span class="card-count" style="font-size:var(--fs-xs);color:var(--text-tertiary);background:var(--bg-glass);padding:2px 8px;border-radius:var(--radius-full);border:1px solid var(--border);">${birthdayCount} next 30 days</span>
            </div>
            <div id="collapse-content-birthdays" class="dashboard-card-content itinerary-list" style="${collapsed['birthdays'] ? 'display:none;' : ''}">
              ${birthdaysHtml}
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}
