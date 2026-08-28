// ===== PROJECT VIEW (TWO-COLUMN DASHBOARD LAYOUT) =====
function renderProject() {
  const projId = state.filterProject;
  const proj = state.projects.find(p => p.id === projId);
  if (!proj) {
    state.currentView = 'tasks';
    return renderTasks();
  }

  // Get project tasks (globally scoped to project, independent of profile tabs)
  const projTasks = state.tasks.filter(t => t.projectId === proj.id);
  const completedProjTasks = (state.archivedTasks || []).filter(t => t.projectId === proj.id);

  // Progress stats
  const totalTasksCount = projTasks.length + completedProjTasks.length;
  const totalCompletedCount = completedProjTasks.length + projTasks.filter(t => t.completed).length;
  const progressPercent = totalTasksCount > 0 ? Math.round((totalCompletedCount / totalTasksCount) * 100) : 0;

  // Active / completing tasks for Left Column
  const activeTasks = projTasks.filter(t => !t.completed && !t.isCompleting);
  const completingTasks = projTasks.filter(t => t.isCompleting);
  const visibleTasks = [...activeTasks, ...completingTasks];

  // Left Column Tasks Card with inline Add task button under the list
  const leftColumnHtml = `
    <div class="project-section-card itinerary-card dashboard-card">
      <div class="card-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <h2 style="font-size:14px; font-weight:600; margin:0; color:var(--text-primary);">Tasks</h2>
          <span class="card-count" style="font-size:11px; padding:2px 7px; background:var(--bg-glass); border:1px solid var(--border); border-radius:var(--radius-full); color:var(--text-tertiary);">${visibleTasks.length}</span>
        </div>
      </div>
      <div class="task-section-list" style="display:flex; flex-direction:column; gap:2px;">
        ${visibleTasks.length > 0
          ? visibleTasks.map(t => renderTaskItem(t, true)).join('')
          : '<div class="empty-state" style="padding:16px; font-size:13px; color:var(--text-tertiary); text-align:center;">No active tasks in this project</div>'
        }
      </div>
      <button class="add-task-inline-btn" data-add-task-section="unsectioned" style="--proj-color:${proj.color || '#5cb8ff'};">
        <span class="plus-icon" style="color:${proj.color || '#5cb8ff'};">+</span> Add task
      </button>
    </div>
  `;

  // --- Right Column: Project Deadlines & Important Dates Tracker ---
  const today = getTodayStr();
  const tmrObj = new Date();
  tmrObj.setDate(tmrObj.getDate() + 1);
  const tomorrow = toDateStr(tmrObj);

  const weekObj = new Date();
  weekObj.setDate(weekObj.getDate() + 7);
  const weekAhead = toDateStr(weekObj);

  const activeDatedTasks = projTasks.filter(t => (t.dueDate || t.plannedDate) && !t.completed);
  
  // Categorize deadlines by urgency
  const overdueTasks = activeDatedTasks.filter(t => t.dueDate && t.dueDate < today);
  const todayTasks = activeDatedTasks.filter(t => t.dueDate === today || (!t.dueDate && t.plannedDate === today));
  const tomorrowTasks = activeDatedTasks.filter(t => t.dueDate === tomorrow || (!t.dueDate && t.plannedDate === tomorrow));
  const thisWeekTasks = activeDatedTasks.filter(t => t.dueDate > tomorrow && t.dueDate <= weekAhead);
  const laterTasks = activeDatedTasks.filter(t => t.dueDate > weekAhead || (!t.dueDate && t.plannedDate > tomorrow && t.plannedDate > weekAhead));

  // Sort helper
  const sortByDate = (arr) => arr.sort((a, b) => {
    const da = a.dueDate || a.plannedDate || '9999-12-31';
    const db = b.dueDate || b.plannedDate || '9999-12-31';
    return da.localeCompare(db);
  });

  const renderDeadlineItem = (t, urgencyClass, urgencyLabel) => {
    const pColor = getPriorityColor(t.priority);
    const dateDisplay = t.dueDate ? formatDateShort(t.dueDate) : (t.plannedDate ? 'Planned: ' + formatDateShort(t.plannedDate) : '');
    const timeDisplay = t.dueTime ? formatTime12(t.dueTime) : (t.plannedTime ? formatTime12(t.plannedTime) : '');

    return `
      <div class="deadline-item-card ${urgencyClass} ${t.completed ? 'completed' : ''}" data-task-id="${t.id}">
        <div class="task-circle-check" data-task-toggle="${t.id}" style="width:18px;height:18px;border-radius:50%;border:1.5px solid ${pColor || 'rgba(255,255,255,0.35)'};color:${pColor || 'var(--text-primary)'};${t.completed ? 'background:' + (pColor || 'var(--accent)') + '33;' : ''}display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;cursor:pointer;" title="Toggle Complete">
          ${t.completed ? '✓' : ''}
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;cursor:pointer;" data-task-edit="${t.id}">
          <div style="font-size:13px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${t.completed ? 'text-decoration:line-through;opacity:0.6;' : ''}">
            ${escHtml(t.title)}
          </div>
          ${timeDisplay ? `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-tertiary);">
              <span>⏰ ${timeDisplay}</span>
            </div>
          ` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;">
          <span class="deadline-urgency-pill ${urgencyClass}">${urgencyLabel}</span>
          <span style="font-size:10px;color:var(--text-tertiary);">${dateDisplay}</span>
        </div>
      </div>
    `;
  };

  let deadlinesTimelineHtml = '';

  if (activeDatedTasks.length === 0) {
    deadlinesTimelineHtml = `
      <div class="empty-state" style="padding:var(--sp-xl); text-align:center;">
        <div class="empty-icon">📅</div>
        <div class="empty-text" style="font-size:13px; color:var(--text-secondary);">No upcoming deadlines tracked for this project.</div>
        <div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">Add due dates to tasks to track milestones here!</div>
      </div>
    `;
  } else {
    // 1. Overdue
    if (overdueTasks.length > 0) {
      deadlinesTimelineHtml += `
        <div class="deadline-group">
          <div class="deadline-group-header overdue">
            <span>⚠️ Overdue (${overdueTasks.length})</span>
          </div>
          ${sortByDate(overdueTasks).map(t => renderDeadlineItem(t, 'overdue', 'Overdue')).join('')}
        </div>
      `;
    }

    // 2. Due Today
    if (todayTasks.length > 0) {
      deadlinesTimelineHtml += `
        <div class="deadline-group">
          <div class="deadline-group-header today">
            <span>🌟 Due Today (${todayTasks.length})</span>
          </div>
          ${sortByDate(todayTasks).map(t => renderDeadlineItem(t, 'today', 'Today')).join('')}
        </div>
      `;
    }

    // 3. Due Tomorrow
    if (tomorrowTasks.length > 0) {
      deadlinesTimelineHtml += `
        <div class="deadline-group">
          <div class="deadline-group-header">
            <span>⏰ Tomorrow (${tomorrowTasks.length})</span>
          </div>
          ${sortByDate(tomorrowTasks).map(t => renderDeadlineItem(t, 'soon', 'Tomorrow')).join('')}
        </div>
      `;
    }

    // 4. This Week
    if (thisWeekTasks.length > 0) {
      deadlinesTimelineHtml += `
        <div class="deadline-group">
          <div class="deadline-group-header">
            <span>📅 Next 7 Days (${thisWeekTasks.length})</span>
          </div>
          ${sortByDate(thisWeekTasks).map(t => renderDeadlineItem(t, 'soon', 'This Week')).join('')}
        </div>
      `;
    }

    // 5. Later / Future
    if (laterTasks.length > 0) {
      deadlinesTimelineHtml += `
        <div class="deadline-group">
          <div class="deadline-group-header">
            <span>🗓️ Later (${laterTasks.length})</span>
          </div>
          ${sortByDate(laterTasks).map(t => renderDeadlineItem(t, 'future', 'Upcoming')).join('')}
        </div>
      `;
    }
  }

  return `
    <div class="project-view">
      <!-- Project Header -->
      <div class="project-header-bar" data-project-id="${proj.id}">
        <div class="project-title-group" style="cursor:pointer;" title="Right-click for project options">
          <span class="project-color-dot" style="background:${proj.color || '#5cb8ff'}; box-shadow: 0 0 14px ${proj.color || '#5cb8ff'}88;"></span>
          <div>
            <h1 style="font-size:22px; font-weight:700; margin:0; line-height:1.2;">${escHtml(proj.name)}</h1>
            ${proj.description ? `<p style="font-size:12px; color:var(--text-tertiary); margin:2px 0 0;">${escHtml(proj.description)}</p>` : ''}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="icon-btn project-options-menu-btn" id="project-options-menu-btn" data-project-id="${proj.id}" title="Project options" style="color:var(--text-secondary); width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-glass); cursor:pointer; font-size:14px;">•••</button>
        </div>
      </div>

      <!-- Project Progress Banner -->
      <div class="project-progress-banner">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <span style="color:var(--text-secondary); font-weight:500;">Project Progress</span>
          <span style="font-weight:600; color:var(--accent);">${totalCompletedCount}/${totalTasksCount} Completed (${progressPercent}%)</span>
        </div>
        <div class="project-progress-track">
          <div class="project-progress-fill" style="width:${progressPercent}%;"></div>
        </div>
      </div>

      <!-- Two-Column Layout Grid -->
      <div class="project-layout-grid">
        <!-- LEFT COLUMN: Tasks -->
        <div class="project-left-column">
          ${leftColumnHtml}
        </div>

        <!-- RIGHT COLUMN: Project Deadlines & Important Dates Tracker -->
        <div class="project-right-column">
          <div class="project-deadlines-widget itinerary-card dashboard-card">
            <div class="card-header">
              <div style="display:flex; align-items:center; gap:8px;">
                <img src="assets/icons/Calendar.png" alt="Deadlines" style="width:16px; height:16px; object-fit:contain; opacity:0.85;" />
                <h2 style="font-size:var(--fs-lg); font-weight:600; margin:0;">Project Deadlines</h2>
              </div>
              <span class="card-count" style="font-size:var(--fs-xs); color:var(--text-tertiary); background:var(--bg-glass); padding:2px 8px; border-radius:var(--radius-full); border:1px solid var(--border);">${activeDatedTasks.length} Tracked</span>
            </div>

            <!-- Summary Stats Pills -->
            <div class="deadlines-stat-row">
              <div class="deadline-stat-badge ${overdueTasks.length > 0 ? 'alert' : ''}">
                <span class="stat-num">${overdueTasks.length}</span>
                <span class="stat-label">Overdue</span>
              </div>
              <div class="deadline-stat-badge today">
                <span class="stat-num">${todayTasks.length}</span>
                <span class="stat-label">Today</span>
              </div>
              <div class="deadline-stat-badge upcoming">
                <span class="stat-num">${tomorrowTasks.length + thisWeekTasks.length}</span>
                <span class="stat-label">This Week</span>
              </div>
              <div class="deadline-stat-badge total">
                <span class="stat-num">${activeDatedTasks.length}</span>
                <span class="stat-label">Total</span>
              </div>
            </div>

            <!-- Deadlines Timeline List -->
            <div class="deadlines-timeline-list">
              ${deadlinesTimelineHtml}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
