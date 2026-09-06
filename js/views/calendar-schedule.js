// ===== CALENDAR SCHEDULE VIEW COMPONENT =====
/**
 * Formats a start and end time range for schedule agenda display.
 */
function formatScheduleTimeRange(startTime, endTime, isAllDay) {
  if (isAllDay || !startTime) return 'All day';
  if (!endTime) return formatTimeShort(startTime);

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  const sAmpm = sh >= 12 ? 'pm' : 'am';
  const eAmpm = (eh >= 12 && eh < 24) ? 'pm' : 'am';
  const sDisplayH = sh === 0 ? 12 : (sh > 12 ? sh - 12 : sh);
  const eDisplayH = (eh === 0 || eh === 24) ? 12 : (eh > 12 ? eh - 12 : eh);

  const sMinsStr = sm > 0 ? `:${String(sm).padStart(2, '0')}` : '';
  const eMinsStr = em > 0 ? `:${String(em).padStart(2, '0')}` : '';

  if (sAmpm === eAmpm) {
    return `${sDisplayH}${sMinsStr} – ${eDisplayH}${eMinsStr}${eAmpm}`;
  }
  return `${sDisplayH}${sMinsStr}${sAmpm} – ${eDisplayH}${eMinsStr}${eAmpm}`;
}

/**
 * Renders the full chronological agenda Schedule View mode for the calendar.
 */
function renderScheduleView(date, todayStr, sessionBanner, viewBtns, monthYear) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const monthDays = [];
  for (let d = 1; d <= totalDays; d++) {
    monthDays.push(new Date(year, month, d));
  }

  const itemsByDate = {};
  monthDays.forEach(d => {
    const dStr = toDateStr(d);
    itemsByDate[dStr] = [];
  });

  const addScheduleEvent = (evt, type, color) => {
    const startDate = evt.date;
    let endDate = evt.endDate || evt.date;
    const isPureAllDay = Boolean(evt.isAllDay || !evt.startTime);

    // Check if timed event ends at 12am midnight (00:00 or 24:00)
    const isEndTimeMidnight = Boolean(
      !isPureAllDay && evt.endTime && (evt.endTime === '00:00' || evt.endTime === '24:00') && evt.startTime !== evt.endTime
    );

    let effectiveEndTime = evt.endTime;

    if (isEndTimeMidnight) {
      effectiveEndTime = '24:00';
      // If endDate was set to the following day because of 00:00 midnight end time, adjust it back by 1 day
      if (endDate > startDate && evt.endTime === '00:00') {
        const parts = endDate.split('-').map(Number);
        const prevD = new Date(parts[0], parts[1] - 1, parts[2] - 1);
        const py = prevD.getFullYear();
        const pm = String(prevD.getMonth() + 1).padStart(2, '0');
        const pd = String(prevD.getDate()).padStart(2, '0');
        endDate = `${py}-${pm}-${pd}`;
        if (endDate < startDate) endDate = startDate;
      }
    }

    const isOvernight = !isPureAllDay && !isEndTimeMidnight && Boolean(
      (endDate > startDate) || (effectiveEndTime && effectiveEndTime <= evt.startTime)
    );

    if (isOvernight && endDate <= startDate) {
      const parts = startDate.split('-').map(Number);
      const nextD = new Date(parts[0], parts[1] - 1, parts[2]);
      nextD.setDate(nextD.getDate() + 1);
      const y = nextD.getFullYear();
      const m = String(nextD.getMonth() + 1).padStart(2, '0');
      const d = String(nextD.getDate()).padStart(2, '0');
      endDate = `${y}-${m}-${d}`;
    }

    monthDays.forEach(d => {
      const dStr = toDateStr(d);
      if (dStr >= startDate && dStr <= endDate && itemsByDate[dStr]) {
        const isStart = (dStr === startDate);
        const isEnd = (dStr === endDate);

        if (isPureAllDay) {
          itemsByDate[dStr].push({
            id: evt.id, originalId: evt.id, type, title: evt.title || 'Untitled Event', color,
            date: dStr, startTime: null, endTime: null,
            location: evt.location || '', isAllDay: true
          });
        } else if (isOvernight) {
          if (isStart) {
            itemsByDate[dStr].push({
              id: `${evt.id}__day1`, originalId: evt.id, type, title: evt.title || 'Untitled Event', color,
              date: dStr, startTime: evt.startTime, endTime: '24:00',
              location: evt.location || '', isAllDay: false
            });
          } else if (isEnd) {
            itemsByDate[dStr].push({
              id: `${evt.id}__day2`, originalId: evt.id, type, title: evt.title || 'Untitled Event', color,
              date: dStr, startTime: '00:00', endTime: evt.endTime || '04:00',
              location: evt.location || '', isAllDay: false
            });
          } else {
            itemsByDate[dStr].push({
              id: `${evt.id}__mid_${dStr}`, originalId: evt.id, type, title: evt.title || 'Untitled Event', color,
              date: dStr, startTime: null, endTime: null,
              location: evt.location || '', isAllDay: true
            });
          }
        } else {
          itemsByDate[dStr].push({
            id: evt.id, originalId: evt.id, type, title: evt.title || 'Untitled Event', color,
            date: dStr, startTime: evt.startTime || null, endTime: effectiveEndTime || evt.endTime || null,
            location: evt.location || '', isAllDay: false
          });
        }
      }
    });
  };

  state.events.forEach(evt => addScheduleEvent(evt, 'event', evt.color || '#4285f4'));

  const activeIds = Array.isArray(state.activeGcalIds) ? state.activeGcalIds : (state.settings.activeGcalIds || []);
  state.gcalEvents.forEach(evt => {
    if (!activeIds.includes(evt.calendarId)) return;
    const cal = state.gcalCalendars.find(c => c.id === evt.calendarId);
    const calColor = cal ? cal.color : (evt.color || 'var(--accent)');
    addScheduleEvent(evt, 'gcal_event', calColor);
  });

  // Collect tasks
  state.tasks.forEach(task => {
    if (!task.dueDate || !itemsByDate[task.dueDate]) return;
    if (task.projectId && !isProjectActive(task.projectId)) return;
    let locPrefix = '';
    let locColor = '';
    if (task.projectId) {
      const proj = (state.projects || []).find(p => p.id === task.projectId);
      if (proj && proj.name) {
        locColor = proj.color || '';
        if (task.sectionId && task.sectionId !== 'unsectioned') {
          const sec = (proj.sections || (state.settings && state.settings.projectSections) || []).find(s => s.id === task.sectionId);
          if (sec && sec.name && sec.name !== 'Uncategorized' && sec.name.toLowerCase() !== 'tasks') {
            locPrefix = `${proj.name} (${sec.name}):`;
          } else {
            locPrefix = `${proj.name}:`;
          }
        } else {
          locPrefix = `${proj.name}:`;
        }
      }
    } else if (task.sectionId && task.sectionId !== 'unsectioned' && state.settings && state.settings.taskSections) {
      const sec = state.settings.taskSections.find(s => s.id === task.sectionId);
      if (sec && sec.name && sec.name !== 'Uncategorized' && sec.name.toLowerCase() !== 'tasks') {
        locPrefix = `${sec.name}:`;
      }
    }

    itemsByDate[task.dueDate].push({
      id: task.id, type: 'task', title: task.title,
      color: getPriorityColor(task.priority) || '#00d4aa',
      date: task.dueDate, startTime: task.dueTime || null, endTime: null,
      locPrefix, locColor, completed: task.completed,
      isAllDay: !task.dueTime
    });
  });

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const dayNamesShort = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  let scheduleGroupsHtml = '';
  let totalRenderedEvents = 0;

  monthDays.forEach(d => {
    const dateStr = toDateStr(d);
    const dayItems = itemsByDate[dateStr] || [];
    const isToday = dateStr === todayStr;

    // Remove gaps: only show days with events (or today if within month)
    if (dayItems.length === 0 && !isToday) return;

    totalRenderedEvents += dayItems.length;

    // Sort day items: All day first, then by start time
    dayItems.forEach(item => {
      if (item.startTime) {
        const [sh, sm] = item.startTime.split(':').map(Number);
        item.startMinutes = sh * 60 + (sm || 0);
      } else {
        item.startMinutes = -1;
      }
    });

    dayItems.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return a.startMinutes - b.startMinutes;
    });

    const dayNum = d.getDate();
    const monthShort = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const dayNameShort = dayNamesShort[d.getDay()];

    let itemsHtml = '';
    let nowRendered = false;

    if (dayItems.length === 0 && isToday) {
      itemsHtml = `<div style="font-size:12px;color:var(--text-tertiary);padding:8px 12px;font-style:italic;">No events or tasks scheduled for today</div>`;
    } else {
      dayItems.forEach(item => {
        // Check current time line insertion for Today
        if (isToday && !nowRendered && !item.isAllDay && item.startMinutes > currentMins) {
          itemsHtml += `
            <div class="schedule-now-indicator">
              <span class="schedule-now-dot"></span>
              <span class="schedule-now-line"></span>
            </div>
          `;
          nowRendered = true;
        }

        const isTask = item.type === 'task';
        const timeDisplay = formatScheduleTimeRange(item.startTime, item.endTime, item.isAllDay);
        const prefixHtml = (isTask && item.locPrefix) 
          ? `<span style="color:${item.locColor || 'var(--accent)'};font-weight:600;margin-right:4px;">${escHtml(item.locPrefix)}</span>` 
          : '';

        itemsHtml += `
          <div class="schedule-item-row ${item.completed ? 'completed' : ''}" data-event-id="${item.id}" data-event-type="${item.type}">
            <div class="schedule-item-dot" style="background:${item.color};"></div>
            <div class="schedule-item-time">${timeDisplay}</div>
            <div class="schedule-item-body">
              ${isTask ? '<span class="task-checkbox-circle" style="font-size:12px;line-height:1;opacity:0.85;margin-right:2px;flex-shrink:0;">◯</span> ' : ''}
              <span class="schedule-item-title">${prefixHtml}${escHtml(item.title)}</span>
              ${item.location ? `<span class="schedule-item-loc">${escHtml(formatLocationShort(item.location))}</span>` : ''}
            </div>
          </div>
        `;
      });

      if (isToday && !nowRendered) {
        itemsHtml += `
          <div class="schedule-now-indicator">
            <span class="schedule-now-dot"></span>
            <span class="schedule-now-line"></span>
          </div>
        `;
        nowRendered = true;
      }
    }

    scheduleGroupsHtml += `
      <div class="schedule-day-group ${isToday ? 'is-today' : ''}" data-schedule-date="${dateStr}">
        <div class="schedule-day-label">
          <span class="schedule-day-num ${isToday ? 'today-badge' : ''}">${dayNum}</span>
          <span class="schedule-day-meta ${isToday ? 'today-meta' : ''}">${monthShort}, ${dayNameShort}</span>
        </div>
        <div class="schedule-day-items">
          ${itemsHtml}
        </div>
      </div>
    `;
  });

  if (totalRenderedEvents === 0 && !scheduleGroupsHtml) {
    scheduleGroupsHtml = `
      <div class="schedule-empty-state">
        <img src="assets/icons/Calendar.png" style="width:40px;height:40px;opacity:0.35;margin-bottom:12px;object-fit:contain;" />
        <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">No events or tasks scheduled</div>
        <div style="font-size:12px;color:var(--text-tertiary);">There are no scheduled items for ${monthYear}</div>
      </div>
    `;
  }

  return `
    ${sessionBanner}
    <div class="calendar-view schedule">
      <div class="calendar-header">
        <div class="calendar-nav">
          <button class="calendar-nav-btn" id="cal-prev" title="Previous">${icons.chevronLeft}</button>
          <button class="calendar-today-btn" id="cal-today">Today</button>
          <button class="calendar-nav-btn" id="cal-next" title="Next">${icons.chevronRight}</button>
        </div>
        <h2 class="calendar-title">${monthYear}</h2>
        <div class="calendar-view-modes">${viewBtns}</div>
      </div>
      
      <div class="schedule-view-container" id="schedule-scroll-area">
        ${scheduleGroupsHtml}
      </div>
    </div>
  `;
}
