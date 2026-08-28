/**
 * view-listeners.js
 * Attach DOM event listeners for all view actions, filters, settings, drag-drop, and modals.
 */

function attachViewListeners() {
  // Dashboard listeners
  document.querySelectorAll('.floating-reminder').forEach(el => {
    el.addEventListener('click', () => toggleFloatingGoal(el.dataset.goalId));
  });

  document.querySelectorAll('.dashboard-collapse-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.collapseId;
      if (!state.settings.dashboardCollapsed) state.settings.dashboardCollapsed = {};
      const isCollapsed = !state.settings.dashboardCollapsed[id];
      state.settings.dashboardCollapsed[id] = isCollapsed;
      
      const icon = btn.querySelector('img') || btn.querySelector('svg');
      if (icon) icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'none';
      const content = document.getElementById(`collapse-content-${id}`);
      if (content) content.style.display = isCollapsed ? 'none' : '';
      
      await window.api.saveSettings(state.settings);
    });
  });

  const upcomingRangeSelect = document.getElementById('dash-upcoming-range');
  if (upcomingRangeSelect) {
    upcomingRangeSelect.addEventListener('change', async (e) => {
      state.dashboardUpcomingRange = e.target.value;
      if (!state.settings) state.settings = {};
      state.settings.dashboardUpcomingRange = state.dashboardUpcomingRange;
      await window.api.saveSettings(state.settings);
      renderView();
    });
  }

  const addQuickLinkBtn = document.getElementById('add-quick-link-btn');
  if (addQuickLinkBtn) {
    addQuickLinkBtn.addEventListener('click', async () => {
      const title = prompt('Enter link title (e.g. Canvas):');
      if (!title || !title.trim()) return;
      let url = prompt('Enter URL (e.g. https://canvas.instructure.com):');
      if (!url || !url.trim()) return;
      url = url.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      if (!state.settings.dashboardQuickLinks) {
        state.settings.dashboardQuickLinks = [
          { title: 'Gmail', url: 'https://mail.google.com' },
          { title: 'Google Calendar', url: 'https://calendar.google.com' },
          { title: 'Canvas', url: 'https://canvas.instructure.com' },
          { title: 'GitHub', url: 'https://github.com' }
        ];
      }
      state.settings.dashboardQuickLinks.push({ title: title.trim(), url });
      await window.api.saveSettings(state.settings);
      renderView();
    });
  }

  document.querySelectorAll('.dashboard-quick-links .quick-link-pill:not(.add-quick-link-btn)').forEach((linkEl, idx) => {
    linkEl.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      if (confirm(`Remove quick link "${linkEl.querySelector('span')?.textContent || 'link'}"?`)) {
        if (!state.settings.dashboardQuickLinks) {
          state.settings.dashboardQuickLinks = [
            { title: 'Gmail', url: 'https://mail.google.com' },
            { title: 'Google Calendar', url: 'https://calendar.google.com' },
            { title: 'Canvas', url: 'https://canvas.instructure.com' },
            { title: 'GitHub', url: 'https://github.com' }
          ];
        }
        state.settings.dashboardQuickLinks.splice(idx, 1);
        await window.api.saveSettings(state.settings);
        renderView();
      }
    });
  });

  document.querySelectorAll('.itinerary-item[data-event-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = el.dataset.eventId;
      const eventType = el.dataset.eventType || (state.gcalEvents.some(g => g.id === eventId) ? 'gcal_event' : 'event');
      if (typeof showEventPopover === 'function') {
        showEventPopover(eventId, eventType, el);
      }
    });
  });

  document.querySelectorAll('.itinerary-item[data-task-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof showTaskModal === 'function') {
        showTaskModal(el.dataset.taskId);
      }
    });
  });

  document.querySelectorAll('.do-soon-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const taskId = e.target.dataset.taskId;
      toggleTask(taskId);
    });
  });

  const dashCalBtn = document.getElementById('dash-cal-btn');
  if (dashCalBtn) {
    dashCalBtn.addEventListener('click', () => {
      document.querySelector('.nav-item[data-view="calendar"]').click();
    });
  }

  // Tasks view listeners
  const sortBtn = document.getElementById('tasks-sort-btn');
  const sortPanel = document.getElementById('tasks-sort-panel');
  if (sortBtn && sortPanel) {
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sortPanel.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      sortPanel.classList.add('hidden');
    }, { once: true });
  }

  document.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', () => {
      state.tasksSortMode = opt.dataset.sort;
      persistUIState();
      renderView();
    });
  });

  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.tasksViewMode = btn.dataset.tasksView;
      state.settings.tasksViewMode = state.tasksViewMode;
      persistUIState();
      await window.api.saveSettings(state.settings);
      renderView();
    });
  });

  document.querySelectorAll('[data-filter-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.filterTag;
      state.filterTag = state.filterTag === tag ? null : tag;
      persistUIState();
      renderView();
    });
  });

  // Task checkboxes
  document.querySelectorAll('[data-task-toggle]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTask(el.dataset.taskToggle);
    });
  });

  // Task edit
  document.querySelectorAll('[data-task-edit]').forEach(el => {
    el.addEventListener('click', () => showTaskModal(el.dataset.taskEdit));
  });

  // Task card dragstart & dragend
  document.querySelectorAll('.task-item-card[data-task-id]').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.taskId);
      e.dataTransfer.effectAllowed = 'move';
      card.style.opacity = '0.4';
    });

    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
      document.querySelectorAll('.task-section').forEach(s => s.classList.remove('drag-over'));
    });
  });

  // Section drop zones
  document.querySelectorAll('.task-section[data-section-drop]').forEach(sectionEl => {
    sectionEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      sectionEl.classList.add('drag-over');
    });

    sectionEl.addEventListener('dragleave', () => {
      sectionEl.classList.remove('drag-over');
    });

    sectionEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      sectionEl.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const targetSectionId = sectionEl.dataset.sectionDrop;

      if (!taskId) return;
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      const newSectionId = targetSectionId === 'unsectioned' ? null : targetSectionId;
      if (task.sectionId !== newSectionId) {
        task.sectionId = newSectionId;
        await saveTasks();
        renderView();
        showToast('Task moved to section', 'success');
      }
    });
  });

  // Itinerary item click
  document.querySelectorAll('.itinerary-item[data-task-id]').forEach(el => {
    el.addEventListener('click', () => showTaskModal(el.dataset.taskId));
  });

  // New task button
  const addBtn = document.getElementById('add-task-btn');
  if (addBtn) addBtn.addEventListener('click', () => showTaskModal(null));

  // Add project list button
  const addProjectListBtn = document.getElementById('add-project-list-btn');
  if (addProjectListBtn && state.filterProject) {
    addProjectListBtn.addEventListener('click', () => showProjectModal(state.filterProject));
  }

  // Calendar navigation
  const calPrev = document.getElementById('cal-prev') || document.getElementById('planner-prev');
  const calNext = document.getElementById('cal-next') || document.getElementById('planner-next');
  const calToday = document.getElementById('cal-today') || document.getElementById('planner-today');

  // Tasks page profile switcher
  document.querySelectorAll('.tasks-mode-switcher [data-tasks-profile]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pId = btn.dataset.tasksProfile;
      state.activeProfileId = pId;
      state.settings.activeProfileId = pId;
      persistUIState();
      await window.api.saveSettings(state.settings);
      renderView();
    });
  });

  if (calPrev) calPrev.addEventListener('click', () => {
    const mode = state.calendarViewMode || 'weekly';
    if (mode === 'daily') state.calendarDate.setDate(state.calendarDate.getDate() - 1);
    else if (mode === 'monthly' || mode === 'schedule') state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    else state.calendarDate.setDate(state.calendarDate.getDate() - 7);
    persistUIState();
    renderView();
  });
  if (calNext) calNext.addEventListener('click', () => {
    const mode = state.calendarViewMode || 'weekly';
    if (mode === 'daily') state.calendarDate.setDate(state.calendarDate.getDate() + 1);
    else if (mode === 'monthly' || mode === 'schedule') state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    else state.calendarDate.setDate(state.calendarDate.getDate() + 7);
    persistUIState();
    renderView();
  });
  if (calToday) calToday.addEventListener('click', () => {
    state.calendarDate = new Date();
    persistUIState();
    renderView();
  });

  // Calendar View Mode Selector
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.calendarViewMode = btn.dataset.calView;
      persistUIState();
      renderView();
    });
  });

  // Inline Add Task for Section
  document.querySelectorAll('.add-task-inline-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const secId = btn.dataset.addTaskSection;
      openInlineTaskCreate(btn, {
        sectionId: secId !== 'unsectioned' ? secId : null,
        projectId: state.filterProject || null
      });
    });
  });

  // Add Section
  document.querySelectorAll('.add-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const html = `
        <div style="padding:var(--sp-md);">
          <h2 style="font-size:16px;margin-bottom:14px;font-weight:600;">Add Section</h2>
          <div style="margin-bottom:12px;">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;font-weight:500;">Section Name</label>
            <input type="text" id="modal-section-name" placeholder="e.g. CS374" style="width:100%;padding:8px 12px;background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);outline:none;font-size:13px;" />
          </div>
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;font-weight:500;">Website / Link (optional)</label>
            <input type="text" id="modal-section-link" placeholder="e.g. https://canvas.illinois.edu" style="width:100%;padding:8px 12px;background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);outline:none;font-size:13px;" />
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="modal-cancel-section" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;font-size:13px;">Cancel</button>
            <button id="modal-confirm-section" class="btn-primary" style="padding:6px 16px;border-radius:var(--radius-sm);cursor:pointer;font-size:13px;">Add</button>
          </div>
        </div>
      `;
      openModal(html);
      
      const submit = async () => {
        const name = document.getElementById('modal-section-name').value.trim();
        let link = (document.getElementById('modal-section-link')?.value || '').trim();
        if (link && !link.startsWith('http://') && !link.startsWith('https://')) {
          link = 'https://' + link;
        }
        if (name) {
          if (!state.settings.taskSections) state.settings.taskSections = [];
          state.settings.taskSections.push({
            id: 'sec-' + generateId(),
            name,
            link: link || null,
            profileId: getActiveProfileId()
          });
          await window.api.saveSettings(state.settings);
          renderView();
          closeModal();
        }
      };

      document.getElementById('modal-cancel-section').addEventListener('click', closeModal);
      document.getElementById('modal-confirm-section').addEventListener('click', submit);
      document.getElementById('modal-section-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
      document.getElementById('modal-section-link')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });
  });

  // Add Project Section
  document.querySelectorAll('.add-project-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const html = `
        <div style="padding:var(--sp-md);">
          <h2 style="font-size:16px;margin-bottom:12px;">Add Project Section</h2>
          <input type="text" id="modal-section-name" class="inbox-input" placeholder="Section name..." style="width:100%;margin-bottom:16px;" autofocus />
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="modal-cancel-section" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;">Cancel</button>
            <button id="modal-confirm-section" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--accent);color:white;border:none;cursor:pointer;">Add</button>
          </div>
        </div>
      `;
      openModal(html);
      
      const submit = async () => {
        const name = document.getElementById('modal-section-name').value.trim();
        if (name && state.filterProject) {
          if (!state.settings.projectSections) state.settings.projectSections = [];
          state.settings.projectSections.push({
            id: 'psec-' + generateId(),
            projectId: state.filterProject,
            name
          });
          await window.api.saveSettings(state.settings);
          renderView();
          closeModal();
        }
      };

      document.getElementById('modal-cancel-section').addEventListener('click', closeModal);
      document.getElementById('modal-confirm-section').addEventListener('click', submit);
      document.getElementById('modal-section-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });
  });

  // Delete project section
  document.querySelectorAll('.delete-project-section-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const secId = btn.dataset.projectSectionId;
      if (!confirm('Delete this section? Tasks in it will be unsectioned.')) return;
      state.settings.projectSections = (state.settings.projectSections || []).filter(s => s.id !== secId);
      state.tasks.forEach(t => {
        if (t.sectionId === secId) t.sectionId = null;
      });
      await saveTasks();
      await window.api.saveSettings(state.settings);
      renderView();
    });
  });

  // Section Options Menu (Edit, Duplicate, Archive, Delete)
  document.querySelectorAll('.delete-section-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSectionMenu(btn.dataset.sectionId, btn);
    });
  });





  // Drag and drop
  setupDragAndDrop();

  // Section drag and drop reordering
  document.querySelectorAll('.task-section[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      // Prevent drag if we're dragging a task inside it
      if (e.target.closest('[data-task-id]')) {
        e.preventDefault();
        return;
      }
      state.dragSectionId = el.dataset.sectionDrag;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/section', el.dataset.sectionDrag);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      state.dragSectionId = null;
      document.querySelectorAll('.drag-over-section').forEach(d => d.classList.remove('drag-over-section'));
    });
    
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!state.dragSectionId || state.dragSectionId === el.dataset.sectionDrag) return;
      el.classList.add('drag-over-section');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-section');
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over-section');
      const dragSectionId = e.dataTransfer.getData('text/section');
      if (!dragSectionId) return; // Dropped a task here
      
      const targetSectionId = el.dataset.sectionDrag;
      if (dragSectionId === targetSectionId) return;
      
      const sections = state.settings.taskSections;
      const fromIdx = sections.findIndex(s => s.id === dragSectionId);
      const toIdx = sections.findIndex(s => s.id === targetSectionId);
      
      if (fromIdx > -1 && toIdx > -1) {
        const [movedSection] = sections.splice(fromIdx, 1);
        sections.splice(toIdx, 0, movedSection);
        await window.api.saveSettings(state.settings);
        renderView();
      }
    });
  });

  // Settings view listeners
  document.querySelectorAll('.setting-visible-cb').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const calId = cb.dataset.calId;
      let visibleIds = Array.isArray(state.settings.visibleGcalIds)
        ? [...state.settings.visibleGcalIds]
        : state.gcalCalendars.map(c => c.id);
      
      if (e.target.checked) {
        if (!visibleIds.includes(calId)) visibleIds.push(calId);
      } else {
        visibleIds = visibleIds.filter(id => id !== calId);
        // Also remove from activeGcalIds if hiding
        state.activeGcalIds = state.activeGcalIds.filter(id => id !== calId);
        state.settings.activeGcalIds = [...state.activeGcalIds];
      }
      
      state.settings.visibleGcalIds = visibleIds;
      await window.api.saveSettings(state.settings);
      
      showToast('Calendar visibility updated', 'success');
      renderSidebarGcals();
      await reloadGoogleEvents();
      updateCalendarEventsUI();
    });
  });

  // Settings: Default Creation Profile
  const defaultProfSelect = document.getElementById('settings-default-profile-select');
  if (defaultProfSelect) {
    defaultProfSelect.addEventListener('change', async (e) => {
      state.settings.defaultProfileId = e.target.value;
      await window.api.saveSettings(state.settings);
      showToast('Default creation profile updated', 'success');
    });
  }

  // Settings: Profiles Add
  const addProfileBtn = document.getElementById('add-profile-btn');
  if (addProfileBtn) {
    addProfileBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('new-profile-name');
      const name = nameInput.value.trim();
      if (!name) return showToast('Profile name required', 'error');
      
      const newProfile = { id: 'profile-' + generateId(), name, image: 'assets/profiles/personal.png' };
      state.profiles.push(newProfile);
      await window.api.saveProfiles(state.profiles);
      showToast('Profile added', 'success');
      renderView();
    });
  }

  // Settings: Profiles Edit
  document.querySelectorAll('.edit-profile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pId = btn.dataset.profileId;
      const profile = state.profiles.find(p => p.id === pId);
      if (!profile) return;
      
      const html = `
        <div style="padding:var(--sp-md);">
          <h2 style="font-size:16px;margin-bottom:16px;">Edit Profile</h2>
          <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-secondary);">Name</label>
          <input type="text" id="edit-profile-name" class="inbox-input" value="${escAttr(profile.name)}" style="width:100%;margin-bottom:12px;" />
          
          <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-secondary);">Upload Profile Image</label>
          <input type="file" id="edit-profile-image" accept="image/*" style="margin-bottom:16px;width:100%;font-size:12px;" />
          ${profile.image ? `<img src="${profile.image}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;margin-bottom:16px;display:block;">` : ''}

          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="modal-cancel-profile" style="padding:6px 16px;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--border);color:var(--text-primary);cursor:pointer;">Cancel</button>
            <button id="modal-save-profile" style="padding:6px 16px;border-radius:var(--radius-sm);background:var(--accent);color:white;border:none;cursor:pointer;">Save</button>
          </div>
        </div>
      `;
      openModal(html);
      
      let newImageBase64 = profile.image || null;
      document.getElementById('edit-profile-image').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            newImageBase64 = event.target.result;
          };
          reader.readAsDataURL(file);
        }
      });

      document.getElementById('modal-cancel-profile').addEventListener('click', closeModal);
      document.getElementById('modal-save-profile').addEventListener('click', async () => {
        profile.name = document.getElementById('edit-profile-name').value.trim() || profile.name;
        delete profile.icon;
        profile.image = newImageBase64;
        
        await window.api.saveProfiles(state.profiles);
        renderView();
        closeModal();
      });
    });
  });

  // Settings: Profiles Delete
  document.querySelectorAll('.delete-profile-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pId = btn.dataset.profileId;
      if (confirm('Delete this profile? (Tasks in this profile will become uncategorized in All)')) {
        state.profiles = state.profiles.filter(p => p.id !== pId);
        if (state.activeProfileId === pId) state.activeProfileId = 'all';
        state.settings.activeProfileId = state.activeProfileId;
        
        // Remove categories from projects that used this profile
        state.projects.forEach(p => {
          if (p.profileId === pId) p.profileId = null;
        });
        await window.api.saveProjects(state.projects);
        await window.api.saveSettings(state.settings);
        await window.api.saveProfiles(state.profiles);
        
        showToast('Profile deleted', 'success');
        setupModeSwitcher();
        renderSidebarProjects();
        renderView();
      }
    });
  });

  // Settings: Priority Flag Colors
  document.querySelectorAll('.setting-prio-color-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const p = e.target.dataset.priority;
      const color = e.target.value;
      if (!state.settings.priorityColors) state.settings.priorityColors = {};
      state.settings.priorityColors[p] = color;
      await window.api.saveSettings(state.settings);
      showToast(`Priority ${p} flag color updated to ${color}`, 'info');
      renderView();
    });
  });

  // Settings: Sync with Cloud Now
  const settingsSyncBtn = document.getElementById('settings-sync-cloud-btn');
  if (settingsSyncBtn) {
    settingsSyncBtn.addEventListener('click', async () => {
      const originalHtml = settingsSyncBtn.innerHTML;
      settingsSyncBtn.innerHTML = '<img src="assets/icons/Refresh.png" alt="Sync" style="width:16px;height:16px;object-fit:contain;filter:brightness(10);animation:spin 0.8s linear infinite;" /> Syncing...';
      settingsSyncBtn.disabled = true;
      setSyncStatus('syncing');
      try {
        if (state.tasks) await window.api.saveTasks(state.tasks);
        if (state.projects) await window.api.saveProjects(state.projects);
        if (state.profiles) await window.api.saveProfiles(state.profiles);
        if (state.settings) await window.api.saveSettings(state.settings);
        const pushRes = await window.api.syncPush();
        if (pushRes && pushRes.error) throw new Error(pushRes.error);
        const pullRes = await window.api.syncPull();
        if (pullRes && pullRes.error) throw new Error(pullRes.error);
        await refreshDataFromStore();
        setSyncStatus('synced');
        showToast('Synced with Firebase Cloud!', 'success');
        renderView();
      } catch (err) {
        console.error('Settings cloud sync failed:', err);
        showToast('Sync failed: ' + err.message, 'error');
        setSyncStatus('offline');
      } finally {
        settingsSyncBtn.innerHTML = originalHtml;
        settingsSyncBtn.disabled = false;
      }
    });
  }

  // Settings: Export Backup
  const exportBtn = document.getElementById('export-backup-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tachotasks_backup_${getTodayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Settings: Import Backup
  const importFile = document.getElementById('import-backup-file');
  if (importFile) {
    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedState = JSON.parse(event.target.result);
          if (importedState && typeof importedState === 'object') {
            if (confirm('Are you sure you want to overwrite all local data with this backup?')) {
              state.tasks = importedState.tasks || [];
              state.projects = importedState.projects || [];
              state.settings = importedState.settings || {};
              state.profiles = importedState.profiles || [];
              state.archivedTasks = importedState.archivedTasks || [];
              
              await saveTasks();
              await window.api.saveProjects(state.projects);
              await window.api.saveSettings(state.settings);
              await window.api.saveProfiles(state.profiles);
              await saveArchivedTasks();
              
              showToast('Backup imported successfully');
              setTimeout(() => location.reload(), 1000);
            }
          } else {
            showToast('Invalid backup file', 'error');
          }
        } catch (err) {
          showToast('Error parsing backup', 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  // Render calendar events overlay after DOM paint
  if (state.currentView === 'calendar') {
    requestAnimationFrame(() => {
      // Double requestAnimationFrame ensures all layout/paint is done
      requestAnimationFrame(() => renderCalendarEvents());
    });
  }
}
