/**
 * task-menu.js
 * Custom Right-Click Menu for tasks matching your reference image.
 */

(function () {
  let activeMenuEl = null;

  function initTaskMenu() {
    document.addEventListener('contextmenu', (e) => {
      const taskCard = e.target.closest('[data-task-id]');
      if (!taskCard) return;

      // Prevent default browser right-click menu
      e.preventDefault();
      const taskId = taskCard.dataset.taskId;
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      openTaskMenu(e.clientX, e.clientY, task);
    });

    document.addEventListener('click', (e) => {
      if (activeMenuEl && !activeMenuEl.contains(e.target)) {
        closeTaskMenu();
      }
    });

    document.addEventListener('scroll', () => {
      closeTaskMenu();
    }, true);
  }

  function openTaskMenu(x, y, task) {
    closeTaskMenu();

    const menu = document.createElement('div');
    menu.id = 'task-menu';
    menu.className = 'task-menu task-context-menu';

    // Format current day string for Today icon
    const todayDayNum = new Date().getDate();

    menu.innerHTML = `
      <button class="ctx-item" id="ctx-edit-task">
        <div class="ctx-item-left">
          <img src="assets/icons/Edit.png" alt="Edit" style="width:20px;height:20px;object-fit:contain;" />
          <span>Edit</span>
        </div>
      </button>

      <div class="ctx-divider"></div>

      <!-- Date Quick-Select Section -->
      <div class="ctx-section">
        <div class="ctx-section-header">
          <span>Date</span>
        </div>
        <div class="ctx-icon-bar">
          <button class="ctx-icon-btn green" id="ctx-date-today" title="Today">
            <img src="assets/icons/Calendar.png" alt="Today" style="width:22px;height:22px;object-fit:contain;" />
          </button>
          <button class="ctx-icon-btn orange" id="ctx-date-tomorrow" title="Tomorrow">
            <img src="assets/icons/Calendar.png" alt="Tomorrow" style="width:22px;height:22px;object-fit:contain;" />
          </button>
          <button class="ctx-icon-btn blue" id="ctx-date-weekend" title="This Weekend">
            <img src="assets/icons/Calendar.png" alt="Weekend" style="width:22px;height:22px;object-fit:contain;" />
          </button>
          <button class="ctx-icon-btn purple" id="ctx-date-nextweek" title="Next Week">
            <img src="assets/icons/Calendar.png" alt="Next Week" style="width:22px;height:22px;object-fit:contain;" />
          </button>
          <button class="ctx-icon-btn grey" id="ctx-date-custom" title="More Dates & Times">
            •••
          </button>
        </div>
      </div>

      <!-- Priority Quick-Select Section -->
      <div class="ctx-section">
        <div class="ctx-section-header">
          <span>Priority</span>
        </div>
        <div class="ctx-icon-bar">
          <button class="ctx-flag-btn ${getPriorityColorClass('P1')} ${task.priority === 'P1' ? 'active' : ''}" data-priority="P1" title="Priority 1">
            <img src="assets/icons/Flag filled.png" alt="P1" style="width:20px;height:20px;object-fit:contain;" />
          </button>
          <button class="ctx-flag-btn ${getPriorityColorClass('P2')} ${task.priority === 'P2' ? 'active' : ''}" data-priority="P2" title="Priority 2">
            <img src="assets/icons/Flag filled.png" alt="P2" style="width:20px;height:20px;object-fit:contain;" />
          </button>
          <button class="ctx-flag-btn ${getPriorityColorClass('P3')} ${task.priority === 'P3' ? 'active' : ''}" data-priority="P3" title="Priority 3">
            <img src="assets/icons/Flag filled.png" alt="P3" style="width:20px;height:20px;object-fit:contain;" />
          </button>
          <button class="ctx-flag-btn flag-color-slate ${task.priority === 'P4' ? 'active' : ''}" data-priority="P4" title="Priority 4 (Default)">
            <img src="assets/icons/Flag.png" alt="P4" style="width:20px;height:20px;object-fit:contain;" />
          </button>
        </div>
      </div>

      <div class="ctx-divider"></div>

      <!-- Move to... Section -->
      <button class="ctx-item" id="ctx-move-task">
        <div class="ctx-item-left">
          <img src="assets/icons/Sort.png" alt="Move to" style="width:20px;height:20px;object-fit:contain;" />
          <span>Move to...</span>
        </div>
      </button>
      
      <!-- Submenu container for Move to -->
      <div id="ctx-move-submenu" class="ctx-submenu hidden"></div>

      <!-- Duplicate -->
      <button class="ctx-item" id="ctx-duplicate-task">
        <div class="ctx-item-left">
          <img src="assets/icons/Duplicate.png" alt="Duplicate" style="width:20px;height:20px;object-fit:contain;" />
          <span>Duplicate</span>
        </div>
      </button>

      <div class="ctx-divider"></div>

      <!-- Delete -->
      <button class="ctx-item danger" id="ctx-delete-task">
        <div class="ctx-item-left">
          <img src="assets/icons/Trash.png" alt="Delete" style="width:20px;height:20px;object-fit:contain;" />
          <span>Delete</span>
        </div>
      </button>
    `;

    document.body.appendChild(menu);
    activeMenuEl = menu;

    // Viewport overflow positioning
    const menuWidth = 240;
    const menuHeight = 310;
    let posX = x;
    let posY = y;

    if (posX + menuWidth > window.innerWidth - 10) posX = window.innerWidth - menuWidth - 10;
    if (posY + menuHeight > window.innerHeight - 10) posY = window.innerHeight - menuHeight - 10;
    if (posX < 10) posX = 10;
    if (posY < 10) posY = 10;

    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';

    attachMenuHandlers(menu, task);
  }

  function attachMenuHandlers(menu, task) {
    // 1. Edit Task
    menu.querySelector('#ctx-edit-task').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTaskMenu();
      showTaskModal(task.id);
    });

    // 2. Date Quick Buttons
    menu.querySelector('#ctx-date-today').addEventListener('click', async (e) => {
      e.stopPropagation();
      task.plannedDate = getTodayStr();
      await saveTasks();
      closeTaskMenu();
      renderView();
      showToast('Date set to Today', 'success');
    });

    menu.querySelector('#ctx-date-tomorrow').addEventListener('click', async (e) => {
      e.stopPropagation();
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      task.plannedDate = toDateStr(tmrw);
      await saveTasks();
      closeTaskMenu();
      renderView();
      showToast('Date set to Tomorrow', 'success');
    });

    menu.querySelector('#ctx-date-weekend').addEventListener('click', async (e) => {
      e.stopPropagation();
      const d = new Date();
      const day = d.getDay(); // 0 is Sun, 6 is Sat
      const dist = (6 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + dist);
      task.plannedDate = toDateStr(d);
      await saveTasks();
      closeTaskMenu();
      renderView();
      showToast('Date set to This Weekend', 'success');
    });

    menu.querySelector('#ctx-date-nextweek').addEventListener('click', async (e) => {
      e.stopPropagation();
      const d = new Date();
      const day = d.getDay();
      const dist = (1 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + dist);
      task.plannedDate = toDateStr(d);
      await saveTasks();
      closeTaskMenu();
      renderView();
      showToast('Date set to Next Week', 'success');
    });

    // Custom Date Picker (•••)
    const customDateBtn = menu.querySelector('#ctx-date-custom');
    customDateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showDateSelector({
        targetElement: customDateBtn,
        initialDate: task.plannedDate,
        initialTime: task.plannedTime,
        initialRepeat: task.recurring,
        onSelect: async ({ date, time, repeat }) => {
          task.plannedDate = date || null;
          task.plannedTime = time || null;
          if (repeat !== undefined) task.recurring = repeat;
          await saveTasks();
          closeTaskMenu();
          renderView();
          showToast('Date & time updated', 'success');
        },
        onClear: async () => {
          task.plannedDate = null;
          task.plannedTime = null;
          await saveTasks();
          closeTaskMenu();
          renderView();
          showToast('Date & time cleared', 'success');
        }
      });
    });

    // 3. Priority Selection
    menu.querySelectorAll('.ctx-flag-btn[data-priority]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        task.priority = btn.dataset.priority;
        await saveTasks();
        closeTaskMenu();
        renderView();
        showToast(`Priority set to ${task.priority}`, 'success');
      });
    });

    // 4. Move to...
    const moveBtn = menu.querySelector('#ctx-move-task');
    const moveSubmenu = menu.querySelector('#ctx-move-submenu');
    moveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!moveSubmenu.classList.contains('hidden')) {
        moveSubmenu.classList.add('hidden');
        return;
      }

      // Build Move To submenu items (Profiles & Projects with Section names)
      let subHtml = '';
      const profiles = (state.profiles || []).filter(p => p.id !== 'all');
      const taskSections = (state.settings && state.settings.taskSections) || [];

      profiles.forEach(p => {
        let pImg = p.image;
        if (!pImg) {
          const idLower = String(p.id).toLowerCase();
          const nameLower = String(p.name).toLowerCase();
          if (idLower.includes('work') || nameLower.includes('work')) pImg = 'assets/profiles/work.png';
          else if (idLower.includes('school') || nameLower.includes('school')) pImg = 'assets/profiles/school.png';
          else pImg = 'assets/profiles/personal.png';
        }
        const imgHtml = `<img src="${pImg}" alt="${escAttr(p.name)}" class="custom-emoji" />`;

        const profSections = taskSections.filter(s => s.profileId === p.id);
        if (profSections.length > 0) {
          profSections.forEach(s => {
            subHtml += `<div class="ctx-submenu-item" data-proj-id="" data-profile-id="${p.id}" data-section-id="${s.id}">${imgHtml}${escHtml(p.name)} / ${escHtml(s.name)}</div>`;
          });
        } else {
          subHtml += `<div class="ctx-submenu-item" data-proj-id="" data-profile-id="${p.id}" data-section-id="unsectioned">${imgHtml}${escHtml(p.name)} / Uncategorized</div>`;
        }
      });

      (state.projects || []).filter(p => !p.archived).forEach(p => {
        if (p.sections && p.sections.length > 0) {
          p.sections.forEach(s => {
            subHtml += `<div class="ctx-submenu-item" data-proj-id="${p.id}" data-section-id="${s.id}">📂 ${escHtml(p.name)} / ${escHtml(s.name)}</div>`;
          });
        } else {
          subHtml += `<div class="ctx-submenu-item" data-proj-id="${p.id}" data-section-id="unsectioned">📂 ${escHtml(p.name)} / Uncategorized</div>`;
        }
      });

      moveSubmenu.innerHTML = subHtml;
      moveSubmenu.classList.remove('hidden');

      moveSubmenu.querySelectorAll('.ctx-submenu-item').forEach(subItem => {
        subItem.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const projId = subItem.dataset.projId || null;
          const profId = subItem.dataset.profileId || null;
          const secId = subItem.dataset.sectionId || 'unsectioned';

          task.projectId = projId;
          if (profId) task.profileId = profId;
          task.sectionId = secId;

          await saveTasks();
          closeTaskMenu();
          renderView();
          showToast('Task moved successfully', 'success');
        });
      });
    });

    // 5. Duplicate Task
    menu.querySelector('#ctx-duplicate-task').addEventListener('click', async (e) => {
      e.stopPropagation();
      const dupTask = {
        ...task,
        id: generateId(),
        title: task.title + ' (Copy)',
        createdAt: new Date().toISOString()
      };
      state.tasks.push(dupTask);
      await saveTasks();
      closeTaskMenu();
      renderView();
      showToast('Task duplicated', 'success');
    });

    // 6. Delete Task
    menu.querySelector('#ctx-delete-task').addEventListener('click', async (e) => {
      e.stopPropagation();
      deleteTask(task.id);
      closeTaskMenu();
    });
  }

  function closeTaskMenu() {
    if (activeMenuEl) {
      activeMenuEl.remove();
      activeMenuEl = null;
    }
  }

  // Initialize event listener when script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTaskMenu);
  } else {
    initTaskMenu();
  }

  window.openTaskMenu = openTaskMenu;
  window.closeTaskMenu = closeTaskMenu;
})();
