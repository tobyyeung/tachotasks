// Archive filters are view state only; they never change or scope cloud data.
const archiveFilters = { search: '', project: 'all', range: 'all', sort: 'newest' };

function uniqueArchiveTasks(tasks) {
  const records = new Map();
  for (const task of tasks || []) {
    if (!task?.id) continue;
    const previous = records.get(task.id);
    if (!previous || (Date.parse(task.updatedAt || task.completedAt) || 0) >= (Date.parse(previous.updatedAt || previous.completedAt) || 0)) records.set(task.id, task);
  }
  return [...records.values()];
}

function filteredArchiveTasks(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = new Date(today);
  if (archiveFilters.range === 'week') cutoff.setDate(cutoff.getDate() - 6);
  if (archiveFilters.range === 'month') cutoff.setDate(cutoff.getDate() - 29);
  const query = archiveFilters.search.trim().toLowerCase();
  return uniqueArchiveTasks(state.archivedTasks).filter(task => {
    const project = (state.projects || []).find(project => project.id === task.projectId);
    const searchable = [task.title, task.description, ...(task.tags || []), project?.name, task.completionSource?.name, task.completionSource?.section].filter(Boolean).join(' ').toLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (archiveFilters.project === 'standalone' && task.projectId) return false;
    if (!['all', 'standalone'].includes(archiveFilters.project) && task.projectId !== archiveFilters.project) return false;
    if (archiveFilters.range !== 'all') {
      const time = Date.parse(task.completedAt);
      if (!Number.isFinite(time) || time < cutoff.getTime() || time > now.getTime()) return false;
    }
    return true;
  }).sort((a, b) => {
    const delta = (Date.parse(b.completedAt) || 0) - (Date.parse(a.completedAt) || 0);
    return (archiveFilters.sort === 'oldest' ? -delta : delta) || a.id.localeCompare(b.id);
  });
}

function archiveDayLabel(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Completion date unavailable';
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function renderArchiveResults() {
  const tasks = filteredArchiveTasks();
  if (!tasks.length) return `<div class="archive-empty"><span aria-hidden="true">✓</span><h2>${uniqueArchiveTasks(state.archivedTasks).length ? 'No matching tasks' : 'A home for finished work'}</h2><p>${uniqueArchiveTasks(state.archivedTasks).length ? 'Try a different search or clear your filters.' : 'Completed tasks will appear here. You can bring them back whenever you need them.'}</p></div>`;
  const groups = new Map();
  for (const task of tasks) {
    const label = archiveDayLabel(task.completedAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(task);
  }
  return `<div class="archive-result-count" role="status">${tasks.length} of ${uniqueArchiveTasks(state.archivedTasks).length} completed tasks</div>` + [...groups].map(([label, items]) => `
    <section class="archive-day" data-archive-day="${escAttr(label)}"><h2>${escHtml(label)} <span>${items.length}</span></h2>
    ${items.map(task => {
      const date = new Date(task.completedAt);
      const time = task.completedAt && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
      return `<article class="archive-task" data-archive-id="${escAttr(task.id)}">
        <span class="task-circle-check checked archive-check" style="border-color:${getPriorityColor(task.priority)};color:${getPriorityColor(task.priority)}" aria-hidden="true">✓</span>
        <div class="archive-task-content"><div class="archive-task-title">${escHtml(task.title || 'Untitled task')}</div>
          <div class="archive-origin"><span class="archive-field-label">From</span><span class="archive-origin-path">${archiveTaskSource(task)}</span></div>
          <div class="archive-task-facts"><div><span class="archive-field-label">Original due</span><span>${escHtml(archiveOriginalDue(task))}</span></div><div><span class="archive-field-label">Completed</span><span>${escHtml(time || 'Time unavailable')}</span></div>${task.originalTaskId ? '<div><span class="archive-field-label">Type</span><span>Repeating occurrence</span></div>' : ''}</div>          ${task.description || task.tags?.length ? `<details class="archive-task-details"><summary>Details</summary>${task.description ? `<p>${escHtml(task.description)}</p>` : ''}${task.tags?.length ? `<p>${task.tags.map(tag => `#${escHtml(tag)}`).join(' ')}</p>` : ''}</details>` : ''}
        </div><button class="btn-secondary archive-restore" data-archive-restore="${escAttr(task.id)}" title="${task.originalTaskId ? 'Restore this occurrence as a separate task' : 'Move back to active tasks with its due date'}" aria-label="Undo completion of ${escAttr(task.title || 'task')}">↶ Undo</button>
      </article>`;
    }).join('')}</section>`).join('');
}

function renderArchive() {
  const all = uniqueArchiveTasks(state.archivedTasks);
  const projects = (state.projects || []).filter(project => project.archived);
  const week = new Date(); week.setHours(0, 0, 0, 0); week.setDate(week.getDate() - 6);
  const recently = all.filter(task => Date.parse(task.completedAt) >= week.getTime()).length;
  return `<div class="archive-view">
    <header class="archive-header"><div><p class="archive-eyebrow">Your progress, kept</p><h1>Archive</h1><p>Finished, not forgotten. See where each task belongs and bring it back with one click.</p></div><div class="archive-stats"><strong>${all.length}<span>completed</span></strong><strong>${recently}<span>last 7 days</span></strong></div></header>
    <div class="archive-toolbar">
      <label class="archive-search"><span class="sr-only">Search completed tasks</span><input id="archive-search" type="search" placeholder="Search tasks, notes, or tags…" value="${escAttr(archiveFilters.search)}"></label>
      <label>Location<select id="archive-project"><option value="all">All locations</option><option value="standalone" ${archiveFilters.project === 'standalone' ? 'selected' : ''}>Standalone tasks</option>${(state.projects || []).map(project => `<option value="${escAttr(project.id)}" ${archiveFilters.project === project.id ? 'selected' : ''}>${escHtml(project.name)}</option>`).join('')}</select></label>
      <label>Completed<select id="archive-range">${[['all','Any time'],['today','Today'],['week','Last 7 days'],['month','Last 30 days']].map(([value,label]) => `<option value="${value}" ${archiveFilters.range === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Order<select id="archive-sort"><option value="newest">Newest first</option><option value="oldest" ${archiveFilters.sort === 'oldest' ? 'selected' : ''}>Oldest first</option></select></label>
      <button id="archive-clear" class="btn-secondary">Clear filters</button>
    </div>
    <div id="archive-results">${renderArchiveResults()}</div>
    ${projects.length ? `<details class="archive-projects"><summary>Archived projects <span>${projects.length}</span></summary>${projects.map(project => `<div class="archive-project-row"><strong>${escHtml(project.name)}</strong><button class="btn-secondary" data-archive-project="${escAttr(project.id)}">Restore project</button></div>`).join('')}</details>` : ''}
  </div>`;
}

function archiveOriginalDue(task) {
  const dateValue = 'completionDueDate' in task ? task.completionDueDate : task.dueDate;
  const time = 'completionDueTime' in task ? task.completionDueTime : task.dueTime;
  if (!dateValue) return 'No due date';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  const label = date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  return `${label}${time ? ' · ' + formatTime12(time) : ' · All day'}`;
}

function archiveTaskSource(task) {
  const source = task.completionSource;
  if (source) {
    const color = source.kind === 'project' && /^#[0-9a-f]{3,8}$/i.test(source.color || '') ? source.color : source.kind === 'profile' ? '#ff6b00' : 'var(--accent)';
    return `${source.kind === 'profile' ? `<img src="${escAttr(source.image || 'assets/profiles/personal.png')}" class="custom-emoji" alt="" />` : ''}<span style="color:${color};font-weight:600;">${source.kind === 'project' ? '● ' : ''}${escHtml(source.name)}</span><span class="archive-source-section"> / ${escHtml(source.section)}</span>`;
  }
  if (task.projectId && !(state.projects || []).some(project => project.id === task.projectId)) return '<span>Unavailable project</span><span class="archive-source-section"> / Original section unavailable</span>';
  return getTaskLocationHtml(task);
}

// Patch only changed nodes. Repeated sync notifications are DOM no-ops; live
// changes preserve the search input, details.open, row identity and scroll.
function patchArchiveNode(current, incoming) {
  if (current.nodeType !== incoming.nodeType || current.nodeName !== incoming.nodeName) { current.replaceWith(incoming.cloneNode(true)); return; }
  if (current.nodeType === Node.TEXT_NODE) { if (current.textContent !== incoming.textContent) current.textContent = incoming.textContent; return; }
  if (current.nodeType !== Node.ELEMENT_NODE) return;
  for (const attribute of [...current.attributes]) {
    if (attribute.name === 'data-archive-listeners') continue;
    if (current.tagName === 'DETAILS' && attribute.name === 'open') continue;
    if (!incoming.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of incoming.attributes) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  const key = node => node.nodeType === Node.ELEMENT_NODE ? node.id || node.getAttribute('data-archive-id') || node.getAttribute('data-archive-day') : null;
  let index = 0;
  for (const child of [...incoming.childNodes]) {
    const childKey = key(child);
    let existing = current.childNodes[index];
    if (childKey && key(existing || {}) !== childKey) {
      const matching = [...current.childNodes].find(node => key(node) === childKey);
      if (matching) { current.insertBefore(matching, existing || null); existing = matching; }
      else { current.insertBefore(child.cloneNode(true), existing || null); index++; continue; }
    }
    if (!existing) current.appendChild(child.cloneNode(true));
    else patchArchiveNode(existing, child);
    index++;
  }
  while (current.childNodes.length > index) current.lastChild.remove();
}

function refreshArchiveView() {
  const root = document.querySelector('.archive-view');
  if (!root) return;
  const template = document.createElement('template');
  template.innerHTML = renderArchive();
  patchArchiveNode(root, template.content.firstElementChild);
}

function attachArchiveListeners() {
  const root = document.querySelector('.archive-view');
  if (!root || root.dataset.archiveListeners) return;
  root.dataset.archiveListeners = 'true';
  root.addEventListener('input', event => {
    if (event.target.id !== 'archive-search') return;
    archiveFilters.search = event.target.value;
    refreshArchiveView();
  });
  root.addEventListener('change', event => {
    for (const key of ['project','range','sort']) if (event.target.id === `archive-${key}`) { archiveFilters[key] = event.target.value; refreshArchiveView(); }
  });
  root.addEventListener('click', async event => {
    if (event.target.closest('#archive-clear')) {
      Object.assign(archiveFilters, { search:'', project:'all', range:'all', sort:'newest' });
      refreshArchiveView();
      document.getElementById('archive-search').value = '';
      for (const key of ['project','range','sort']) document.getElementById(`archive-${key}`).value = archiveFilters[key];
      return;
    }
    const projectButton = event.target.closest('[data-archive-project]');
    if (projectButton && !projectButton.disabled) {
      const project = state.projects.find(item => item.id === projectButton.dataset.archiveProject);
      if (!project) return;
      projectButton.disabled = true;
      project.archived = false; project.updatedAt = new Date().toISOString();
      try { await window.api.saveProjects(state.projects); renderSidebarProjects(); refreshArchiveView(); showToast('Project restored', 'success'); }
      catch (_) { project.archived = true; projectButton.disabled = false; showToast('Could not restore project', 'error'); }
      return;
    }
    const button = event.target.closest('[data-archive-restore]');
    if (!button || button.disabled) return;
    button.disabled = true;
    try { await undoTaskCompletion(button.dataset.archiveRestore); showToast('Completion undone — task moved back to its original location', 'success'); }
    catch (_) { showToast('Could not undo completion. Please try again.', 'error'); button.disabled = false; }
  });
}
