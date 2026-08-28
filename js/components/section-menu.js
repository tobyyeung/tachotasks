// ===== SECTION OPTIONS DROPDOWN & MODALS =====
/**
 * Opens the section options context menu for a specific section.
 * Options: Edit, Duplicate, Archive, Delete.
 *
 * @param {string} secId - Section ID.
 * @param {HTMLElement} triggerBtn - The 3-dots trigger button element.
 */
function openSectionMenu(secId, triggerBtn) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  const sec = (state.settings && state.settings.taskSections || []).find(s => s.id === secId);
  if (!sec) return;

  menu.innerHTML = `
    <div class="context-menu-item" id="sec-menu-edit">
      <img src="assets/icons/Edit.png" alt="Edit" style="width:16px;height:16px;object-fit:contain;margin-right:8px;opacity:0.8;" />
      <span>Edit</span>
    </div>
    <div class="context-menu-item" id="sec-menu-duplicate">
      <img src="assets/icons/Duplicate.png" alt="Duplicate" style="width:16px;height:16px;object-fit:contain;margin-right:8px;opacity:0.8;" />
      <span>Duplicate</span>
    </div>
    <div style="height:1px;background:var(--border);margin:4px 0;"></div>
    <div class="context-menu-item" id="sec-menu-archive">
      <img src="assets/icons/Archive.png" alt="Archive" style="width:16px;height:16px;object-fit:contain;margin-right:8px;opacity:0.8;" />
      <span>Archive</span>
    </div>
    <div class="context-menu-item danger" id="sec-menu-delete" style="color:var(--danger,#ff5c5c);">
      <img src="assets/icons/Trash.png" alt="Delete" style="width:16px;height:16px;object-fit:contain;margin-right:8px;" />
      <span>Delete</span>
    </div>
  `;

  const rect = triggerBtn.getBoundingClientRect();
  menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - 180))}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.classList.remove('hidden');

  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== triggerBtn) {
      menu.classList.add('hidden');
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);

  // 1. Edit Section
  document.getElementById('sec-menu-edit').addEventListener('click', () => {
    menu.classList.add('hidden');
    const html = `
      <div style="padding:var(--sp-md);">
        <h2 style="font-size:16px;margin-bottom:14px;font-weight:600;">Edit Section</h2>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;font-weight:500;">Section Name</label>
          <input type="text" id="modal-edit-sec-name" value="${escAttr(sec.name)}" placeholder="e.g. CS374" style="width:100%;padding:8px 12px;background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);outline:none;font-size:13px;" />
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;font-weight:500;">Website / Link (optional)</label>
          <input type="text" id="modal-edit-sec-link" value="${escAttr(sec.link || '')}" placeholder="e.g. https://canvas.illinois.edu" style="width:100%;padding:8px 12px;background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);outline:none;font-size:13px;" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="modal-cancel-edit-sec" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;font-size:13px;">Cancel</button>
          <button id="modal-confirm-edit-sec" class="btn-primary" style="padding:6px 16px;border-radius:var(--radius-sm);cursor:pointer;font-size:13px;">Save</button>
        </div>
      </div>
    `;
    openModal(html);
    const input = document.getElementById('modal-edit-sec-name');
    const linkInput = document.getElementById('modal-edit-sec-link');
    input.focus();
    input.select();
    const save = async () => {
      const newName = input.value.trim();
      let newLink = linkInput.value.trim();
      if (newLink && !newLink.startsWith('http://') && !newLink.startsWith('https://')) {
        newLink = 'https://' + newLink;
      }
      if (newName) {
        sec.name = newName;
        sec.link = newLink || null;
        await window.api.saveSettings(state.settings);
        renderView();
        closeModal();
      }
    };
    document.getElementById('modal-confirm-edit-sec').addEventListener('click', save);
    document.getElementById('modal-cancel-edit-sec').addEventListener('click', closeModal);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  });

  // 2. Duplicate Section
  document.getElementById('sec-menu-duplicate').addEventListener('click', async () => {
    menu.classList.add('hidden');
    const newSecId = 'sec-' + generateId();
    const newSec = {
      id: newSecId,
      name: sec.name + ' (Copy)',
      profileId: sec.profileId
    };
    const secIndex = state.settings.taskSections.findIndex(s => s.id === sec.id);
    if (secIndex >= 0) {
      state.settings.taskSections.splice(secIndex + 1, 0, newSec);
    } else {
      state.settings.taskSections.push(newSec);
    }

    // Duplicate all tasks belonging to this section
    const originalTasks = state.tasks.filter(t => t.sectionId === sec.id);
    originalTasks.forEach(t => {
      const dup = {
        ...t,
        id: generateId(),
        sectionId: newSecId,
        createdAt: new Date().toISOString()
      };
      state.tasks.push(dup);
    });

    await window.api.saveSettings(state.settings);
    await saveTasks();
    showToast('Section duplicated', 'success');
    renderView();
  });

  // 3. Archive Section
  document.getElementById('sec-menu-archive').addEventListener('click', async () => {
    menu.classList.add('hidden');
    const tasksToArchive = state.tasks.filter(t => t.sectionId === sec.id);
    if (tasksToArchive.length === 0) {
      showToast('No tasks to archive in this section', 'info');
      return;
    }
    if (confirm(`Archive all ${tasksToArchive.length} tasks in "${sec.name}"?`)) {
      tasksToArchive.forEach(t => {
        t.completed = true;
        t.completedAt = new Date().toISOString();
        state.archivedTasks.push(t);
      });
      state.tasks = state.tasks.filter(t => t.sectionId !== sec.id);
      await saveTasks();
      await saveArchivedTasks();
      showToast(`Archived ${tasksToArchive.length} tasks`, 'success');
      renderView();
    }
  });

  // 4. Delete Section
  document.getElementById('sec-menu-delete').addEventListener('click', async () => {
    menu.classList.add('hidden');
    const secTasks = state.tasks.filter(t => t.sectionId === sec.id);
    const html = `
      <div style="padding:var(--sp-md);text-align:center;">
        <h2 style="font-size:16px;margin-bottom:8px;font-weight:600;">Delete Section?</h2>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;">
          Delete section "<strong>${escHtml(sec.name)}</strong>"? ${secTasks.length > 0 ? `Its ${secTasks.length} tasks will become uncategorized.` : ''}
        </p>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button id="modal-cancel-del-sec" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;">Cancel</button>
          <button id="modal-confirm-del-sec" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--danger);color:white;border:none;cursor:pointer;">Delete</button>
        </div>
      </div>
    `;
    openModal(html);
    document.getElementById('modal-cancel-del-sec').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-del-sec').addEventListener('click', async () => {
      state.settings.taskSections = state.settings.taskSections.filter(s => s.id !== sec.id);
      state.tasks.forEach(t => {
        if (t.sectionId === sec.id) t.sectionId = null;
      });
      await window.api.saveSettings(state.settings);
      await saveTasks();
      closeModal();
      showToast('Section deleted', 'info');
      renderView();
    });
  });
}
