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

  // Global tasks across workspace, excluding deactivated projects
  const allTasks = (state.tasks || []).filter(t => !t.projectId || isProjectActive(t.projectId));
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
        plannedLabel = `<span class="task-date-pill planned" title="Planned Date"><img src="assets/icons/Calendar.png" alt="Planned" style="width:12px;height:12px;object-fit:contain;vertical-align:-1px;margin-right:3px;" />${formatDateShort(t.plannedDate)}${timeStr}</span>`;
      }

      let dueHtml = '';
      if (dueLabel) {
        const dueTimeStr = t.dueTime ? ' ' + formatTime12(t.dueTime) : '';
        const clockIcon = dueLabel.showClock ? '<img src="assets/icons/Clock.png" alt="Due" style="width:12px;height:12px;object-fit:contain;vertical-align:-1px;margin-right:3px;" />' : '';
        dueHtml = `<span class="task-date-pill ${dueLabel.class}" title="Due Date">${clockIcon}${dueLabel.text}${dueTimeStr}</span>`;
      }

      const dateDivider = (plannedLabel && dueHtml) ? '<span class="task-date-divider" style="color:var(--text-tertiary);opacity:0.4;font-size:11px;user-select:none;">|</span>' : '';
      const locHtml = getTaskLocationHtml(t);
      const isDone = Boolean(t.completed || t.isCompleting);
      const isCompleting = Boolean(t.isCompleting);

      return `
        <div class="task-item-card list-row ${isDone ? 'completed' : ''} ${isCompleting ? 'is-completing' : ''}" data-task-id="${t.id}">
          <div class="task-circle-check ${isDone ? 'checked' : ''}" data-task-toggle="${t.id}" style="width:18px;height:18px;border-radius:50%;border:1.5px solid ${pColor || (isDone ? 'var(--accent)' : 'rgba(255,255,255,0.35)')};color:${pColor || 'var(--text-primary)'};${isDone ? 'background:' + (pColor || 'var(--accent)') + '40;' : ''}display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;cursor:pointer;transition:all 0.2s ease;" title="${isDone ? 'Mark Incomplete' : `Priority ${t.priority ? t.priority.replace('P', '') : 'Default'}`}">
            ${isDone ? '<span class="task-check-mark">✓</span>' : ''}
          </div>
          <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;" data-task-edit="${t.id}">
            <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
              <div style="font-size:14px;font-weight:400;color:${isDone ? 'var(--text-tertiary)' : 'var(--text-primary)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isDone ? 'text-decoration:line-through;opacity:0.6;' : ''};transition:all 0.2s ease;">
                ${escHtml(t.title)}
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);display:flex;align-items:center;gap:6px;">
                ${locHtml}
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;margin-left:auto;opacity:${isDone ? '0.6' : '1'};">
              ${plannedLabel}
              ${dateDivider}
              ${dueHtml}
            </div>
          </div>
        </div>
      `;
    }).join('')
    : '<div class="empty-state"><div class="empty-icon"><img src="assets/icons/Star.png" alt="Empty" style="width:28px;height:28px;object-fit:contain;opacity:0.6;" /></div><div class="empty-text">No upcoming tasks in this timeframe</div></div>';

  // 2. Daily Tasks (Tasks that repeat daily)
  const allDailyTasks = allTasks.filter(t => isDailyRecurring(t));
  const activeDailyTasks = allDailyTasks.filter(t => !t.dueDate || t.dueDate <= today || t.isCompleting);
  
  // Also include completed instances for today from archive
  const archivedDailyCompletedToday = (state.archivedTasks || []).filter(t => {
    if (!t.completed || !t.completedAt || !t.completedAt.startsWith(today)) return false;
    return isDailyRecurring(t) || t.isRecurringInstance;
  });

  const dailyTasks = [...activeDailyTasks, ...archivedDailyCompletedToday];
  const dailyIncomplete = activeDailyTasks.filter(t => !t.completed && !t.isCompleting);
  const dailyCompleted = [...activeDailyTasks.filter(t => t.completed || t.isCompleting), ...archivedDailyCompletedToday];
  const totalDailyTasksCount = Math.max(allDailyTasks.length, dailyTasks.length);
  const dailyCompletedCount = dailyCompleted.length;

  const dailyHtml = dailyTasks.length > 0
    ? dailyTasks.map(t => {
      const pColor = getPriorityColor(t.priority);
      const isDone = Boolean(t.completed || t.isCompleting);
      const isCompleting = Boolean(t.isCompleting);
      const locHtml = getTaskLocationHtml(t);

      return `
        <div class="task-item-card list-row ${isDone ? 'completed' : ''} ${isCompleting ? 'is-completing' : ''}" data-task-id="${t.id}">
          <div class="task-circle-check ${isDone ? 'checked' : ''}" data-task-toggle="${t.id}" style="width:18px;height:18px;border-radius:50%;border:1.5px solid ${pColor || (isDone ? 'var(--accent)' : 'rgba(255,255,255,0.35)')};color:${pColor || 'var(--text-primary)'};${isDone ? 'background:' + (pColor || 'var(--accent)') + '40;' : ''}display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;cursor:pointer;transition:all 0.2s ease;" title="${isDone ? 'Mark Incomplete' : `Priority ${t.priority ? t.priority.replace('P', '') : 'Default'}`}">
            ${isDone ? '<span class="task-check-mark">✓</span>' : ''}
          </div>
          <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;" data-task-edit="${t.id}">
            <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
              <div style="font-size:14px;font-weight:400;color:${isDone ? 'var(--text-tertiary)' : 'var(--text-primary)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isDone ? 'text-decoration:line-through;opacity:0.6;' : ''};transition:all 0.2s ease;">
                ${escHtml(t.title)}
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);display:flex;align-items:center;gap:6px;">
                ${locHtml}
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;margin-left:auto;">
              ${t.dueTime ? `<span style="font-size:11px;color:var(--text-secondary);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;"><img src="assets/icons/Clock.png" alt="Due" style="width:11px;height:11px;object-fit:contain;vertical-align:-1px;margin-right:3px;" />${formatTime12(t.dueTime)}</span>` : ''}
              <span style="font-size:11px;color:var(--accent);background:rgba(72,219,251,0.08);padding:2px 6px;border-radius:4px;">Daily</span>
            </div>
          </div>
        </div>
      `;
    }).join('')
    : (allDailyTasks.length > 0
        ? '<div class="empty-state" style="padding:var(--sp-lg);"><div class="empty-icon"><img src="assets/icons/Party.png" alt="Done" style="width:28px;height:28px;object-fit:contain;" /></div><div class="empty-text" style="color:var(--accent);font-weight:600;">All daily tasks completed for today!</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">Next occurrences scheduled for tomorrow</div></div>'
        : '<div class="empty-state"><div class="empty-icon"><img src="assets/icons/Repeat.png" alt="Repeat" style="width:28px;height:28px;object-fit:contain;opacity:0.6;" /></div><div class="empty-text">No daily repeating tasks. Set a task repeat to "Every day" to see it here.</div></div>');

  // 3. Today's Schedule: Google Calendar events + local events + today's tasks
  const gcalToday = getActiveGcalEvents()
    .filter(e => e.date === today)
    .map(e => ({ ...e, type: 'gcal_event', isAllDay: !e.startTime, sortTime: e.startTime || '' }));

  const localEventsToday = (state.events || [])
    .filter(e => e.date === today)
    .map(e => ({ ...e, type: 'event', isAllDay: !e.startTime, sortTime: e.startTime || '' }));

  const todayTasks = allTasks
    .filter(t => (t.dueDate === today || t.plannedDate === today))
    .map(t => {
      const timeStr = t.dueTime || t.plannedTime || '';
      return { ...t, type: 'task', isAllDay: !timeStr, sortTime: timeStr, displayTime: timeStr };
    });

  const scheduleItems = [...gcalToday, ...localEventsToday, ...todayTasks].sort((a, b) => {
    // 1. All Day / Untimed "Today" items appear at the very top
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;

    // 2. If both have specific times, sort chronologically
    if (!a.isAllDay && !b.isAllDay) {
      const timeCompare = a.sortTime.localeCompare(b.sortTime);
      if (timeCompare !== 0) return timeCompare;
    }

    // 3. Ties / All-day items: sort by Priority (P1 > P2 > P3 > P4 > none), then Alphabetically
    const prioA = getPrioritySortOrder(a.priority);
    const prioB = getPrioritySortOrder(b.priority);
    if (prioA !== prioB) return prioA - prioB;

    const titleA = (a.title || a.summary || '').toLowerCase();
    const titleB = (b.title || b.summary || '').toLowerCase();
    return titleA.localeCompare(titleB);
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
    : '<div class="empty-state"><div class="empty-icon"><img src="assets/icons/Mailbox.png" alt="Empty" style="width:30px;height:30px;object-fit:contain;opacity:0.6;" /></div><div class="empty-text">No schedule items for today</div></div>';

  // 4. Birthday Calendar Detection for Next 30 Days
  const birthdayCal = (state.gcalCalendars || []).find(cal =>
    cal.summary && cal.summary.toLowerCase().includes('birthday')
  );

  let birthdaysHtml = '';
  let birthdayCount = 0;

  if (!birthdayCal) {
    birthdaysHtml = `
      <div class="dashboard-birthday-fallback" style="padding:var(--sp-md);background:var(--bg-glass);border-radius:var(--radius-md);border:1px dashed var(--border);display:flex;align-items:center;gap:12px;">
        <img src="assets/icons/Gift.png" alt="Birthday" style="width:24px;height:24px;object-fit:contain;flex-shrink:0;" />
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
          <div class="empty-icon"><img src="assets/icons/Gift.png" alt="Birthday" style="width:30px;height:30px;object-fit:contain;opacity:0.6;" /></div>
          <div class="empty-text">No birthdays in the next 30 days</div>
        </div>
      `;
    } else {
      birthdaysHtml = upcomingBirthdays.map(b => {
        let relativeStr = '';
        if (b.date === today) {
          relativeStr = '<span style="color:#ff6b81;font-weight:700;font-size:11px;background:rgba(255,107,129,0.15);padding:2px 8px;border-radius:var(--radius-full);display:inline-flex;align-items:center;gap:3px;">Today! <img src="assets/icons/Party.png" alt="Party" style="width:12px;height:12px;object-fit:contain;" /></span>';
        } else {
          const bDate = parseDateLocal(b.date);
          const diffDays = Math.round((bDate - parseDateLocal(today)) / (1000 * 60 * 60 * 24));
          relativeStr = `<span style="color:var(--text-secondary);font-size:11px;background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:var(--radius-full);">${formatDateShort(b.date)} (${diffDays === 1 ? 'Tomorrow' : 'In ' + diffDays + ' days'})</span>`;
        }

        return `
          <div class="itinerary-item birthday-item" data-event-id="${b.id}" style="align-items:center;padding:10px 12px;cursor:pointer;">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg, rgba(255,107,129,0.2), rgba(255,165,2,0.2));display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:4px;">
              <img src="assets/icons/Gift.png" alt="Birthday" style="width:18px;height:18px;object-fit:contain;" />
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
          <img src="assets/icons/Link.png" alt="Link" style="width:10px;height:10px;object-fit:contain;opacity:0.6;" />
        </a>
      `).join('')}
    </div>
  `;

  const sessionBanner = state.sessionExpired
    ? `<div onclick="window.reconnectGoogleCalendar()" style="background:rgba(255,100,100,0.1);color:var(--danger);padding:10px;text-align:center;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);cursor:pointer;margin-bottom:var(--sp-md);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;gap:6px;" title="Click to reconnect Google Calendar"><img src="assets/icons/Caution.png" alt="Warning" style="width:14px;height:14px;object-fit:contain;" /> Google Calendar session expired. <span style="text-decoration:underline;font-weight:700;">Click to reconnect</span></div>`
    : '';

  const splitRatio = (state.settings && state.settings.dashboardSplitRatio) !== undefined ? state.settings.dashboardSplitRatio : 50;

  const allWidgets = {
    'upcoming-tasks': `
      <!-- Card 1: Upcoming Tasks -->
      <div class="itinerary-card dashboard-card ${collapsed['upcoming-tasks'] ? 'is-collapsed' : ''}" draggable="true" data-widget-id="upcoming-tasks" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);backdrop-filter:blur(20px);position:relative;">
        <span class="card-drag-handle" title="Drag to move widget">⋮⋮</span>
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            ${getCollapseIcon('upcoming-tasks')}
            <h2 style="font-size:var(--fs-lg);font-weight:600;margin:0;">Upcoming Tasks</h2>
            <span class="card-count" style="font-size:var(--fs-xs);color:var(--text-tertiary);background:var(--bg-glass);padding:2px 8px;border-radius:var(--radius-full);border:1px solid var(--border);">${upcomingTasks.length}</span>
          </div>
          <div class="sort-dropdown-wrapper" id="dash-upcoming-dropdown-wrapper">
            <button class="sort-dropdown-btn" id="dash-upcoming-range-btn" style="padding:4px 10px;font-size:12px;display:flex;align-items:center;gap:6px;">
              <span>${upcomingRange === 'today' ? 'Today' : (upcomingRange === '30' ? 'Next 30 Days' : 'Next 7 Days')}</span>
              <img src="assets/icons/Down.png" alt="▼" style="width:10px;height:10px;object-fit:contain;opacity:0.75;" />
            </button>
            <div class="sort-dropdown-panel hidden" id="dash-upcoming-range-panel" style="min-width:140px;right:0;z-index:1000;">
              <div class="sort-option ${upcomingRange === 'today' ? 'active' : ''}" data-dash-range="today">
                <span>Today</span>
                ${upcomingRange === 'today' ? '<img src="assets/icons/Checkmark.png" alt="✓" style="width:12px;height:12px;object-fit:contain;" />' : ''}
              </div>
              <div class="sort-option ${upcomingRange === '7' ? 'active' : ''}" data-dash-range="7">
                <span>Next 7 Days</span>
                ${upcomingRange === '7' ? '<img src="assets/icons/Checkmark.png" alt="✓" style="width:12px;height:12px;object-fit:contain;" />' : ''}
              </div>
              <div class="sort-option ${upcomingRange === '30' ? 'active' : ''}" data-dash-range="30">
                <span>Next 30 Days</span>
                ${upcomingRange === '30' ? '<img src="assets/icons/Checkmark.png" alt="✓" style="width:12px;height:12px;object-fit:contain;" />' : ''}
              </div>
            </div>
          </div>
        </div>
        <div id="collapse-content-upcoming-tasks" class="dashboard-card-content" style="${collapsed['upcoming-tasks'] ? 'display:none;' : ''}">
          <div class="task-section-list" style="display:flex;flex-direction:column;gap:2px;">
            ${upcomingHtml}
          </div>
        </div>
      </div>
    `,
    'daily-tasks': `
      <!-- Card 2: Daily Tasks -->
      <div class="itinerary-card dashboard-card ${collapsed['daily-tasks'] ? 'is-collapsed' : ''}" draggable="true" data-widget-id="daily-tasks" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);backdrop-filter:blur(20px);position:relative;">
        <span class="card-drag-handle" title="Drag to move widget">⋮⋮</span>
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            ${getCollapseIcon('daily-tasks')}
            <h2 style="font-size:var(--fs-lg);font-weight:600;margin:0;">Daily Tasks</h2>
            <span class="card-count" style="font-size:var(--fs-xs);color:var(--text-tertiary);background:var(--bg-glass);padding:2px 8px;border-radius:var(--radius-full);border:1px solid var(--border);">${dailyCompletedCount}/${totalDailyTasksCount}</span>
          </div>
        </div>
        <div id="collapse-content-daily-tasks" class="dashboard-card-content" style="${collapsed['daily-tasks'] ? 'display:none;' : ''}">
          ${totalDailyTasksCount > 0 ? `
            <div class="daily-progress" style="height:4px;background:var(--bg-glass-strong);border-radius:2px;margin-bottom:8px;overflow:hidden;">
              <div class="daily-progress-bar" style="height:100%;width:${totalDailyTasksCount > 0 ? Math.round((dailyCompletedCount / totalDailyTasksCount) * 100) : 0}%;background:var(--accent-gradient);border-radius:2px;transition:width var(--t-slow);"></div>
            </div>
          ` : ''}
          <div class="task-section-list" style="display:flex;flex-direction:column;gap:2px;">
            ${dailyHtml}
          </div>
        </div>
      </div>
    `,
    'todays-schedule': `
      <!-- Card 3: Today's Schedule -->
      <div class="itinerary-card dashboard-card ${collapsed['todays-schedule'] ? 'is-collapsed' : ''}" draggable="true" data-widget-id="todays-schedule" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);backdrop-filter:blur(20px);position:relative;">
        <span class="card-drag-handle" title="Drag to move widget">⋮⋮</span>
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
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
    `,
    'birthdays': `
      <!-- Card 4: Birthdays -->
      <div class="itinerary-card dashboard-card ${collapsed['birthdays'] ? 'is-collapsed' : ''}" draggable="true" data-widget-id="birthdays" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);backdrop-filter:blur(20px);position:relative;">
        <span class="card-drag-handle" title="Drag to move widget">⋮⋮</span>
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
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
    `
  };

  const knownWidgets = ['upcoming-tasks', 'daily-tasks', 'todays-schedule', 'birthdays'];
  const userLayout = (state.settings && state.settings.dashboardLayout) || {};
  let leftWidgetIds = Array.isArray(userLayout.left) ? userLayout.left.filter(id => knownWidgets.includes(id)) : ['upcoming-tasks', 'daily-tasks'];
  let rightWidgetIds = Array.isArray(userLayout.right) ? userLayout.right.filter(id => knownWidgets.includes(id)) : ['todays-schedule', 'birthdays'];

  // Ensure all known widgets are placed without duplicates
  const placed = new Set([...leftWidgetIds, ...rightWidgetIds]);
  knownWidgets.forEach(id => {
    if (!placed.has(id)) {
      if (id === 'upcoming-tasks' || id === 'daily-tasks') leftWidgetIds.push(id);
      else rightWidgetIds.push(id);
    }
  });

  const leftHtml = leftWidgetIds.map(id => allWidgets[id] || '').join('');
  const rightHtml = rightWidgetIds.map(id => allWidgets[id] || '').join('');

  const quickNoteData = (state.settings && state.settings.quickNote) || { text: '', color: 'yellow' };
  const noteText = typeof quickNoteData === 'string' ? quickNoteData : (quickNoteData.text || '');
  const noteColor = quickNoteData.color || 'yellow';

  return `
    <div class="dashboard-view">
      ${sessionBanner}

      <!-- Top Header Row -->
      <div class="dashboard-header-row" style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-md);margin-bottom:var(--sp-lg);flex-wrap:wrap;">
        <div class="dashboard-header-left" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;position:relative;">
          <h1 class="dashboard-title" style="font-size:26px;font-weight:700;letter-spacing:-0.5px;margin:0;color:var(--text-primary);">Dashboard</h1>
          <div class="dashboard-datetime-badge" id="dashboard-datetime-badge" style="font-size:var(--fs-sm);font-weight:500;color:var(--text-secondary);background:var(--bg-glass);padding:4px 12px;border-radius:var(--radius-full);border:1px solid var(--border);">
            ${getFormattedCurrentDateTime()}
          </div>
          <button class="icon-btn dashboard-quick-note-btn" id="dash-quick-note-btn" title="Quick Notes" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-full);cursor:pointer;background:var(--bg-glass);border:1px solid var(--border);padding:0;transition:all var(--t-fast);">
            <img src="assets/icons/Edit.png" alt="Notes" style="width:14px;height:14px;object-fit:contain;opacity:0.85;" />
          </button>

          <!-- Floating Sticky Note Popover -->
          <div id="dashboard-sticky-popover" class="dashboard-sticky-popover theme-${noteColor} hidden" data-current-color="${noteColor}">
            <div class="sticky-header">
              <div style="display:flex;align-items:center;gap:6px;">
                <img src="assets/icons/Pin.png" alt="Pin" style="width:16px;height:16px;object-fit:contain;" />
                <span style="font-weight:600;">Quick Note</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="sticky-color-picker" style="display:flex;align-items:center;gap:8px;">
                  <button class="sticky-color-dot ${noteColor === 'yellow' ? 'active' : ''}" data-note-color="yellow" style="background:#fef08a;" title="Yellow"></button>
                  <button class="sticky-color-dot ${noteColor === 'blue' ? 'active' : ''}" data-note-color="blue" style="background:#bae6fd;" title="Sky Blue"></button>
                  <button class="sticky-color-dot ${noteColor === 'green' ? 'active' : ''}" data-note-color="green" style="background:#bbf7d0;" title="Mint Green"></button>
                  <button class="sticky-color-dot ${noteColor === 'dark' ? 'active' : ''}" data-note-color="dark" style="background:#1e293b;border:1px solid rgba(255,255,255,0.25);" title="Dark Slate"></button>
                </div>
                <span id="sticky-save-indicator" style="font-size:10px;opacity:0.6;font-weight:500;">Saved</span>
                <button class="icon-btn sticky-close-btn" id="sticky-close-btn" style="background:none;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:2px 4px;opacity:0.7;" title="Close">
                  <img src="assets/icons/Cross.png" alt="Close" style="width:12px;height:12px;object-fit:contain;" />
                </button>
              </div>
            </div>
            <textarea id="dashboard-sticky-textarea" class="sticky-textarea" placeholder="Jot down quick thoughts, scratchpad notes, reminders...">${escHtml(noteText)}</textarea>
          </div>
        </div>
        <div class="dashboard-header-right">
          ${quickLinksHtml}
        </div>
      </div>

      <!-- 2-Column Main Dashboard Grid with Draggable Resizer & Draggable Widgets -->
      <div class="dashboard-grid" id="dashboard-grid" style="--dash-split-left:${splitRatio}%; --dash-split-right:${100 - splitRatio}%;">
        
        <!-- Left Column -->
        <div class="dashboard-left dashboard-widget-column" id="dashboard-col-left" data-dash-column="left" style="display:flex;flex-direction:column;gap:var(--sp-lg);">
          ${leftHtml}
        </div>

        <!-- Draggable Resizer Splitter -->
        <div class="dashboard-splitter" id="dashboard-splitter" title="Drag to adjust column widths">
          <div class="dashboard-splitter-handle"></div>
        </div>

        <!-- Right Column -->
        <div class="dashboard-right dashboard-widget-column" id="dashboard-col-right" data-dash-column="right" style="display:flex;flex-direction:column;gap:var(--sp-lg);">
          ${rightHtml}
        </div>
      </div>
    </div>
  `;
}
