// ===== ARCHIVE VIEW =====
function renderArchive() {
  const archivedProjects = (state.projects || []).filter(p => p.archived);

  let html = `
    <div class="tasks-view" style="max-width:800px;margin:0 auto;animation:fadeInUp 0.3s ease;padding:24px 32px 48px;">
      <div class="view-header" style="margin-bottom:24px;">
        <h1>Archive</h1>
        <p style="color:var(--text-secondary);">Your completed tasks and archived projects.</p>
      </div>
  `;

  if (archivedProjects.length > 0) {
    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Archived Projects (${archivedProjects.length})</h2>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${archivedProjects.map(p => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-md);">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="width:12px;height:12px;border-radius:50%;background:${p.color || '#5cb8ff'};flex-shrink:0;"></span>
                <span style="font-size:14px;font-weight:500;color:var(--text-primary);">${escHtml(p.name)}</span>
              </div>
              <button class="btn-secondary unarchive-proj-btn" data-project-id="${p.id}" style="padding:4px 12px;font-size:12px;cursor:pointer;">Restore Project</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  html += `
      <div>
        <h2 style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Completed Tasks</h2>
        <div class="task-list" style="display:flex;flex-direction:column;gap:2px;">
  `;
  
  if (state.archivedTasks && state.archivedTasks.length > 0) {
    const sorted = [...state.archivedTasks].sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
    html += sorted.map(t => renderTaskItem(t, true)).join('');
  } else {
    html += `<div class="empty-state"><div class="empty-icon" style="width:48px;height:48px;margin:0 auto 16px;color:var(--text-tertiary);">${icons.box}</div><div class="empty-text">No archived tasks yet.</div></div>`;
  }
  
  html += `
        </div>
      </div>
    </div>
  `;
  return html;
}
