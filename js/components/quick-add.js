/**
 * quick-add.js
 * Quick-add task bar with Natural Language Processing (NLP) integration.
 */

function setupQuickAdd() {
  const input = document.getElementById('quick-add-input');
  if (!input) return;

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      const text = input.value.trim();
      const parsed = await window.api.parseNaturalLanguage(text);
      await addTaskFromParsed(parsed);
      input.value = '';
      showToast('Task added!', 'success');
    }
  });
}

async function addTaskFromParsed(parsed) {
  // Try to match project by name
  let projectId = null;
  if (parsed.projectName) {
    const proj = state.projects.find(p =>
      p.name.toLowerCase() === parsed.projectName.toLowerCase()
    );
    if (proj) projectId = proj.id;
  }

  const task = {
    id: generateId(),
    title: (parsed.title && parsed.title.trim()) || 'Untitled task',
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
  renderSidebarTags();
}
