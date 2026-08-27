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
  const currentView = state.tasksViewMode || 'board';
  const isList = currentView === 'list';

  const profileOrder = { 'school': 1, 'work': 2, 'personal': 3 };
  const sortedProfiles = [...(state.profiles || [])]
    .filter(p => p.id !== 'all')
    .sort((a, b) => {
      const orderA = profileOrder[a.id.toLowerCase()] || profileOrder[a.name.toLowerCase()] || 99;
      const orderB = profileOrder[b.id.toLowerCase()] || profileOrder[b.name.toLowerCase()] || 99;
      return orderA - orderB;
    });

  const profileBtns = `
    <div class="mode-switcher tasks-mode-switcher" id="tasks-mode-switcher">
      <button class="mode-btn ${(!state.activeProfileId || state.activeProfileId === 'all') ? 'active' : ''}" data-tasks-profile="all" title="All Profiles">All</button>
      ${sortedProfiles.map(p => {
        const isActive = state.activeProfileId === p.id;
        const iconSrc = p.image || 'assets/profiles/personal.png';
        return `<button class="mode-btn ${isActive ? 'active' : ''}" data-tasks-profile="${p.id}" title="${escAttr(p.name)}">
          <img src="${iconSrc}" alt="${escAttr(p.name)}" class="custom-emoji" />
          <span>${escHtml(p.name)}</span>
        </button>`;
      }).join('')}
    </div>
  `;

  const activeProf = (state.profiles || []).find(p => p.id === state.activeProfileId);
  const headerTitle = (state.activeProfileId && state.activeProfileId !== 'all') ? (activeProf ? activeProf.name : 'Tasks') : 'Tasks';

  const filterHtml = `
    <div class="filter-bar" style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <h1 style="margin:0;font-size:26px;font-weight:700;letter-spacing:-0.4px;">${escHtml(headerTitle)}</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${allTags.map(tag => `<button class="filter-chip ${state.filterTag === tag ? 'active' : ''}" data-filter-tag="${tag}">${tag}</button>`).join('')}
        </div>
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
  `;

  return `
    <div class="tasks-view ${isList ? 'list-mode' : 'board-mode'}">
      <div class="view-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          ${profileBtns}
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="view-toggle">
            <button class="view-toggle-btn ${!isList ? 'active' : ''}" data-tasks-view="board">Board</button>
            <button class="view-toggle-btn ${isList ? 'active' : ''}" data-tasks-view="list">List</button>
          </div>
          <button class="btn-primary" id="add-task-btn" style="padding:6px 12px;font-size:12px;">+ New Task</button>
        </div>
      </div>
      ${filterHtml}
      ${renderTaskList(filtered)}
    </div>
  `;
}

function renderTaskList(tasks) {
  const isList = state.tasksViewMode === 'list';
  const incomplete = tasks.filter(t => !t.completed && !t.isCompleting);
  const completing = tasks.filter(t => t.isCompleting);
  const visibleTasks = [...incomplete, ...completing];

  // Section configuration
  if (!state.settings.taskSections) {
    state.settings.taskSections = [];
  }

  // Filter sections by active profile
  let sections = state.settings.taskSections;
  if (state.activeProfileId && state.activeProfileId !== 'all') {
    sections = sections.filter(s => !s.profileId || s.profileId === state.activeProfileId);
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

  if (isList) {
    // ===== LIST VIEW (Vertical sectioned agenda list) =====
    let html = '<div class="tasks-sections-wrapper list-view">';

    // 1. Top Unsectioned area (like Inbox in screenshot)
    html += `
      <div class="task-section unsectioned-section" data-section-drop="unsectioned">
        <div class="task-section-list">
          ${unsectionedTasks.map(t => renderTaskItem(t, true)).join('')}
        </div>
        <button class="add-task-inline-btn" data-add-task-section="unsectioned">
          <span class="plus-icon">+</span> Add task
        </button>
      </div>
    `;

    // 2. Add Section divider after unsectioned tasks
    html += `
      <div class="add-section-divider-wrap add-section-btn" title="Add section">
        <div class="add-section-line"></div>
        <span class="add-section-divider-btn">Add section</span>
        <div class="add-section-line"></div>
      </div>
    `;

    // 3. Named sections (e.g. UIUC, Personal 9)
    sections.forEach((sec, idx) => {
      const secTasks = sectionedTasks[sec.id] || [];
      const count = secTasks.length;
      html += `
        <div class="task-section" data-section-drop="${sec.id}" draggable="true" data-section-drag="${sec.id}">
          <div class="task-group-header">
            <div class="section-title-wrap">
              <span class="section-name">${escHtml(sec.name)}</span>
              ${count > 0 ? `<span class="section-count">${count}</span>` : ''}
            </div>
            <button class="icon-btn delete-section-btn" data-section-id="${sec.id}" title="Section options" style="font-size:14px;opacity:0.4;">•••</button>
          </div>
          <div class="task-section-list">
            ${secTasks.map(t => renderTaskItem(t, true)).join('')}
          </div>
          <button class="add-task-inline-btn" data-add-task-section="${sec.id}">
            <span class="plus-icon">+</span> Add task
          </button>
        </div>
      `;

      // Add Section divider after each section
      html += `
        <div class="add-section-divider-wrap add-section-btn" title="Add section">
          <div class="add-section-line"></div>
          <span class="add-section-divider-btn">Add section</span>
          <div class="add-section-line"></div>
        </div>
      `;
    });

    html += '</div>';
    return html;
  } else {
    // ===== BOARD VIEW (Original horizontal Kanban columns) =====
    let html = '<div class="tasks-sections-wrapper board-view">';

    // Render sections as columns
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
            ${secTasks.map(t => renderTaskItem(t, false)).join('')}
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
            ${unsectionedTasks.map(t => renderTaskItem(t, false)).join('')}
          </div>
          <button class="add-task-inline-btn" data-add-task-section="unsectioned">
            <span class="plus-icon">+</span> Add task
          </button>
        </div>
      `;
    }

    // Add Section button column in Board view
    html += `
      <button class="add-section-btn">
        <img src="assets/icons/Add.png" alt="Add" style="width:18px;height:18px;object-fit:contain;" />
        Add section
      </button>
    `;

    html += '</div>';
    return html;
  }
}

function renderTaskItem(task, isListView = false) {
  const pColor = getPriorityColor(task.priority);
  const dueLabel = getDueLabel(task);

  let plannedLabel = '';
  if (task.plannedDate) {
    const timeStr = task.plannedTime ? ' ' + formatTime12(task.plannedTime) : '';
    plannedLabel = `<span class="task-date-pill planned" style="font-size:11px;color:var(--text-secondary);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;" title="Planned Date & Time">📅 ${formatDateShort(task.plannedDate)}${timeStr}</span>`;
  }

  let dueHtml = '';
  if (dueLabel) {
    const dueTimeStr = task.dueTime ? ' ' + formatTime12(task.dueTime) : '';
    dueHtml = `<span class="task-date-pill ${dueLabel.class}" style="font-size:11px;padding:2px 8px;border-radius:4px;" title="Due Date & Time">⏰ ${dueLabel.text}${dueTimeStr}</span>`;
  }

  const locHtml = getTaskLocationHtml(task);
  const hasMeta = plannedLabel || dueHtml || (task.tags && task.tags.length > 0);

  if (isListView) {
    return `
      <div class="task-item-card list-row ${task.completed ? 'completed' : ''}" data-task-id="${task.id}" draggable="true">
        <div class="task-circle-check" data-task-toggle="${task.id}" style="width:18px;height:18px;border-radius:50%;border:1.5px solid ${pColor || 'rgba(255,255,255,0.35)'};color:${pColor || 'var(--text-primary)'};${task.completed ? 'background:' + (pColor || 'var(--accent)') + '33;' : ''}display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;cursor:pointer;" title="Priority ${task.priority ? task.priority.replace('P', '') : 'Default'}">
          ${task.completed ? '✓' : ''}
        </div>
        <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px;" data-task-edit="${task.id}">
          <div style="font-size:14px;font-weight:400;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escHtml(task.title)}
          </div>
          ${hasMeta ? `
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${plannedLabel}
              ${dueHtml}
              ${task.tags.map(tag => `<span style="font-size:11px;color:var(--accent);background:rgba(72,219,251,0.08);padding:1px 6px;border-radius:4px;">${escHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Board card layout
  return `
    <div class="task-item-card board-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}" draggable="true">
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





