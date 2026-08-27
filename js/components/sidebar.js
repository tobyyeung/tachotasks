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

  const allProjects = state.projects || [];
  const topLevel = allProjects.filter(p => !p.parentProjectId);
  const collapsedProjects = state.settings.collapsedProjects || [];

  let html = '';
  topLevel.forEach(p => {
    const subProjects = allProjects.filter(sub => sub.parentProjectId === p.id);
    const count = state.tasks.filter(t => t.projectId === p.id && !t.completed).length;
    const hasSub = subProjects.length > 0;
    const isCollapsed = collapsedProjects.includes(p.id);
    const isActive = state.filterProject === p.id;

    html += `
      <div class="sidebar-list-item project-item ${isActive ? 'active' : ''}" data-filter-project="${p.id}" data-project-id="${p.id}" style="position:relative; display:flex; align-items:center; gap:8px; padding:6px 12px; border-radius:6px; cursor:pointer;">
        ${hasSub ? `
          <button class="project-collapse-btn" data-toggle-project="${p.id}" title="Toggle sub-lists" style="background:none;border:none;padding:0;margin-right:2px;cursor:pointer;color:var(--text-tertiary);display:flex;align-items:center;">
            <img class="collapse-arrow ${isCollapsed ? 'collapsed' : ''}" src="assets/icons/Down.png" alt="Toggle" style="width:14px;height:14px;transition:transform 0.2s;" />
          </button>
        ` : ''}
        <input type="checkbox" class="project-sidebar-checkbox" style="accent-color:${p.color || 'var(--accent)'}; width:16px; height:16px; border-radius:3px; cursor:pointer; flex-shrink:0; pointer-events:none;" ${isActive ? 'checked' : ''} />
        <span class="project-name" style="font-size:13px; font-weight:500; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escHtml(p.name)}</span>
        <span class="count" style="font-size:11px; color:var(--text-tertiary); margin-left:auto;">${count}</span>
        
        <div class="project-actions" style="position:absolute; right:8px; display:flex; gap:4px; opacity:0;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0'">
          <button class="btn-icon-sm add-list-btn" data-parent-id="${p.id}" title="Add List" style="opacity:0.6;">+</button>
        </div>
      </div>
    `;

    if (hasSub && !isCollapsed) {
      subProjects.forEach(sub => {
        const subCount = state.tasks.filter(t => t.projectId === sub.id && !t.completed).length;
        const subActive = state.filterProject === sub.id;
        html += `
          <div class="sidebar-list-item project-item ${subActive ? 'active' : ''}" data-filter-project="${sub.id}" data-project-id="${sub.id}" style="padding-left:26px; display:flex; align-items:center; gap:8px; padding-top:4px; padding-bottom:4px; border-radius:6px; cursor:pointer;">
            <input type="checkbox" class="project-sidebar-checkbox" style="accent-color:${sub.color || 'var(--accent)'}; width:14px; height:14px; border-radius:3px; cursor:pointer; flex-shrink:0; pointer-events:none;" ${subActive ? 'checked' : ''} />
            <span style="font-size:12px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escHtml(sub.name)}</span>
            <span class="count" style="font-size:11px; color:var(--text-tertiary); margin-left:auto;">${subCount}</span>
          </div>
        `;
      });
    }
  });

  container.innerHTML = html;

  // Toggle sub-projects collapse
  container.querySelectorAll('[data-toggle-project]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const projId = btn.dataset.toggleProject;
      let collapsed = state.settings.collapsedProjects || [];
      if (collapsed.includes(projId)) {
        collapsed = collapsed.filter(id => id !== projId);
      } else {
        collapsed.push(projId);
      }
      state.settings.collapsedProjects = collapsed;
      await window.api.saveSettings(state.settings);
      renderSidebarProjects();
    });
  });

  // Project filter click
  container.querySelectorAll('[data-filter-project]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.project-actions') || e.target.closest('.project-collapse-btn')) return;
      const projId = el.dataset.filterProject;
      if (state.filterProject === projId && state.currentView === 'project') {
        state.filterProject = null;
        state.currentView = 'tasks';
        const navTasks = document.getElementById('nav-tasks');
        if (navTasks) {
          document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
          navTasks.classList.add('active');
        }
      } else {
        state.filterProject = projId;
        state.currentView = 'project';
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      }
      renderSidebarProjects();
      renderView();
    });
  });

  // Add List button
  container.querySelectorAll('.add-list-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showProjectModal(btn.dataset.parentId);
    });
  });

  // Project right-click context menu
  container.querySelectorAll('.project-item').forEach(item => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const projId = item.dataset.projectId;
      showContextMenu(e.clientX, e.clientY, projId);
    });
  });
}

/**
 * Displays a right-click context menu for project deletion.
 * @param {number} x - Mouse X position.
 * @param {number} y - Mouse Y position.
 * @param {string} projectId - Project ID to operate on.
 */
function showContextMenu(x, y, projectId) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  menu.innerHTML = `
    <div class="context-menu-item danger" id="context-delete-project">
      <img src="assets/icons/Trash.png" alt="Delete" style="width:18px;height:18px;object-fit:contain;margin-right:6px;" />
      Delete Project
    </div>
  `;

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove('hidden');

  document.getElementById('context-delete-project').addEventListener('click', async () => {
    menu.classList.add('hidden');
    const isList = !!state.projects.find(p => p.id === projectId)?.parentProjectId;
    const idsToDelete = [projectId, ...state.projects.filter(p => p.parentProjectId === projectId).map(p => p.id)];

    const html = `
      <div style="padding:var(--sp-md);text-align:center;">
        <h2 style="font-size:16px;margin-bottom:8px;">${isList ? 'Delete List?' : 'Delete Project?'}</h2>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;">
          ${isList ? 'Delete this list and move its tasks to uncategorized?' : 'Delete this project (and its lists) and move all its tasks to uncategorized?'}
        </p>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button id="modal-cancel-delete" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;">Cancel</button>
          <button id="modal-confirm-delete" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--danger);color:white;border:none;cursor:pointer;">Delete</button>
        </div>
      </div>
    `;
    openModal(html);

    document.getElementById('modal-cancel-delete').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-delete').addEventListener('click', async () => {
      state.projects = state.projects.filter(p => !idsToDelete.includes(p.id));
      state.tasks.forEach(t => {
        if (idsToDelete.includes(t.projectId)) t.projectId = null;
      });
      await window.api.saveProjects(state.projects);
      await window.api.saveTasks(state.tasks);
      if (idsToDelete.includes(state.filterProject)) state.filterProject = null;
      renderSidebarProjects();
      renderView();
      closeModal();
    });
  });

  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.classList.add('hidden');
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
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
