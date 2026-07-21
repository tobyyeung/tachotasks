// ===== SETTINGS VIEW =====
function renderSettings() {
  const visibleIds = state.settings.visibleGcalIds || state.gcalCalendars.map(c => c.id);

  let gcalSettingsHtml = '';
  if (state.gcalCalendars.length > 0) {
    gcalSettingsHtml = state.gcalCalendars.map(cal => {
      const isVisible = visibleIds.includes(cal.id);
      return `
        <div class="settings-cal-item" style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg-glass);border-radius:var(--radius-md);margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:16px;height:16px;border-radius:4px;background:${cal.color}"></div>
            <span style="font-size:14px;font-weight:500;">${escHtml(cal.summary)}</span>
          </div>
          <label style="display:flex;align-items:center;cursor:pointer;">
            <input type="checkbox" class="setting-visible-cb" data-cal-id="${cal.id}" ${isVisible ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer;">
            <span style="margin-left:8px;font-size:13px;color:var(--text-secondary)">Show in Sidebar</span>
          </label>
        </div>
      `;
    }).join('');
  } else {
    gcalSettingsHtml = `<div class="empty-state"><div class="empty-icon" style="width:48px;height:48px;margin:0 auto 16px;color:var(--text-tertiary);">${icons.calendar}</div><div class="empty-text">No Google Calendars loaded. Sign in first!</div></div>`;
  }

  return `
    <div class="settings-view" style="max-width:800px;margin:0 auto;animation:fadeInUp 0.3s ease;">
      <div class="view-header" style="margin-bottom:24px;">
        <h1>Settings</h1>
        <p style="color:var(--text-secondary);">Manage your preferences and integrations.</p>
      </div>

      <div class="settings-section" style="margin-bottom:32px;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Profiles</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Manage your category profiles (Work, Personal, etc.).</p>
        <div id="settings-profiles-list">
          ${(state.profiles || []).map(p => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg-glass);border-radius:var(--radius-md);margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:12px;">
                ${p.image ? `<img src="${p.image}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;">` : `<span style="font-weight:600;width:24px;text-align:center;">${escHtml(p.icon)}</span>`}
                <span style="font-size:14px;font-weight:500;">${escHtml(p.name)}</span>
              </div>
              <div style="display:flex;gap:8px;">
                ${p.id !== 'all' ? `<button class="icon-btn edit-profile-btn" data-profile-id="${p.id}" title="Edit Profile" style="color:var(--text-secondary);">✎</button>` : ''}
                ${p.id !== 'all' ? `<button class="icon-btn delete-profile-btn" data-profile-id="${p.id}" title="Delete Profile" style="color:var(--danger);">✕</button>` : '<span style="font-size:12px;color:var(--text-tertiary);">Default</span>'}
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <input type="text" id="new-profile-name" placeholder="Profile Name" class="form-input" style="flex:1;">
          <input type="text" id="new-profile-icon" placeholder="Icon (e.g. W, 💼)" class="form-input" style="width:120px;">
          <button id="add-profile-btn" class="btn-primary" style="padding:0 16px;">Add</button>
        </div>
      </div>

      <div class="settings-section" style="margin-bottom:32px;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Default Creation Profile</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Items created while viewing 'All' will automatically be assigned to this profile.</p>
        <select id="settings-default-profile-select" class="form-select" style="max-width:300px;padding:8px 12px;">
          ${(state.profiles || []).filter(p => p.id !== 'all').map(p => `
            <option value="${p.id}" ${(state.settings.defaultProfileId || 'profile-personal') === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>
          `).join('')}
        </select>
      </div>

      <div class="settings-section" style="margin-bottom:32px;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Google Calendars Visibility</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Select which calendars should appear in your sidebar. Hidden calendars will not be synced or displayed.</p>
        <div class="settings-gcal-list">
          ${gcalSettingsHtml}
        </div>
      <div class="settings-section" style="margin-bottom:32px;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Data & Backup</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Export your local data to a JSON file for safekeeping, or import from a previous backup.</p>
        <div style="display:flex;gap:16px;">
          <button id="export-backup-btn" class="btn-secondary">Export Backup</button>
          <label class="btn-secondary" style="cursor:pointer;display:flex;align-items:center;">
            Import Backup
            <input type="file" id="import-backup-file" accept=".json" style="display:none;" />
          </label>
        </div>
      </div>
    </div>
  `;
}

