/**
 * dashboard.js
 * Renders the primary Dashboard view featuring greeting header, Today's Itinerary (Google Calendar & scheduled tasks), Do Soon tasks, and Upcoming Celebrations.
 */

function renderDashboard() {
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17) greeting = 'Good evening';

  const userName = state.settings.userName || 'there';
  const today = getTodayStr();
  const tmrw = new Date();
  tmrw.setDate(tmrw.getDate() + 1);
  const tomorrow = toDateStr(tmrw);

  const collapsed = state.settings.dashboardCollapsed || {};
  const getCollapseIcon = (id) => `
    <button class="icon-btn dashboard-collapse-btn" data-collapse-id="${id}" title="Toggle collapse" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);cursor:pointer;color:var(--text-secondary);">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;transition:transform 0.2s;transform:${collapsed[id] ? 'rotate(-90deg)' : 'none'}"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
  `;

  // Apply mode filter to dashboard tasks
  const modeFilteredTasks = getFilteredByMode(state.tasks);
  const dateStr = formatDateFull(new Date());

  // 1. Today's Itinerary: merge Google Calendar events + scheduled tasks, sorted by time
  const gcalToday = getActiveGcalEvents()
    .filter(e => e.date === today)
    .map(e => ({ ...e, type: 'gcal_event', sortTime: e.startTime || '00:00' }));

  const todayScheduledTasks = modeFilteredTasks
    .filter(t => t.dueDate === today && t.dueTime)
    .map(t => {
      const [h, m] = t.dueTime.split(':').map(Number);
      const startMins = h * 60 + m;
      const endMins = Math.min(startMins + 15, 1439);
      const endH = Math.floor(endMins / 60);
      const endM = endMins % 60;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      return { ...t, type: 'task', sortTime: t.dueTime, endTime };
    });

  const itinerary = [...gcalToday, ...todayScheduledTasks].sort((a, b) =>
    a.sortTime.localeCompare(b.sortTime)
  );

  const itineraryHtml = itinerary.length > 0
    ? itinerary.map(item => {
      if (item.type === 'gcal_event') {
        return `
          <div class="itinerary-item" data-event-id="${item.id}">
            <span class="itinerary-time">${item.startTime ? formatTime12(item.startTime) : 'All Day'}</span>
            <div class="itinerary-bar" style="background: var(--accent)"></div>
            <div class="itinerary-content">
              <div class="itinerary-title">${escHtml(item.title)}</div>
              <div class="itinerary-meta">
                <span>${item.startTime ? formatTime12(item.startTime) + ' – ' : ''}${item.endTime ? formatTime12(item.endTime) : ''}</span>
                <span class="source-badge">Google Calendar</span>
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

  const unscheduledToday = modeFilteredTasks.filter(t => t.dueDate === today && !t.dueTime && !t.completed);

  // 2. Do Soon (Due Today or Tomorrow)
  const doSoonTasks = modeFilteredTasks.filter(t => (t.dueDate === today || t.dueDate === tomorrow) && !t.completed)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const doSoonHtml = doSoonTasks.length > 0
    ? doSoonTasks.map(t => {
      const dueLabel = t.dueDate === today ? 'Today' : 'Tomorrow';
      return `
        <div class="itinerary-item" data-task-id="${t.id}" style="align-items:center;">
          <input type="checkbox" class="task-checkbox do-soon-checkbox" data-task-id="${t.id}" style="margin-right:12px;width:18px;height:18px;accent-color:var(--accent);cursor:pointer;" />
          <div class="itinerary-content">
            <div class="itinerary-title" style="font-size:13px;">${escHtml(t.title)}</div>
          </div>
          <span style="font-size:11px;color:var(--priority-p1);font-weight:600;padding-left:8px;">${dueLabel}</span>
        </div>
      `;
    }).join('')
    : '<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-text">Nothing due soon</div></div>';

  // 3. Upcoming Birthdays (Reminders)
  const upcomingReminders = state.reminders
    .map(r => {
      const rDate = new Date(r.date);
      const diff = Math.ceil((rDate - new Date(today)) / 86400000);
      return { ...r, daysUntil: diff };
    })
    .filter(r => r.daysUntil >= 0 && r.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const remindersHtml = upcomingReminders.length > 0
    ? upcomingReminders.map(r => {
      const initials = r.personName.split(' ').map(n => n[0]).join('').toUpperCase();
      const daysText = r.daysUntil === 0 ? 'Today!' : r.daysUntil === 1 ? 'Tomorrow' : `In ${r.daysUntil} days`;
      const icon = r.type === 'birthday' ? '🎂' : '💝';
      return `
        <div class="reminder-card">
          <div class="reminder-avatar">${initials}</div>
          <div class="reminder-info">
            <div class="reminder-name">🔔 ${escHtml(r.personName)}</div>
            <div class="reminder-detail">${daysText} · ${r.date}</div>
          </div>
        </div>
      `;
    }).join('')
    : '<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-text">No upcoming reminders</div></div>';

  // Dynamic greeting logic
  const greetingOptions = [];
  if (unscheduledToday.length > 0) {
    greetingOptions.push(`You have ${unscheduledToday.length} tasks due today!`);
  }
  if (upcomingReminders.length > 0) {
    const nextRem = upcomingReminders[0];
    if (nextRem.daysUntil === 0) {
      greetingOptions.push(`Reminder for ${escHtml(nextRem.personName)} is today! 🔔`);
    } else {
      greetingOptions.push(`Reminder for ${escHtml(nextRem.personName)} is coming up!`);
    }
  }
  if (greetingOptions.length === 0) {
    greetingOptions.push(`Congrats! You have no tasks coming up.`);
  }

  const randomGreeting = greetingOptions[Math.floor(Math.random() * greetingOptions.length)];
  const sessionBanner = state.sessionExpired ? `<div style="background:rgba(255,100,100,0.1);color:var(--danger);padding:10px;text-align:center;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);">Google Session Expired. Please sign out and sign back in to sync your Google Calendars.</div>` : '';

  return `
    ${sessionBanner}
    <div class="dashboard-view">
      <div class="dashboard-greeting">
        <h1>${greeting}, ${escHtml(userName)} 👋</h1>
        <div style="font-size:var(--fs-md);color:var(--text-primary);font-weight:500;margin-bottom:6px;">${randomGreeting}</div>
        <div class="date-text">${dateStr}</div>
      </div>

      <div class="dashboard-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);align-items:start;">
        <div class="dashboard-left" style="display:flex;flex-direction:column;gap:var(--sp-lg);">
          
          <div class="itinerary-card" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);">
            <div class="card-header">
              <div style="display:flex;align-items:center;gap:8px;">
                ${getCollapseIcon('itinerary')}
                <h2 style="font-size:var(--fs-lg);font-weight:600;">Today's Itinerary</h2>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="card-count" style="font-size:var(--fs-sm);color:var(--text-tertiary);background:var(--bg-glass);padding:4px 10px;border-radius:var(--radius-full);">${itinerary.length} items${unscheduledToday.length > 0 ? ` · ${unscheduledToday.length} unscheduled` : ''}</span>
                <button class="icon-btn" id="dash-cal-btn" style="color:var(--text-secondary);width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);cursor:pointer;" title="Go to Calendar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </button>
              </div>
            </div>
            <div id="collapse-content-itinerary" class="itinerary-list" style="${collapsed['itinerary'] ? 'display:none;' : ''}">${itineraryHtml}</div>
          </div>

        </div>

        <div class="dashboard-right" style="display:flex;flex-direction:column;gap:var(--sp-lg);">
          
          <div class="itinerary-card" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);">
            <div class="card-header">
              <div style="display:flex;align-items:center;gap:8px;">
                ${getCollapseIcon('do-soon')}
                <h2 style="font-size:var(--fs-lg);font-weight:600;">Do Soon</h2>
              </div>
              <span class="card-count" style="font-size:var(--fs-sm);color:var(--text-tertiary);background:var(--bg-glass);padding:4px 10px;border-radius:var(--radius-full);">${doSoonTasks.length} due</span>
            </div>
            <div id="collapse-content-do-soon" class="itinerary-list" style="${collapsed['do-soon'] ? 'display:none;' : ''}">
              ${doSoonHtml}
            </div>
          </div>

          <div class="social-widget" style="background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-lg);">
            <div class="card-header">
              <div style="display:flex;align-items:center;gap:8px;">
                ${getCollapseIcon('birthdays')}
                <h2 style="font-size:var(--fs-lg);font-weight:600;">Upcoming Birthdays</h2>
              </div>
            </div>
            <div id="collapse-content-birthdays" style="${collapsed['birthdays'] ? 'display:none;' : ''}">
              ${remindersHtml}
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}
