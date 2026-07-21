// ===== TASKS VIEW =====
function renderTasks() {
  let modeTasks = getFilteredByMode(state.tasks);
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
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
    <div class="tasks-view" style="height:100%; overflow-y:auto; padding-bottom:32px;">
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
    <div class="tasks-sections-wrapper" style="display:flex; gap:var(--sp-md); overflow-x:auto; padding-bottom:16px; min-height: 400px;">
  `;

  // Render sections
  sections.forEach(sec => {
    html += `
      <div class="task-section" data-section-drop="${sec.id}" draggable="true" data-section-drag="${sec.id}" style="min-width:240px; width:240px; flex-shrink:0; background:var(--bg-glass); border:1px solid var(--border); border-radius:var(--radius-lg); padding:var(--sp-md); display:flex; flex-direction:column;">
        <div class="task-group-header" style="display:flex; justify-content:space-between; align-items:center; cursor:grab; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--text-tertiary);"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            <span style="font-size:14px; font-weight:600; color:var(--text-primary); text-transform:none; letter-spacing:0;">${escHtml(sec.name)}</span>
          </div>
          <button class="icon-btn delete-section-btn" data-section-id="${sec.id}" style="font-size:12px;opacity:0.5;">✕</button>
        </div>
        <div class="task-section-list" style="flex:1; overflow-y:auto; min-height:20px; padding-bottom:8px;">
          ${sectionedTasks[sec.id].length > 0 
            ? sectionedTasks[sec.id].map(t => renderTaskItem(t)).join('')
            : '<div style="font-size:12px;color:var(--text-tertiary);padding:8px;font-style:italic;">Drag tasks here</div>'}
        </div>
      </div>
    `;
  });

  // Render unsectioned tasks if not empty (or if no sections exist)
  if (unsectionedTasks.length > 0 || sections.length === 0) {
    html += `
      <div class="task-section" data-section-drop="unsectioned" style="min-width:240px; width:240px; flex-shrink:0; background:var(--bg-glass); border:1px solid var(--border); border-radius:var(--radius-lg); padding:var(--sp-md); display:flex; flex-direction:column;">
        <div class="task-group-header" style="margin-bottom:12px;">
          <span style="font-size:14px; font-weight:600; color:var(--text-primary); text-transform:none; letter-spacing:0;">Uncategorized</span>
        </div>
        <div class="task-section-list" style="flex:1; overflow-y:auto; min-height:20px; padding-bottom:8px;">
          ${unsectionedTasks.length > 0 
            ? unsectionedTasks.map(t => renderTaskItem(t)).join('')
            : '<div class="empty-state" style="padding:16px;"><div class="empty-text">No tasks yet.</div></div>'}
        </div>
      </div>
    `;
  }

  // Always show Add Section button
  html += `
    <button class="add-section-btn" style="min-width:150px; flex-shrink:0; border:2px dashed var(--border); border-radius:var(--radius-lg); background:transparent; color:var(--text-secondary); cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:500; font-size:14px; transition:all var(--t-fast);">
      + Add Section
    </button>
  </div>`;
  return html;
}




