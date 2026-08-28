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
