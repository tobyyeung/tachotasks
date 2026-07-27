/**
 * reminders.js
 * Reminders view rendering and management.
 */

function renderReminders() {
  let html = `
    <div class="tasks-view" style="max-width:800px;margin:0 auto;animation:fadeInUp 0.3s ease;">
      <div class="view-header" style="margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h1>Reminders</h1>
          <p style="color:var(--text-secondary);">Manage upcoming events and reminders.</p>
        </div>
        <button class="btn-primary" id="add-reminder-btn">+ New Reminder</button>
      </div>
      
      <div style="display:flex; gap:var(--sp-sm); margin-bottom: 24px; flex-wrap:wrap;">
        <input type="text" id="quick-reminder-name" class="inbox-input" placeholder="Reminder / Person Name" style="flex: 1; padding: 10px;" />
        <input type="date" id="quick-reminder-date" class="inbox-input" style="flex: 0 0 150px; padding: 10px;" />
        <button id="quick-reminder-submit-btn" class="inbox-add-btn" style="padding: 10px 20px;">Add</button>
      </div>

      <div class="task-list">
  `;
  const filteredReminders = getFilteredByMode(state.reminders || []);
  if (filteredReminders && filteredReminders.length > 0) {
    const sorted = [...filteredReminders].sort((a, b) => new Date(a.date) - new Date(b.date));
    html += sorted.map(r => {
      const rDate = new Date(r.date);
      const diff = Math.ceil((rDate - new Date(getTodayStr())) / 86400000);
      let daysText = diff === 0 ? 'Today' : (diff === 1 ? 'Tomorrow' : (diff < 0 ? 'Past' : `In ${diff} days`));

      return `
        <div class="task-item" style="display:flex; justify-content:space-between; align-items:center; cursor:default;">
          <div style="display:flex; align-items:center; gap:16px;">
            <div style="width:24px;height:24px;display:flex;align-items:center;">
              <img src="assets/icons/Bell.png" alt="Reminder" style="width:24px;height:24px;object-fit:contain;" />
            </div>
            <div>
              <div style="font-size:15px; font-weight:500;">${escHtml(r.personName)}</div>
              <div style="font-size:12px; color:var(--text-tertiary);">${r.date}</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:16px;">
            <span style="font-size:13px; font-weight:600; color:var(--accent);">${daysText}</span>
            <button class="icon-btn delete-reminder-btn" data-reminder-id="${r.id}" style="color:var(--danger);" title="Delete Reminder">✕</button>
          </div>
        </div>
      `;
    }).join('');
  } else {
    html += `<div class="empty-state"><div class="empty-icon" style="width:48px;height:48px;margin:0 auto 16px;color:var(--text-tertiary);">${icons.party}</div><div class="empty-text">No reminders set. Add reminders to stay on track!</div></div>`;
  }

  html += `
      </div>
    </div>
  `;
  return html;
}
