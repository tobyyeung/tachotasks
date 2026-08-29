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
        <img src="assets/icons/Pencil.png" alt="Edit" style="width:16px;height:16px;object-fit:contain;" />
      </button>
      <button class="popover-action" id="popover-delete-btn" title="Delete event">
        <img src="assets/icons/Trash.png" alt="Delete" style="width:16px;height:16px;object-fit:contain;" />
      </button>
      <button class="popover-action" id="popover-email-btn" title="Email">
        <img src="assets/icons/Mail.png" alt="Email" style="width:16px;height:16px;object-fit:contain;" />
      </button>
      <button class="popover-action" id="popover-more-btn" title="More options">
        <img src="assets/icons/Dots.png" alt="More" style="width:16px;height:16px;object-fit:contain;" />
      </button>
      <button class="popover-action" id="popover-close-btn" title="Close">
        <img src="assets/icons/Cross.png" alt="Close" style="width:16px;height:16px;object-fit:contain;" />
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
            <img src="assets/icons/Pinpoint.png" alt="Location" style="width:18px;height:18px;object-fit:contain;" />
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
            <img src="assets/icons/Description.png" alt="Description" style="width:18px;height:18px;object-fit:contain;" />
          </div>
          <div class="popover-detail-content">
            <div class="popover-detail-primary" style="white-space:pre-wrap;">${escHtml(cleanDesc.trim())}</div>
          </div>
        </div>
      ` : ''}

      <div class="popover-detail-row">
        <div class="popover-detail-icon">
          <img src="assets/icons/Calendar.png" alt="Calendar" style="width:18px;height:18px;object-fit:contain;" />
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
