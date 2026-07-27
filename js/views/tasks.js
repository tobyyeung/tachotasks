// ===== TASKS VIEW =====
function renderTasks() {
  let modeTasks = getFilteredByMode(state.tasks).filter(t => !t.projectId);
  let filtered = applyFilters(modeTasks);

  // Sorting
  const sortMode = state.tasksSortMode || 'dueDate';
  filtered.sort((a, b) => {
    if (sortMode === 'dueDate') {
      const dateA = a.dueDate || '9999-12-31';
      const dateB = b.dueDate || '9999-12-31';
      return dateA.localeCompare(dateB);
    } else if (sortMode === 'plannedDate') {
      const dateA = a.plannedDate || '9999-12-31';
      const dateB = b.plannedDate || '9999-12-31';
      return dateA.localeCompare(dateB);
    } else if (sortMode === 'priority') {
      const pA = a.priority || 'P9';
      const pB = b.priority || 'P9';
      return pA.localeCompare(pB);
    } else if (sortMode === 'createdDate') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return 0;
  });

  const allTags = getAllTags();
  const filterHtml = `
    <div class="filter-bar" style="justify-content: space-between;">
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${allTags.map(tag => `<button class="filter-chip ${state.filterTag === tag ? 'active' : ''}" data-filter-tag="${tag}">${tag}</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;">
        <div class="view-toggle">
          <button class="view-toggle-btn ${state.tasksViewMode !== 'list' ? 'active' : ''}" data-tasks-view="section">Sections</button>
          <button class="view-toggle-btn ${state.tasksViewMode === 'list' ? 'active' : ''}" data-tasks-view="list">List</button>
        </div>
        <div class="sort-dropdown-wrapper">
          <button class="sort-dropdown-btn" id="tasks-sort-btn">
            <img src="assets/icons/Sort.png" alt="Sort" style="width:18px;height:18px;object-fit:contain;" />
            Sort
          </button>
          <div class="sort-dropdown-panel hidden" id="tasks-sort-panel">
            <div class="sort-option ${sortMode === 'dueDate' ? 'active' : ''}" data-sort="dueDate">
              <span>Due Date</span>
              ${sortMode === 'dueDate' ? '<span class="check-mark">✓</span>' : ''}
            </div>
            <div class="sort-option ${sortMode === 'plannedDate' ? 'active' : ''}" data-sort="plannedDate">
              <span>Planned Date</span>
              ${sortMode === 'plannedDate' ? '<span class="check-mark">✓</span>' : ''}
            </div>
            <div class="sort-option ${sortMode === 'priority' ? 'active' : ''}" data-sort="priority">
              <span>Priority</span>
              ${sortMode === 'priority' ? '<span class="check-mark">✓</span>' : ''}
            </div>
            <div class="sort-option ${sortMode === 'createdDate' ? 'active' : ''}" data-sort="createdDate">
              <span>Created Date</span>
              ${sortMode === 'createdDate' ? '<span class="check-mark">✓</span>' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return `
    <div class="tasks-view">
      <div class="view-header">
        <h1>Tasks</h1>
        <button class="btn-primary" id="add-task-btn" style="padding:8px 16px;font-size:13px;">+ New Task</button>
      </div>
      ${filterHtml}
      ${renderTaskList(filtered)}
    </div>
  `;
}

function renderTaskList(tasks) {
  const incomplete = tasks.filter(t => !t.completed && !t.isCompleting);
  const completing = tasks.filter(t => t.isCompleting);
  const visibleTasks = [...incomplete, ...completing];

  let html = '<div class="task-list">';

  // List view mode: just render all tasks directly
  if (state.tasksViewMode === 'list') {
    html += visibleTasks.length > 0
      ? visibleTasks.map(t => renderTaskItem(t)).join('')
      : '<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-text">No tasks here yet. Add one!</div></div>';
    html += '</div>';
    return html;
  }

  // Section view mode (default)
  // Ensure sections exist in settings
  if (!state.settings.taskSections) {
    state.settings.taskSections = [];
  }

  // Filter sections by active mode
  let sections = state.settings.taskSections;
  if (state.activeMode !== 'all') {
    sections = sections.filter(s => !s.profileId || s.profileId === state.activeMode);
  }

  // Group tasks by section
  const sectionedTasks = {};
  sections.forEach(s => sectionedTasks[s.id] = []);
  const unsectionedTasks = [];

  visibleTasks.forEach(t => {
    if (t.sectionId && sectionedTasks[t.sectionId]) {
      sectionedTasks[t.sectionId].push(t);
    } else {
      unsectionedTasks.push(t);
    }
  });

  html += `
    <div class="tasks-sections-wrapper">
  `;

  // Render sections
  sections.forEach(sec => {
    const secTasks = sectionedTasks[sec.id] || [];
    const count = secTasks.length;
    html += `
      <div class="task-section ${count > 0 ? 'has-tasks' : ''}" data-section-drop="${sec.id}" draggable="true" data-section-drag="${sec.id}">
        <div class="task-group-header">
          <div class="section-title-wrap">
            <span class="section-name">${escHtml(sec.name)}</span>
            <span class="section-count">${count}</span>
          </div>
          <button class="icon-btn delete-section-btn" data-section-id="${sec.id}" title="Delete section" style="font-size:12px;opacity:0.4;">•••</button>
        </div>
        <div class="task-section-list">
          ${secTasks.map(t => renderTaskItem(t)).join('')}
        </div>
        <button class="add-task-inline-btn" data-add-task-section="${sec.id}">
          <span class="plus-icon">+</span> Add task
        </button>
      </div>
    `;
  });

  // Render unsectioned tasks if not empty (or if no sections exist)
  if (unsectionedTasks.length > 0 || sections.length === 0) {
    const count = unsectionedTasks.length;
    html += `
      <div class="task-section ${count > 0 ? 'has-tasks' : ''}" data-section-drop="unsectioned">
        <div class="task-group-header">
          <div class="section-title-wrap">
            <span class="section-name">Uncategorized</span>
            <span class="section-count">${count}</span>
          </div>
          <button class="icon-btn" style="font-size:12px;opacity:0.2;cursor:default;">•••</button>
        </div>
        <div class="task-section-list">
          ${unsectionedTasks.map(t => renderTaskItem(t)).join('')}
        </div>
        <button class="add-task-inline-btn" data-add-task-section="unsectioned">
          <span class="plus-icon">+</span> Add task
        </button>
      </div>
    `;
  }

  // Always show Add Section button
  html += `
    <button class="add-section-btn">
      <img src="assets/icons/Add.png" alt="Add" style="width:18px;height:18px;object-fit:contain;" />
      Add section
    </button>
  </div>`;
  return html;
}

function renderTaskItem(task) {
  const pColor = getPriorityColor(task.priority);
  const dueLabel = getDueLabel(task);
  const proj = state.projects.find(p => p.id === task.projectId);

  let plannedLabel = '';
  if (task.plannedDate) {
    const timeStr = task.plannedTime ? ' ' + formatTime12(task.plannedTime) : '';
    plannedLabel = `<span class="task-date-pill planned" style="font-size:11px;color:var(--text-secondary);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;" title="Planned Date & Time">📅 ${formatDateShort(new Date(task.plannedDate))}${timeStr}</span>`;
  }

  let dueHtml = '';
  if (dueLabel) {
    const dueTimeStr = task.dueTime ? ' ' + formatTime12(task.dueTime) : '';
    dueHtml = `<span class="task-date-pill ${dueLabel.class}" style="font-size:11px;padding:2px 8px;border-radius:4px;" title="Due Date & Time">⏰ ${dueLabel.text}${dueTimeStr}</span>`;
  }

  const locHtml = getTaskLocationHtml(task);

  return `
    <div class="task-item-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}" draggable="true">
      <div class="task-circle-check" data-task-toggle="${task.id}" style="width:20px;height:20px;border-radius:50%;border:2px solid ${pColor || 'var(--text-tertiary)'};color:${pColor || 'var(--text-primary)'};${task.completed ? 'background:' + (pColor || 'var(--accent)') + '33;' : ''}display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;flex-shrink:0;cursor:pointer;" title="Priority ${task.priority ? task.priority.replace('P', '') : 'Default'}">
        ${task.completed ? '✓' : ''}
      </div>
      <div style="flex:1;min-width:0;" data-task-edit="${task.id}">
        <div style="font-size:14px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escHtml(task.title)}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap;">
          <span style="font-size:11px;">${locHtml}</span>
          ${plannedLabel}
          ${dueHtml}
          ${task.tags.map(tag => `<span style="font-size:11px;color:var(--accent);">${escHtml(tag)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}





