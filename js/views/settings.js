// ===== SETTINGS VIEW =====
function renderSettings() {
  const visibleIds = Array.isArray(state.settings.visibleGcalIds)
    ? state.settings.visibleGcalIds
    : state.gcalCalendars.map(c => c.id);

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
                <img src="${p.image || 'assets/profiles/personal.png'}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;">
                <span style="font-size:14px;font-weight:500;">${escHtml(p.name)}</span>
              </div>
              <div style="display:flex;gap:8px;">
                ${p.id !== 'all' ? `<button class="icon-btn edit-profile-btn" data-profile-id="${p.id}" title="Edit Profile" style="display:inline-flex;align-items:center;justify-content:center;color:var(--text-secondary);"><img src="assets/icons/Pencil.png" alt="Edit" style="width:14px;height:14px;object-fit:contain;" /></button>` : ''}
                ${p.id !== 'all' ? `<button class="icon-btn delete-profile-btn" data-profile-id="${p.id}" title="Delete Profile" style="display:inline-flex;align-items:center;justify-content:center;color:var(--danger);"><img src="assets/icons/Trash.png" alt="Delete" style="width:14px;height:14px;object-fit:contain;" /></button>` : '<span style="font-size:12px;color:var(--text-tertiary);">Default</span>'}
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <input type="text" id="new-profile-name" placeholder="Profile Name" class="form-input" style="flex:1;">
          <button id="add-profile-btn" class="btn-primary" style="padding:0 16px;">Add</button>
        </div>
      </div>

      <div class="settings-section" style="margin-bottom:32px;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Dashboard Quick Links</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Customize the shortcut website links displayed in the top right of your Dashboard.</p>
        <div id="settings-quick-links-list" style="display:flex;flex-direction:column;gap:8px;">
          ${((state.settings && state.settings.dashboardQuickLinks) || [
            { title: 'Gmail', url: 'https://mail.google.com' },
            { title: 'Google Calendar', url: 'https://calendar.google.com' },
            { title: 'Canvas', url: 'https://canvas.instructure.com' },
            { title: 'GitHub', url: 'https://github.com' }
          ]).map((link, idx) => `
            <div class="settings-quick-link-row" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-glass);border-radius:var(--radius-md);border:1px solid var(--border);">
              <input type="text" class="form-input quick-link-edit-title" data-link-idx="${idx}" value="${escAttr(link.title)}" placeholder="Title (e.g. Canvas)" style="width:140px;padding:6px 10px;font-size:13px;" />
              <input type="url" class="form-input quick-link-edit-url" data-link-idx="${idx}" value="${escAttr(link.url)}" placeholder="URL (e.g. https://canvas.instructure.com)" style="flex:1;padding:6px 10px;font-size:13px;" />
              <button class="icon-btn delete-quick-link-btn" data-link-idx="${idx}" title="Delete Link" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;opacity:0.75;">
                <img src="assets/icons/Trash.png" alt="Delete" style="width:16px;height:16px;object-fit:contain;" />
              </button>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;align-items:center;">
          <input type="text" id="new-quick-link-title" placeholder="Title (e.g. Canvas)" class="form-input" style="width:150px;padding:8px 12px;font-size:13px;">
          <input type="url" id="new-quick-link-url" placeholder="URL (e.g. https://canvas.instructure.com)" class="form-input" style="flex:1;padding:8px 12px;font-size:13px;">
          <button id="add-quick-link-settings-btn" class="btn-primary" style="padding:8px 18px;font-size:13px;white-space:nowrap;">Add Link</button>
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
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Priority Flag Colors</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Customize flag colors for P1, P2, and P3. Priority P4 is always the slate outline flag.</p>
        <div style="display:flex;flex-direction:column;gap:12px;background:var(--bg-glass);padding:16px;border-radius:var(--radius-md);">
          ${['P1', 'P2', 'P3'].map(p => {
            const pColors = state.settings.priorityColors || { P1: 'red', P2: 'orange', P3: 'blue' };
            const currentColor = pColors[p] || (p === 'P1' ? 'red' : p === 'P2' ? 'orange' : 'blue');
            const availableColors = [
              { id: 'red', name: 'Red' },
              { id: 'orange', name: 'Orange' },
              { id: 'yellow', name: 'Yellow' },
              { id: 'green', name: 'Green' },
              { id: 'blue', name: 'Blue' },
              { id: 'purple', name: 'Purple' }
            ];
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div class="priority-flag-btn flag-color-${currentColor}" style="width:32px;height:32px;pointer-events:none;">
                    <img src="assets/icons/Flag filled.png" alt="${p}" style="width:18px;height:18px;" />
                  </div>
                  <span style="font-size:14px;font-weight:600;color:var(--text-primary);">Priority ${p}</span>
                </div>
                <select class="form-select setting-prio-color-select" data-priority="${p}" style="max-width:160px;padding:6px 10px;font-size:13px;">
                  ${availableColors.map(c => `<option value="${c.id}" ${currentColor === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
              </div>
            `;
          }).join('')}
          <div style="display:flex;align-items:center;justify-content:space-between;padding-top:4px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="priority-flag-btn flag-color-slate" style="width:32px;height:32px;pointer-events:none;">
                <img src="assets/icons/Flag.png" alt="P4" style="width:18px;height:18px;" />
              </div>
              <span style="font-size:14px;font-weight:600;color:var(--text-secondary);">Priority P4 (Default)</span>
            </div>
            <span style="font-size:12px;color:var(--text-tertiary);">Fixed Slate Outline</span>
          </div>
        </div>
      </div>

      <div class="settings-section" style="margin-bottom:32px;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Google Calendars Visibility</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Select which calendars should appear in your sidebar. Hidden calendars will not be synced or displayed.</p>
        <div class="settings-gcal-list">
          ${gcalSettingsHtml}
        </div>
      <div class="settings-section" style="margin-bottom:32px;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Developer & UI Testing</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Temporarily disable Auth and Google Sync to make UI design and testing fast and easy without auth overlays or network errors.</p>
        <label style="display:flex;align-items:center;cursor:pointer;gap:12px;padding:12px;background:var(--bg-glass);border-radius:var(--radius-md);">
          <input type="checkbox" id="settings-toggle-dev-mode" ${state.settings.devMode ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px;cursor:pointer;">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Disable Auth & Google Sync (Dev Mode)</div>
            <div style="font-size:12px;color:var(--text-secondary);">Bypasses Google login & cloud sync errors for fast local UI work.</div>
          </div>
        </label>
      </div>

      <div class="settings-section" style="margin-bottom:32px;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">Data & Cloud Sync</h2>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;">Force an immediate two-way synchronization with Firebase Cloud, or export/import your local data.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button id="settings-sync-cloud-btn" class="btn-primary" style="display:flex;align-items:center;gap:6px;">
            <img src="assets/icons/Refresh.png" alt="Sync" style="width:16px;height:16px;object-fit:contain;filter:brightness(10);" />
            Sync with Cloud Now
          </button>
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

