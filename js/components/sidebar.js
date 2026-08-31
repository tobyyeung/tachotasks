/**
 * sidebar.js
 * Sidebar rendering functions for projects, context menus, and tags filtering.
 */

/**
 * Sets up persistent section collapse handlers for Projects, Google Calendars, and Tags headers.
 */
function setupSidebarSectionCollapses() {
  const sections = [
    { headerId: 'header-projects', listId: 'sidebar-projects', key: 'projects' },
    { headerId: 'header-gcal', listId: 'gcal-list', key: 'gcal' },
    { headerId: 'header-tags', listId: 'sidebar-tags', key: 'tags' }
  ];

  const collapsed = state.settings.collapsedCategories || [];

  sections.forEach(({ headerId, listId, key }) => {
    const header = document.getElementById(headerId);
    const list = document.getElementById(listId);
    if (!header || !list) return;

    const arrow = header.querySelector('.collapse-arrow');
    const isCollapsed = collapsed.includes(key);

    if (isCollapsed) {
      list.classList.add('collapsed');
      if (arrow) arrow.classList.add('collapsed');
    } else {
      list.classList.remove('collapsed');
      if (arrow) arrow.classList.remove('collapsed');
    }

    if (!header.dataset.collapseListener) {
      header.dataset.collapseListener = 'true';
      header.addEventListener('click', async (e) => {
        if (e.target.closest('button')) return; // Ignore add/refresh buttons
        let current = state.settings.collapsedCategories || [];
        if (current.includes(key)) {
          current = current.filter(k => k !== key);
          list.classList.remove('collapsed');
          if (arrow) arrow.classList.remove('collapsed');
        } else {
          current.push(key);
          list.classList.add('collapsed');
          if (arrow) arrow.classList.add('collapsed');
        }
        state.settings.collapsedCategories = current;
        await window.api.saveSettings(state.settings);
      });
    }
  });
}

/**
 * Renders all projects globally with Google Calendar-style colored checkboxes.
 */
function renderSidebarProjects() {
  setupSidebarSectionCollapses();

  const container = document.getElementById('sidebar-projects');
  if (!container) return;

  const allProjects = (state.projects || []).filter(p => !p.archived);

  let html = '';
  allProjects.forEach(p => {
    const count = state.tasks.filter(t => t.projectId === p.id && !t.completed).length;
    const isSelected = state.filterProject === p.id && state.currentView === 'project';
    const isActivated = isProjectActive(p.id);

    html += `
      <div class="sidebar-list-item project-item ${isSelected ? 'active' : ''}" data-filter-project="${p.id}" data-project-id="${p.id}" style="position:relative; display:flex; align-items:center; gap:8px; padding:6px 12px; border-radius:6px; cursor:pointer;">
        <input type="checkbox" class="project-sidebar-checkbox" data-proj-toggle="${p.id}" style="--proj-color:${p.color || '#5cb8ff'};" ${isActivated ? 'checked' : ''} />
        <span class="project-name" style="font-size:13px; font-weight:500; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escHtml(p.name)}</span>
        <span class="count" style="font-size:11px; color:var(--text-tertiary); margin-left:auto;">${count}</span>
      </div>
    `;
  });

  container.innerHTML = html;

  // Toggle project active/visible in calendar, dashboard, planner
  container.querySelectorAll('.project-sidebar-checkbox').forEach(cb => {
    cb.addEventListener('click', async (e) => {
      e.stopPropagation();
      const projId = cb.dataset.projToggle;
      state.settings.hiddenProjectIds = state.settings.hiddenProjectIds || [];
      if (cb.checked) {
        state.settings.hiddenProjectIds = state.settings.hiddenProjectIds.filter(id => id !== projId);
      } else {
        if (!state.settings.hiddenProjectIds.includes(projId)) {
          state.settings.hiddenProjectIds.push(projId);
        }
      }
      await window.api.saveSettings(state.settings);
      renderView();
    });
  });

  // Project item click: Opens project view
  container.querySelectorAll('[data-filter-project]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.project-sidebar-checkbox')) return;
      const projId = el.dataset.filterProject;
      if (state.filterProject === projId && state.currentView === 'project') {
        state.filterProject = null;
        state.currentView = state.previousView || 'tasks';
        const targetNav = document.getElementById(`nav-${state.currentView}`) || document.getElementById('nav-tasks');
        if (targetNav) {
          document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
          targetNav.classList.add('active');
        }
      } else {
        if (state.currentView !== 'project') {
          state.previousView = state.currentView;
        }
        state.filterProject = projId;
        state.currentView = 'project';
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      }
      persistUIState();
      renderSidebarProjects();
      renderView();
    });
  });

  // Project right-click context menu
  container.querySelectorAll('.project-item').forEach(item => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const projId = item.dataset.projectId;
      openProjectContextMenu(e.clientX, e.clientY, projId);
    });
  });
}

/**
 * Displays a right-click context menu for project actions (Edit, Duplicate, Archive, Delete).
 * @param {number} x - Mouse X position.
 * @param {number} y - Mouse Y position.
 * @param {string} projectId - Project ID to operate on.
 */
function openProjectContextMenu(x, y, projectId) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) return;

  menu.innerHTML = `
    <div class="context-menu-item" id="context-edit-project">
      <img src="assets/icons/Edit.png" alt="Edit" style="width:16px;height:16px;object-fit:contain;margin-right:8px;opacity:0.8;" />
      <span>Edit Project</span>
    </div>
    <div class="context-menu-item" id="context-dup-project">
      <img src="assets/icons/Duplicate.png" alt="Duplicate" style="width:16px;height:16px;object-fit:contain;margin-right:8px;opacity:0.8;" />
      <span>Duplicate Project</span>
    </div>
    <div style="height:1px;background:var(--border);margin:4px 0;"></div>
    <div class="context-menu-item" id="context-archive-project">
      <img src="assets/icons/Archive.png" alt="Archive" style="width:16px;height:16px;object-fit:contain;margin-right:8px;opacity:0.8;" />
      <span>Archive Project</span>
    </div>
    <div class="context-menu-item danger" id="context-delete-project" style="color:var(--danger,#ff5c5c);">
      <img src="assets/icons/Trash.png" alt="Delete" style="width:16px;height:16px;object-fit:contain;margin-right:8px;" />
      <span>Delete Project</span>
    </div>
  `;

  menu.style.left = `${Math.max(10, Math.min(x, window.innerWidth - 190))}px`;
  menu.style.top = `${Math.max(10, Math.min(y, window.innerHeight - 230))}px`;
  menu.classList.remove('hidden');

  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.classList.add('hidden');
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);

  // 1. Edit Project
  document.getElementById('context-edit-project')?.addEventListener('click', () => {
    menu.classList.add('hidden');
    showProjectModal(proj.id);
  });

  // 2. Duplicate Project
  document.getElementById('context-dup-project')?.addEventListener('click', async () => {
    menu.classList.add('hidden');
    const nowIso = new Date().toISOString();
    const newProjId = 'proj-' + generateId();
    const newProj = {
      ...proj,
      id: newProjId,
      name: proj.name + ' (Copy)',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    state.projects.push(newProj);

    // Duplicate project tasks
    const projTasks = state.tasks.filter(t => t.projectId === proj.id);
    projTasks.forEach(t => {
      const dup = {
        ...t,
        id: generateId(),
        projectId: newProjId,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      state.tasks.push(dup);
    });

    await window.api.saveProjects(state.projects);
    await saveTasks();
    showToast('Project duplicated', 'success');
    renderSidebarProjects();
    renderView();
  });

  // 3. Archive Project
  document.getElementById('context-archive-project')?.addEventListener('click', () => {
    menu.classList.add('hidden');
    const tasksToArchive = state.tasks.filter(t => t.projectId === proj.id && !t.completed);

    const html = `
      <div style="padding:var(--sp-md);text-align:center;">
        <h2 style="font-size:16px;margin-bottom:8px;font-weight:600;">Archive Project?</h2>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;">
          Archive project "<strong>${escHtml(proj.name)}</strong>"? It will be hidden from the sidebar, and its ${tasksToArchive.length > 0 ? `${tasksToArchive.length} active tasks will be marked completed and moved to the Archive` : 'tasks will be moved to the Archive'}.
        </p>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button id="modal-cancel-archive" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;font-size:13px;">Cancel</button>
          <button id="modal-confirm-archive" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--accent);color:white;border:none;cursor:pointer;font-size:13px;">Archive</button>
        </div>
      </div>
    `;
    openModal(html);

    document.getElementById('modal-cancel-archive').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-archive').addEventListener('click', async () => {
      const nowIso = new Date().toISOString();
      proj.archived = true;
      proj.archivedAt = nowIso;
      proj.updatedAt = nowIso;

      tasksToArchive.forEach(t => {
        t.completed = true;
        t.completedAt = nowIso;
        t.updatedAt = nowIso;
        state.archivedTasks.push(t);
      });
      state.tasks = state.tasks.filter(t => !tasksToArchive.includes(t));

      await window.api.saveProjects(state.projects);
      await saveTasks();
      await saveArchivedTasks();

      if (state.filterProject === proj.id) {
        state.filterProject = null;
        state.currentView = state.previousView || 'tasks';
        const targetNav = document.getElementById(`nav-${state.currentView}`) || document.getElementById('nav-tasks');
        if (targetNav) {
          document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
          targetNav.classList.add('active');
        }
      }

      closeModal();
      showToast(`Project "${proj.name}" archived`, 'success');
      renderSidebarProjects();
      renderView();
    });
  });

  // 4. Delete Project
  document.getElementById('context-delete-project')?.addEventListener('click', () => {
    menu.classList.add('hidden');

    const html = `
      <div style="padding:var(--sp-md);text-align:center;">
        <h2 style="font-size:16px;margin-bottom:8px;font-weight:600;">Delete Project?</h2>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;">
          Delete project "<strong>${escHtml(proj.name)}</strong>"? Its tasks will become uncategorized.
        </p>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button id="modal-cancel-delete" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;font-size:13px;">Cancel</button>
          <button id="modal-confirm-delete" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--danger);color:white;border:none;cursor:pointer;font-size:13px;">Delete</button>
        </div>
      </div>
    `;
    openModal(html);

    document.getElementById('modal-cancel-delete').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-delete').addEventListener('click', async () => {
      if (window.api && window.api.recordTombstone) {
        window.api.recordTombstone(proj.id, 'project');
      }
      state.projects = state.projects.filter(p => p.id !== proj.id);
      state.tasks.forEach(t => {
        if (t.projectId === proj.id) {
          t.projectId = null;
          t.updatedAt = new Date().toISOString();
        }
      });

      await window.api.saveProjects(state.projects);
      await saveTasks();

      if (state.filterProject === proj.id) {
        state.filterProject = null;
        state.currentView = state.previousView || 'tasks';
        const targetNav = document.getElementById(`nav-${state.currentView}`) || document.getElementById('nav-tasks');
        if (targetNav) {
          document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
          targetNav.classList.add('active');
        }
      }
      closeModal();
      showToast('Project deleted', 'info');
      renderSidebarProjects();
      renderView();
    });
  });
}

function showContextMenu(x, y, projectId) {
  openProjectContextMenu(x, y, projectId);
}

/**
 * Renders active tag chips in the sidebar for tag-based filtering.
 */
function renderSidebarTags() {
  const container = document.getElementById('sidebar-tags');
  const section = document.getElementById('tags-sidebar-section');
  if (!container || !section) return;

  const tags = getAllTags();
  if (tags.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  container.innerHTML = tags.map(tag => {
    const count = state.tasks.filter(t => t.tags.includes(tag) && !t.completed).length;
    const isChecked = state.filterTag === tag;
    return `
      <div class="gcal-item" data-sidebar-tag="${tag}">
        <input type="checkbox" class="gcal-checkbox" style="pointer-events: none;" ${isChecked ? 'checked' : ''}>
        <span class="gcal-name">${tag}</span>
        <span style="font-size: 10px; color: var(--text-tertiary); margin-left: auto;">${count}</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-sidebar-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.sidebarTag;
      state.filterTag = state.filterTag === tag ? null : tag;
      state.currentView = 'tasks';
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      const navTasks = document.getElementById('nav-tasks');
      if (navTasks) navTasks.classList.add('active');
      renderSidebarTags();
      renderView();
    });
  });
}
