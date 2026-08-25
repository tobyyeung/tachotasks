// ===== CALENDAR VIEW =====
function renderCalendar() {
  const viewMode = state.calendarViewMode || 'weekly';
  const date = state.calendarDate;
  const today = getTodayStr();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let days = [];
  if (viewMode === 'daily') {
    days.push(new Date(date));
  } else if (viewMode === 'weekly') {
    const weekStart = getWeekStart(date);
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
  }

  const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Day headers
  let headerHtml = `<div class="calendar-day-header"></div>`;
  if (viewMode === 'monthly') {
    headerHtml = dayNames.map(name => `<div class="calendar-day-header">${name}</div>`).join('');
  } else {
    headerHtml += days.map((d, i) => {
      const dateStr = toDateStr(d);
      const isToday = dateStr === today;
      return `
        <div class="calendar-day-header ${isToday ? 'today' : ''}">
          ${dayNames[viewMode === 'daily' ? (d.getDay() === 0 ? 6 : d.getDay() - 1) : i]}
          <span class="day-num">${d.getDate()}</span>
        </div>
      `;
    }).join('');
  }

  const viewBtns = ['daily', 'weekly', 'monthly'].map(mode =>
    `<button class="view-mode-btn ${viewMode === mode ? 'active' : ''}" data-cal-view="${mode}" style="padding:4px 12px;font-size:12px;border:1px solid var(--border);background:${viewMode === mode ? 'var(--accent-muted)' : 'transparent'};color:${viewMode === mode ? 'var(--accent)' : 'var(--text-secondary)'};border-radius:var(--radius-sm);cursor:pointer;transition:background 0.2s;">${mode.charAt(0).toUpperCase() + mode.slice(1)}</button>`
  ).join('');

  let gridHtml = '';
  
  if (viewMode === 'monthly') {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const startDay = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1; // Mon = 0
    const totalDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    // We render up to 6 weeks (42 cells)
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(date.getFullYear(), date.getMonth(), i - startDay + 1);
      const dateStr = toDateStr(cellDate);
      const isCurrentMonth = cellDate.getMonth() === date.getMonth();
      const isToday = dateStr === today;
      
      gridHtml += `
        <div class="calendar-month-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today-cell' : ''}" data-cal-date="${dateStr}" data-drop-target="calendar">
          <div class="month-cell-header ${isToday ? 'today' : ''}">${cellDate.getDate()}</div>
          <div class="month-cell-events" id="month-events-${dateStr}"></div>
        </div>
      `;
    }
  } else {
    // Time slots: 12am to 11pm
    const hours = [];
    for (let h = 0; h <= 23; h++) hours.push(h);

    hours.forEach(hour => {
      const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
      const timeLabel = `${displayHour}${hour >= 12 ? 'PM' : 'AM'}`;
      gridHtml += `<div class="calendar-time-label">${timeLabel}</div>`;

      days.forEach(d => {
        const dateStr = toDateStr(d);
        const isToday = dateStr === today;
        gridHtml += `
          <div class="calendar-cell ${isToday ? 'today-col' : ''}" 
               data-cal-date="${dateStr}" data-cal-hour="${hour}"
               data-drop-target="calendar">
          </div>
        `;
      });
    });
  }

  const gridClass = viewMode === 'monthly' ? 'calendar-month-grid' : (viewMode === 'daily' ? 'calendar-time-grid daily' : 'calendar-time-grid');

  const sessionBanner = state.sessionExpired ? `<div style="background:rgba(255,100,100,0.1);color:var(--danger);padding:10px;text-align:center;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);">Google Session Expired. Please sign out and sign back in to sync your Google Calendars.</div>` : '';

  return `
    ${sessionBanner}
    <div class="calendar-view">
      <div class="calendar-header">
        <div class="calendar-nav">
          <button class="calendar-nav-btn" id="cal-prev">${icons.chevronLeft}</button>
          <button class="calendar-today-btn" id="cal-today">Today</button>
          <button class="calendar-nav-btn" id="cal-next">${icons.chevronRight}</button>
        </div>
        <h2 class="calendar-title">${monthYear}</h2>
        <div style="display:flex;gap:4px;margin-left:auto;">${viewBtns}</div>
      </div>
      <div class="calendar-grid-wrapper" id="calendar-grid-wrapper" ${viewMode === 'monthly' ? 'style="border-radius:var(--radius-lg);overflow:hidden;"' : ''}>
        <div class="calendar-day-headers ${viewMode === 'monthly' ? 'monthly' : (viewMode === 'daily' ? 'daily' : '')}">${headerHtml}</div>
        <div class="${gridClass}" id="calendar-time-grid">
          ${gridHtml}
        </div>
      </div>
    </div>
  `;
}

function renderCalendarEvents() {
  const grid = document.getElementById('calendar-time-grid');
  const wrapper = document.getElementById('calendar-grid-wrapper');
  if (!grid || !wrapper) return;
  const viewMode = state.calendarViewMode || 'weekly';

  // Remove old event overlays
  wrapper.querySelectorAll('.calendar-event').forEach(el => el.remove());

  const days = [];
  if (viewMode === 'daily') {
    days.push(toDateStr(state.calendarDate));
  } else if (viewMode === 'weekly') {
    const weekStart = getWeekStart(state.calendarDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(toDateStr(d));
    }
  } else if (viewMode === 'monthly') {
    const monthStart = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth(), 1);
    const startDay = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1; // Mon = 0
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth(), i - startDay + 1);
      days.push(toDateStr(cellDate));
    }
  }

  // Combine events and scheduled tasks
  const items = [];

  state.events.forEach(evt => {
    const dayIdx = days.indexOf(evt.date);
    if (dayIdx < 0) return;
    items.push({
      id: evt.id, type: 'event', title: evt.title, color: evt.color,
      date: evt.date, startTime: evt.startTime, endTime: evt.endTime,
      location: evt.location || '',
      dayIdx
    });
  });

  state.gcalEvents.forEach(evt => {
    const dayIdx = days.indexOf(evt.date);
    if (dayIdx < 0) return;
    const activeIds = Array.isArray(state.activeGcalIds) ? state.activeGcalIds : (state.settings.activeGcalIds || []);
    if (!activeIds.includes(evt.calendarId)) return;
    
    const cal = state.gcalCalendars.find(c => c.id === evt.calendarId);
    const calColor = cal ? cal.color : 'var(--accent)';
    
    items.push({
      id: evt.id, type: 'gcal_event', title: evt.title, color: calColor,
      date: evt.date, startTime: evt.startTime, endTime: evt.endTime,
      location: evt.location || '',
      dayIdx
    });
  });

  state.tasks.forEach(task => {
    if (!task.dueDate) return;
    const dayIdx = days.indexOf(task.dueDate);
    if (dayIdx < 0) return;
    let startTime = task.dueTime || null;
    let endTime = null;
    if (startTime) {
      const [h, m] = startTime.split(':').map(Number);
      const startMins = h * 60 + m;
      const endMins = Math.min(startMins + 15, 1439); // 1439 mins = 23:59
      const endH = Math.floor(endMins / 60);
      const endM = endMins % 60;
      endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }
    items.push({
      id: task.id, type: 'task', title: task.title,
      color: getPriorityColor(task.priority) || '#00d4aa',
      date: task.dueDate, startTime: startTime,
      endTime: endTime,
      dayIdx, completed: task.completed
    });
  });
  
  if (viewMode === 'monthly') {
    // For monthly view, populate events in cells
    items.forEach(item => {
      const container = document.getElementById(`month-events-${item.date}`);
      if (container) {
        const el = document.createElement('div');
        el.className = 'month-event-item';
        el.style.background = item.color + '33';
        el.style.borderLeftColor = item.color;
        el.style.color = 'var(--text-primary)';
        if (item.completed) el.style.opacity = '0.4';
        el.innerHTML = `<span style="font-weight:600;">${item.startTime ? formatTime12(item.startTime).replace('AM','a').replace('PM','p') : ''}</span> ${escHtml(item.title)}`;
        
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.type === 'task') showTaskModal(item.id);
          else showEventPopover(item.id, item.type, el);
        });
        container.appendChild(el);
      }
    });
    return;
  }

  // Get grid cell dimensions (for Daily / Weekly)
  const cells = grid.querySelectorAll('.calendar-cell');
  if (cells.length === 0) return;
  const cellHeight = cells[0].offsetHeight;
  const cellWidth = cells[0].offsetWidth;

  // If the view is still animating in, offsetWidth might be 0, which would hide all events.
  // Delay until it's properly laid out.
  if (cellWidth === 0 || cellHeight === 0) {
    setTimeout(renderCalendarEvents, 50);
    return;
  }

  
  // Track overlapping
  // For simplicity we just set a fixed right padding, 
  // but if we want true overlapping shift, we'd need an algorithm.
  // The user requested: "left side starts in its column and ends with a few pixels so there is space between the event right side and the end of the column that space is for other events if it overlaps in the future".
  // This implies giving it a fixed width smaller than cellWidth, or tracking columns.
  
  const eventsByDay = {};
  items.forEach(item => {
    if (!eventsByDay[item.dayIdx]) eventsByDay[item.dayIdx] = [];
    eventsByDay[item.dayIdx].push(item);
  });

  Object.values(eventsByDay).forEach(dayItems => {
    // Simple overlap algorithm: sort by start time
    dayItems.sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
    
    // Check overlaps
    for (let i = 0; i < dayItems.length; i++) {
      let overlaps = [];
      for (let j = 0; j < i; j++) {
        if ((dayItems[j].endTime || '23:59') > (dayItems[i].startTime || '00:00')) {
          overlaps.push(dayItems[j]);
        }
      }
      dayItems[i].overlapIndex = overlaps.length;
    }
    
    dayItems.forEach(item => {
      const sTime = item.startTime || '00:00';
      const eTime = item.endTime || (item.startTime ? item.startTime : '01:00');
      
      const startParts = sTime.split(':').map(Number);
      const endParts = eTime.split(':').map(Number);
      
      let startMinutes = startParts[0] * 60 + startParts[1];
      let endMinutes = endParts[0] * 60 + endParts[1];
      
      if (endMinutes < startMinutes) endMinutes = startMinutes + 15;
      if (endMinutes === startMinutes) endMinutes = startMinutes + 1; // 1 min duration (e.g. 23:59 to 23:59)
      
      const top = (startMinutes / 60) * cellHeight;
      const height = Math.max(((endMinutes - startMinutes) / 60) * cellHeight, 18);

      // Width logic for padding
      const maxColSpan = 2; // if max overlaps
      const shift = item.overlapIndex * 15; // Shift left by 15px for each overlapping event
      
      const left = 60 + item.dayIdx * cellWidth + shift; // 60px = time label width
      const width = cellWidth - shift - 15; // leaving 15px space on the right

      const el = document.createElement('div');
      el.className = 'calendar-event';
      el.style.top = `${top + 49}px`; // offset for the day header height
      el.style.left = `${left + 2}px`;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.background = item.color + '33'; // Slightly more opaque for better background visibility
      el.style.borderLeftColor = item.color;
      el.style.color = 'var(--text-primary)';
      if (item.completed) el.style.opacity = '0.4';

      el.innerHTML = `
        <div class="event-title" style="font-weight: 500; margin-bottom: 2px;">${escHtml(item.title)}</div>
        <div class="event-time" style="opacity: 0.8;">${item.startTime ? formatTime12(item.startTime) + ' – ' + formatTime12(item.endTime) : 'All Day'}</div>
        ${item.location ? `<div class="event-location" style="opacity: 0.8; font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(item.location)}</div>` : ''}
      `;

      el.dataset.eventId = item.id;
      el.dataset.eventType = item.type;
      
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.type === 'task') {
          showTaskModal(item.id);
        } else {
          showEventPopover(item.id, item.type, el);
        }
      });

      const wrapper = document.getElementById('calendar-grid-wrapper');
      wrapper.style.position = 'relative';
      wrapper.appendChild(el);
    });
  });
}

