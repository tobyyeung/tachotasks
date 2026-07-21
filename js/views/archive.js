// ===== ARCHIVE VIEW =====
function renderArchive() {
  let html = `
    <div class="tasks-view" style="max-width:800px;margin:0 auto;animation:fadeInUp 0.3s ease;">
      <div class="view-header" style="margin-bottom:24px;">
        <h1>Archive</h1>
        <p style="color:var(--text-secondary);">Your completed tasks.</p>
      </div>
      <div class="task-list">
  `;
  
  if (state.archivedTasks && state.archivedTasks.length > 0) {
    const sorted = [...state.archivedTasks].sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
    html += sorted.map(t => renderTaskItem(t)).join('');
  } else {
    html += `<div class="empty-state"><div class="empty-icon" style="width:48px;height:48px;margin:0 auto 16px;color:var(--text-tertiary);">${icons.box}</div><div class="empty-text">No archived tasks yet.</div></div>`;
  }
  
  html += `
      </div>
    </div>
  `;
  return html;
}

function renderTaskItem(task) {
  const project = state.projects.find(p => p.id === task.projectId);
  const pClass = task.priority ? task.priority.toLowerCase() : '';
  const dueLabel = getDueLabel(task);

  return `
    <div class="task-item ${task.completed || task.isCompleting ? 'completed' : ''}" data-task-id="${task.id}" draggable="true">
      <div class="task-checkbox ${task.completed || task.isCompleting ? 'checked' : ''} ${pClass}" data-task-toggle="${task.id}"></div>
      <div class="task-content" data-task-edit="${task.id}">
        <div class="task-title">${escHtml(task.title)}</div>
        <div class="task-meta">
          ${task.priority ? `<span class="priority-badge ${pClass}">${task.priority}</span>` : ''}
          ${task.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
          ${project ? `<span style="color:${project.color}">● ${escHtml(project.name)}</span>` : ''}
        </div>
      </div>
      ${dueLabel ? `<span class="task-due ${dueLabel.class}">${dueLabel.text}</span>` : ''}
    </div>
  `;
}

