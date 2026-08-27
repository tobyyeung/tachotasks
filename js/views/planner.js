// ===== PLANNER VIEW =====
function renderPlanner() {
  const weekStart = getWeekStart(state.calendarDate);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const today = getTodayStr();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Mini week calendar
  let miniCalHtml = '<div class="calendar-nav" style="margin-bottom:16px;">';
  miniCalHtml += `<button class="calendar-nav-btn" id="planner-prev">${icons.chevronLeft}</button>`;
  miniCalHtml += `<button class="calendar-today-btn" id="planner-today">Today</button>`;
  miniCalHtml += `<button class="calendar-nav-btn" id="planner-next">${icons.chevronRight}</button>`;
  miniCalHtml += `<span class="calendar-title" style="margin-left:12px;font-size:14px;">${state.calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>`;
  miniCalHtml += '</div>';

  days.forEach((d, i) => {
    const dateStr = toDateStr(d);
    const isToday = dateStr === today;
    const localDayEvents = state.events.filter(e => e.date === dateStr);
    const gcalDayEvents = getActiveGcalEvents().filter(e => e.date === dateStr);
    const dayEvents = [...localDayEvents, ...gcalDayEvents];
    const dayTasks = state.tasks.filter(t => (t.dueDate === dateStr || t.plannedDate === dateStr));

    miniCalHtml += `
      <div class="planner-day-row" data-planner-date="${dateStr}" data-drop-target="planner" 
           style="padding:12px;margin-bottom:6px;border-radius:10px;background:${isToday ? 'var(--accent-muted)' : 'var(--bg-glass)'};border:1px solid ${isToday ? 'rgba(0,212,170,0.2)' : 'var(--border)'};">
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
          ...dayTasks.filter(t => !t.completed).map(t => {
            const proj = t.projectId ? state.projects.find(p => p.id === t.projectId) : null;
            const pColor = getPriorityColor(t.priority);
            return `
              <div style="font-size:12px;color:var(--text-secondary);padding:3px 0;display:flex;align-items:center;gap:6px;" data-task-id="${t.id}">
                <span style="color:${pColor || 'var(--text-tertiary)'};">◯</span>
                <span style="color:var(--text-primary);">${escHtml(t.title)}</span>
                ${proj ? `<span style="color:${proj.color || 'var(--accent)'};font-size:11px;margin-left:auto;font-weight:500;">● ${escHtml(proj.name)}</span>` : ''}
              </div>
            `;
          })
        ].join('')}
      </div>
    `;
  });

  // Unscheduled backlog (all standalone and project tasks)
  const unscheduled = state.tasks.filter(t => !t.dueDate && !t.plannedDate && !t.completed);

  const backlogHtml = unscheduled.length > 0
    ? unscheduled.map(t => {
      const proj = t.projectId ? state.projects.find(p => p.id === t.projectId) : null;
      return `
        <div class="planner-task-card" draggable="true" data-task-id="${t.id}">
          <div class="kanban-card-title">${escHtml(t.title)}</div>
          <div class="kanban-card-meta" style="display:flex;align-items:center;gap:6px;margin-top:4px;">
            ${proj ? `<span class="tag-pill" style="border:1px solid ${proj.color}40;color:${proj.color};">● ${escHtml(proj.name)}</span>` : ''}
            ${t.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
          </div>
        </div>
      `;
    }).join('')
    : `<div class="empty-state"><div class="empty-icon" style="width:48px;height:48px;margin:0 auto 16px;color:var(--text-tertiary);">${icons.target}</div><div class="empty-text">All tasks are scheduled!</div></div>`;

  return `
    <div class="planner-view">
      <div class="planner-calendar">
        ${miniCalHtml}
      </div>
      <div class="planner-backlog">
        <div class="planner-backlog-header">
          <h2>Unscheduled</h2>
          <span class="text-muted text-sm">${unscheduled.length} tasks</span>
        </div>
        <div class="planner-backlog-list">
          ${backlogHtml}
        </div>
      </div>
    </div>
  `;
}

