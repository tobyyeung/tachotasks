// ===== MODALS =====
function showTaskModal(taskId) {
  let task = null;
  let isArchived = false;
  if (taskId) {
    task = state.tasks.find(t => t.id === taskId);
    if (!task) {
      task = state.archivedTasks.find(t => t.id === taskId);
      if (task) isArchived = true;
    }
  }
  const isNew = !task;
  const ro = isArchived ? 'disabled' : '';

  const activeProjId = task ? task.projectId : (state.filterProject || null);
  const locHtml = getTaskLocationHtml(task || { projectId: activeProjId });
  const defaultProfId = (state.settings && state.settings.defaultProfileId) || 'profile-personal';
  const profId = (task && task.profileId) || defaultProfId;
  const prof = (state.profiles || []).find(p => p.id === profId);
  const profName = prof ? prof.name : 'Personal';

  const projectOptions = state.projects.map(p =>
    `<option value="${p.id}" ${activeProjId === p.id ? 'selected' : ''}>📂 ${escHtml(p.name)}</option>`
  ).join('');

  const currentTags = task ? task.tags.join(', ') : '';
  const currentPriority = task ? (task.priority || 'P4') : 'P4';

  // Format creation timestamp
  let createdText = 'New Task';
  if (task && task.createdAt) {
    try {
      const cDate = new Date(task.createdAt);
      createdText = 'Created ' + cDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + cDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (e) {
      createdText = 'Created recently';
    }
  }

  const html = `
    <div class="task-modal-split">
      <!-- Left Main Panel -->
      <div class="task-modal-left">
        <div class="task-modal-top-bar">
          <div class="task-breadcrumb">
            <span>${locHtml}</span>
          </div>
          <div class="task-top-actions">
            <div class="more-options-wrapper" style="position:relative;">
              <button class="task-action-btn" id="modal-more-options-btn" title="More options">•••</button>
              
              <!-- Options Dropdown Menu (•••) -->
              <div id="task-options-menu" class="task-options-menu hidden">
                <div class="task-options-header">${createdText}</div>
                <div class="task-options-divider"></div>
                ${!isNew ? `
                  <button class="task-options-item" id="opt-duplicate-btn">
                    <img src="assets/icons/Duplicate.png" alt="Duplicate" style="width:18px;height:18px;object-fit:contain;" />
                    Duplicate Task
                  </button>
                  <div class="task-options-divider"></div>
                  <button class="task-options-item danger" id="opt-delete-btn">
                    <img src="assets/icons/Trash.png" alt="Delete" style="width:18px;height:18px;object-fit:contain;" />
                    Delete Task
                  </button>
                ` : `<div style="padding:4px 14px;font-size:12px;color:var(--text-tertiary);">Save task to enable options</div>`}
              </div>
            </div>

            <button class="task-action-btn modal-close" id="modal-close-btn" title="Close">✕</button>
          </div>
        </div>

        <div class="task-title-row">
          <div class="task-circle-check" id="modal-toggle-check" title="Toggle completion">
            ${task && task.completed ? '✓' : ''}
          </div>
          <input class="task-title-input" id="modal-title" value="${escAttr(task ? task.title : '')}" placeholder="Task name" autofocus ${ro} />
        </div>

        <div class="task-desc-container">
          <div class="task-desc-icon">
            <img src="assets/icons/Edit.png" alt="Desc" style="width:20px;height:20px;object-fit:contain;" />
          </div>
          <textarea class="task-desc-textarea" id="modal-desc" placeholder="Description" ${ro}>${task ? escHtml(task.description) : ''}</textarea>
        </div>
      </div>

      <!-- Right Metadata Sidebar -->
      <div class="task-modal-right">
        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Project</label>
          <select class="sidebar-select-input" id="modal-project" ${ro}>
            <option value="" ${!activeProjId ? 'selected' : ''}>${escHtml(profName)}</option>
            ${projectOptions}
          </select>
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Due Date</label>
          <div class="dt-trigger-capsule" id="modal-due-dt-picker" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:7px 10px;cursor:pointer;">
            <span id="modal-due-dt-text" style="font-size:13px;${task && task.dueDate ? 'color:var(--text-primary);' : 'color:var(--text-tertiary);'}">${task && task.dueDate ? formatDateShort(task.dueDate) + (task.dueTime ? ' at ' + formatTime12(task.dueTime) : '') : 'e.g. Jul 24, 9:30 AM'}</span>
            <img src="assets/icons/Calendar.png" alt="Calendar" style="width:18px;height:18px;object-fit:contain;" />
          </div>
          <input type="hidden" id="modal-due-date" value="${task && task.dueDate ? task.dueDate : ''}" />
          <input type="hidden" id="modal-due-time" value="${task && task.dueTime ? task.dueTime : ''}" />
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Planned Date</label>
          <div class="dt-trigger-capsule" id="modal-planned-dt-picker" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:7px 10px;cursor:pointer;">
            <span id="modal-planned-dt-text" style="font-size:13px;${task && task.plannedDate ? 'color:var(--text-primary);' : 'color:var(--text-tertiary);'}">${task && task.plannedDate ? formatDateShort(task.plannedDate) + (task.plannedTime ? ' at ' + formatTime12(task.plannedTime) : '') : 'e.g. Jul 25, 2:00 PM'}</span>
            <img src="assets/icons/Calendar.png" alt="Calendar" style="width:18px;height:18px;object-fit:contain;" />
          </div>
          <input type="hidden" id="modal-planned-date" value="${task && task.plannedDate ? task.plannedDate : ''}" />
          <input type="hidden" id="modal-planned-time" value="${task && task.plannedTime ? task.plannedTime : ''}" />
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Priority</label>
          <div class="priority-flag-selector">
            ${['P1', 'P2', 'P3', 'P4'].map(p => {
              const selected = currentPriority === p ? 'selected' : '';
              const colorClass = getPriorityColorClass(p);
              const flagSrc = p === 'P4' ? 'assets/icons/Flag.png' : 'assets/icons/Flag filled.png';
              return `<button class="priority-flag-btn ${colorClass} ${selected}" data-priority="${p}" title="Priority ${p.replace('P', '')}">
                <img src="${flagSrc}" alt="${p}" style="width:20px;height:20px;object-fit:contain;" />
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Labels / Tags</label>
          <input class="sidebar-date-input" id="modal-tags" value="${escAttr(currentTags)}" placeholder="@deep_work, @errands" ${ro} />
        </div>

        <div style="flex:1"></div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button class="btn-secondary" id="modal-cancel-btn" style="padding:6px 14px;font-size:12px;">Cancel</button>
          ${!isArchived ? `<button class="btn-primary" id="modal-save-btn" style="padding:6px 16px;font-size:12px;">${isNew ? 'Add Task' : 'Save'}</button>` : ''}
        </div>
      </div>
    </div>
  `;

  openDraggablePopup(html, 'task-popup');

  // Priority flag selector logic
  if (!isArchived) {
    document.querySelectorAll('.priority-flag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.priority-flag-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // DateTimePicker triggers
  const duePickerBtn = document.getElementById('modal-due-dt-picker');
  if (duePickerBtn && !isArchived) {
    duePickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isImgClick = !!(e.target && e.target.closest('img'));
      const todayStr = toDateStr(new Date());
      const curDate = isImgClick ? todayStr : document.getElementById('modal-due-date').value;
      const curTime = document.getElementById('modal-due-time').value;
      showDateSelector({
        targetElement: duePickerBtn,
        initialDate: curDate,
        initialTime: curTime,
        initialRepeat: task ? task.recurring : null,
        onSelect: ({ date, time, repeat }) => {
          document.getElementById('modal-due-date').value = date || '';
          document.getElementById('modal-due-time').value = time || '';
          if (task) task.recurring = repeat;
          const textEl = document.getElementById('modal-due-dt-text');
          if (textEl) {
            textEl.textContent = date ? formatDateShort(date) + (time ? ' at ' + formatTime12(time) : '') : 'e.g. Jul 24, 9:30 AM';
            textEl.style.color = date ? 'var(--text-primary)' : 'var(--text-tertiary)';
          }
        },
        onClear: () => {
          document.getElementById('modal-due-date').value = '';
          document.getElementById('modal-due-time').value = '';
          const textEl = document.getElementById('modal-due-dt-text');
          if (textEl) {
            textEl.textContent = 'e.g. Jul 24, 9:30 AM';
            textEl.style.color = 'var(--text-tertiary)';
          }
        }
      });
    });
  }

  const plannedPickerBtn = document.getElementById('modal-planned-dt-picker');
  if (plannedPickerBtn && !isArchived) {
    plannedPickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isImgClick = !!(e.target && e.target.closest('img'));
      const todayStr = toDateStr(new Date());
      const curDate = isImgClick ? todayStr : document.getElementById('modal-planned-date').value;
      const curTime = document.getElementById('modal-planned-time').value;
      showDateSelector({
        targetElement: plannedPickerBtn,
        initialDate: curDate,
        initialTime: curTime,
        initialRepeat: null,
        onSelect: ({ date, time }) => {
          document.getElementById('modal-planned-date').value = date || '';
          document.getElementById('modal-planned-time').value = time || '';
          const textEl = document.getElementById('modal-planned-dt-text');
          if (textEl) {
            textEl.textContent = date ? formatDateShort(date) + (time ? ' at ' + formatTime12(time) : '') : 'e.g. Jul 25, 2:00 PM';
            textEl.style.color = date ? 'var(--text-primary)' : 'var(--text-tertiary)';
          }
        },
        onClear: () => {
          document.getElementById('modal-planned-date').value = '';
          document.getElementById('modal-planned-time').value = '';
          const textEl = document.getElementById('modal-planned-dt-text');
          if (textEl) {
            textEl.textContent = 'e.g. Jul 25, 2:00 PM';
            textEl.style.color = 'var(--text-tertiary)';
          }
        }
      });
    });
  }

  // Toggle check inside modal
  const checkBtn = document.getElementById('modal-toggle-check');
  if (checkBtn && !isNew) {
    checkBtn.addEventListener('click', async () => {
      await toggleTask(taskId);
      closeModal();
    });
  }

  // Options menu (•••) toggle
  const moreBtn = document.getElementById('modal-more-options-btn');
  const optionsMenu = document.getElementById('task-options-menu');
  if (moreBtn && optionsMenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      optionsMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!optionsMenu.contains(e.target) && e.target !== moreBtn) {
        optionsMenu.classList.add('hidden');
      }
    });
  }

  // Duplicate task option
  const dupBtn = document.getElementById('opt-duplicate-btn');
  if (dupBtn && task) {
    dupBtn.addEventListener('click', async () => {
      const dupTask = {
        ...task,
        id: generateId(),
        title: task.title + ' (Copy)',
        createdAt: new Date().toISOString()
      };
      state.tasks.push(dupTask);
      await saveTasks();
      closeModal();
      renderView();
      showToast('Task duplicated!', 'success');
    });
  }

  // Delete task option
  const delBtn = document.getElementById('opt-delete-btn');
  if (delBtn && task) {
    delBtn.addEventListener('click', () => {
      deleteTask(taskId);
      closeModal();
    });
  }

  // Save Task
  const saveBtn = document.getElementById('modal-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const title = document.getElementById('modal-title').value.trim();
      if (!title) { showToast('Title is required', 'error'); return; }

      const selectedPriorityBtn = document.querySelector('.priority-flag-btn.selected');
      const selectedPriority = selectedPriorityBtn ? selectedPriorityBtn.dataset.priority : 'P4';
      const tagsInput = document.getElementById('modal-tags').value;
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

      const data = {
        title,
        description: document.getElementById('modal-desc').value,
        priority: selectedPriority,
        plannedDate: document.getElementById('modal-planned-date').value || null,
        plannedTime: document.getElementById('modal-planned-time').value || null,
        dueDate: document.getElementById('modal-due-date').value || null,
        dueTime: document.getElementById('modal-due-time').value || null,
        projectId: document.getElementById('modal-project').value || null,
        tags
      };

      if (isNew) {
        const newTask = {
          id: generateId(),
          ...data,
          parentTaskId: null,
          recurring: null,
          completed: false,
          completedAt: null,
          createdAt: new Date().toISOString(),
          profileId: getActiveProfileId()
        };
        state.tasks.push(newTask);
      } else {
        if (!task.profileId || task.profileId === 'all') {
          task.profileId = getActiveProfileId();
        }
        Object.assign(task, data);
      }

      await saveTasks();
      closeModal();
      renderView();
      renderSidebarTags();
      showToast(isNew ? 'Task created!' : 'Task updated!', 'success');
    });
  }

  // Close buttons
  const cancelBtn = document.getElementById('modal-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
}

function showProjectModal(parentId = null) {
  const html = `
    <div class="modal-header">
      <h2>${parentId ? 'New List' : 'New Project'}</h2>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Project Name</label>
        <input class="form-input" id="modal-proj-name" placeholder="e.g. Work, Personal" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="color-picker">
          ${['#5cb8ff', '#00d4aa', '#b47aff', '#ff5c5c', '#ffb347', '#ff6bcb', '#48dbfb', '#ffd93d'].map(c =>
    `<div class="color-swatch" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent;transition:all 0.15s ease;"></div>`
  ).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn-primary" id="modal-save-btn">Create</button>
    </div>
  `;

  openModal(html);

  let selectedColor = '#5cb8ff';
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.style.borderColor = 'transparent');
      swatch.style.borderColor = 'white';
      selectedColor = swatch.dataset.color;
    });
  });
  // Select first by default
  document.querySelector('.color-swatch').style.borderColor = 'white';

  document.getElementById('modal-save-btn').addEventListener('click', async () => {
    const name = document.getElementById('modal-proj-name').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }
    state.projects.push({
      id: 'proj-' + generateId(),
      name,
      color: selectedColor,
      parentProjectId: parentId,
      profileId: getActiveProfileId()
    });
    await window.api.saveProjects(state.projects);
    closeModal();
    renderSidebarProjects();
    showToast('Project created!', 'success');
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
}

function showReminderModal() {
  const html = `
    <div class="modal-header">
      <h2>New Reminder</h2>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Reminder Name</label>
        <input class="form-input" id="modal-reminder-name" placeholder="e.g. Call Mom, Doctor appointment" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="modal-reminder-date" type="date" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn-primary" id="modal-save-btn">Add Reminder</button>
    </div>
  `;

  openModal(html);

  document.getElementById('modal-save-btn').addEventListener('click', async () => {
    const personName = document.getElementById('modal-reminder-name').value.trim();
    const date = document.getElementById('modal-reminder-date').value;

    if (!personName || !date) { showToast('Name and date are required', 'error'); return; }

    state.reminders.push({
      id: 'rem-' + generateId(),
      personName,
      date,
      profileId: getActiveProfileId()
    });

    await window.api.saveReminders(state.reminders);
    closeModal();
    showToast('Reminder added!', 'success');
    renderView();
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
}

function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  container.innerHTML = html;
  overlay.classList.remove('hidden');

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-container').innerHTML = '';

  // Also close any popups
  document.querySelectorAll('.draggable-popup').forEach(el => el.remove());
}

function openDraggablePopup(html, popupId) {
  // Remove existing
  const existing = document.getElementById(popupId);
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = popupId;
  popup.className = 'draggable-popup';
  popup.innerHTML = html;

  // Apply initial styles for floating panel
  Object.assign(popup.style, {
    position: 'fixed',
    top: '70px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'max-content',
    maxWidth: '94vw',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column'
  });

  document.body.appendChild(popup);

  // Make draggable
  const header = popup.querySelector('.modal-header') || popup.querySelector('.task-modal-top-bar');
  if (header) {
    header.style.cursor = 'grab';
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
      // Don't drag if clicking close button
      if (e.target.closest('.modal-close')) return;
      isDragging = true;
      header.style.cursor = 'grabbing';
      startX = e.clientX;
      startY = e.clientY;

      const rect = popup.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      popup.style.transform = 'none'; // Remove translateX
      popup.style.left = initialLeft + 'px';
      popup.style.top = initialTop + 'px';

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      popup.style.left = (initialLeft + dx) + 'px';
      popup.style.top = (initialTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      header.style.cursor = 'grab';
    });
  }

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      popup.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function openInspector(html) {
  const inspector = document.getElementById('task-inspector');
  const main = document.getElementById('main');
  const content = document.getElementById('inspector-content');
  if (!inspector || !main || !content) return;

  content.innerHTML = html;
  inspector.classList.add('open');
  main.classList.add('inspector-open');
}

function closeInspector() {
  const inspector = document.getElementById('task-inspector');
  const main = document.getElementById('main');
  const content = document.getElementById('inspector-content');
  if (!inspector || !main || !content) return;

  inspector.classList.remove('open');
  main.classList.remove('inspector-open');
  setTimeout(() => {
    if (!inspector.classList.contains('open')) {
      content.innerHTML = '';
    }
  }, 250);
}

function showEventPopover(eventId, eventType, triggerEl) {
  let event = null;
  if (eventType === 'gcal_event') {
    event = state.gcalEvents.find(e => e.id === eventId);
  } else {
    event = state.events.find(e => e.id === eventId);
  }

  if (!event) return;

  const popover = document.getElementById('event-popover');
  if (!popover) return;

  let meetLink = event.hangoutLink || '';
  let loc = event.location || '';

  // Extract Zoom/Webex/Teams from description if no hangoutLink is provided
  const meetMatch = (event.description || '').match(/(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:zoom\.us|webex\.com|teams\.microsoft\.com|meet\.google\.com)[^\s"<>]*)/i);
  if (!meetLink && meetMatch) {
    meetLink = meetMatch[1];
  }

  let cleanDesc = '';
  if (event.description) {
    const tmp = document.createElement('div');
    tmp.innerHTML = event.description.replace(/<br\s*[\/]?>/gi, '\n');
    cleanDesc = tmp.textContent || tmp.innerText || '';
    if (meetLink) {
      cleanDesc = cleanDesc.replace(meetLink, '');
    }
    if (loc && cleanDesc.startsWith(loc)) {
      cleanDesc = cleanDesc.substring(loc.length).trim();
    }
    if (cleanDesc.includes('Changes made to the title, description, or attachments will not be saved')) {
      cleanDesc = '';
    }
  }

  const html = `
    <div class="popover-header">
      <div style="flex:1"></div>
      ${event.htmlLink ? `<a href="${event.htmlLink}" class="popover-action external-link" title="Open in Google Calendar">🔗</a>` : ''}
      <button class="popover-action" id="popover-close-btn" title="Close">✕</button>
    </div>
    <div class="popover-body">
      <div class="popover-row">
        <div class="popover-icon" style="color: ${event.color || 'var(--accent)'}">●</div>
        <div class="popover-content">
          <h3>${escHtml(event.title)}</h3>
          <div class="popover-text">
            ${event.date} • ${event.startTime ? formatTime12(event.startTime) + ' – ' + formatTime12(event.endTime) : 'All Day'}
          </div>
        </div>
      </div>
      ${meetLink ? `
        <div class="popover-row">
          <div class="popover-icon" style="color:var(--text-tertiary);">🎥</div>
          <div class="popover-content">
            <div class="popover-text">
              <a href="${meetLink}" class="external-link" style="color:var(--accent);text-decoration:none;word-break:break-all;">Join Video Call</a>
            </div>
          </div>
        </div>
      ` : ''}
      ${loc ? `
        <div class="popover-row">
          <div class="popover-icon" style="color:var(--text-tertiary);">📍</div>
          <div class="popover-content">
            <div class="popover-text">
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}" class="external-link" style="color:var(--accent);text-decoration:none;">${escHtml(loc)}</a>
            </div>
          </div>
        </div>
      ` : ''}
      ${cleanDesc.trim() ? `
        <div class="popover-row">
          <div class="popover-icon" style="color:var(--text-tertiary);">📝</div>
          <div class="popover-content">
            <div class="popover-text" style="white-space:pre-wrap;max-height:150px;overflow-y:auto;">${escHtml(cleanDesc.trim())}</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  popover.innerHTML = html;

  // Calculate position
  const rect = triggerEl.getBoundingClientRect();
  const popoverWidth = 350;

  // Try to place it to the right of the event
  let left = rect.right + 10;
  if (left + popoverWidth > window.innerWidth) {
    // If it overflows right, place it to the left
    left = rect.left - popoverWidth - 10;
  }

  let top = rect.top;
  // Make sure it doesn't overflow bottom
  const popoverHeight = popover.offsetHeight || 200; // estimated
  if (top + popoverHeight > window.innerHeight) {
    top = window.innerHeight - popoverHeight - 20;
  }
  if (top < 0) top = 20;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.classList.remove('hidden');

  document.getElementById('popover-close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    popover.classList.add('hidden');
  });

  // Global click listener to close popover if clicking outside
  const outsideClickListener = (e) => {
    if (!popover.contains(e.target) && !triggerEl.contains(e.target)) {
      popover.classList.add('hidden');
      document.removeEventListener('click', outsideClickListener);
    }
  };

  // Remove existing listeners if any, by attaching a new one
  document.removeEventListener('click', window._popoverOutsideClickListener);
  window._popoverOutsideClickListener = outsideClickListener;
  document.addEventListener('click', outsideClickListener);
}


// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : '✕';
  toast.innerHTML = `<span class="toast-icon">${icon}</span> ${escHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

