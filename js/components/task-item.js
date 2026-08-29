// ===== TASK ITEM COMPONENT =====
/**
 * Renders an individual task item as either a list row or a board card.
 * Priority is strictly indicated by the circle checkbox border/fill color (no P1-P4 text badges).
 *
 * @param {Object} task - Task object.
 * @param {boolean} isListView - True if rendering in list mode, false for board mode.
 * @returns {string} HTML string.
 */
function renderTaskItem(task, isListView = false) {
  const pColor = getPriorityColor(task.priority);
  const dueLabel = getDueLabel(task);
  const isDone = Boolean(task.completed || task.isCompleting);
  const isCompleting = Boolean(task.isCompleting);

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
      <div class="task-item-card list-row ${isDone ? 'completed' : ''} ${isCompleting ? 'is-completing' : ''}" data-task-id="${task.id}" draggable="${!isDone}">
        <div class="task-circle-check ${isDone ? 'checked' : ''}" data-task-toggle="${task.id}" style="width:18px;height:18px;border-radius:50%;border:1.5px solid ${pColor || (isDone ? 'var(--accent)' : 'rgba(255,255,255,0.35)')};color:${pColor || 'var(--text-primary)'};${isDone ? 'background:' + (pColor || 'var(--accent)') + '40;' : ''}display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;cursor:pointer;transition:all 0.2s ease;" title="${isDone ? 'Mark Incomplete' : 'Mark Complete'}">
          ${isDone ? '<span class="task-check-mark">✓</span>' : ''}
        </div>
        <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;" data-task-edit="${task.id}">
          <div class="task-title-text" style="font-size:14px;font-weight:400;color:${isDone ? 'var(--text-tertiary)' : 'var(--text-primary)'};text-decoration:${isDone ? 'line-through' : 'none'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color 0.2s ease, text-decoration 0.2s ease;">
            ${escHtml(task.title)}
          </div>
          ${hasMeta ? `
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;opacity:${isDone ? '0.6' : '1'};">
              ${plannedLabel}
              ${dueHtml}
              ${(task.tags || []).map(tag => `<span style="font-size:11px;color:var(--accent);background:rgba(72,219,251,0.08);padding:1px 6px;border-radius:4px;">${escHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Board card layout
  return `
    <div class="task-item-card board-card ${isDone ? 'completed' : ''} ${isCompleting ? 'is-completing' : ''}" data-task-id="${task.id}" draggable="${!isDone}">
      <div class="task-circle-check ${isDone ? 'checked' : ''}" data-task-toggle="${task.id}" style="width:20px;height:20px;border-radius:50%;border:2px solid ${pColor || (isDone ? 'var(--accent)' : 'var(--text-tertiary)')};color:${pColor || 'var(--text-primary)'};${isDone ? 'background:' + (pColor || 'var(--accent)') + '40;' : ''}display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;flex-shrink:0;cursor:pointer;transition:all 0.2s ease;" title="${isDone ? 'Mark Incomplete' : 'Mark Complete'}">
        ${isDone ? '<span class="task-check-mark">✓</span>' : ''}
      </div>
      <div style="flex:1;min-width:0;cursor:pointer;" data-task-edit="${task.id}">
        <div class="task-title-text" style="font-size:14px;font-weight:500;color:${isDone ? 'var(--text-tertiary)' : 'var(--text-primary)'};text-decoration:${isDone ? 'line-through' : 'none'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color 0.2s ease, text-decoration 0.2s ease;">
          ${escHtml(task.title)}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap;opacity:${isDone ? '0.6' : '1'};">
          <span style="font-size:11px;">${locHtml}</span>
          ${plannedLabel}
          ${dueHtml}
          ${(task.tags || []).map(tag => `<span style="font-size:11px;color:var(--accent);">${escHtml(tag)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}
