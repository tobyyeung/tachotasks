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
        <div class="settings-cal-item">
          <div class="settings-item-info">
            <div style="width:14px;height:14px;border-radius:4px;background:${cal.color};flex-shrink:0;"></div>
            <span class="settings-item-name">${escHtml(cal.summary || cal.name || 'Calendar')}</span>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" class="setting-visible-cb" data-cal-id="${cal.id}" ${isVisible ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer;">
            <span style="font-size:13px;color:var(--text-secondary);">Show in Sidebar</span>
          </label>
        </div>
      `;
    }).join('');
  } else {
    gcalSettingsHtml = `
      <div class="empty-state" style="padding:28px 16px;text-align:center;">
        <div class="empty-icon" style="width:40px;height:40px;margin:0 auto 12px;opacity:0.4;">
          <img src="assets/icons/Calendar.png" alt="Calendar" style="width:100%;height:100%;object-fit:contain;" />
        </div>
        <div class="empty-text" style="font-size:13px;color:var(--text-secondary);">No Google Calendars loaded yet. Sign in or connect Google Calendar below.</div>
      </div>
    `;
  }

  const priorityColors = state.settings.priorityColors || { P1: 'red', P2: 'orange', P3: 'blue' };
  const availableColors = [
    { id: 'red', name: 'Red' },
    { id: 'orange', name: 'Orange' },
    { id: 'yellow', name: 'Yellow' },
    { id: 'green', name: 'Green' },
    { id: 'blue', name: 'Blue' },
    { id: 'purple', name: 'Purple' }
  ];

  return `
    <div class="settings-view">
      <div class="settings-header">
        <h1>Settings</h1>
        <p>Customize your workspace, priority flags, dashboard shortcuts, and integrations.</p>
      </div>

      <div class="settings-layout">
        <!-- Table of Contents Side Navigation -->
        <aside class="settings-toc" id="settings-toc">
          <div class="settings-toc-header">
            <span class="settings-toc-title">Table of Contents</span>
          </div>
          <nav class="settings-toc-nav" aria-label="Settings sections navigation">
            <button type="button" class="settings-toc-link active" data-target="settings-sec-profiles">
              <span class="settings-toc-icon">
                <img src="assets/icons/User.png" alt="" />
              </span>
              <span class="settings-toc-text">Profiles & Categories</span>
            </button>
            <button type="button" class="settings-toc-link" data-target="settings-sec-priorities">
              <span class="settings-toc-icon">
                <img src="assets/icons/Flag.png" alt="" />
              </span>
              <span class="settings-toc-text">Priority Flags</span>
            </button>
            <button type="button" class="settings-toc-link" data-target="settings-sec-quicklinks">
              <span class="settings-toc-icon">
                <img src="assets/icons/Dashboard.png" alt="" />
              </span>
              <span class="settings-toc-text">Dashboard Shortcuts</span>
            </button>
            <button type="button" class="settings-toc-link" data-target="settings-sec-gcal">
              <span class="settings-toc-icon">
                <img src="assets/icons/Calendar.png" alt="" />
              </span>
              <span class="settings-toc-text">Google Calendars</span>
            </button>
            <button type="button" class="settings-toc-link" data-target="settings-sec-sync">
              <span class="settings-toc-icon">
                <img src="assets/icons/Cloud.png" alt="" />
              </span>
              <span class="settings-toc-text">Cloud Sync & Data</span>
            </button>
            <button type="button" class="settings-toc-link" data-target="settings-sec-developer">
              <span class="settings-toc-icon">
                <img src="assets/icons/Settings.png" alt="" />
              </span>
              <span class="settings-toc-text">Developer & Testing</span>
            </button>
          </nav>
        </aside>

        <!-- Settings Cards Content -->
        <div class="settings-content" id="settings-content">
          <!-- General & Profiles Card -->
          <div class="settings-card" id="settings-sec-profiles">
        <div class="settings-card-header">
          <div class="settings-card-title-group">
            <div class="settings-card-icon">
              <img src="assets/icons/User.png" alt="Profiles" />
            </div>
            <div class="settings-card-title">Profiles & Categorization</div>
          </div>
        </div>
        <div class="settings-card-desc">Organize non-project tasks into distinct profiles (Personal, School, Work).</div>

        <div style="margin-bottom:18px;">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text-primary);">Default Creation Profile</label>
          <p style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">New standalone tasks created while viewing "All" will automatically be assigned to this profile.</p>
          <select id="settings-default-profile-select" class="form-select" style="max-width:320px;padding:8px 12px;font-size:13px;">
            ${(state.profiles || []).filter(p => p.id !== 'all').map(p => `
              <option value="${p.id}" ${(state.settings.defaultProfileId || 'profile-personal') === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>
            `).join('')}
          </select>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-primary);">Category Profiles</label>
          <div id="settings-profiles-list">
            ${(state.profiles || []).map(p => `
              <div class="settings-item-row">
                <div class="settings-item-info">
                  <img src="${p.image || 'assets/profiles/personal.png'}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;">
                  <span class="settings-item-name">${escHtml(p.name)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  ${p.id !== 'all' ? `
                    <button class="icon-btn edit-profile-btn" data-profile-id="${p.id}" title="Edit Profile" style="color:var(--text-secondary);">
                      <img src="assets/icons/Pencil.png" alt="Edit" style="width:14px;height:14px;object-fit:contain;" />
                    </button>
                    <button class="icon-btn delete-profile-btn" data-profile-id="${p.id}" title="Delete Profile" style="color:var(--danger);">
                      <img src="assets/icons/Trash.png" alt="Delete" style="width:14px;height:14px;object-fit:contain;" />
                    </button>
                  ` : '<span style="font-size:12px;color:var(--text-tertiary);padding-right:4px;">Default System View</span>'}
                </div>
              </div>
            `).join('')}
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <input type="text" id="new-profile-name" placeholder="New profile name..." class="form-input" style="flex:1;font-size:13px;padding:8px 12px;">
            <button id="add-profile-btn" class="btn-primary" style="padding:0 18px;font-size:13px;">Add Profile</button>
          </div>
        </div>
      </div>

      <!-- Priority Customization Card -->
      <div class="settings-card" id="settings-sec-priorities">
        <div class="settings-card-header">
          <div class="settings-card-title-group">
            <div class="settings-card-icon">
              <img src="assets/icons/Flag.png" alt="Priorities" />
            </div>
            <div class="settings-card-title">Priority Flag Colors</div>
          </div>
        </div>
        <div class="settings-card-desc">Personalize color tags for P1, P2, and P3 priorities. Priority P4 is permanently fixed to the neutral Slate outline.</div>

        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:var(--radius-md);padding:6px 12px;">
          ${['P1', 'P2', 'P3'].map(p => {
            const currentColor = priorityColors[p] || (p === 'P1' ? 'red' : p === 'P2' ? 'orange' : 'blue');
            return `
              <div class="settings-prio-row">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div class="priority-flag-btn flag-color-${currentColor}" style="width:30px;height:30px;pointer-events:none;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;">
                    <img src="assets/icons/Flag filled.png" alt="${p}" style="width:16px;height:16px;object-fit:contain;" />
                  </div>
                  <div>
                    <span style="font-size:14px;font-weight:600;color:var(--text-primary);">Priority ${p}</span>
                  </div>
                </div>
                <select class="form-select setting-prio-color-select" data-priority="${p}" style="max-width:150px;padding:6px 10px;font-size:13px;">
                  ${availableColors.map(c => `<option value="${c.id}" ${currentColor === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
              </div>
            `;
          }).join('')}
          <div class="settings-prio-row">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="priority-flag-btn flag-color-slate" style="width:30px;height:30px;pointer-events:none;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;">
                <img src="assets/icons/Flag.png" alt="P4" style="width:16px;height:16px;object-fit:contain;" />
              </div>
              <div>
                <span style="font-size:14px;font-weight:600;color:var(--text-secondary);">Priority P4 (Default)</span>
              </div>
            </div>
            <span style="font-size:12px;color:var(--text-tertiary);padding-right:8px;">Fixed Slate Outline</span>
          </div>
        </div>
      </div>

      <!-- Dashboard Quick Links Card -->
      <div class="settings-card" id="settings-sec-quicklinks">
        <div class="settings-card-header">
          <div class="settings-card-title-group">
            <div class="settings-card-icon">
              <img src="assets/icons/Dashboard.png" alt="Quick Links" />
            </div>
            <div class="settings-card-title">Dashboard Quick Links</div>
          </div>
        </div>
        <div class="settings-card-desc">Customize one-click shortcut bookmarks displayed in the top right of your Dashboard.</div>

        <div id="settings-quick-links-list">
          ${((state.settings && state.settings.dashboardQuickLinks) || [
            { title: 'Gmail', url: 'https://mail.google.com' },
            { title: 'Google Calendar', url: 'https://calendar.google.com' },
            { title: 'Canvas', url: 'https://canvas.instructure.com' },
            { title: 'GitHub', url: 'https://github.com' }
          ]).map((link, idx) => `
            <div class="settings-quick-link-row">
              <input type="text" class="form-input quick-link-edit-title" data-link-idx="${idx}" value="${escAttr(link.title)}" placeholder="Title (e.g. Canvas)" style="width:150px;padding:7px 10px;font-size:13px;" />
              <input type="url" class="form-input quick-link-edit-url" data-link-idx="${idx}" value="${escAttr(link.url)}" placeholder="URL (e.g. https://canvas.instructure.com)" style="flex:1;padding:7px 10px;font-size:13px;" />
              <button class="icon-btn delete-quick-link-btn" data-link-idx="${idx}" title="Delete Link" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;opacity:0.75;">
                <img src="assets/icons/Trash.png" alt="Delete" style="width:15px;height:15px;object-fit:contain;" />
              </button>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;align-items:center;">
          <input type="text" id="new-quick-link-title" placeholder="Title (e.g. Notion)" class="form-input" style="width:160px;padding:8px 12px;font-size:13px;">
          <input type="url" id="new-quick-link-url" placeholder="URL (e.g. https://notion.so)" class="form-input" style="flex:1;padding:8px 12px;font-size:13px;">
          <button id="add-quick-link-settings-btn" class="btn-primary" style="padding:8px 18px;font-size:13px;white-space:nowrap;">Add Shortcut</button>
        </div>
      </div>

      <!-- Google Calendar Visibility & Integrations Card -->
      <div class="settings-card" id="settings-sec-gcal">
        <div class="settings-card-header">
          <div class="settings-card-title-group">
            <div class="settings-card-icon">
              <img src="assets/icons/Calendar.png" alt="Calendar" />
            </div>
            <div class="settings-card-title">Google Calendar Visibility</div>
          </div>
        </div>
        <div class="settings-card-desc">Manage visible calendars in your sidebar and calendar schedules. Unchecked calendars will not clutter your view.</div>

        ${window.api.calendarAutoRenewalEnabled?.() ? `
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
            <button id="settings-connect-gcal-btn" class="btn-primary" style="font-size:13px;padding:7px 14px;">Connect Google Calendar</button>
            <button id="settings-disconnect-gcal-btn" class="btn-secondary" style="font-size:13px;padding:7px 14px;">Stop Automatic Renewal</button>
          </div>
        ` : ''}

        <div class="settings-gcal-list">
          ${gcalSettingsHtml}
        </div>
      </div>

      <!-- Data & Cloud Sync Card -->
      <div class="settings-card" id="settings-sec-sync">
        <div class="settings-card-header">
          <div class="settings-card-title-group">
            <div class="settings-card-icon">
              <img src="assets/icons/Cloud.png" alt="Cloud" />
            </div>
            <div class="settings-card-title">Data & Cloud Synchronization</div>
          </div>
        </div>
        <div class="settings-card-desc">Synchronize with Firebase Firestore in real-time or manage portable JSON backups.</div>

        <div class="settings-btn-group">
          <button id="settings-sync-cloud-btn" class="btn-primary" style="display:flex;align-items:center;gap:8px;padding:8px 18px;font-size:13px;">
            <img src="assets/icons/Refresh.png" alt="Sync" style="width:15px;height:15px;object-fit:contain;filter:brightness(10);" />
            Sync with Cloud Now
          </button>
          <button id="export-backup-btn" class="btn-secondary" style="padding:8px 16px;font-size:13px;">Export JSON Backup</button>
          <label class="btn-secondary" style="cursor:pointer;display:flex;align-items:center;padding:8px 16px;font-size:13px;margin:0;">
            Import Backup
            <input type="file" id="import-backup-file" accept=".json" style="display:none;" />
          </label>
        </div>

        ${window.electronAPI?.isElectron ? `
          <div style="margin-top:16px;padding:12px 16px;background:rgba(255,107,0,0.08);border:1px solid rgba(255,107,0,0.2);border-radius:8px;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:12px;">
              <img src="assets/brand/logo.png" alt="" style="width:24px;height:24px;object-fit:contain;" />
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);">Tacho Tasks Desktop (Active)</div>
                <div style="font-size:12px;color:var(--text-secondary);">Local SQLite Database &bull; Real-time Firestore Sync</div>
              </div>
            </div>
            <span style="font-size:12px;color:var(--accent);font-weight:600;padding:2px 8px;background:rgba(255,107,0,0.15);border-radius:4px;">Desktop v1.16.1</span>
          </div>
        ` : `
          <div style="margin-top:16px;padding:12px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:12px;">
              <img src="assets/brand/logo.png" alt="" style="width:24px;height:24px;object-fit:contain;" />
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);">Tacho Tasks Desktop App</div>
                <div style="font-size:12px;color:var(--text-secondary);">Native desktop app with offline SQLite, system tray, and notifications</div>
              </div>
            </div>
            <a href="https://tasks.tobyyeung.com/releases/" target="_blank" class="btn-secondary" style="font-size:12px;padding:6px 12px;text-decoration:none;display:inline-flex;align-items:center;">Download App</a>
          </div>
        `}
      </div>

      <!-- Developer & UI Testing Card -->
      <div class="settings-card" id="settings-sec-developer">
        <div class="settings-card-header">
          <div class="settings-card-title-group">
            <div class="settings-card-icon">
              <img src="assets/icons/Settings.png" alt="Dev" />
            </div>
            <div class="settings-card-title">Developer & UI Testing</div>
          </div>
        </div>
        <div class="settings-card-desc">Bypasses authentication overlays and external sync errors for rapid local testing and UI development.</div>

        <label class="settings-toggle-card">
          <input type="checkbox" id="settings-toggle-dev-mode" ${state.settings.devMode ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px;cursor:pointer;">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Disable Auth & Google Sync (Dev Mode)</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Prevents network authentication prompts and errors during local development.</div>
          </div>
        </label>

        ${window.electronAPI?.isElectron ? '' : `        <div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Account Setup Wizard</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Re-launch the initial account onboarding & workflow configuration wizard.</div>
          </div>
          <button id="settings-rerun-onboarding-btn" class="btn-secondary" style="font-size:13px;padding:7px 14px;white-space:nowrap;">Run Setup Wizard</button>
        </div>`}
      </div>

        </div> <!-- /.settings-content -->
      </div> <!-- /.settings-layout -->

    </div> <!-- /.settings-view -->
  `;
}
