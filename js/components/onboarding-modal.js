/**
 * onboarding-modal.js
 * First-run Setup Wizard & Onboarding for new accounts.
 */

let _onboardingStep = 0;
let _onboardingWorkflowChoice = 'kanban'; // 'kanban', 'action', 'simple'

function showOnboardingModal(forceReset = false) {
  if (forceReset) _onboardingStep = 0;
  renderOnboardingStep();
}

function renderOnboardingStep() {
  const steps = [
    renderOnboardingStepWelcome,
    renderOnboardingStepWorkflow,
    renderOnboardingStepFeatures,
    renderOnboardingStepReady
  ];

  if (_onboardingStep < 0) _onboardingStep = 0;
  if (_onboardingStep >= steps.length) _onboardingStep = steps.length - 1;

  const stepContentHtml = steps[_onboardingStep]();

  const modalHtml = `
    <div class="onboarding-modal-card">
      <button class="onboarding-close-btn" id="onboarding-close-btn" title="Close setup">✕</button>
      <div class="onboarding-progress-dots">
        ${[0, 1, 2, 3].map(i => `
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
        
        ${_onboardingStep < 3 ? `
          <button class="btn-primary onboarding-btn-next" id="onboarding-next-btn">Continue</button>
        ` : `
          <button class="btn-primary onboarding-btn-next" id="onboarding-finish-btn" style="background:var(--accent);color:#000;font-weight:700;">Get Started</button>
        `}
      </div>
    </div>
  `;

  openModal(modalHtml);
  const container = document.getElementById('modal-container');
  if (container) {
    container.classList.add('onboarding-modal-container');
  }
  attachOnboardingListeners();
}

function renderOnboardingStepWelcome() {
  return `
    <div class="onboarding-header-center">
      <div class="onboarding-logo-icon">
        <img src="assets/brand/logo.png" alt="Tacho Tasks" />
      </div>
      <h2 class="onboarding-title">Welcome to Tacho Tasks</h2>
      <p class="onboarding-subtitle">Your unified daily command center designed for seamless scheduling, high-speed task organization, and calendar focus.</p>
    </div>

    <div style="margin-top:20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius-lg);padding:16px 18px;width:100%;box-sizing:border-box;">
      <label style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-primary);">What's your name or workspace nickname?</label>
      <input type="text" id="onboarding-user-name" class="form-input" placeholder="e.g. Toby" value="${escAttr(state.settings.userName || '')}" style="width:100%;box-sizing:border-box;font-size:14px;padding:10px 14px;" />
      <p style="font-size:12px;color:var(--text-tertiary);margin-top:6px;">This personalizes your dashboard greeting and quick overview.</p>
    </div>
  `;
}

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

function renderOnboardingStepFeatures() {
  return `
    <div class="onboarding-header-center">
      <h2 class="onboarding-title">Built for Speed & Control</h2>
      <p class="onboarding-subtitle">Here are a few powerful superpowers to help you move faster every day:</p>
    </div>

    <div class="onboarding-features-list">
      <div class="onboarding-feature-item">
        <div class="onboarding-feature-icon">
          <img src="assets/icons/Clock.png" alt="Postpone" />
        </div>
        <div class="onboarding-feature-text">
          <h4>One-Click Postpone</h4>
          <p>Overdue tasks? Easily postpone all overdue tasks to today with one click on the Dashboard or Project views, complete with quick undo.</p>
        </div>
      </div>

      <div class="onboarding-feature-item">
        <div class="onboarding-feature-icon">
          <img src="assets/icons/Calendar.png" alt="Calendar" />
        </div>
        <div class="onboarding-feature-text">
          <h4>Connected Multi-Day Calendar</h4>
          <p>Google Calendar and local events that span multiple days connect smoothly across cells with continuous pill badges.</p>
        </div>
      </div>

      <div class="onboarding-feature-item">
        <div class="onboarding-feature-icon">
          <img src="assets/icons/Dashboard.png" alt="Drag & Drop" />
        </div>
        <div class="onboarding-feature-text">
          <h4>Fluid Reordering & Layout Persistence</h4>
          <p>Drag tasks, sections, and widgets seamlessly. Your custom layouts and section choices persist reliably across refreshes.</p>
        </div>
      </div>
    </div>
  `;
}

function renderOnboardingStepReady() {
  return `
    <div class="onboarding-header-center" style="margin-top:20px;">
      <div class="onboarding-logo-icon" style="background:rgba(0,212,170,0.15);transform:scale(1.1);">
        <img src="assets/brand/logo.png" alt="Ready" />
      </div>
      <h2 class="onboarding-title" style="margin-top:16px;">You're All Set!</h2>
      <p class="onboarding-subtitle">Your customized workspace is ready. You can adjust sections, Google Calendar syncing, and priority colors anytime in Settings.</p>
    </div>

    <div style="text-align:center;margin-top:32px;">
      <div style="font-size:12px;color:var(--text-tertiary);letter-spacing:0.5px;text-transform:uppercase;">Setup Completed</div>
    </div>
  `;
}

function attachOnboardingListeners() {
  const closeBtn = document.getElementById('onboarding-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeModal();
    });
  }

  const prevBtn = document.getElementById('onboarding-prev-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      _onboardingStep--;
      renderOnboardingStep();
    });
  }

  const nextBtn = document.getElementById('onboarding-next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      saveCurrentStepInputs();
      _onboardingStep++;
      renderOnboardingStep();
    });
  }

  const finishBtn = document.getElementById('onboarding-finish-btn');
  if (finishBtn) {
    finishBtn.addEventListener('click', async () => {
      saveCurrentStepInputs();
      applyWorkflowChoice();
      state.settings.accountSetupComplete = true;
      if (window.api && window.api.saveSettings) {
        await window.api.saveSettings(state.settings);
      }
      if (typeof syncToCloud === 'function') {
        syncToCloud();
      }
      closeModal();
      if (typeof render === 'function') render();
      showToast('Welcome to Tacho Tasks! Workspace configured successfully.');
    });
  }

  // Workflow preset radios/cards
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
