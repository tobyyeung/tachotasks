/**
 * task-modal.js
 * Task creation & editing split modal interface.
 */

// Entry point: opens full task editor modal for new or existing task
function showTaskModal(taskId = null, initialData = {}) {
  showTaskEditorModal(taskId, initialData);
}


/**
 * Full Split-Pane Task Editor Modal (used when editing existing tasks or clicking [+] expand)
 */
function showTaskEditorModal(taskId, initialData = {}) {
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

  const activeProjId = task ? task.projectId : ((initialData && initialData.projectId) !== undefined ? initialData.projectId : (state.filterProject || null));
  const initialSectionId = (initialData && initialData.sectionId) !== undefined ? initialData.sectionId : (task ? task.sectionId : null);
  const locHtml = getTaskLocationHtml(task || { projectId: activeProjId, sectionId: initialSectionId });
  const defaultProfId = (state.settings && state.settings.defaultProfileId) || 'profile-personal';
  const profId = (task && task.profileId) || (initialData && initialData.profileId) || defaultProfId;
  const prof = (state.profiles || []).find(p => p.id === profId);
  const profName = prof ? prof.name : 'Personal';

  const projectOptions = (state.projects || []).filter(p => !p.archived).map(p =>
    `<option value="${p.id}" ${activeProjId === p.id ? 'selected' : ''}>● ${escHtml(p.name)}</option>`
  ).join('');

  const currentTags = task ? task.tags.join(', ') : ((initialData && initialData.tags) ? initialData.tags.join(', ') : '');
  const currentPriority = task ? (task.priority || 'P4') : ((initialData && initialData.priority) || 'P4');
  let currentRecurring = task ? task.recurring : ((initialData && initialData.recurring) || null);
  const currentTitle = task ? task.title : ((initialData && initialData.title) || '');
  const currentDueDate = task ? (task.dueDate || '') : ((initialData && initialData.dueDate) || '');
  const currentDueTime = task ? (task.dueTime || '') : ((initialData && initialData.dueTime) || '');
  const currentPlannedDate = task ? (task.plannedDate || '') : ((initialData && initialData.plannedDate) || '');
  const currentPlannedTime = task ? (task.plannedTime || '') : ((initialData && initialData.plannedTime) || '');

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
              <button class="task-action-btn" id="modal-more-options-btn" title="More options" style="display:inline-flex;align-items:center;justify-content:center;">
                <img src="assets/icons/Dots.png" alt="Options" style="width:16px;height:16px;object-fit:contain;" />
              </button>
              
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

            <button class="task-action-btn modal-close" id="modal-close-btn" title="Close" style="display:inline-flex;align-items:center;justify-content:center;">
              <img src="assets/icons/Cross.png" alt="Close" style="width:14px;height:14px;object-fit:contain;" />
            </button>
          </div>
        </div>

        <div class="task-title-row">
          <div class="task-circle-check" id="modal-toggle-check" title="Toggle completion">
            ${task && task.completed ? '✓' : ''}
          </div>
          <input class="task-title-input" id="modal-title" value="${escAttr(currentTitle)}" placeholder="Task name" autofocus ${ro} />
        </div>

        <div class="task-desc-container">
          <div class="task-desc-icon">
            <img src="assets/icons/Description.png" alt="Desc" style="width:18px;height:18px;object-fit:contain;" />
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
          <div class="dt-trigger-capsule" id="modal-due-dt-picker" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:5px 8px;cursor:pointer;">
            <span id="modal-due-dt-text" style="font-size:12px;${currentDueDate ? 'color:var(--text-primary);' : 'color:var(--text-tertiary);'}">${currentDueDate ? formatDateShort(currentDueDate) + (currentDueTime ? ' at ' + formatTime12(currentDueTime) : '') : 'e.g. Jul 24, 9:30 AM'}</span>
            <img src="assets/icons/Calendar.png" alt="Calendar" style="width:16px;height:16px;object-fit:contain;" />
          </div>
          <input type="hidden" id="modal-due-date" value="${currentDueDate}" />
          <input type="hidden" id="modal-due-time" value="${currentDueTime}" />
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Planned Date</label>
          <div class="dt-trigger-capsule" id="modal-planned-dt-picker" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:5px 8px;cursor:pointer;">
            <span id="modal-planned-dt-text" style="font-size:12px;${currentPlannedDate ? 'color:var(--text-primary);' : 'color:var(--text-tertiary);'}">${currentPlannedDate ? formatDateShort(currentPlannedDate) + (currentPlannedTime ? ' at ' + formatTime12(currentPlannedTime) : '') : 'e.g. Jul 25, 2:00 PM'}</span>
            <img src="assets/icons/Calendar.png" alt="Calendar" style="width:16px;height:16px;object-fit:contain;" />
          </div>
          <input type="hidden" id="modal-planned-date" value="${currentPlannedDate}" />
          <input type="hidden" id="modal-planned-time" value="${currentPlannedTime}" />
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Priority</label>
          <div class="priority-flag-selector">
            ${['P1', 'P2', 'P3', 'P4'].map(p => {
              const selected = currentPriority === p ? 'selected' : '';
              const colorClass = getPriorityColorClass(p);
              const flagSrc = p === 'P4' ? 'assets/icons/Flag.png' : 'assets/icons/Flag filled.png';
              return `<button class="priority-flag-btn ${colorClass} ${selected}" data-priority="${p}" title="Priority ${p.replace('P', '')}">
                <img src="${flagSrc}" alt="${p}" style="width:16px;height:16px;object-fit:contain;" />
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Labels / Tags</label>
          <input class="sidebar-date-input" id="modal-tags" value="${escAttr(currentTags)}" placeholder="@deep_work, @errands" ${ro} />
        </div>

        <div style="flex:1"></div>

        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:16px;">
          <button class="btn-secondary" id="modal-cancel-btn" style="padding:5px 12px;font-size:11px;">Cancel</button>
          ${!isArchived ? `<button class="btn-primary" id="modal-save-btn" style="padding:5px 14px;font-size:11px;">${isNew ? 'Add Task' : 'Save'}</button>` : ''}
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
      const todayStr = toISODate(new Date());
      const curDate = isImgClick ? todayStr : document.getElementById('modal-due-date').value;
      const curTime = document.getElementById('modal-due-time').value;
      showDateSelector({
        targetElement: duePickerBtn,
        initialDate: curDate,
        initialTime: curTime,
        initialRepeat: currentRecurring,
        onSelect: ({ date, time, repeat }) => {
          document.getElementById('modal-due-date').value = date || '';
          document.getElementById('modal-due-time').value = time || '';
          currentRecurring = repeat || null;
          if (task) task.recurring = currentRecurring;
          const textEl = document.getElementById('modal-due-dt-text');
          if (textEl) {
            let label = date ? formatDateShort(date) + (time ? ' at ' + formatTime12(time) : '') : 'e.g. Jul 24, 9:30 AM';
            if (currentRecurring) {
              label += ` (${currentRecurring})`;
            }
            textEl.textContent = label;
            textEl.style.color = date || currentRecurring ? 'var(--text-primary)' : 'var(--text-tertiary)';
          }
        },
        onClear: () => {
          document.getElementById('modal-due-date').value = '';
          document.getElementById('modal-due-time').value = '';
          currentRecurring = null;
          if (task) task.recurring = null;
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
      const todayStr = toISODate(new Date());
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

  // Location selector click
  const locBtn = document.getElementById('modal-location-btn');
  if (locBtn && !isArchived) {
    locBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const projSelect = document.getElementById('modal-project');
      if (projSelect) {
        projSelect.focus();
        if (typeof projSelect.showPicker === 'function') {
          try { projSelect.showPicker(); } catch (err) { }
        }
      }
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
      const nowIso = new Date().toISOString();
      const dupTask = {
        ...task,
        id: generateId(),
        title: task.title + ' (Copy)',
        createdAt: nowIso,
        updatedAt: nowIso
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
      const rawTitle = document.getElementById('modal-title').value.trim();
      if (!rawTitle) { showToast('Title is required', 'error'); return; }

      // Parse NLP tokens from title if any
      const parsed = typeof parseTaskInputTokens === 'function' ? parseTaskInputTokens(rawTitle) : { cleanTitle: rawTitle };
      const finalTitle = parsed.cleanTitle || rawTitle;

      const selectedPriorityBtn = document.querySelector('.priority-flag-btn.selected');
      let selectedPriority = selectedPriorityBtn ? selectedPriorityBtn.dataset.priority : 'P4';
      if (selectedPriority === 'P4' && parsed.priority) {
        selectedPriority = parsed.priority;
      }

      const tagsInput = document.getElementById('modal-tags').value;
      let tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];
      if (tags.length === 0 && parsed.tags && parsed.tags.length > 0) {
        tags = parsed.tags;
      }

      let dueDate = document.getElementById('modal-due-date').value || null;
      let dueTime = document.getElementById('modal-due-time').value || null;
      if (!dueDate && parsed.dueDate) {
        dueDate = parsed.dueDate;
        dueTime = parsed.dueTime || dueTime;
      }

      if (!currentRecurring && parsed.recurring) {
        currentRecurring = parsed.recurring;
      }

      const data = {
        title: finalTitle,
        description: document.getElementById('modal-desc').value,
        priority: selectedPriority,
        plannedDate: document.getElementById('modal-planned-date').value || null,
        plannedTime: document.getElementById('modal-planned-time').value || null,
        dueDate: dueDate,
        dueTime: dueTime,
        projectId: document.getElementById('modal-project').value || null,
        tags
      };

      const nowIso = new Date().toISOString();

      if (isNew) {
        const newTask = {
          id: generateId(),
          ...data,
          sectionId: initialSectionId || null,
          parentTaskId: null,
          recurring: currentRecurring || null,
          completed: false,
          completedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
          profileId: (initialData && initialData.profileId) || getActiveProfileId()
        };
        state.tasks.push(newTask);
      } else {
        if (!task.profileId || task.profileId === 'all') {
          task.profileId = getActiveProfileId();
        }
        task.recurring = currentRecurring || null;
        task.updatedAt = nowIso;
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
