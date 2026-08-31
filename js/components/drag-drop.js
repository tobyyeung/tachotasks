/**
 * drag-drop.js
 * Handles drag and drop operations for tasks across sections, calendar slots, and planner columns.
 */

function setupDragAndDrop() {
  // Draggable tasks
  document.querySelectorAll('[draggable="true"][data-task-id]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      state.dragTaskId = el.dataset.taskId;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.taskId);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      state.dragTaskId = null;
      document.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
    });
  });

  // Section drop zones
  document.querySelectorAll('[data-section-drop]').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.background = 'var(--bg-glass)';
      zone.style.outline = '1px dashed var(--accent)';
    });
    zone.addEventListener('dragleave', () => {
      zone.style.background = '';
      zone.style.outline = 'none';
    });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.style.background = '';
      zone.style.outline = 'none';
      const taskId = e.dataTransfer.getData('text/plain');
      const newSectionId = zone.dataset.sectionDrop;
      const task = state.tasks.find(t => t.id === taskId);
      if (task) {
        task.sectionId = newSectionId === 'unsectioned' ? null : newSectionId;
        task.updatedAt = new Date().toISOString();
        await saveTasks();
        renderView();
      }
    });
  });

  // Calendar drop zones
  document.querySelectorAll('[data-drop-target="calendar"]').forEach(cell => {
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      cell.classList.add('drag-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', async (e) => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const date = cell.dataset.calDate;
      const hour = parseInt(cell.dataset.calHour);
      const task = state.tasks.find(t => t.id === taskId);
      if (task && date) {
        task.dueDate = date;
        task.dueTime = `${String(hour).padStart(2, '0')}:00`;
        task.updatedAt = new Date().toISOString();
        await saveTasks();
        renderView();
        showToast(`Due time set to ${formatTime12(task.dueTime)}`, 'success');
      }
    });
  });

  // Planner drop zones
  document.querySelectorAll('[data-drop-target="planner"]').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.background = 'var(--accent-muted)';
    });
    zone.addEventListener('dragleave', () => {
      zone.style.background = '';
    });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.style.background = '';
      const taskId = e.dataTransfer.getData('text/plain');
      const date = zone.dataset.plannerDate;
      const task = state.tasks.find(t => t.id === taskId);
      if (task && date) {
        task.dueDate = date;
        task.updatedAt = new Date().toISOString();
        await saveTasks();
        renderView();
        showToast(`Scheduled for ${formatDateShort(date)}`, 'success');
      }
    });
  });
}
