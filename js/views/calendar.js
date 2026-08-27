// ===== CALENDAR VIEW =====
function renderCalendar() {
  const viewMode = state.calendarViewMode || 'weekly';
  const date = state.calendarDate;
  const today = getTodayStr();
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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
  let headerHtml = '';
  if (viewMode === 'monthly') {
    headerHtml = dayNames.map(name => `<div class="calendar-day-header">${name}</div>`).join('');
  } else {
    headerHtml = `<div class="calendar-day-header time-col-header"></div>`;
    headerHtml += days.map((d) => {
      const dateStr = toDateStr(d);
      const isToday = dateStr === today;
      const dayName = dayNames[d.getDay()];
      return `
        <div class="calendar-day-header ${isToday ? 'today' : ''}">
          <span class="day-name">${dayName}</span>
          <span class="day-num">${d.getDate()}</span>
        </div>
      `;
    }).join('');
  }

  const viewBtns = ['daily', 'weekly', 'monthly'].map(mode =>
    `<button class="view-mode-btn ${viewMode === mode ? 'active' : ''}" data-cal-view="${mode}">${mode.charAt(0).toUpperCase() + mode.slice(1)}</button>`
  ).join('');

  let gridHtml = '';
  
  if (viewMode === 'monthly') {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const startDay = monthStart.getDay(); // 0 = Sun
    
    // 6 weeks = 42 cells
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(date.getFullYear(), date.getMonth(), i - startDay + 1);
      const dateStr = toDateStr(cellDate);
      const isCurrentMonth = cellDate.getMonth() === date.getMonth();
      const isToday = dateStr === today;
      const dayNum = cellDate.getDate();
      
      // If 1st of month or first day of calendar, show Month abbreviation
      const monthAbbr = cellDate.toLocaleDateString('en-US', { month: 'short' });
      const displayDayText = (dayNum === 1 || i === 0) ? `${monthAbbr} ${dayNum}` : `${dayNum}`;
      
      gridHtml += `
        <div class="calendar-month-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today-cell' : ''}" data-cal-date="${dateStr}" data-drop-target="calendar">
          <div class="month-cell-header">
            <span class="month-cell-date-text ${isToday ? 'today-badge' : ''}">${displayDayText}</span>
          </div>
          <div class="month-cell-events" id="month-events-${dateStr}"></div>
        </div>
      `;
    }
  } else {
    // Time slots: 12am to 11pm (24 hours)
    for (let hour = 0; hour <= 23; hour++) {
      const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
      const ampm = hour >= 12 ? 'pm' : 'am';
      const timeLabel = hour === 0 ? '12am' : `${displayHour}${ampm}`;
      
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
    }
  }

  const sessionBanner = state.sessionExpired ? `<div class="gcal-expired-banner" onclick="window.reconnectGoogleCalendar()" style="cursor:pointer;" title="Click to reconnect Google Calendar">⚠️ Google Calendar session expired. <span style="text-decoration:underline;font-weight:700;">Click to reconnect</span></div>` : '';

  if (viewMode === 'monthly') {
    return `
      ${sessionBanner}
      <div class="calendar-view monthly">
        <div class="calendar-header">
          <div class="calendar-nav">
            <button class="calendar-nav-btn" id="cal-prev" title="Previous">${icons.chevronLeft}</button>
            <button class="calendar-today-btn" id="cal-today">Today</button>
            <button class="calendar-nav-btn" id="cal-next" title="Next">${icons.chevronRight}</button>
          </div>
          <h2 class="calendar-title">${monthYear}</h2>
          <div class="calendar-view-modes">${viewBtns}</div>
        </div>
        
        <div class="calendar-month-container">
          <div class="calendar-day-headers monthly">
            ${headerHtml}
          </div>
          <div class="calendar-month-grid" id="calendar-time-grid">
            ${gridHtml}
          </div>
        </div>
      </div>
    `;
  }

  // Weekly & Daily view
  return `
    ${sessionBanner}
    <div class="calendar-view ${viewMode}">
      <div class="calendar-header">
        <div class="calendar-nav">
          <button class="calendar-nav-btn" id="cal-prev" title="Previous">${icons.chevronLeft}</button>
          <button class="calendar-today-btn" id="cal-today">Today</button>
          <button class="calendar-nav-btn" id="cal-next" title="Next">${icons.chevronRight}</button>
        </div>
        <h2 class="calendar-title">${monthYear}</h2>
        <div class="calendar-view-modes">${viewBtns}</div>
      </div>
      
      <div class="calendar-main-container ${viewMode}">
        <div class="calendar-scroll-area ${viewMode}" id="calendar-scroll-area">
          <div class="calendar-day-headers ${viewMode}">
            ${headerHtml}
          </div>
          <div class="${viewMode === 'daily' ? 'calendar-time-grid daily' : 'calendar-time-grid'}" id="calendar-time-grid">
            ${gridHtml}
          </div>
          <div id="calendar-events-layer" class="calendar-events-layer"></div>
        </div>
      </div>
    </div>
  `;
}

function renderCalendarEvents() {
  const viewMode = state.calendarViewMode || 'weekly';

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
    const startDay = monthStart.getDay(); // 0 = Sun
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth(), i - startDay + 1);
      days.push(toDateStr(cellDate));
    }
  }

  // Combine local events, Google Calendar events, and scheduled tasks
  const items = [];

  state.events.forEach(evt => {
    const dayIdx = days.indexOf(evt.date);
    if (dayIdx < 0) return;
    items.push({
      id: evt.id, type: 'event', title: evt.title || 'Untitled Event', color: evt.color || '#4285f4',
      date: evt.date, startTime: evt.startTime || null, endTime: evt.endTime || null,
      location: evt.location || '',
      dayIdx, isAllDay: evt.isAllDay || !evt.startTime
    });
  });

  state.gcalEvents.forEach(evt => {
    const dayIdx = days.indexOf(evt.date);
    if (dayIdx < 0) return;
    const activeIds = Array.isArray(state.activeGcalIds) ? state.activeGcalIds : (state.settings.activeGcalIds || []);
    if (!activeIds.includes(evt.calendarId)) return;
    
    const cal = state.gcalCalendars.find(c => c.id === evt.calendarId);
    const calColor = cal ? cal.color : (evt.color || 'var(--accent)');
    
    items.push({
      id: evt.id, type: 'gcal_event', title: evt.title || 'Untitled Event', color: calColor,
      date: evt.date, startTime: evt.startTime || null, endTime: evt.endTime || null,
      location: evt.location || '',
      dayIdx, isAllDay: evt.isAllDay || !evt.startTime
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
      const endMins = Math.min(startMins + 45, 1439);
      const endH = Math.floor(endMins / 60);
      const endM = endMins % 60;
      endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }
    items.push({
      id: task.id, type: 'task', title: task.title,
      color: getPriorityColor(task.priority) || '#00d4aa',
      date: task.dueDate, startTime: startTime,
      endTime: endTime,
      dayIdx, completed: task.completed,
      isAllDay: !startTime
    });
  });
  
  // ==========================================
  // MONTHLY VIEW RENDERING
  // ==========================================
  if (viewMode === 'monthly') {
    days.forEach(dateStr => {
      const container = document.getElementById(`month-events-${dateStr}`);
      if (container) container.innerHTML = '';
    });

    const itemsByDate = {};
    items.forEach(item => {
      if (!itemsByDate[item.date]) itemsByDate[item.date] = [];
      itemsByDate[item.date].push(item);
    });

    Object.entries(itemsByDate).forEach(([dateStr, dayItems]) => {
      const container = document.getElementById(`month-events-${dateStr}`);
      if (!container) return;

      dayItems.sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
      });

      const maxVisible = 3;
      const visibleItems = dayItems.slice(0, maxVisible);
      const overflowCount = dayItems.length - maxVisible;

      visibleItems.forEach(item => {
        const el = document.createElement('div');
        el.className = 'month-event-item';
        
        if (item.isAllDay) {
          const textColor = getContrastTextColor(item.color);
          el.classList.add('all-day');
          el.style.background = item.color;
          el.style.border = '1px solid rgba(0, 0, 0, 0.25)';
          el.style.color = textColor;
        } else {
          el.style.background = 'transparent';
          el.style.color = 'var(--text-primary)';
        }

        if (item.completed) el.classList.add('completed');

        const timeStr = item.startTime ? formatTimeShort(item.startTime) : '';
        const dotHtml = !item.isAllDay ? `<span class="event-dot" style="background:${item.color};"></span>` : '';
        const timeHtml = timeStr ? `<span class="event-time-prefix">${timeStr}</span> ` : '';
        const titleHtml = `<span class="event-title-text">${escHtml(item.title)}</span>`;

        el.innerHTML = `${dotHtml}${timeHtml}${titleHtml}`;
        
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.type === 'task') showTaskModal(item.id);
          else showEventPopover(item.id, item.type, el);
        });
        container.appendChild(el);
      });

      if (overflowCount > 0) {
        const moreBtn = document.createElement('div');
        moreBtn.className = 'month-more-badge';
        moreBtn.textContent = `+${overflowCount} more`;
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.calendarDate = parseDateLocal(dateStr);
          state.calendarViewMode = 'daily';
          renderView();
        });
        container.appendChild(moreBtn);
      }
    });
    return;
  }

  // ==========================================
  // WEEKLY & DAILY VIEW RENDERING
  // ==========================================
  const scrollArea = document.getElementById('calendar-scroll-area');
  const eventsLayer = document.getElementById('calendar-events-layer');
  const grid = document.getElementById('calendar-time-grid');
  if (!scrollArea || !eventsLayer || !grid) return;
  eventsLayer.innerHTML = '';

  const cells = grid.querySelectorAll('.calendar-cell');
  if (cells.length === 0) return;
  const cellHeight = cells[0].offsetHeight || 48;
  const timeColWidth = 56;
  const totalGridWidth = grid.offsetWidth;
  const numDays = days.length;
  const dayColWidth = (totalGridWidth - timeColWidth) / numDays;

  // Header row height offset inside scroll area
  const dayHeaders = scrollArea.querySelector('.calendar-day-headers');
  const headerOffset = dayHeaders ? dayHeaders.offsetHeight : 52;

  if (dayColWidth <= 0 || cellHeight <= 0) {
    setTimeout(renderCalendarEvents, 50);
    return;
  }

  // Group items by day index
  const eventsByDay = {};
  items.forEach(item => {
    if (!eventsByDay[item.dayIdx]) eventsByDay[item.dayIdx] = [];
    eventsByDay[item.dayIdx].push(item);
  });

  Object.entries(eventsByDay).forEach(([dayIdxStr, dayItems]) => {
    const dayIdx = parseInt(dayIdxStr, 10);

    dayItems.forEach(item => {
      const sTime = item.startTime || '08:00';
      const [sh, sm] = sTime.split(':').map(Number);
      item.startMinutes = sh * 60 + (sm || 0);

      if (item.endTime) {
        const [eh, em] = item.endTime.split(':').map(Number);
        item.endMinutes = eh * 60 + (em || 0);
      } else {
        item.endMinutes = item.startMinutes + 45;
      }
      if (item.endMinutes <= item.startMinutes) item.endMinutes = item.startMinutes + 15;
    });

    dayItems.sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes);
    });

    const clusters = [];
    let currentCluster = [];
    let clusterEnd = -1;

    dayItems.forEach(item => {
      if (currentCluster.length === 0 || item.startMinutes < clusterEnd) {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMinutes);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.endMinutes;
      }
    });
    // Greedy interval allocation: assign lowest available column index (0, 1, 2, ...)
    const columns = [];
    dayItems.forEach(item => {
      let assignedCol = -1;
      for (let c = 0; c < columns.length; c++) {
        if (item.startMinutes >= columns[c]) {
          assignedCol = c;
          columns[c] = item.endMinutes;
          break;
        }
      }
      if (assignedCol === -1) {
        assignedCol = columns.length;
        columns.push(item.endMinutes);
      }
      item.colIndex = assignedCol;
    });

    // Layout algorithm: Column 0 takes wide left width, Column 1+ indents right and layers on top
    dayItems.forEach(item => {
      const top = (item.startMinutes / 60) * cellHeight + headerOffset;
      const height = Math.max(((item.endMinutes - item.startMinutes) / 60) * cellHeight, 22);

      // Find items starting at the exact same time (within 5 mins)
      const sameTimeItems = dayItems.filter(other =>
        Math.abs(other.startMinutes - item.startMinutes) < 5
      );

      let left = 0;
      let width = 0;
      let zIndex = 5;

      if (sameTimeItems.length > 1) {
        // Simultaneous events: split column width equally side-by-side
        const sameIndex = sameTimeItems.findIndex(o => o.id === item.id);
        const totalSame = sameTimeItems.length;
        const colW = (dayColWidth - 4) / totalSame;
        left = timeColWidth + dayIdx * dayColWidth + sameIndex * colW + 2;
        width = colW - 2;
        zIndex = 5 + sameIndex;
      } else if (item.colIndex === 0) {
        // Column 0: starts on the left edge and takes wide width (e.g. Computer Systems, CS Advising)
        left = timeColWidth + dayIdx * dayColWidth + 2;
        width = (dayColWidth - 4) * 0.94;
        zIndex = 5;
      } else {
        // Column 1+: indented to the right and layered on top (e.g. INVITE Keating)
        const indentFactor = Math.min(0.42 * item.colIndex, 0.58);
        const dayStart = timeColWidth + dayIdx * dayColWidth;
        const offsetPx = dayColWidth * indentFactor;
        left = dayStart + offsetPx + 2;
        width = Math.max(dayColWidth - offsetPx - 4, dayColWidth * 0.48);
        zIndex = 6 + item.colIndex * 2;
      }

      const el = document.createElement('div');
      el.className = `calendar-event ${item.type === 'task' ? 'is-task' : ''}`;
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.zIndex = zIndex;

      const isTask = item.type === 'task';
      const textColor = isTask ? '#d2e3fc' : getContrastTextColor(item.color);

      if (isTask) {
        el.style.background = '#162d4a';
        el.style.border = `1px solid rgba(0, 0, 0, 0.4)`;
        el.style.borderLeft = `3px solid ${item.color || '#00d4aa'}`;
      } else {
        el.style.background = item.color;
        el.style.border = `1px solid rgba(0, 0, 0, 0.25)`;
      }

      el.style.color = textColor;

      if (item.completed) el.style.opacity = '0.4';

      const timeDisplay = item.startTime ? `${formatTimeShort(item.startTime)} – ${formatTimeShort(item.endTime)}` : 'All Day';

      el.innerHTML = `
        <div class="event-card-content" style="color:${textColor};">
          <div class="event-title">${isTask ? '<span class="task-checkbox-circle">◯</span> ' : ''}${escHtml(item.title)}</div>
          ${height >= 32 ? `<div class="event-time" style="color:${textColor};opacity:0.88;">${timeDisplay}</div>` : ''}
          ${item.location && height >= 50 ? `<div class="event-location" style="color:${textColor};opacity:0.85;">${escHtml(formatLocationShort(item.location))}</div>` : ''}
        </div>
      `;

      el.dataset.eventId = item.id;
      el.dataset.eventType = item.type;
      
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.type === 'task') {
          showTaskModal(item.id);
        } else {
          showEventPopover(item.id, item.type, el);
        }
      });

      eventsLayer.appendChild(el);
    });
  });

  // Current time indicator line
  const now = new Date();
  const todayStr = getTodayStr();
  const todayDayIdx = days.indexOf(todayStr);

  if (todayDayIdx >= 0) {
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const lineTop = (currentMins / 60) * cellHeight + headerOffset;

    const timeLine = document.createElement('div');
    timeLine.className = 'calendar-current-time-line';
    timeLine.style.top = `${lineTop}px`;
    timeLine.style.left = `${timeColWidth}px`;
    timeLine.style.right = '0px';

    const timeDot = document.createElement('div');
    timeDot.className = 'calendar-current-time-dot';
    timeDot.style.top = `${lineTop - 4}px`;
    timeDot.style.left = `${timeColWidth + todayDayIdx * dayColWidth - 4}px`;

    eventsLayer.appendChild(timeLine);
    eventsLayer.appendChild(timeDot);

    if (!scrollArea.dataset.scrolled) {
      scrollArea.dataset.scrolled = 'true';
      const targetScroll = Math.max(0, lineTop - 160);
      scrollArea.scrollTop = targetScroll;
    }
  } else if (!scrollArea.dataset.scrolled) {
    scrollArea.dataset.scrolled = 'true';
    scrollArea.scrollTop = 8 * cellHeight;
  }
}

function formatTimeShort(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':').map(Number);
  const hour = parts[0];
  const mins = parts[1] || 0;
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  if (mins === 0) return `${displayHour}${ampm}`;
  return `${displayHour}:${String(mins).padStart(2, '0')}${ampm}`;
}

function colorToGlassBg(colorStr, alpha = 0.35) {
  if (!colorStr) return `rgba(66, 133, 244, ${alpha})`;
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  } else if (colorStr.startsWith('rgb(')) {
    return colorStr.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  } else if (colorStr.startsWith('rgba(')) {
    return colorStr;
  }
  return colorStr;
}

function getContrastTextColor(colorStr) {
  if (!colorStr) return '#ffffff';
  let r = 0, g = 0, b = 0;
  
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0], 10);
      g = parseInt(match[1], 10);
      b = parseInt(match[2], 10);
    }
  }
  
  // Standard perceived luminance formula (ITU-R BT.709)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  // If luminance > 0.55 (like yellow, light green, pastel), use dark text #121212; else white #ffffff
  return luminance > 0.55 ? '#121212' : '#ffffff';
}
