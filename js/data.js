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
async function toggleTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  const today = getTodayStr();

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
      renderView();
      
      if (task.completionTimeout) clearTimeout(task.completionTimeout);
      
      task.completionTimeout = setTimeout(async () => {
        task.isCompleting = false;
        
        if (isTaskRecurring(task)) {
          // Recurring task: archive completion snapshot for today and advance active task to next upcoming date
          task.previousDueDate = task.dueDate || today;
          task.previousPlannedDate = task.plannedDate || null;
          
          const completedRecord = {
            ...task,
            id: task.id + '-' + (task.dueDate || today) + '-' + Date.now(),
            completed: true,
            completedAt: new Date().toISOString(),
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
        } else {
          // Non-recurring task: mark completed and move to archived tasks
          task.completed = true;
          task.completedAt = new Date().toISOString();
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
        }
      }
      archivedTask.completed = false;
      archivedTask.completedAt = null;
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
function undoTaskCompletion(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  const today = getTodayStr();

  if (task) {
    if (task.isCompleting) {
      clearTimeout(task.completionTimeout);
      task.isCompleting = false;
      task.completed = false;
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
      state.archivedTasks = state.archivedTasks.filter(a => !(a.originalTaskId === taskId && a.completedAt && a.completedAt.startsWith(today)));
      saveTasks();
      saveArchivedTasks();
      renderView();
      return;
    }
  }

  const archivedTask = state.archivedTasks.find(t => t.id === taskId);
  if (archivedTask) {
    if (archivedTask.originalTaskId) {
      const orig = state.tasks.find(t => t.id === archivedTask.originalTaskId);
      if (orig) {
        orig.lastCompletedDate = null;
        if (orig.previousDueDate) orig.dueDate = orig.previousDueDate;
        if (orig.previousPlannedDate) orig.plannedDate = orig.previousPlannedDate;
        delete orig.previousDueDate;
        delete orig.previousPlannedDate;
      }
    }
    archivedTask.completed = false;
    archivedTask.completedAt = null;
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
  state.tasks = (state.tasks || []).filter(t => t.id !== taskId);
  state.archivedTasks = (state.archivedTasks || []).filter(t => t.id !== taskId);
  await saveTasks();
  if (window.api.saveArchivedTasks) {
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
    createdAt: new Date().toISOString(),
    profileId: getActiveProfileId()
  };

  state.tasks.push(task);
  await saveTasks();
  renderView();
  if (typeof renderSidebarTags === 'function') renderSidebarTags();
}
