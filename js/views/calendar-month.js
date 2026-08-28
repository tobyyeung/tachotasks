/**
 * calendar-month.js
 * Monthly calendar view grid and event rendering with interactive day overflow popover.
 */

/**
 * Closes any active month day overflow popover.
 */
function closeMonthDayOverflowPopover() {
  const existing = document.getElementById('month-day-overflow-popover');
  if (existing) {
    existing.remove();
  }
}

/**
 * Displays the day overflow popover anchored to the day cell matching the native design.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {Array} dayItems - list of tasks/events for this day
 * @param {HTMLElement} anchorEl - the clicked '+X more' badge or cell
 */
function showMonthDayOverflowPopover(dateStr, dayItems, anchorEl) {
  closeMonthDayOverflowPopover();

  const dateObj = parseDateLocal(dateStr);
  const weekdayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const dayNum = dateObj.getDate();

  // Create popover container
  const popover = document.createElement('div');
  popover.id = 'month-day-overflow-popover';
  popover.className = 'month-day-overflow-popover';

  // Build items HTML
  const itemsHtml = dayItems.map(item => {
    const isTask = item.type === 'task';
    const isDone = Boolean(item.completed);

    if (item.isAllDay) {
      const textColor = isTask ? '#d2e3fc' : '#ffffff';
      const bg = isTask ? '#162d4a' : darkenColor(item.color || '#4285f4', 0.52);
      const borderLeft = `3px solid ${item.color || '#4285f4'}`;
      return `
        <div class="month-popover-pill ${isDone ? 'completed' : ''}" data-item-id="${item.id}" data-item-type="${item.type}" style="background:${bg};color:${textColor};border:1px solid rgba(0,0,0,0.35);border-left:${borderLeft};" title="${escAttr(item.title)}">
          <span class="month-popover-title">${escHtml(item.title)}</span>
        </div>
      `;
    } else {
      const dotColor = item.color || (isTask ? 'var(--accent)' : '#4285f4');
      const timeStr = item.startTime ? formatTimeShort(item.startTime) : '';
      return `
        <div class="month-popover-timed-row ${isDone ? 'completed' : ''}" data-item-id="${item.id}" data-item-type="${item.type}" title="${escAttr(item.title)}">
          <span class="month-popover-dot" style="background:${dotColor};"></span>
          ${timeStr ? `<span class="month-popover-time">${timeStr}</span>` : ''}
          ${isDone ? `<span class="month-popover-check">✔</span>` : ''}
          <span class="month-popover-title">${escHtml(item.title)}</span>
        </div>
      `;
    }
  }).join('');

  popover.innerHTML = `
    <div class="month-popover-header">
      <div class="month-popover-weekday">${weekdayShort}</div>
      <div class="month-popover-daynum">${dayNum}</div>
      <button class="month-popover-close-btn" id="month-popover-close-btn" title="Close">✕</button>
    </div>
    <div class="month-popover-items">
      ${itemsHtml}
    </div>
  `;

  document.body.appendChild(popover);

  // Position popover relative to cell or anchor
  const cell = anchorEl.closest('.calendar-month-cell') || anchorEl;
  const cellRect = cell.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();

  const popoverWidth = popoverRect.width || 250;
  const popoverHeight = popoverRect.height || 260;

  // Align with the top of the cell, centered horizontally over the cell
  let left = cellRect.left + (cellRect.width / 2) - (popoverWidth / 2);
  let top = cellRect.top - 8;

  // Boundary checks
  const margin = 12;
  if (left < margin) left = margin;
  if (left + popoverWidth > window.innerWidth - margin) {
    left = window.innerWidth - popoverWidth - margin;
  }
  if (top < margin) top = margin;
  if (top + popoverHeight > window.innerHeight - margin) {
    top = window.innerHeight - popoverHeight - margin;
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;

  // Close button handler
  const closeBtn = popover.querySelector('#month-popover-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMonthDayOverflowPopover();
    });
  }

  // Item click handlers
  popover.querySelectorAll('[data-item-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = row.dataset.itemId;
      const itemType = row.dataset.itemType;
      closeMonthDayOverflowPopover();
      if (itemType === 'task') {
        showTaskModal(itemId);
      } else {
        showEventPopover(itemId, itemType, row);
      }
    });
  });

  // Click outside and ESC key dismiss listeners
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeMonthDayOverflowPopover();
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  document.addEventListener('keydown', onKeyDown);

  setTimeout(() => {
    const onDocClick = (e) => {
      if (!popover.contains(e.target) && e.target !== anchorEl) {
        closeMonthDayOverflowPopover();
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKeyDown);
      }
    };
    document.addEventListener('click', onDocClick);
  }, 10);
}

function renderMonthlyCalendarGrid(date, today) {
  let gridHtml = '';
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
  return gridHtml;
}

function renderMonthEvents(days, items) {
  closeMonthDayOverflowPopover();

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
        const isTask = item.type === 'task';
        el.classList.add('all-day');
        el.style.background = isTask ? '#162d4a' : darkenColor(item.color, 0.52);
        el.style.border = '1px solid rgba(0, 0, 0, 0.35)';
        el.style.borderLeft = `3px solid ${item.color}`;
        el.style.color = isTask ? '#d2e3fc' : '#ffffff';
      } else {
        el.style.background = 'transparent';
        el.style.color = 'var(--text-primary)';
      }

      if (item.completed) el.classList.add('completed');

      const timeStr = item.startTime ? formatTimeShort(item.startTime) : '';
      const dotHtml = !item.isAllDay ? `<span class="event-dot" style="background:${item.color};"></span>` : '';
      const timeHtml = timeStr ? `<span class="event-time-prefix">${timeStr}</span> ` : '';
      const prefixHtml = (item.type === 'task' && item.locPrefix) ? `<span style="color:${item.locColor || 'var(--accent)'};font-weight:600;opacity:0.9;">${escHtml(item.locPrefix)} </span>` : '';
      const titleHtml = `<span class="event-title-text">${prefixHtml}${escHtml(item.title)}</span>`;

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
        showMonthDayOverflowPopover(dateStr, dayItems, moreBtn);
      });
      container.appendChild(moreBtn);
    }
  });
  return;
}
