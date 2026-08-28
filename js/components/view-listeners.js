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
      
      const card = btn.closest('.dashboard-card');
      if (card) card.classList.toggle('is-collapsed', isCollapsed);
      
      await window.api.saveSettings(state.settings);
    });
  });

  const upcomingRangeBtn = document.getElementById('dash-upcoming-range-btn');
  const upcomingRangePanel = document.getElementById('dash-upcoming-range-panel');
  if (upcomingRangeBtn && upcomingRangePanel) {
    upcomingRangeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      upcomingRangePanel.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!upcomingRangePanel.contains(e.target) && e.target !== upcomingRangeBtn) {
        upcomingRangePanel.classList.add('hidden');
      }
    });

    upcomingRangePanel.querySelectorAll('[data-dash-range]').forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        state.dashboardUpcomingRange = opt.dataset.dashRange;
        if (!state.settings) state.settings = {};
        state.settings.dashboardUpcomingRange = state.dashboardUpcomingRange;
        await window.api.saveSettings(state.settings);
        persistUIState();
        renderView();
      });
    });
  }

  // Dashboard Splitter Drag Resizing
  const dashSplitter = document.getElementById('dashboard-splitter');
  const dashGrid = document.getElementById('dashboard-grid');
  if (dashSplitter && dashGrid) {
    let isDragging = false;
    let startX = 0;
    const minColumnPx = 280;

    const calculateClampedPercent = (clientX) => {
      const rect = dashGrid.getBoundingClientRect();
      if (rect.width <= 0) return 50;
      const minP = Math.max(25, (minColumnPx / rect.width) * 100);
      const maxP = Math.min(75, 100 - (minColumnPx / rect.width) * 100);
      const effectiveMin = Math.min(minP, maxP);
      const effectiveMax = Math.max(minP, maxP);

      const offsetX = clientX - rect.left;
      let percent = Math.round((offsetX / rect.width) * 100);
      return Math.max(effectiveMin, Math.min(effectiveMax, percent));
    };

    const startDrag = (clientX) => {
      isDragging = true;
      startX = clientX;
      dashSplitter.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const moveDrag = (clientX) => {
      if (!isDragging) return;
      const percent = calculateClampedPercent(clientX);
      dashGrid.style.setProperty('--dash-split-left', `${percent}%`);
      dashGrid.style.setProperty('--dash-split-right', `${100 - percent}%`);
    };

    const stopDrag = async (clientX) => {
      if (!isDragging) return;
      isDragging = false;
      dashSplitter.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const percent = calculateClampedPercent(clientX);
      if (!state.settings) state.settings = {};
      state.settings.dashboardSplitRatio = percent;
      await window.api.saveSettings(state.settings);
    };

    dashSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientX);
    });

    dashSplitter.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        startDrag(e.touches[0].clientX);
      }
    }, { passive: true });

    const handleMouseMove = (e) => {
      if (isDragging) moveDrag(e.clientX);
    };

    const handleTouchMove = (e) => {
      if (isDragging && e.touches && e.touches.length > 0) {
        moveDrag(e.touches[0].clientX);
      }
    };

    const handleMouseUp = (e) => {
      if (isDragging) stopDrag(e.clientX);
    };

    const handleTouchEnd = (e) => {
      if (isDragging) {
        const clientX = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientX : startX;
        stopDrag(clientX);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);
  }

  // Dashboard Widget Drag & Drop Reordering
  const dashCards = document.querySelectorAll('.dashboard-card[data-widget-id]');
  const dashColumns = document.querySelectorAll('.dashboard-widget-column');
  if (dashCards.length > 0) {
    let draggedWidgetId = null;

    dashCards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        if (e.target.closest('button, select, input, a, .itinerary-item, .sort-dropdown-panel, .sort-dropdown-btn')) {
          e.preventDefault();
          return;
        }
        draggedWidgetId = card.dataset.widgetId;
        card.classList.add('widget-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/dash-widget', draggedWidgetId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('widget-dragging');
        draggedWidgetId = null;
        document.querySelectorAll('.dashboard-card').forEach(c => {
          c.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        document.querySelectorAll('.dashboard-widget-column').forEach(col => {
          col.classList.remove('drag-over-column');
        });
      });

      card.addEventListener('dragover', (e) => {
        if (!draggedWidgetId || draggedWidgetId === card.dataset.widgetId) return;
        e.preventDefault();
        e.stopPropagation();

        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          card.classList.add('drag-over-top');
          card.classList.remove('drag-over-bottom');
        } else {
          card.classList.add('drag-over-bottom');
          card.classList.remove('drag-over-top');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      card.addEventListener('drop', async (e) => {
        if (!draggedWidgetId || draggedWidgetId === card.dataset.widgetId) return;
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over-top', 'drag-over-bottom');

        const targetWidgetId = card.dataset.widgetId;
        const rect = card.getBoundingClientRect();
        const insertBefore = e.clientY < (rect.top + rect.height / 2);

        const knownWidgets = ['upcoming-tasks', 'daily-tasks', 'todays-schedule', 'birthdays'];
        let layout = state.settings.dashboardLayout || {};
        let left = Array.isArray(layout.left) ? [...layout.left].filter(id => knownWidgets.includes(id)) : ['upcoming-tasks', 'daily-tasks'];
        let right = Array.isArray(layout.right) ? [...layout.right].filter(id => knownWidgets.includes(id)) : ['todays-schedule', 'birthdays'];

        const placed = new Set([...left, ...right]);
        knownWidgets.forEach(id => {
          if (!placed.has(id)) {
            if (id === 'upcoming-tasks' || id === 'daily-tasks') left.push(id);
            else right.push(id);
          }
        });

        const sourceCol = left.includes(draggedWidgetId) ? 'left' : 'right';
        const targetCol = left.includes(targetWidgetId) ? 'left' : 'right';

        if (sourceCol === targetCol) {
          // Within same column: Swap / Switch positions
          const list = sourceCol === 'left' ? left : right;
          const fromIdx = list.indexOf(draggedWidgetId);
          const toIdx = list.indexOf(targetWidgetId);
          if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
            const [moved] = list.splice(fromIdx, 1);
            list.splice(toIdx, 0, moved);
          }
        } else {
          // Across columns
          const srcList = sourceCol === 'left' ? left : right;
          const destList = targetCol === 'left' ? left : right;
          const fromIdx = srcList.indexOf(draggedWidgetId);
          const toIdx = destList.indexOf(targetWidgetId);
          if (fromIdx !== -1) {
            const [moved] = srcList.splice(fromIdx, 1);
            if (toIdx !== -1) {
              const destIdx = insertBefore ? toIdx : toIdx + 1;
              destList.splice(destIdx, 0, moved);
            } else {
              destList.push(moved);
            }
          }
        }

        if (!state.settings) state.settings = {};
        state.settings.dashboardLayout = { left, right };
        await window.api.saveSettings(state.settings);
        renderView();
      });
    });

    dashColumns.forEach(col => {
      col.addEventListener('dragover', (e) => {
        if (!draggedWidgetId) return;
        e.preventDefault();
        col.classList.add('drag-over-column');
      });

      col.addEventListener('dragleave', (e) => {
        if (!col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over-column');
        }
      });

      col.addEventListener('drop', async (e) => {
        if (!draggedWidgetId) return;
        if (e.defaultPrevented) return;
        e.preventDefault();
        col.classList.remove('drag-over-column');

        const targetColumn = col.dataset.dashColumn || 'left';
        const knownWidgets = ['upcoming-tasks', 'daily-tasks', 'todays-schedule', 'birthdays'];
        let layout = state.settings.dashboardLayout || {};
        let left = Array.isArray(layout.left) ? [...layout.left].filter(id => knownWidgets.includes(id)) : ['upcoming-tasks', 'daily-tasks'];
        let right = Array.isArray(layout.right) ? [...layout.right].filter(id => knownWidgets.includes(id)) : ['todays-schedule', 'birthdays'];

        const placed = new Set([...left, ...right]);
        knownWidgets.forEach(id => {
          if (!placed.has(id)) {
            if (id === 'upcoming-tasks' || id === 'daily-tasks') left.push(id);
            else right.push(id);
          }
        });

        const sourceCol = left.includes(draggedWidgetId) ? 'left' : 'right';
        const srcList = sourceCol === 'left' ? left : right;
        const destList = targetColumn === 'left' ? left : right;

        const fromIdx = srcList.indexOf(draggedWidgetId);
        if (fromIdx !== -1) {
          const [moved] = srcList.splice(fromIdx, 1);
          destList.push(moved);
        }

        if (!state.settings) state.settings = {};
        state.settings.dashboardLayout = { left, right };
        await window.api.saveSettings(state.settings);
        renderView();
      });
    });
  }

  // Dashboard Quick Sticky Note
  const quickNoteBtn = document.getElementById('dash-quick-note-btn');
  const stickyPopover = document.getElementById('dashboard-sticky-popover');
  const stickyTextarea = document.getElementById('dashboard-sticky-textarea');
  const stickyCloseBtn = document.getElementById('sticky-close-btn');
  const stickySaveIndicator = document.getElementById('sticky-save-indicator');
  const stickyHeader = stickyPopover ? stickyPopover.querySelector('.sticky-header') : null;

  if (quickNoteBtn && stickyPopover) {
    let saveTimeout = null;

    const setStickyPosition = (x, y) => {
      const popoverWidth = stickyPopover.offsetWidth || 320;
      const popoverHeight = stickyPopover.offsetHeight || 250;
      const clampedX = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, x));
      const clampedY = Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, y));
      stickyPopover.style.position = 'fixed';
      stickyPopover.style.left = clampedX + 'px';
      stickyPopover.style.top = clampedY + 'px';
      stickyPopover.style.right = 'auto';
      stickyPopover.style.bottom = 'auto';
      return { x: clampedX, y: clampedY };
    };

    const showSticky = () => {
      stickyPopover.classList.remove('hidden');
      const savedPos = state.settings && state.settings.quickNotePos;
      if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
        setStickyPosition(savedPos.x, savedPos.y);
      } else {
        const rect = quickNoteBtn.getBoundingClientRect();
        setStickyPosition(rect.left, rect.bottom + 8);
      }
      if (stickyTextarea) {
        stickyTextarea.focus();
        stickyTextarea.setSelectionRange(stickyTextarea.value.length, stickyTextarea.value.length);
      }
    };

    const hideSticky = () => {
      stickyPopover.classList.add('hidden');
    };

    quickNoteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (stickyPopover.classList.contains('hidden')) {
        showSticky();
      } else {
        hideSticky();
      }
    });

    if (stickyCloseBtn) {
      stickyCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideSticky();
      });
    }

    stickyPopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Make Sticky Note Draggable via Header
    if (stickyHeader) {
      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      const onDragStart = (clientX, clientY) => {
        isDragging = true;
        stickyHeader.classList.add('is-dragging');
        const rect = stickyPopover.getBoundingClientRect();
        startX = clientX;
        startY = clientY;
        initialLeft = rect.left;
        initialTop = rect.top;
      };

      const onDragMove = (clientX, clientY) => {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        setStickyPosition(initialLeft + dx, initialTop + dy);
      };

      const onDragEnd = async () => {
        if (!isDragging) return;
        isDragging = false;
        stickyHeader.classList.remove('is-dragging');
        const rect = stickyPopover.getBoundingClientRect();
        if (!state.settings) state.settings = {};
        state.settings.quickNotePos = { x: rect.left, y: rect.top };
        await window.api.saveSettings(state.settings);
      };

      stickyHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, select, textarea')) return;
        onDragStart(e.clientX, e.clientY);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDragging) {
          e.preventDefault();
          onDragMove(e.clientX, e.clientY);
        }
      });

      window.addEventListener('mouseup', onDragEnd);

      stickyHeader.addEventListener('touchstart', (e) => {
        if (e.target.closest('button, input, select, textarea')) return;
        if (e.touches && e.touches.length > 0) {
          onDragStart(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches && e.touches.length > 0) {
          onDragMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      window.addEventListener('touchend', onDragEnd);
    }

    if (stickyTextarea) {
      stickyTextarea.addEventListener('input', () => {
        if (stickySaveIndicator) stickySaveIndicator.textContent = 'Saving...';
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          if (!state.settings) state.settings = {};
          if (!state.settings.quickNote || typeof state.settings.quickNote !== 'object') {
            state.settings.quickNote = { text: '', color: 'yellow' };
          }
          state.settings.quickNote.text = stickyTextarea.value;
          state.settings.quickNote.updatedAt = new Date().toISOString();
          await window.api.saveSettings(state.settings);
          if (stickySaveIndicator) stickySaveIndicator.textContent = 'Saved ✓';
        }, 300);
      });
    }

    document.querySelectorAll('.sticky-color-dot').forEach(dot => {
      dot.addEventListener('click', async (e) => {
        e.stopPropagation();
        const color = dot.dataset.noteColor;
        if (!color) return;

        document.querySelectorAll('.sticky-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');

        ['yellow', 'blue', 'green', 'dark'].forEach(c => {
          stickyPopover.classList.remove('theme-' + c);
        });
        stickyPopover.classList.add('theme-' + color);

        if (!state.settings) state.settings = {};
        if (!state.settings.quickNote || typeof state.settings.quickNote !== 'object') {
          state.settings.quickNote = { text: '', color: 'yellow' };
        }
        state.settings.quickNote.color = color;
        await window.api.saveSettings(state.settings);
      });
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
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (state.currentView === 'project' && state.filterProject) {
        showTaskModal(null, { projectId: state.filterProject });
      } else {
        showTaskModal(null);
      }
    });
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

  // Project Options Menu (Header button and right-click)
  document.querySelectorAll('.project-options-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      openProjectContextMenu(rect.left, rect.bottom + 4, btn.dataset.projectId);
    });
  });

  document.querySelectorAll('.project-header-bar').forEach(header => {
    header.addEventListener('contextmenu', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      e.preventDefault();
      openProjectContextMenu(e.clientX, e.clientY, header.dataset.projectId);
    });
  });

  // Restore archived project
  document.querySelectorAll('.unarchive-proj-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const projId = btn.dataset.projectId;
      const proj = state.projects.find(p => p.id === projId);
      if (proj) {
        proj.archived = false;
        delete proj.archivedAt;
        await window.api.saveProjects(state.projects);
        showToast(`Project "${proj.name}" restored`, 'success');
        renderSidebarProjects();
        renderView();
      }
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
