/**
 * calendar-grid.js
 * Weekly and Daily 24h hourly time-grid layout, collision handling, and current-time line.
 */

function renderWeeklyDailyGrid(days, today) {
  let gridHtml = '';
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
  return gridHtml;
}

function renderWeeklyDailyEvents(days, items) {
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

  // Clear all all-day row cells before populating
  document.querySelectorAll('.calendar-all-day-cell').forEach(cell => {
    cell.innerHTML = '';
  });

  // Separate all-day events and timed events
  const allDayItems = items.filter(item => item.isAllDay || !item.startTime);
  const timedItems = items.filter(item => !item.isAllDay && item.startTime);

  // Toggle all-day row visibility (hidden if 0 all-day items)
  const allDayRow = document.getElementById('calendar-all-day-row');
  if (allDayRow) {
    allDayRow.style.display = allDayItems.length > 0 ? 'grid' : 'none';
  }

  // 1. RENDER ALL-DAY ITEMS IN THE HEADER ROW
  allDayItems.forEach(item => {
    const cell = document.querySelector(`.calendar-all-day-cell[data-all-day-date="${item.date}"]`);
    if (!cell) return;

    const isTask = item.type === 'task';
    const textColor = isTask ? '#d2e3fc' : getContrastTextColor(item.color);

    const pill = document.createElement('div');
    pill.className = `calendar-all-day-pill ${isTask ? 'is-task' : ''}`;
    pill.dataset.eventId = item.id;
    pill.dataset.eventType = item.type;
    pill.title = `${item.title}${item.location ? ' (' + item.location + ')' : ''}`;

    if (isTask) {
      pill.style.background = '#162d4a';
      pill.style.border = `1px solid rgba(0, 0, 0, 0.4)`;
      pill.style.borderLeft = `3px solid ${item.color || '#00d4aa'}`;
      pill.style.color = '#d2e3fc';
    } else {
      pill.style.background = darkenColor(item.color, 0.52);
      pill.style.border = `1px solid rgba(0, 0, 0, 0.35)`;
      pill.style.borderLeft = `3px solid ${item.color}`;
      pill.style.color = '#ffffff';
    }

    if (item.completed) pill.style.opacity = '0.4';

    const prefixHtml = isTask && item.locPrefix 
      ? `<span class="task-loc-prefix" style="color:${item.locColor || 'var(--accent)'};font-weight:600;margin-right:3px;flex-shrink:0;opacity:0.9;">${escHtml(item.locPrefix)}</span>` 
      : '';

    pill.innerHTML = `
      ${isTask ? '<span class="task-checkbox-circle" style="font-size:10px;line-height:1;opacity:0.8;flex-shrink:0;">◯</span> ' : ''}
      ${prefixHtml}
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-weight:600;">${escHtml(item.title)}</span>
    `;

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.type === 'task') {
        showTaskModal(item.id);
      } else {
        showEventPopover(item.id, item.type, pill);
      }
    });

    cell.appendChild(pill);
  });

  // 2. RENDER TIMED ITEMS IN THE SCROLLABLE HOURLY GRID
  const eventsByDay = {};
  timedItems.forEach(item => {
    if (!eventsByDay[item.dayIdx]) eventsByDay[item.dayIdx] = [];
    eventsByDay[item.dayIdx].push(item);
  });

  Object.entries(eventsByDay).forEach(([dayIdxStr, dayItems]) => {
    const dayIdx = parseInt(dayIdxStr, 10);

    dayItems.forEach(item => {
      const sTime = item.startTime || '08:00';
      const [sh, sm] = sTime.split(':').map(Number);
      item.startMinutes = sh * 60 + (sm || 0);

      if (item.type === 'task') {
        item.endMinutes = item.startMinutes + 30;
      } else if (item.endTime) {
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
      const top = (item.startMinutes / 60) * cellHeight;
      const isTask = item.type === 'task';
      const height = isTask ? Math.max(((30 / 60) * cellHeight), 22) : Math.max(((item.endMinutes - item.startMinutes) / 60) * cellHeight, 22);

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
      el.className = `calendar-event ${isTask ? 'is-task' : ''}`;
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.zIndex = zIndex;

      const textColor = isTask ? '#d2e3fc' : '#ffffff';

      if (isTask) {
        el.style.background = '#162d4a';
        el.style.border = `1px solid rgba(0, 0, 0, 0.4)`;
        el.style.borderLeft = `3px solid ${item.color || '#00d4aa'}`;
        el.style.color = textColor;
      } else {
        el.style.background = darkenColor(item.color, 0.52);
        el.style.border = `1px solid rgba(0, 0, 0, 0.35)`;
        el.style.borderLeft = `3px solid ${item.color}`;
        el.style.color = textColor;
      }

      if (item.completed) el.style.opacity = '0.4';

      const eventTimeDisplay = item.startTime ? `${formatTimeShort(item.startTime)}${item.endTime ? ' – ' + formatTimeShort(item.endTime) : ''}` : 'All Day';
      const isSideBySide = sameTimeItems.length > 1;
      const titleLenPx = (item.title || '').length * 6.5;
      const prefixLenPx = (item.locPrefix || '').length * 6.5;

      // Space-aware prioritization: Task Title (1st) > Section Prefix (2nd) > Time (3rd)
      const showTaskPrefix = isTask && item.locPrefix && !isSideBySide && (width >= 135) && ((width - 35) >= (prefixLenPx + Math.min(titleLenPx, 40)));
      const showTaskTime = isTask && item.startTime && !isSideBySide && (width >= 175) && ((width - 35) >= (prefixLenPx + titleLenPx + 45));

      const prefixHtml = showTaskPrefix 
        ? `<span class="task-loc-prefix" style="color:${item.locColor || 'var(--accent)'};font-weight:600;margin-right:3px;flex-shrink:0;opacity:0.9;">${escHtml(item.locPrefix)}</span>` 
        : '';
      const timeHtml = showTaskTime 
        ? `<span class="task-time-inline" style="opacity:0.82;font-size:10px;margin-left:4px;flex-shrink:0;font-variant-numeric:tabular-nums;">${formatTimeShort(item.startTime)}</span>` 
        : '';

      el.innerHTML = `
        <div class="event-card-content" style="color:${textColor};">
          <div class="event-title" style="display:flex;align-items:center;gap:3px;min-width:0;">
            ${isTask ? '<span class="task-checkbox-circle" style="font-size:10px;line-height:1;opacity:0.8;flex-shrink:0;">◯</span> ' : ''}
            ${prefixHtml}
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-weight:600;">${escHtml(item.title)}</span>
            ${timeHtml}
          </div>
          ${!isTask && height >= 32 ? `<div class="event-time" style="color:${textColor};opacity:0.88;">${eventTimeDisplay}</div>` : ''}
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
    const lineTop = (currentMins / 60) * cellHeight;
    const dayLeft = timeColWidth + todayDayIdx * dayColWidth;

    const timeLine = document.createElement('div');
    timeLine.className = 'calendar-current-time-line';
    timeLine.style.top = `${lineTop}px`;
    timeLine.style.left = `${dayLeft}px`;
    timeLine.style.width = `${dayColWidth}px`;

    const timeDot = document.createElement('div');
    timeDot.className = 'calendar-current-time-dot';
    timeDot.style.top = `${lineTop - 4}px`;
    timeDot.style.left = `${dayLeft - 4}px`;

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
