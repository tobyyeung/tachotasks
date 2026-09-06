/**
 * sandbox-tools.js
 * Developer Testing Sandbox for new account setup, UI layout scaling, and overnight event verification.
 */

function initSandboxTools() {
  // Always attach sandbox floating trigger for easy testing
  if (document.getElementById('sandbox-floating-trigger')) return;

  const trigger = document.createElement('button');
  trigger.id = 'sandbox-floating-trigger';
  trigger.className = 'sandbox-floating-trigger';
  trigger.innerHTML = `<span>🧪</span><span>Test Sandbox</span>`;
  document.body.appendChild(trigger);

  const panel = document.createElement('div');
  panel.id = 'sandbox-panel';
  panel.className = 'sandbox-panel hidden';
  panel.innerHTML = `
    <div class="sandbox-panel-header">
      <div class="sandbox-panel-title">
        <span>🧪</span> Developer Sandbox
      </div>
      <button class="sandbox-close-btn" id="sandbox-close-btn" title="Close">✕</button>
    </div>

    <div class="sandbox-action-group">
      <button class="sandbox-action-btn" id="sb-restore-original-btn" style="background:rgba(0,212,170,0.15);border:1px solid var(--accent);">
        <span class="sandbox-icon">🔄</span>
        <div>
          <div style="font-weight:700;color:var(--accent);">Restore Original Workspace</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.85);">Recover all 42 real tasks & 11 sections</div>
        </div>
      </button>

      <button class="sandbox-action-btn" id="sb-reset-account-btn">
        <span class="sandbox-icon">✨</span>
        <div>
          <div style="font-weight:600;">Reset to New Account</div>
          <div style="font-size:11px;opacity:0.7;">Clear setup flag & launch onboarding wizard</div>
        </div>
      </button>

      <button class="sandbox-action-btn" id="sb-inject-overnight-btn">
        <span class="sandbox-icon">🌙</span>
        <div>
          <div style="font-weight:600;">Inject Overnight Event (8pm-4am)</div>
          <div style="font-size:11px;opacity:0.7;">Adds 8pm–4am event across midnight for today</div>
        </div>
      </button>

      <button class="sandbox-action-btn" id="sb-inject-midnight-btn">
        <span class="sandbox-icon">🕛</span>
        <div>
          <div style="font-weight:600;">Inject Midnight End Event (8pm-12am)</div>
          <div style="font-size:11px;opacity:0.7;">Ends at 12am (should NOT show on next day)</div>
        </div>
      </button>

      <button class="sandbox-action-btn" id="sb-launch-onboarding-btn">
        <span class="sandbox-icon">🚀</span>
        <div>
          <div style="font-weight:600;">Launch Onboarding Wizard</div>
          <div style="font-size:11px;opacity:0.7;">Test workflow selection & setup steps</div>
        </div>
      </button>

      <button class="sandbox-action-btn" id="sb-toggle-tablet-width-btn">
        <span class="sandbox-icon">📱</span>
        <div>
          <div style="font-weight:600;" id="sb-width-text">Simulate Tablet Width (768px)</div>
          <div style="font-size:11px;opacity:0.7;">Test responsive layout & column stacking</div>
        </div>
      </button>

      <button class="sandbox-action-btn" id="sb-load-sample-tasks-btn">
        <span class="sandbox-icon">📋</span>
        <div>
          <div style="font-weight:600;">Load Sample Tasks</div>
          <div style="font-size:11px;opacity:0.7;">Populate sample tasks for layout testing</div>
        </div>
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  trigger.addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });

  document.getElementById('sandbox-close-btn')?.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  // Action: Restore Original Workspace
  document.getElementById('sb-restore-original-btn')?.addEventListener('click', async () => {
    panel.classList.add('hidden');
    if (typeof window.restoreOriginalWorkspace === 'function') {
      await window.restoreOriginalWorkspace();
    } else {
      showToast('Recovery function not ready. Please refresh the page.', 'error');
    }
  });

  // Action: Reset Account Setup
  document.getElementById('sb-reset-account-btn')?.addEventListener('click', async () => {
    state.settings.accountSetupComplete = false;
    state.settings.taskSectionsInitialized = false;
    await window.api.saveSettings(state.settings);
    panel.classList.add('hidden');
    if (typeof showOnboardingModal === 'function') {
      showOnboardingModal(true);
    }
    showToast('Account setup reset! Onboarding wizard launched.', 'info');
  });

  // Action: Inject Overnight Event
  document.getElementById('sb-inject-overnight-btn')?.addEventListener('click', async () => {
    const todayStr = getTodayStr();
    const parts = todayStr.split('-').map(Number);
    const tomorrowD = new Date(parts[0], parts[1] - 1, parts[2] + 1);
    const tomorrowStr = toDateStr(tomorrowD);

    const overnightEvent = {
      id: `evt-overnight-${Date.now()}`,
      title: 'Night Hackathon (Overnight 8pm–4am)',
      date: todayStr,
      endDate: tomorrowStr,
      startTime: '20:00',
      endTime: '04:00',
      color: '#8b5cf6',
      location: 'Innovation Lab',
      isAllDay: false,
      isMultiDay: true
    };

    if (!Array.isArray(state.events)) state.events = [];
    state.events.push(overnightEvent);
    if (window.api.saveEvents) await window.api.saveEvents(state.events);

    panel.classList.add('hidden');
    state.currentView = 'calendar';
    renderView();
    showToast('Injected 8:00 PM – 4:00 AM overnight event into Calendar!', 'success');
  });

  // Action: Inject Event Ending at 12am Midnight
  document.getElementById('sb-inject-midnight-btn')?.addEventListener('click', async () => {
    const todayStr = getTodayStr();

    const midnightEvent = {
      id: `evt-midnight-${Date.now()}`,
      title: 'Late Study Session (8pm–12am)',
      date: todayStr,
      endDate: todayStr,
      startTime: '20:00',
      endTime: '00:00',
      color: '#3b82f6',
      location: 'Main Library',
      isAllDay: false,
      isMultiDay: false
    };

    if (!Array.isArray(state.events)) state.events = [];
    state.events.push(midnightEvent);
    if (window.api.saveEvents) await window.api.saveEvents(state.events);

    panel.classList.add('hidden');
    state.currentView = 'calendar';
    renderView();
    showToast('Injected 8:00 PM – 12:00 AM midnight event! Check that it does not show tomorrow.', 'success');
  });

  // Action: Launch Onboarding Wizard
  document.getElementById('sb-launch-onboarding-btn')?.addEventListener('click', () => {
    panel.classList.add('hidden');
    if (typeof showOnboardingModal === 'function') {
      showOnboardingModal(true);
    }
  });

  // Action: Toggle Tablet Width Simulation
  let isTabletSim = false;
  document.getElementById('sb-toggle-tablet-width-btn')?.addEventListener('click', () => {
    const mainEl = document.getElementById('main');
    const widthText = document.getElementById('sb-width-text');
    if (!mainEl) return;

    if (!isTabletSim) {
      mainEl.style.maxWidth = '768px';
      mainEl.style.margin = '0 auto';
      mainEl.style.border = '2px dashed var(--accent)';
      if (widthText) widthText.textContent = 'Reset to Full Width';
      isTabletSim = true;
      showToast('Simulating 768px Tablet screen width', 'info');
    } else {
      mainEl.style.maxWidth = '';
      mainEl.style.margin = '';
      mainEl.style.border = '';
      if (widthText) widthText.textContent = 'Simulate Tablet Width (768px)';
      isTabletSim = false;
      showToast('Reset to Full Width', 'info');
    }
    if (typeof renderCalendarEvents === 'function' && state.currentView === 'calendar') {
      renderCalendarEvents();
    }
  });

  // Action: Load Sample Tasks
  document.getElementById('sb-load-sample-tasks-btn')?.addEventListener('click', async () => {
    const today = getTodayStr();
    const sampleTasks = [
      { id: `task-sample-1`, title: 'Review Product Architecture', priority: 'P1', dueDate: today, sectionId: 'sec-todo', completed: false },
      { id: `task-sample-2`, title: 'Prepare Weekly Sprint Presentation', priority: 'P2', dueDate: today, sectionId: 'sec-progress', completed: false },
      { id: `task-sample-3`, title: 'Update Cloud Sync Schema', priority: 'P3', dueDate: today, sectionId: 'sec-done', completed: true }
    ];
    if (!Array.isArray(state.tasks)) state.tasks = [];
    state.tasks.push(...sampleTasks);
    if (window.api.saveTasks) await window.api.saveTasks(state.tasks);
    panel.classList.add('hidden');
    renderView();
    showToast('Loaded sample tasks into workspace!', 'success');
  });
}

// Auto-initialize sandbox tools when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSandboxTools);
} else {
  initSandboxTools();
}
