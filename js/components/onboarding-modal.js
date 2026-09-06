/**
 * onboarding-modal.js
 * First-run Setup Wizard & Onboarding for new accounts.
 * Features:
 *  - Workspace nickname personalization
 *  - Workflow section presets (Kanban, Action-Oriented, Minimalist)
 *  - Default profile selection (Personal, Work, School - supports single-profile setups)
 *  - Google Calendar sync & calendar visibility activation
 *  - Priority flag color customizer (P1, P2, P3 with live checkmark preview)
 *  - Skip Setup flow with Settings menu reminder
 */

let _onboardingStep = 0;
let _onboardingWorkflowChoice = 'kanban'; // 'kanban', 'action', 'simple'
let _onboardingSelectedProfiles = ['profile-personal', 'profile-work', 'profile-school'];
let _onboardingVisibleGcalIds = [];
let _onboardingPriorityColors = { P1: 'red', P2: 'orange', P3: 'blue' };
let _onboardingShowSkipConfirm = false;
let _onboardingGcalConnecting = false;

const ONBOARDING_PRIORITY_COLORS = [
  { id: 'red', name: 'Red', hex: '#ff4d4f' },
  { id: 'orange', name: 'Orange', hex: '#fa8c16' },
  { id: 'yellow', name: 'Yellow', hex: '#fadb14' },
  { id: 'green', name: 'Green', hex: '#52c41a' },
  { id: 'blue', name: 'Blue', hex: '#1890ff' },
  { id: 'purple', name: 'Purple', hex: '#722ed1' }
];

const ONBOARDING_PROFILE_DEFAULTS = [
  { id: 'profile-personal', name: 'Personal', desc: 'Everyday personal tasks, errands, and life goals', image: 'assets/profiles/personal.png' },
  { id: 'profile-work', name: 'Work', desc: 'Professional projects, deliverables, and team items', image: 'assets/profiles/work.png' },
  { id: 'profile-school', name: 'School', desc: 'Classes, study sessions, homework, and exams', image: 'assets/profiles/school.png' }
];

function showOnboardingModal(forceReset = false) {
  if (forceReset) {
    _onboardingStep = 0;
    _onboardingShowSkipConfirm = false;
  }

  // Initialize selected profiles from state if already configured
  if (state.profiles && state.profiles.length > 0) {
    const existingIds = state.profiles.filter(p => p.id !== 'all').map(p => p.id);
    if (existingIds.length > 0) {
      _onboardingSelectedProfiles = [...existingIds];
    }
  }

  // Initialize priority colors from state if configured
  if (state.settings && state.settings.priorityColors) {
    _onboardingPriorityColors = {
      P1: state.settings.priorityColors.P1 || 'red',
      P2: state.settings.priorityColors.P2 || 'orange',
      P3: state.settings.priorityColors.P3 || 'blue'
    };
  }

  // Initialize Google Calendars
  if (state.gcalCalendars && state.gcalCalendars.length > 0) {
    _onboardingVisibleGcalIds = Array.isArray(state.settings.visibleGcalIds)
      ? [...state.settings.visibleGcalIds]
      : state.gcalCalendars.map(c => c.id);
  } else if (window.api && typeof window.api.getGCalCalendars === 'function') {
    // Attempt automatic background fetch of calendars for already signed-in users
    window.api.getGCalCalendars().then(cals => {
      if (Array.isArray(cals) && cals.length > 0) {
        state.gcalCalendars = cals;
        _onboardingVisibleGcalIds = cals.map(c => c.id);
        if (_onboardingStep === 3) {
          renderOnboardingStep();
        }
      }
    }).catch(() => {});
  }

  renderOnboardingStep();
}

function renderOnboardingStep() {
  const steps = [
    renderOnboardingStepWelcome,
    renderOnboardingStepWorkflow,
    renderOnboardingStepProfiles,
    renderOnboardingStepGcal,
    renderOnboardingStepPriorities,
    renderOnboardingStepReady
  ];

  if (_onboardingStep < 0) _onboardingStep = 0;
  if (_onboardingStep >= steps.length) _onboardingStep = steps.length - 1;

  const stepContentHtml = steps[_onboardingStep]();

  const skipOverlayHtml = _onboardingShowSkipConfirm ? `
    <div class="onboarding-skip-confirm">
      <div class="onboarding-skip-confirm-icon">
        <img src="assets/icons/Settings.png" alt="Settings" />
      </div>
      <h3>Customize Anytime in Settings</h3>
      <p>All options—including workflow sections, profiles, Google Calendar syncing, and priority flag colors—can be configured anytime from the <strong>Settings</strong> page.</p>
      <div class="onboarding-skip-confirm-actions">
        <button class="btn-secondary" id="onboarding-skip-cancel-btn" style="padding:9px 18px;font-size:13px;">Continue Setup</button>
        <button class="btn-primary" id="onboarding-skip-confirm-btn" style="padding:9px 20px;font-size:13px;background:var(--accent);color:#000;font-weight:700;">Skip & Go to App</button>
      </div>
    </div>
  ` : '';

  const modalHtml = `
    <div class="onboarding-modal-card">
      <button class="onboarding-skip-btn" id="onboarding-skip-btn" title="Skip setup wizard">Skip Setup</button>
      <button class="onboarding-close-btn" id="onboarding-close-btn" title="Close setup">✕</button>

      <div class="onboarding-progress-dots">
        ${[0, 1, 2, 3, 4, 5].map(i => `
          <div class="onboarding-dot ${i === _onboardingStep ? 'active' : ''}"></div>
        `).join('')}
      </div>

      <div class="onboarding-step-body">
        ${stepContentHtml}
      </div>

      <div class="onboarding-actions">
        ${_onboardingStep > 0 ? `
          <button class="onboarding-btn-prev" id="onboarding-prev-btn">Back</button>
        ` : `<div></div>`}
        
        ${_onboardingStep < 5 ? `
          <button class="btn-primary onboarding-btn-next" id="onboarding-next-btn">Continue</button>
        ` : `
          <button class="btn-primary onboarding-btn-next" id="onboarding-finish-btn" style="background:var(--accent);color:#000;font-weight:700;">Get Started</button>
        `}
      </div>

      ${skipOverlayHtml}
    </div>
  `;

  openModal(modalHtml);
  const container = document.getElementById('modal-container');
  if (container) {
    container.classList.add('onboarding-modal-container');
  }
  attachOnboardingListeners();
}

/* Step 0: Welcome & Nickname */
function renderOnboardingStepWelcome() {
  return `
    <div class="onboarding-header-center">
      <div class="onboarding-logo-icon">
        <img src="assets/brand/logo.png" alt="Tacho Tasks" />
      </div>
      <h2 class="onboarding-title">Welcome to Tacho Tasks</h2>
      <p class="onboarding-subtitle">Your unified daily command center designed for seamless scheduling, high-speed task organization, and calendar focus.</p>
    </div>

    <div style="margin-top:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius-lg);padding:16px 18px;width:100%;box-sizing:border-box;">
      <label style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-primary);">What's your name or workspace nickname?</label>
      <input type="text" id="onboarding-user-name" class="form-input" placeholder="e.g. Toby" value="${escAttr(state.settings.userName || '')}" style="width:100%;box-sizing:border-box;font-size:14px;padding:10px 14px;" />
      <p style="font-size:12px;color:var(--text-tertiary);margin-top:6px;margin-bottom:0;">This personalizes your dashboard greeting and quick overview.</p>
    </div>
  `;
}

/* Step 1: Workflow Choice */
function renderOnboardingStepWorkflow() {
  return `
    <div class="onboarding-header-center">
      <h2 class="onboarding-title">Choose Your Workflow</h2>
      <p class="onboarding-subtitle">Pick how you would like your default task sections organized. You can always rename, add, or delete sections later.</p>
    </div>

    <div class="onboarding-presets">
      <label class="onboarding-preset-card ${_onboardingWorkflowChoice === 'kanban' ? 'selected' : ''}" data-workflow="kanban">
        <input type="radio" name="workflow_choice" value="kanban" class="onboarding-preset-radio" ${_onboardingWorkflowChoice === 'kanban' ? 'checked' : ''} />
        <div class="onboarding-preset-info">
          <h4>Standard Kanban</h4>
          <p>Organized into <strong>To Do</strong>, <strong>In Progress</strong>, and <strong>Done</strong>. Perfect for structured daily progress.</p>
        </div>
      </label>

      <label class="onboarding-preset-card ${_onboardingWorkflowChoice === 'action' ? 'selected' : ''}" data-workflow="action">
        <input type="radio" name="workflow_choice" value="action" class="onboarding-preset-radio" ${_onboardingWorkflowChoice === 'action' ? 'checked' : ''} />
        <div class="onboarding-preset-info">
          <h4>Action-Oriented</h4>
          <p>Divided into <strong>Today</strong>, <strong>This Week</strong>, and <strong>Later</strong>. Ideal for priority triage.</p>
        </div>
      </label>

      <label class="onboarding-preset-card ${_onboardingWorkflowChoice === 'simple' ? 'selected' : ''}" data-workflow="simple">
        <input type="radio" name="workflow_choice" value="simple" class="onboarding-preset-radio" ${_onboardingWorkflowChoice === 'simple' ? 'checked' : ''} />
        <div class="onboarding-preset-info">
          <h4>Minimalist List</h4>
          <p>A single <strong>Tasks</strong> list. Clean, focused, and distraction-free.</p>
        </div>
      </label>
    </div>
  `;
}

/* Step 2: Default Profiles Selection */
function renderOnboardingStepProfiles() {
  return `
    <div class="onboarding-header-center">
      <h2 class="onboarding-title">Choose Your Profiles</h2>
      <p class="onboarding-subtitle">Select which default profiles to start with. If you prefer a simpler setup, you can keep just 1 profile like Personal.</p>
    </div>

    <div class="onboarding-profiles-list">
      ${ONBOARDING_PROFILE_DEFAULTS.map(p => {
        const isSelected = _onboardingSelectedProfiles.includes(p.id);
        return `
          <div class="onboarding-profile-card ${isSelected ? 'selected' : ''}" data-profile-id="${p.id}">
            <input type="checkbox" class="onboarding-profile-check" data-profile-id="${p.id}" ${isSelected ? 'checked' : ''} />
            <img src="${p.image}" alt="${p.name}" class="profile-thumb" />
            <div class="onboarding-profile-info">
              <h4>${p.name}</h4>
              <p>${p.desc}</p>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <p style="font-size:12px;color:var(--text-tertiary);text-align:center;margin-top:10px;margin-bottom:0;">
      At least 1 profile must remain selected. You can add, edit, or delete profiles anytime in Settings.
    </p>
  `;
}

/* Step 3: Google Calendar Sync & Visibility */
function renderOnboardingStepGcal() {
  const hasCalendars = Array.isArray(state.gcalCalendars) && state.gcalCalendars.length > 0;

  let gcalContent = '';
  if (_onboardingGcalConnecting) {
    gcalContent = `
      <div class="onboarding-gcal-connect-box">
        <div style="font-size:14px;color:var(--text-primary);font-weight:600;margin-bottom:6px;">Connecting to Google Calendar...</div>
        <p style="font-size:12px;color:var(--text-secondary);margin:0;">Please complete the Google authentication prompt.</p>
      </div>
    `;
  } else if (hasCalendars) {
    gcalContent = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;margin-top:6px;">
        <span style="font-size:12px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Connected Calendars</span>
        <button id="onboarding-refresh-gcal-btn" class="icon-btn" title="Refresh Google Calendars" style="font-size:12px;color:var(--accent);display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;">
          <img src="assets/icons/Refresh.png" alt="Refresh" style="width:13px;height:13px;object-fit:contain;filter:brightness(10);" /> Refresh
        </button>
      </div>
      <div class="onboarding-gcal-list">
        ${state.gcalCalendars.map(cal => {
          const isChecked = _onboardingVisibleGcalIds.includes(cal.id);
          return `
            <div class="onboarding-gcal-item">
              <div class="onboarding-gcal-item-info">
                <div class="onboarding-gcal-dot" style="background:${cal.color || '#1890ff'};"></div>
                <span class="onboarding-gcal-name" title="${escAttr(cal.summary || cal.name || '')}">${escHtml(cal.summary || cal.name || 'Calendar')}</span>
              </div>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;">
                <input type="checkbox" class="onboarding-gcal-check" data-cal-id="${cal.id}" ${isChecked ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer;" />
                <span style="font-size:12px;color:var(--text-secondary);">Show</span>
              </label>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else {
    gcalContent = `
      <div class="onboarding-gcal-connect-box">
        <div style="width:40px;height:40px;margin:0 auto 10px;opacity:0.8;">
          <img src="assets/icons/Calendar.png" alt="Calendar" style="width:100%;height:100%;object-fit:contain;" />
        </div>
        <div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:4px;">Connect Google Calendar</div>
        <p style="font-size:12px;color:var(--text-secondary);max-width:360px;margin:0 auto 16px;line-height:1.4;">
          Sync your schedule alongside your tasks. You can choose which calendars to display or skip this step.
        </p>
        <button id="onboarding-connect-gcal-btn" class="btn-primary" style="font-size:13px;padding:8px 18px;display:inline-flex;align-items:center;gap:8px;">
          <img src="assets/icons/Calendar.png" alt="Connect" style="width:15px;height:15px;object-fit:contain;filter:brightness(10);" /> Connect Google Calendar
        </button>
      </div>
    `;
  }

  return `
    <div class="onboarding-header-center">
      <h2 class="onboarding-title">Google Calendar Sync</h2>
      <p class="onboarding-subtitle">Choose which calendars to show in your daily schedule and planner view.</p>
    </div>

    ${gcalContent}
  `;
}

/* Step 4: Priority Flag Colors Customization */
function renderOnboardingStepPriorities() {
  const priorities = [
    { key: 'P1', label: 'Priority 1 (Urgent)', defaultColor: 'red' },
    { key: 'P2', label: 'Priority 2 (High)', defaultColor: 'orange' },
    { key: 'P3', label: 'Priority 3 (Medium)', defaultColor: 'blue' }
  ];

  return `
    <div class="onboarding-header-center">
      <h2 class="onboarding-title">Priority Flag Colors</h2>
      <p class="onboarding-subtitle">Personalize your priority colors, or keep the defaults. Priority 4 is fixed to Slate outline.</p>
    </div>

    <div class="onboarding-prio-list">
      ${priorities.map(p => {
        const currentColor = _onboardingPriorityColors[p.key] || p.defaultColor;
        const currentHex = (ONBOARDING_PRIORITY_COLORS.find(c => c.id === currentColor) || {}).hex || '#ff4d4f';
        return `
          <div class="onboarding-prio-row">
            <div class="onboarding-prio-left">
              <div class="onboarding-prio-preview" id="prio-preview-${p.key}" style="border-color:${currentHex};"></div>
              <span class="onboarding-prio-name">${p.key}</span>
            </div>
            <div class="onboarding-prio-swatches">
              ${ONBOARDING_PRIORITY_COLORS.map(c => `
                <button type="button" class="onboarding-color-swatch ${c.id === currentColor ? 'active' : ''}" data-prio="${p.key}" data-color="${c.id}" data-hex="${c.hex}" style="background:${c.hex};" title="${c.name}"></button>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}

      <div class="onboarding-prio-row" style="opacity:0.75;">
        <div class="onboarding-prio-left">
          <div class="onboarding-prio-preview" style="border-color:#94a3b8;"></div>
          <span class="onboarding-prio-name">P4 (Low)</span>
        </div>
        <span style="font-size:12px;color:var(--text-tertiary);padding-right:6px;">Fixed Slate Outline</span>
      </div>
    </div>

    <div style="text-align:center;margin-top:12px;">
      <button type="button" id="onboarding-reset-prio-btn" style="background:none;border:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;text-decoration:underline;">
        Reset to Default Colors
      </button>
    </div>
  `;
}

/* Step 5: You're All Set! */
function renderOnboardingStepReady() {
  return `
    <div class="onboarding-header-center" style="margin-top:20px;">
      <div class="onboarding-logo-icon" style="background:rgba(0,212,170,0.15);transform:scale(1.1);">
        <img src="assets/brand/logo.png" alt="Ready" />
      </div>
      <h2 class="onboarding-title" style="margin-top:16px;">You're All Set!</h2>
      <p class="onboarding-subtitle">Your workspace is configured and ready. You can modify workflows, profiles, Google Calendar syncing, and colors anytime in Settings.</p>
    </div>

    <div style="text-align:center;margin-top:32px;">
      <div style="font-size:12px;color:var(--text-tertiary);letter-spacing:0.5px;text-transform:uppercase;">Setup Completed</div>
    </div>
  `;
}

function attachOnboardingListeners() {
  // Close / Dismiss button
  const closeBtn = document.getElementById('onboarding-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeModal();
    });
  }

  // Skip Setup button
  const skipBtn = document.getElementById('onboarding-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      _onboardingShowSkipConfirm = true;
      renderOnboardingStep();
    });
  }

  // Skip Confirmation Actions
  const skipCancelBtn = document.getElementById('onboarding-skip-cancel-btn');
  if (skipCancelBtn) {
    skipCancelBtn.addEventListener('click', () => {
      _onboardingShowSkipConfirm = false;
      renderOnboardingStep();
    });
  }

  const skipConfirmBtn = document.getElementById('onboarding-skip-confirm-btn');
  if (skipConfirmBtn) {
    skipConfirmBtn.addEventListener('click', async () => {
      saveCurrentStepInputs();
      applyWorkflowChoice();
      await applyProfilesChoice();
      applyGcalChoice();
      applyPriorityColorsChoice();

      state.settings.accountSetupComplete = true;
      if (window.api && window.api.saveSettings) {
        await window.api.saveSettings(state.settings);
      }
      if (typeof syncToCloud === 'function') {
        syncToCloud();
      }
      closeModal();
      if (typeof render === 'function') render();
      showToast('Setup skipped. You can change all settings anytime in the Settings menu.', 'info');
    });
  }

  // Navigation: Prev
  const prevBtn = document.getElementById('onboarding-prev-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      _onboardingStep--;
      renderOnboardingStep();
    });
  }

  // Navigation: Next
  const nextBtn = document.getElementById('onboarding-next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      saveCurrentStepInputs();
      _onboardingStep++;
      renderOnboardingStep();
    });
  }

  // Navigation: Finish
  const finishBtn = document.getElementById('onboarding-finish-btn');
  if (finishBtn) {
    finishBtn.addEventListener('click', async () => {
      saveCurrentStepInputs();
      applyWorkflowChoice();
      await applyProfilesChoice();
      applyGcalChoice();
      applyPriorityColorsChoice();

      state.settings.accountSetupComplete = true;
      if (window.api && window.api.saveSettings) {
        await window.api.saveSettings(state.settings);
      }
      if (typeof syncToCloud === 'function') {
        syncToCloud();
      }
      closeModal();
      if (typeof render === 'function') render();
      showToast('Welcome to Tacho Tasks! Workspace configured successfully.', 'success');
    });
  }

  // Step 1: Workflow preset cards
  document.querySelectorAll('.onboarding-preset-card').forEach(card => {
    card.addEventListener('click', () => {
      const choice = card.dataset.workflow;
      if (choice) {
        _onboardingWorkflowChoice = choice;
        document.querySelectorAll('.onboarding-preset-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      }
    });
  });

  // Step 2: Profiles selection cards
  document.querySelectorAll('.onboarding-profile-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const pId = card.dataset.profileId;
      if (!pId) return;

      const checkbox = card.querySelector('.onboarding-profile-check');
      const isCurrentlySelected = _onboardingSelectedProfiles.includes(pId);

      if (isCurrentlySelected) {
        // Enforce at least 1 profile remaining
        if (_onboardingSelectedProfiles.length <= 1) {
          showToast('At least one profile must remain selected.', 'warning');
          if (checkbox) checkbox.checked = true;
          return;
        }
        _onboardingSelectedProfiles = _onboardingSelectedProfiles.filter(id => id !== pId);
        card.classList.remove('selected');
        if (checkbox) checkbox.checked = false;
      } else {
        _onboardingSelectedProfiles.push(pId);
        card.classList.add('selected');
        if (checkbox) checkbox.checked = true;
      }
    });
  });

  // Step 3: Google Calendar connect button
  const connectGcalBtn = document.getElementById('onboarding-connect-gcal-btn');
  if (connectGcalBtn) {
    connectGcalBtn.addEventListener('click', async () => {
      _onboardingGcalConnecting = true;
      renderOnboardingStep();

      try {
        if (typeof window.reconnectGoogleCalendar === 'function') {
          await window.reconnectGoogleCalendar();
        } else if (window.api && typeof window.api.reconnectGCal === 'function') {
          await window.api.reconnectGCal();
        }

        // Fetch fresh calendars
        if (window.api && typeof window.api.getGCalCalendars === 'function') {
          const cals = await window.api.getGCalCalendars();
          if (Array.isArray(cals) && cals.length > 0) {
            state.gcalCalendars = cals;
            _onboardingVisibleGcalIds = cals.map(c => c.id);
          }
        }
      } catch (err) {
        console.warn('Onboarding GCal connection error:', err);
      } finally {
        _onboardingGcalConnecting = false;
        renderOnboardingStep();
      }
    });
  }

  // Step 3: Refresh Google Calendar button
  const refreshGcalBtn = document.getElementById('onboarding-refresh-gcal-btn');
  if (refreshGcalBtn) {
    refreshGcalBtn.addEventListener('click', async () => {
      refreshGcalBtn.style.opacity = '0.5';
      try {
        if (window.api && typeof window.api.getGCalCalendars === 'function') {
          const cals = await window.api.getGCalCalendars();
          if (Array.isArray(cals)) {
            state.gcalCalendars = cals;
            // Retain existing visible selections plus any new ones
            const existingSet = new Set(_onboardingVisibleGcalIds);
            _onboardingVisibleGcalIds = cals.map(c => c.id).filter(id => existingSet.size === 0 || existingSet.has(id));
          }
        }
      } catch (err) {
        console.warn('GCal refresh error:', err);
      } finally {
        renderOnboardingStep();
      }
    });
  }

  // Step 3: Calendar visibility checkboxes
  document.querySelectorAll('.onboarding-gcal-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const calId = e.target.dataset.calId;
      if (!calId) return;
      if (e.target.checked) {
        if (!_onboardingVisibleGcalIds.includes(calId)) _onboardingVisibleGcalIds.push(calId);
      } else {
        _onboardingVisibleGcalIds = _onboardingVisibleGcalIds.filter(id => id !== calId);
      }
    });
  });

  // Step 4: Priority color swatches
  document.querySelectorAll('.onboarding-color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const prio = btn.dataset.prio;
      const color = btn.dataset.color;
      const hex = btn.dataset.hex;
      if (!prio || !color) return;

      _onboardingPriorityColors[prio] = color;

      // Update active swatch state in row
      const row = btn.closest('.onboarding-prio-row');
      if (row) {
        row.querySelectorAll('.onboarding-color-swatch').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');

        // Update preview circle border
        const preview = row.querySelector('.onboarding-prio-preview');
        if (preview && hex) {
          preview.style.borderColor = hex;
        }
      }
    });
  });

  // Step 4: Reset priority colors
  const resetPrioBtn = document.getElementById('onboarding-reset-prio-btn');
  if (resetPrioBtn) {
    resetPrioBtn.addEventListener('click', () => {
      _onboardingPriorityColors = { P1: 'red', P2: 'orange', P3: 'blue' };
      renderOnboardingStep();
    });
  }
}

function saveCurrentStepInputs() {
  const nameInput = document.getElementById('onboarding-user-name');
  if (nameInput) {
    state.settings.userName = nameInput.value.trim();
  }
}

function applyWorkflowChoice() {
  state.settings.taskSectionsInitialized = true;
  if (_onboardingWorkflowChoice === 'kanban') {
    state.settings.taskSections = [
      { id: 'sec-todo', name: 'To Do', order: 0 },
      { id: 'sec-progress', name: 'In Progress', order: 1 },
      { id: 'sec-done', name: 'Done', order: 2 }
    ];
  } else if (_onboardingWorkflowChoice === 'action') {
    state.settings.taskSections = [
      { id: 'sec-today', name: 'Today', order: 0 },
      { id: 'sec-week', name: 'This Week', order: 1 },
      { id: 'sec-later', name: 'Later', order: 2 }
    ];
  } else if (_onboardingWorkflowChoice === 'simple') {
    state.settings.taskSections = [
      { id: 'sec-tasks', name: 'Tasks', order: 0 }
    ];
  }
}

async function applyProfilesChoice() {
  state.settings.profilesInitialized = true;

  const defaultTemplates = typeof getDefaultProfiles === 'function' ? getDefaultProfiles() : [
    { id: 'all', name: 'All', icon: '', image: 'assets/brand/logo.png' },
    { id: 'profile-personal', name: 'Personal', icon: '', image: 'assets/profiles/personal.png' },
    { id: 'profile-work', name: 'Work', icon: '', image: 'assets/profiles/work.png' },
    { id: 'profile-school', name: 'School', icon: '', image: 'assets/profiles/school.png' }
  ];

  // System 'all' view always included
  const newProfiles = [defaultTemplates[0]];

  // Include user-selected profiles
  for (const def of defaultTemplates.slice(1)) {
    if (_onboardingSelectedProfiles.includes(def.id)) {
      newProfiles.push(def);
    } else {
      // Record tombstone so Firebase does not revive unselected default profiles
      if (window.api && typeof window.api.recordTombstone === 'function') {
        window.api.recordTombstone(def.id, 'profile');
      }
    }
  }

  state.profiles = newProfiles;
  state.settings.defaultProfileId = _onboardingSelectedProfiles[0] || 'profile-personal';

  if (!state.profiles.some(p => p.id === state.activeProfileId)) {
    state.activeProfileId = 'all';
    state.settings.activeProfileId = 'all';
  }

  if (window.api && typeof window.api.saveProfiles === 'function') {
    await window.api.saveProfiles(state.profiles);
  }

  if (typeof setupModeSwitcher === 'function') setupModeSwitcher();
  if (typeof renderSidebarProjects === 'function') renderSidebarProjects();
}

function applyGcalChoice() {
  if (state.gcalCalendars && state.gcalCalendars.length > 0) {
    state.settings.visibleGcalIds = [..._onboardingVisibleGcalIds];
    state.settings.activeGcalIds = [..._onboardingVisibleGcalIds];
    state.activeGcalIds = [..._onboardingVisibleGcalIds];
    if (typeof renderSidebarGcals === 'function') renderSidebarGcals();
  }
}

function applyPriorityColorsChoice() {
  state.settings.priorityColors = { ..._onboardingPriorityColors };
}
