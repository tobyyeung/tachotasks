/**
 * data.js
 * Operations for persisting state changes and handling task completion/deletion.
 */

/**
 * Saves current active tasks array to the store API.
 */
async function saveTasks() {
  await window.api.saveTasks(state.tasks);
}

/**
 * Saves current archived tasks array to the store API.
 */
async function saveArchivedTasks() {
  await window.api.saveArchivedTasks(state.archivedTasks);
}

/**
 * Toggles task completion state with a visual delay before archiving or advancing recurrence.
 * @param {string} taskId - ID of task to toggle.
 */
const taskTogglesInFlight = new Set();
async function toggleTask(taskId) {
  if (taskTogglesInFlight.has(taskId)) return;
  taskTogglesInFlight.add(taskId);
  try { await performTaskToggle(taskId); }
  finally { taskTogglesInFlight.delete(taskId); }
}

async function performTaskToggle(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  const today = getTodayStr();

  if (task && !isTaskRecurring(task)) {
    // Persist completion immediately; a remote refresh must not replace the
    // object captured by a delayed animation before it can be archived.
    const nowIso = nextTaskChangeTimestamp(taskId);
    const completed = { ...task, ...captureTaskCompletionContext(task), completed: true, completedAt: nowIso, updatedAt: nowIso };
    delete completed.isCompleting;
    delete completed.completionTimeout;
    state.tasks = state.tasks.filter(item => item.id !== taskId);
    state.archivedTasks = state.archivedTasks.filter(item => item.id !== taskId).concat(completed);
    const saved = window.api.saveTaskCollections({ tasks: state.tasks, archivedTasks: state.archivedTasks });
    renderView();
    showUndoToast(taskId, 'Task completed');
    await saved;
    return;
  }
  if (!task && state.archivedTasks.some(item => item.id === taskId && !item.originalTaskId)) {
    await undoTaskCompletion(taskId);
    return;
  }

  if (task) {
    // If it's a recurring task that was completed today, clicking it uncompletes it for today
    if (isTaskRecurring(task) && task.lastCompletedDate === today) {
      task.lastCompletedDate = null;
      if (task.previousDueDate) {
        task.dueDate = task.previousDueDate;
      } else {
        task.dueDate = today;
      }
      if (task.previousPlannedDate) {
        task.plannedDate = task.previousPlannedDate;
      }
      delete task.previousDueDate;
      delete task.previousPlannedDate;
      task.completed = false;
      task.isCompleting = false;

      // Remove today's archived snapshot if present
      state.archivedTasks = state.archivedTasks.filter(a => !(a.originalTaskId === taskId && a.completedAt && a.completedAt.startsWith(today)));
      
      await saveTasks();
      await saveArchivedTasks();
      renderView();
      showToast('Task marked incomplete', 'info');
      return;
    }

    if (!task.completed && !task.isCompleting) {
      task.isCompleting = true;
      task.updatedAt = new Date().toISOString();
      renderView();
      
      if (task.completionTimeout) clearTimeout(task.completionTimeout);
      
      task.completionTimeout = setTimeout(async () => {
        task.isCompleting = false;
        const nowIso = new Date().toISOString();
        
        if (isTaskRecurring(task)) {
          // Recurring task: archive completion snapshot for today and advance active task to next upcoming date
          task.previousDueDate = task.dueDate || today;
          task.previousPlannedDate = task.plannedDate || null;
          
          const completedRecord = {
            ...task,
            ...captureTaskCompletionContext(task),
            id: task.id + '-' + (task.dueDate || today) + '-' + Date.now(),
            completed: true,
            completedAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
            originalTaskId: task.id,
            isRecurringInstance: true
          };
          delete completedRecord.previousDueDate;
          delete completedRecord.previousPlannedDate;
          state.archivedTasks.push(completedRecord);

          task.lastCompletedDate = today;
          task.dueDate = getNextRecurringDate(task.dueDate || today, task.recurring);
          if (task.plannedDate) {
            task.plannedDate = getNextRecurringDate(task.plannedDate || today, task.recurring);
          }
          task.completed = false;
          task.updatedAt = nowIso;
        } else {
          // Non-recurring task: mark completed and move to archived tasks
          task.completed = true;
          task.completedAt = nowIso;
          task.updatedAt = nowIso;
          state.tasks = state.tasks.filter(t => t.id !== taskId);
          state.archivedTasks.push(task);
        }
        
        await saveTasks();
        await saveArchivedTasks();
        renderView();
      }, 1500);
      
      showUndoToast(taskId, isTaskRecurring(task) ? 'Task completed & set for next date' : 'Task completed');
    } else if (task.isCompleting) {
      undoTaskCompletion(taskId);
    }
  } else {
    const archivedTask = state.archivedTasks.find(t => t.id === taskId);
    if (archivedTask) {
      const nowIso = new Date().toISOString();
      if (archivedTask.originalTaskId) {
        const orig = state.tasks.find(t => t.id === archivedTask.originalTaskId);
        if (orig) {
          orig.lastCompletedDate = null;
          if (orig.previousDueDate) orig.dueDate = orig.previousDueDate;
          if (orig.previousPlannedDate) orig.plannedDate = orig.previousPlannedDate;
          delete orig.previousDueDate;
          delete orig.previousPlannedDate;
          orig.completed = false;
          orig.isCompleting = false;
          orig.updatedAt = nowIso;
        }
      }
      archivedTask.completed = false;
      archivedTask.completedAt = null;
      archivedTask.updatedAt = nowIso;
      state.archivedTasks = state.archivedTasks.filter(t => t.id !== taskId);
      if (!archivedTask.originalTaskId) {
        state.tasks.push(archivedTask);
      }
      await saveTasks();
      await saveArchivedTasks();
      renderView();
    }
  }
}

/**
 * Reverts pending or archived task completion.
 * @param {string} taskId - ID of task to uncomplete.
 */
function nextTaskChangeTimestamp(taskId) {
  const latest = [...state.tasks, ...state.archivedTasks]
    .filter(task => task.id === taskId)
    .reduce((time, task) => Math.max(time, Date.parse(task.updatedAt || task.createdAt) || 0), 0);
  return new Date(Math.max(Date.now(), latest + 1)).toISOString();
}

async function undoTaskCompletion(taskId) {
  const ordinary = state.archivedTasks.find(task => task.id === taskId);
  if (ordinary) {
    const restored = { ...ordinary, completed: false, completedAt: null, updatedAt: nextTaskChangeTimestamp(taskId) };
    if ('completionDueDate' in ordinary) restored.dueDate = ordinary.completionDueDate;
    if ('completionDueTime' in ordinary) restored.dueTime = ordinary.completionDueTime;
    // Restoring an older recurring occurrence must not rewind its active series.
    // Bring that occurrence back as a standalone task, preserving its stable ID.
    if (restored.originalTaskId) {
      delete restored.originalTaskId;
      delete restored.isRecurringInstance;
      delete restored.lastCompletedDate;
      delete restored.previousDueDate;
      delete restored.previousPlannedDate;
      restored.recurring = null;
    }
    delete restored.isCompleting;
    delete restored.completionTimeout;
    state.archivedTasks = state.archivedTasks.filter(task => task.id !== taskId);
    state.tasks = state.tasks.filter(task => task.id !== taskId).concat(restored);
    const saved = window.api.saveTaskCollections({ tasks: state.tasks, archivedTasks: state.archivedTasks });
    renderView();
    await saved;
    return;
  }
  const task = state.tasks.find(t => t.id === taskId);
  const today = getTodayStr();

  if (task) {
    if (task.isCompleting) {
      clearTimeout(task.completionTimeout);
      task.isCompleting = false;
      task.completed = false;
      task.updatedAt = new Date().toISOString();
      renderView();
      return;
    }
    if (task.previousDueDate) {
      task.dueDate = task.previousDueDate;
      if (task.previousPlannedDate) task.plannedDate = task.previousPlannedDate;
      task.lastCompletedDate = null;
      delete task.previousDueDate;
      delete task.previousPlannedDate;
      task.completed = false;
      task.isCompleting = false;
      task.updatedAt = new Date().toISOString();
      state.archivedTasks = state.archivedTasks.filter(a => !(a.originalTaskId === taskId && a.completedAt && a.completedAt.startsWith(today)));
      saveTasks();
      saveArchivedTasks();
      renderView();
      return;
    }
  }

  const archivedTask = state.archivedTasks.find(t => t.id === taskId);
  if (archivedTask) {
    const nowIso = new Date().toISOString();
    if (archivedTask.originalTaskId) {
      const orig = state.tasks.find(t => t.id === archivedTask.originalTaskId);
      if (orig) {
        orig.lastCompletedDate = null;
        if (orig.previousDueDate) orig.dueDate = orig.previousDueDate;
        if (orig.previousPlannedDate) orig.plannedDate = orig.previousPlannedDate;
        delete orig.previousDueDate;
        delete orig.previousPlannedDate;
        orig.completed = false;
        orig.isCompleting = false;
        orig.updatedAt = nowIso;
      }
    }
    archivedTask.completed = false;
    archivedTask.completedAt = null;
    archivedTask.updatedAt = nowIso;
    state.archivedTasks = state.archivedTasks.filter(t => t.id !== taskId);
    if (!archivedTask.originalTaskId) {
      state.tasks.push(archivedTask);
    }
    saveTasks();
    saveArchivedTasks();
    renderView();
  }
}

/**
 * Displays a toast notification with an Undo action.
 * @param {string} taskId - ID of affected task.
 * @param {string} message - Toast text.
 */
function showUndoToast(taskId, message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast success`;
  toast.innerHTML = `
    <span class="toast-icon">✓</span> 
    <span style="flex:1">${escHtml(message)}</span>
    <button class="undo-btn" style="background:transparent;border:1px solid rgba(255,255,255,0.5);color:white;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Undo</button>
  `;
  
  const undoBtn = toast.querySelector('.undo-btn');
  undoBtn.addEventListener('click', () => {
    undoTaskCompletion(taskId);
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  });
  
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }
  }, 2500);
}

/**
 * Deletes a task permanently from active or archived tasks.
 * @param {string} taskId - Task ID to delete.
 */
async function deleteTask(taskId) {
  if (!taskId) return;
  state.tasks = (state.tasks || []).filter(t => t.id !== taskId);
  state.archivedTasks = (state.archivedTasks || []).filter(t => t.id !== taskId);
  
  if (window.api && window.api.recordTombstone) {
    window.api.recordTombstone(taskId, 'task');
  }

  await saveTasks();
  if (window.api && window.api.saveArchivedTasks) {
    await window.api.saveArchivedTasks(state.archivedTasks);
  }
  
  if (typeof closeModal === 'function') closeModal();
  renderView();
  if (typeof showToast === 'function') showToast('Task deleted', 'success');
}

/**
 * Creates and appends a task from a natural language parsed payload object.
 * @param {Object} parsed - Parsed task details from chrono/NLP parser.
 */
async function addTaskFromParsed(parsed) {
  let projectId = null;
  if (parsed.projectName) {
    const proj = state.projects.find(p =>
      !p.archived && p.name.toLowerCase() === parsed.projectName.toLowerCase()
    );
    if (proj) projectId = proj.id;
  }

  const nowIso = new Date().toISOString();
  const task = {
    id: generateId(),
    title: parsed.title || 'Untitled task',
    description: '',
    priority: parsed.priority || null,
    tags: parsed.tags || [],
    projectId: projectId,
    parentTaskId: null,
    dueDate: parsed.dueDate || null,
    dueTime: parsed.dueTime || null,
    recurring: parsed.recurring || null,
    completed: false,
    completedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    profileId: getActiveProfileId()
  };

  state.tasks.push(task);
  await saveTasks();
  renderView();
  if (typeof renderSidebarTags === 'function') renderSidebarTags();
}

/**
 * Postpones a list of tasks (or all overdue tasks if not specified) to a target date (defaults to today).
 * @param {Array<string>|null} taskIds - Specific task IDs to postpone, or null for all overdue tasks.
 * @param {string|null} targetDateStr - Target date string 'YYYY-MM-DD', defaults to today.
 * @returns {number} Count of postponed tasks.
 */
async function postponeOverdueTasks(taskIds = null, targetDateStr = null) {
  const today = targetDateStr || getTodayStr();
  const nowIso = new Date().toISOString();

  let affectedTasks = [];
  if (Array.isArray(taskIds)) {
    affectedTasks = state.tasks.filter(t => taskIds.includes(t.id) && !t.completed);
  } else {
    affectedTasks = state.tasks.filter(t => isTaskOverdue(t));
  }

  if (affectedTasks.length === 0) {
    if (typeof showToast === 'function') showToast('No overdue tasks to postpone', 'info');
    return 0;
  }

  // Save previous dates for Undo capability
  const previousDates = affectedTasks.map(t => ({
    id: t.id,
    dueDate: t.dueDate,
    plannedDate: t.plannedDate, dueTime: t.dueTime
  }));

  affectedTasks.forEach(t => {
    t.previousDueDate = t.dueDate;
    t.dueDate = today;
    if (isTaskOverdue(t)) t.dueTime = null;
    t.updatedAt = nowIso;
  });

  await saveTasks();
  renderView();

  showPostponeUndoToast(previousDates, affectedTasks.length);
  return affectedTasks.length;
}

/**
 * Shows an undo toast specifically for postponing tasks.
 */
function showPostponeUndoToast(previousDates, count) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast success`;
  toast.innerHTML = `
    <span class="toast-icon">✓</span> 
    <span style="flex:1">${count} overdue task${count > 1 ? 's' : ''} postponed to today</span>
    <button class="undo-btn" style="background:transparent;border:1px solid rgba(255,255,255,0.5);color:white;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Undo</button>
  `;

  const undoBtn = toast.querySelector('.undo-btn');
  undoBtn.addEventListener('click', async () => {
    const nowIso = new Date().toISOString();
    previousDates.forEach(p => {
      const task = state.tasks.find(t => t.id === p.id);
      if (task) {
        task.dueDate = p.dueDate;
        task.dueTime = p.dueTime;
        task.updatedAt = nowIso;
      }
    });
    await saveTasks();
    renderView();
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
    if (typeof showToast === 'function') showToast('Postpone undone', 'info');
  });

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }
  }, 4000);
}

// Do not lose a task that is midway through its completion animation when the
// window is refreshed or closed. This is deliberately synchronous first so it
// also works during the browser's short beforeunload lifecycle.
window.addEventListener('beforeunload', () => {
  const pendingTasks = (state.tasks || []).filter(task => task && task.isCompleting);
  if (pendingTasks.length === 0) return;

  const nowIso = new Date().toISOString();
  const today = getTodayStr();
  const archived = [...(state.archivedTasks || [])];

  pendingTasks.forEach(task => {
    task.isCompleting = false;
    if (isTaskRecurring(task)) {
      task.previousDueDate = task.dueDate || today;
      task.previousPlannedDate = task.plannedDate || null;
      const completedRecord = {
        ...task,
            ...captureTaskCompletionContext(task),
        id: `${task.id}-${task.dueDate || today}-${Date.now()}`,
        completed: true,
        completedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        originalTaskId: task.id,
        isRecurringInstance: true
      };
      delete completedRecord.previousDueDate;
      delete completedRecord.previousPlannedDate;
      archived.push(completedRecord);
      task.lastCompletedDate = today;
      task.dueDate = getNextRecurringDate(task.dueDate || today, task.recurring);
      if (task.plannedDate) task.plannedDate = getNextRecurringDate(task.plannedDate, task.recurring);
      task.completed = false;
    } else {
      task.completed = true;
      task.completedAt = nowIso;
      archived.push(task);
    }
    task.updatedAt = nowIso;
  });

  state.tasks = (state.tasks || []).filter(task => !task.completed);
  state.archivedTasks = archived;
  try {
    localStorage.setItem('tachotasks.tasks', JSON.stringify(state.tasks));
    localStorage.setItem('tachotasks.archivedTasks', JSON.stringify(archived));
    if (window.electronStorage) {
      window.electronStorage.saveTasks(state.tasks);
      window.electronStorage.saveArchivedTasks(archived);
    }
  } catch (_) {}
});

