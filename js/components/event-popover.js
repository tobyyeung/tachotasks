/**
 * event-popover.js
 * Calendar Event Inspector / Popover for Google Calendar and local events.
 */

function showEventPopover(eventId, eventType, triggerEl) {
  let event = null;
  let calName = 'My Calendar';
  let eventColor = '#4285f4';

  if (eventType === 'gcal_event') {
    event = state.gcalEvents.find(e => e.id === eventId);
    if (event) {
      const cal = state.gcalCalendars.find(c => c.id === event.calendarId);
      if (cal) {
        calName = cal.summary || cal.name || 'Google Calendar';
        eventColor = cal.color || event.color || '#4285f4';
      } else {
        eventColor = event.color || '#4285f4';
      }
    }
  } else {
    event = state.events.find(e => e.id === eventId);
    if (event) {
      eventColor = event.color || '#4285f4';
      const prof = state.profiles.find(p => p.id === state.activeProfileId);
      if (prof) calName = prof.name;
    }
  }

  if (!event) return;

  const popover = document.getElementById('event-popover');
  if (!popover) return;

  // Format date and time
  const dateObj = parseDateLocal(event.date);
  const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' });
  const dayNum = dateObj.getDate();
  const fullDateStr = `${weekday}, ${monthName} ${dayNum}`;

  let timeStr = 'All Day';
  if (event.startTime && event.endTime) {
    timeStr = `${formatTime12(event.startTime)} – ${formatTime12(event.endTime)}`;
  } else if (event.startTime) {
    timeStr = `${formatTime12(event.startTime)}`;
  }

  // Location parsing (split venue name and address if comma/newline separated)
  let loc = event.location || '';
  let locLine1 = '';
  let locLine2 = '';
  if (loc) {
    if (loc.includes('\n')) {
      const parts = loc.split('\n');
      locLine1 = parts[0].trim();
      locLine2 = parts.slice(1).join(', ').trim();
    } else if (loc.includes(',')) {
      const commaIdx = loc.indexOf(',');
      locLine1 = loc.substring(0, commaIdx).trim();
      locLine2 = loc.substring(commaIdx + 1).trim();
    } else {
      locLine1 = loc.trim();
    }
  }

  // Clean description
  let cleanDesc = '';
  if (event.description) {
    const tmp = document.createElement('div');
    tmp.innerHTML = event.description.replace(/<br\s*[\/]?>/gi, '\n');
    cleanDesc = tmp.textContent || tmp.innerText || '';
    if (cleanDesc.includes('Changes made to the title, description, or attachments will not be saved')) {
      cleanDesc = '';
    }
  }

  const creatorName = state.user ? (state.user.displayName || state.user.email || 'Toby Yeung') : 'Toby Yeung';
  const recurrenceStr = event.recurrenceText || (event.recurring ? `Repeats ${event.recurring}` : '');

  const html = `
    <div class="popover-header">
      <button class="popover-action" id="popover-edit-btn" title="Edit event">
        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
      </button>
      <button class="popover-action" id="popover-delete-btn" title="Delete event">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
      <button class="popover-action" id="popover-email-btn" title="Email">
        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
      </button>
      <button class="popover-action" id="popover-more-btn" title="More options">
        <svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
      </button>
      <button class="popover-action" id="popover-close-btn" title="Close">
        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>

    <div class="popover-main">
      <div class="popover-color-box" style="background:${eventColor}"></div>
      <div class="popover-title-section">
        <h2 class="popover-title">${escHtml(event.title)}</h2>
        <div class="popover-datetime">${fullDateStr} · ${timeStr}</div>
        ${recurrenceStr ? `<div class="popover-recurrence">${escHtml(recurrenceStr)}</div>` : ''}
      </div>
    </div>

    <div class="popover-details">
      ${locLine1 ? `
        <div class="popover-detail-row">
          <div class="popover-detail-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          </div>
          <div class="popover-detail-content">
            <div class="popover-detail-primary">${escHtml(locLine1)}</div>
            ${locLine2 ? `<div class="popover-detail-secondary">${escHtml(locLine2)}</div>` : ''}
          </div>
        </div>
      ` : ''}

      ${cleanDesc.trim() ? `
        <div class="popover-detail-row">
          <div class="popover-detail-icon">
            <svg viewBox="0 0 24 24"><path d="M3 18h12v-2H3v2zM3 6v2h18V6H3zm0 7h18v-2H3v2z"/></svg>
          </div>
          <div class="popover-detail-content">
            <div class="popover-detail-primary" style="white-space:pre-wrap;">${escHtml(cleanDesc.trim())}</div>
          </div>
        </div>
      ` : ''}

      <div class="popover-detail-row">
        <div class="popover-detail-icon">
          <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
        </div>
        <div class="popover-detail-content">
          <div class="popover-detail-primary">${escHtml(calName)}</div>
          <div class="popover-detail-secondary">Created by: ${escHtml(creatorName)}</div>
        </div>
      </div>
    </div>
  `;

  popover.innerHTML = html;

  // Calculate position
  const rect = triggerEl.getBoundingClientRect();
  const popoverWidth = 440;

  let left = rect.right + 12;
  if (left + popoverWidth > window.innerWidth - 16) {
    left = rect.left - popoverWidth - 12;
  }
  if (left < 16) left = Math.max(16, (window.innerWidth - popoverWidth) / 2);

  let top = rect.top - 20;
  const popoverHeight = popover.offsetHeight || 280;
  if (top + popoverHeight > window.innerHeight - 20) {
    top = window.innerHeight - popoverHeight - 20;
  }
  if (top < 20) top = 20;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.classList.remove('hidden');

  // Event Listeners
  document.getElementById('popover-close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    popover.classList.add('hidden');
  });

  const editBtn = document.getElementById('popover-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.add('hidden');
      if (event.htmlLink) window.open(event.htmlLink, '_blank');
      else showToast('Editing local event', 'info');
    });
  }

  const deleteBtn = document.getElementById('popover-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this event?')) {
        state.events = state.events.filter(ev => ev.id !== event.id);
        popover.classList.add('hidden');
        renderView();
        showToast('Event deleted', 'success');
      }
    });
  }

  const emailBtn = document.getElementById('popover-email-btn');
  if (emailBtn) {
    emailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`mailto:?subject=${encodeURIComponent(event.title)}`, '_blank');
    });
  }

  // Global click listener to close popover if clicking outside
  const outsideClickListener = (e) => {
    if (!popover.contains(e.target) && !triggerEl.contains(e.target)) {
      popover.classList.add('hidden');
      document.removeEventListener('click', outsideClickListener);
    }
  };

  document.removeEventListener('click', window._popoverOutsideClickListener);
  window._popoverOutsideClickListener = outsideClickListener;
  setTimeout(() => document.addEventListener('click', outsideClickListener), 10);
}
