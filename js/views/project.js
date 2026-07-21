// ===== PROJECT VIEW =====
function renderProject() {
  const projId = state.filterProject;
  const proj = state.projects.find(p => p.id === projId);
  if (!proj) {
    state.currentView = 'tasks';
    return renderTasks();
  }

  // Get project & sub-project tasks
  const subProjects = state.projects.filter(p => p.parentProjectId === proj.id);
  const projectIds = [proj.id, ...subProjects.map(p => p.id)];
  
  let modeTasks = getFilteredByMode(state.tasks);
  let projectTasks = modeTasks.filter(t => projectIds.includes(t.projectId));
  let filtered = applyFilters(projectTasks);

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

  // Profile info for connection badge
  const profile = state.profiles.find(p => p.id === proj.profileId) || { name: 'Personal', icon: 'P' };

  // Sub-lists chips if any
  const subListsHtml = subProjects.length > 0 ? `
    <div class="project-sublists-bar" style="display:flex; gap:6px; margin-bottom:12px; align-items:center;">
      <span style="font-size:12px; color:var(--text-tertiary);">Lists:</span>
      ${subProjects.map(sub => `<span class="tag-pill" style="border:1px solid ${sub.color}; background:${sub.color}15; color:var(--text-primary); cursor:pointer;" onclick="showProjectModal('${sub.id}')">● ${escHtml(sub.name)}</span>`).join('')}
    </div>
  ` : '';

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

  // Project Deadlines card under tasks
  const upcomingTasks = filtered
    .filter(t => t.dueDate && !t.completed)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8);

  const deadlinesHtml = upcomingTasks.length > 0
    ? upcomingTasks.map(t => `<div style="font-size:12px; padding:6px 0; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;" title="${escHtml(t.title).replace(/"/g, '&quot;')}">${escHtml(t.title)}</span> <span style="color:var(--priority-p1);font-weight:600;font-size:11px;flex-shrink:0;">${t.dueDate}</span></div>`).join('')
    : '<div style="font-size:12px;color:var(--text-tertiary);">No upcoming deadlines.</div>';

  const projectDeadlinesCard = `
    <div class="project-deadlines-card" style="margin-top:24px; background:var(--bg-glass); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px 20px;">
      <h3 style="font-size:14px; font-weight:600; margin-bottom:12px; color:var(--text-primary); border-bottom:1px solid var(--border); padding-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
        <span>Project Deadlines</span>
        <span style="font-size:11px; font-weight:normal; color:var(--text-tertiary);">${upcomingTasks.length} upcoming</span>
      </h3>
      ${deadlinesHtml}
    </div>
  `;

  return `
    <div class="project-view" style="height:100%; overflow-y:auto; padding-bottom:32px;">
      <div class="view-header" style="flex-wrap:wrap; gap:12px; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="dot" style="background:${proj.color}; width:14px; height:14px; border-radius:50%; box-shadow: 0 0 10px ${proj.color}88;"></span>
          <h1 style="font-size:24px; font-weight:700;">${escHtml(proj.name)}</h1>
          <span class="profile-badge" style="display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:var(--radius-full); background:var(--accent-muted); color:var(--accent); font-size:11px; font-weight:600;">
            <span>${profile.icon || 'P'}</span>
            <span>${escHtml(profile.name)}</span>
          </span>
        </div>
        <div style="display:flex; gap:8px; margin-left:auto;">
          <button class="btn-secondary" id="add-project-list-btn" style="padding:6px 12px; font-size:12px;">+ Add List</button>
          <button class="btn-primary" id="add-task-btn" style="padding:6px 14px; font-size:13px;">+ New Task</button>
        </div>
      </div>
      ${subListsHtml}
      ${filterHtml}
      ${renderTaskList(filtered)}
      ${projectDeadlinesCard}
    </div>
  `;
}
