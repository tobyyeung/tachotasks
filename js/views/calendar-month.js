/**
 * calendar-month.js
 * Monthly calendar view grid and event rendering.
 */

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
          state.calendarDate = parseDateLocal(dateStr);
          state.calendarViewMode = 'daily';
          persistUIState();
          renderView();
        });
        container.appendChild(moreBtn);
      }
    });
    return;
}
