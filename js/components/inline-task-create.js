/**
 * inline-task-create.js
 * Inline section task creation interface.
 */

/**
 * Close any active quick dropdowns
 */
function closeAllQuickPopovers() {
  if (window.closeDateSelector) window.closeDateSelector();
  closeQuickPrioritySelector();
  const locDrop = document.getElementById('qc-loc-dropdown');
  if (locDrop) locDrop.remove();
}

function closeQuickPrioritySelector() {
  const existing = document.getElementById('inline-prio-dropdown');
  if (existing) existing.remove();
}

/**
 * Priority Dropdown Selector matching user icons
 */
function showQuickPrioritySelector(anchorEl, currentPriority, onSelect) {
  closeQuickPrioritySelector();
  if (window.closeDateSelector) window.closeDateSelector();
  const locDrop = document.getElementById('qc-loc-dropdown');
  if (locDrop) locDrop.remove();

  const rect = anchorEl.getBoundingClientRect();
  const dropdown = document.createElement('div');
  dropdown.id = 'inline-prio-dropdown';
  Object.assign(dropdown.style, {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    background: '#1e1e20',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    zIndex: '10001',
    minWidth: '150px',
    padding: '4px 0',
    fontSize: '13px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#eee',
    userSelect: 'none'
  });

  const priorities = [
    { id: 'P1', name: 'Priority 1', flagSrc: 'assets/icons/Flag filled.png', flagClass: 'flag-color-red', checkColor: '#ff5c5c' },
    { id: 'P2', name: 'Priority 2', flagSrc: 'assets/icons/Flag filled.png', flagClass: 'flag-color-orange', checkColor: '#ffa502' },
    { id: 'P3', name: 'Priority 3', flagSrc: 'assets/icons/Flag filled.png', flagClass: 'flag-color-blue', checkColor: '#1e90ff' },
    { id: 'P4', name: 'Priority 4', flagSrc: 'assets/icons/Flag.png', flagClass: 'flag-color-slate', checkColor: '#888' }
  ];

  let itemsHtml = '';
  priorities.forEach(p => {
    const isSel = (currentPriority || 'P4') === p.id;
    itemsHtml += `
      <div class="prio-drop-opt" data-prio="${p.id}" style="padding:7px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;background:${isSel ? 'rgba(255,255,255,0.06)' : 'transparent'};">
        <span class="${p.flagClass}" style="display:inline-flex;align-items:center;">
          <img src="${p.flagSrc}" alt="${p.id}" style="width:16px;height:16px;object-fit:contain;" />
        </span>
        <span style="flex:1;font-weight:500;">${p.name}</span>
        ${isSel ? `<span style="color:${p.checkColor};font-weight:bold;font-size:13px;">✓</span>` : ''}
      </div>
    `;
  });

  dropdown.innerHTML = itemsHtml;
  document.body.appendChild(dropdown);

  dropdown.querySelectorAll('.prio-drop-opt').forEach(opt => {
    opt.addEventListener('mouseenter', () => opt.style.background = 'rgba(255,255,255,0.1)');
    opt.addEventListener('mouseleave', () => {
      const isSel = (currentPriority || 'P4') === opt.dataset.prio;
      opt.style.background = isSel ? 'rgba(255,255,255,0.06)' : 'transparent';
    });
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const prio = opt.dataset.prio;
      onSelect(prio === 'P4' ? null : prio);
      dropdown.remove();
    });
  });

  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && !anchorEl.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 10);
}

/**
 * Inline Task Creator inside a section container (matches user photo with direct keyword highlight box)
 */
function openInlineTaskCreate(triggerBtn, initialData = {}) {
  closeAllQuickPopovers();

  // If an inline create card is already open in another section, close it first
  document.querySelectorAll('.inline-section-create-card').forEach(el => {
    const prevBtn = el.previousElementSibling || el.nextElementSibling;
    if (prevBtn && prevBtn.classList.contains('add-task-inline-btn')) {
      prevBtn.style.display = '';
    }
    el.remove();
  });

  const secId = (initialData && initialData.sectionId) !== undefined ? initialData.sectionId : (triggerBtn ? triggerBtn.dataset.addTaskSection : null);
  let targetSectionId = secId === 'unsectioned' ? null : secId;
  let targetProjectId = (initialData && initialData.projectId) !== undefined ? initialData.projectId : (state.filterProject || null);
  let targetProfileId = (initialData && initialData.profileId) !== undefined ? initialData.profileId : getActiveProfileId();

  // Parse initial text if any
  const initRaw = (initialData && initialData.title) || '';
  const initParsed = parseTaskInputTokens(initRaw);

  let inlineState = {
    rawText: initRaw,
    cleanTitle: initParsed.cleanTitle || initRaw,
    dueDate: initParsed.dueDate || (initialData && initialData.dueDate) || null,
    dueTime: initParsed.dueTime || (initialData && initialData.dueTime) || null,
    priority: initParsed.priority || (initialData && initialData.priority) || null,
    recurring: initParsed.recurring || (initialData && initialData.recurring) || null,
    tags: initParsed.tags.length > 0 ? initParsed.tags : ((initialData && initialData.tags) ? [...initialData.tags] : []),
    projectId: targetProjectId,
    sectionId: targetSectionId,
    profileId: targetProfileId,
    dismissedTokens: [],
    activeTokens: initParsed.tokens || []
  };

  function getLocationInfo() {
    if (inlineState.projectId) {
      const proj = state.projects.find(p => p.id === inlineState.projectId);
      if (proj) {
        const sec = (state.settings && state.settings.projectSections || []).find(s => s.id === inlineState.sectionId);
        return {
          iconHtml: `<span style="color:${proj.color || '#5cb8ff'};font-size:11px;">●</span>`,
          text: proj.name + (sec ? ` / ${sec.name}` : '')
        };
      }
    }
    const prof = (state.profiles || []).find(p => p.id === inlineState.profileId) || { name: 'Personal' };
    const sec = (state.settings && state.settings.taskSections || []).find(s => s.id === inlineState.sectionId);
    return {
      iconHtml: `<img src="assets/icons/Task.png" alt="Loc" style="width:14px;height:14px;object-fit:contain;opacity:0.8;" />`,
      text: prof.name + (sec ? ` / ${sec.name}` : '')
    };
  }

  function getDateChipLabel(dateStr, timeStr) {
    if (!dateStr) return 'Date';
    const todayStr = toISODate(new Date());
    const d = new Date(todayStr + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const tmrStr = toISODate(d);

    let base = formatDateShort(dateStr);
    if (dateStr === todayStr) base = 'Today';
    else if (dateStr === tmrStr) base = 'Tomorrow';

    if (timeStr) base += ' ' + formatTime12(timeStr);
    return base;
  }

  const locInfo = getLocationInfo();

  const inlineCard = document.createElement('div');
  inlineCard.className = 'inline-section-create-card';
  inlineCard.innerHTML = `
    <div class="inline-create-input" id="inline-create-input" contenteditable="true" spellcheck="false" data-placeholder="Task name">${initParsed.highlightHtml || escHtml(initRaw)}</div>
    
    <div class="inline-create-row">
      <div class="inline-create-location-pill" id="inline-loc-pill" title="Click to change project / section">
        ${locInfo.iconHtml}
        <span id="inline-loc-text">${escHtml(locInfo.text)}</span>
      </div>
      <div class="inline-create-date-btn ${inlineState.dueDate ? 'has-date' : ''}" id="inline-date-btn" title="Set date">
        <img src="assets/icons/Calendar.png" alt="Calendar" style="width:14px;height:14px;object-fit:contain;" />
        <span id="inline-date-label">${escHtml(getDateChipLabel(inlineState.dueDate, inlineState.dueTime))}</span>
        ${inlineState.dueDate ? '<span class="chip-close" id="inline-date-clear" style="margin-left:4px;display:inline-flex;align-items:center;"><img src="assets/icons/Cross.png" alt="Clear" style="width:10px;height:10px;object-fit:contain;opacity:0.7;" /></span>' : ''}
      </div>
      <div id="inline-extra-chips" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"></div>
      <button class="inline-create-plus-btn" id="inline-expand-btn" title="Open full task editor">+</button>
    </div>

    <div class="inline-create-actions">
      <button class="inline-create-cancel-btn" id="inline-cancel-btn" title="Cancel">
        <img src="assets/icons/Cross.png" alt="Cancel" style="width:14px;height:14px;object-fit:contain;" />
      </button>
      <button class="inline-create-submit-btn" id="inline-submit-btn" title="Add task">
        <img src="assets/icons/Submit.png" alt="Submit" style="width:16px;height:16px;object-fit:contain;" />
      </button>
    </div>
  `;

  if (triggerBtn) {
    triggerBtn.style.display = 'none';
    triggerBtn.parentNode.insertBefore(inlineCard, triggerBtn);
  }

  const inputEl = inlineCard.querySelector('.inline-create-input');

  if (inputEl) {
    inputEl.focus();
    restoreCaretOffset(inputEl, inputEl.innerText.length);
  }

  function updateDateButton() {
    const dateBtn = inlineCard.querySelector('#inline-date-btn');
    const dateLabel = inlineCard.querySelector('#inline-date-label');
    if (!dateBtn || !dateLabel) return;

    if (inlineState.dueDate) {
      dateBtn.classList.add('has-date');
      dateLabel.textContent = getDateChipLabel(inlineState.dueDate, inlineState.dueTime);
      if (!dateBtn.querySelector('#inline-date-clear')) {
        const clearSpan = document.createElement('span');
        clearSpan.id = 'inline-date-clear';
        clearSpan.className = 'chip-close';
        clearSpan.style.cssText = 'margin-left:4px;opacity:0.7;font-size:12px;cursor:pointer;';
        clearSpan.textContent = '✕';
        dateBtn.appendChild(clearSpan);
        clearSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          inlineState.dueDate = null;
          inlineState.dueTime = null;
          updateDateButton();
        });
      }
    } else {
      dateBtn.classList.remove('has-date');
      dateLabel.textContent = 'Date';
      const clearSpan = dateBtn.querySelector('#inline-date-clear');
      if (clearSpan) clearSpan.remove();
    }
  }

  function updateExtraChips() {
    const container = inlineCard.querySelector('#inline-extra-chips');
    if (!container) return;
    let chipsHtml = '';

    if (inlineState.recurring) {
      const rVal = inlineState.recurring;
      const recurText = rVal === 'daily' ? 'Daily' : (rVal === 'weekly' ? 'Weekly' : (rVal === 'monthly' ? 'Monthly' : (rVal === 'yearly' ? 'Yearly' : (rVal === 'weekdays' ? 'Weekdays' : rVal))));
      chipsHtml += `
        <div class="inline-create-prio-chip" id="inline-repeat-chip" style="background:rgba(165,94,234,0.18);border:1px solid rgba(165,94,234,0.4);color:#c56cf0;" title="Repeats: ${escAttr(recurText)}">
          <span style="display:inline-flex;align-items:center;">
            <img src="assets/icons/Repeat.png" alt="Repeat" style="width:14px;height:14px;object-fit:contain;" />
          </span>
          <span style="font-weight:600;">${escHtml(recurText)}</span>
          <span class="chip-close" id="inline-repeat-clear" style="margin-left:4px;opacity:0.7;font-size:12px;cursor:pointer;">✕</span>
        </div>
      `;
    }

    if (inlineState.priority && inlineState.priority !== 'P4') {
      const pColor = getPriorityColor(inlineState.priority);
      const colorClass = getPriorityColorClass(inlineState.priority);
      chipsHtml += `
        <div class="inline-create-prio-chip ${colorClass}" id="inline-prio-chip" title="Change priority">
          <span style="display:inline-flex;align-items:center;">
            <img src="${inlineState.priority === 'P4' ? 'assets/icons/Flag.png' : 'assets/icons/Flag filled.png'}" style="width:14px;height:14px;object-fit:contain;" />
          </span>
          <span style="color:${pColor};font-weight:600;">${inlineState.priority}</span>
          <span class="chip-close" id="inline-prio-clear" style="margin-left:4px;opacity:0.7;font-size:12px;">✕</span>
        </div>
      `;
    }

    if (inlineState.tags && inlineState.tags.length > 0) {
      inlineState.tags.forEach(t => {
        chipsHtml += `
          <div class="quick-create-chip tag-chip" style="padding:2px 8px;font-size:11px;" data-tag="${escAttr(t)}">
            <span>${escHtml(t)}</span>
            <span class="chip-close tag-remove-btn" data-tag="${escAttr(t)}">✕</span>
          </div>
        `;
      });
    }

    container.innerHTML = chipsHtml;

    const repeatClear = container.querySelector('#inline-repeat-clear');
    if (repeatClear) {
      repeatClear.addEventListener('click', (e) => {
        e.stopPropagation();
        inlineState.recurring = null;
        updateExtraChips();
      });
    }

    const prioChip = container.querySelector('#inline-prio-chip');
    if (prioChip) {
      prioChip.addEventListener('click', (e) => {
        if (e.target.id === 'inline-prio-clear') {
          e.stopPropagation();
          inlineState.priority = null;
          updateExtraChips();
          return;
        }
        e.stopPropagation();
        showQuickPrioritySelector(prioChip, inlineState.priority, (newPrio) => {
          inlineState.priority = newPrio;
          updateExtraChips();
        });
      });
    }

    container.querySelectorAll('.tag-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = btn.dataset.tag;
        inlineState.tags = inlineState.tags.filter(t => t !== tag);
        updateExtraChips();
      });
    });
  }

  updateExtraChips();

  // Date Button Click -> open Date Selector popover (and close other dropdowns)
  const dateBtn = inlineCard.querySelector('#inline-date-btn');
  if (dateBtn) {
    dateBtn.addEventListener('click', (e) => {
      if (e.target.id === 'inline-date-clear') return;
      e.stopPropagation();

      closeQuickPrioritySelector();
      const locDrop = document.getElementById('qc-loc-dropdown');
      if (locDrop) locDrop.remove();

      showDateSelector({
        targetElement: dateBtn,
        initialDate: inlineState.dueDate,
        initialTime: inlineState.dueTime,
        onSelect: ({ date, time }) => {
          inlineState.dueDate = date || null;
          inlineState.dueTime = time || null;
          updateDateButton();
        },
        onClear: () => {
          inlineState.dueDate = null;
          inlineState.dueTime = null;
          updateDateButton();
        }
      });
    });
  }

  // Location pill click -> open Location Selector (and close other dropdowns)
  const locPill = inlineCard.querySelector('#inline-loc-pill');
  if (locPill) {
    locPill.addEventListener('click', (e) => {
      e.stopPropagation();

      if (window.closeDateSelector) window.closeDateSelector();
      closeQuickPrioritySelector();

      showQuickLocationSelector(locPill, inlineState, (newProjId, newSecId, newProfId) => {
        inlineState.projectId = newProjId;
        inlineState.sectionId = newSecId;
        inlineState.profileId = newProfId;
        const updated = getLocationInfo();
        locPill.innerHTML = `${updated.iconHtml} <span id="inline-loc-text">${escHtml(updated.text)}</span>`;
      });
    });
  }

  // [+] Button -> Switch to full split modal editor
  const expandBtn = inlineCard.querySelector('#inline-expand-btn');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      closeAllQuickPopovers();
      const currentRaw = (inputEl ? inputEl.innerText.replace(/\u00A0/g, ' ').replace(/\r?\n|\r/g, ' ') : inlineState.rawText).trim();
      const currentTitle = inlineState.cleanTitle || currentRaw;
      closeInlineCreate();
      showTaskEditorModal(null, {
        title: currentTitle,
        dueDate: inlineState.dueDate,
        dueTime: inlineState.dueTime,
        priority: inlineState.priority,
        recurring: inlineState.recurring,
        tags: inlineState.tags,
        projectId: inlineState.projectId,
        sectionId: inlineState.sectionId,
        profileId: inlineState.profileId
      });
    });
  }

  // Real-time NLP parsing and highlight update with seamless TreeWalker caret preservation
  let isUpdating = false;
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      if (isUpdating) return;

      const rawText = inputEl.innerText.replace(/\u00A0/g, ' ').replace(/\r?\n|\r/g, ' ');
      inlineState.rawText = rawText;

      // Filter dismissed tokens so they remain active only while the text at that position matches
      if (inlineState.dismissedTokens && inlineState.dismissedTokens.length > 0) {
        inlineState.dismissedTokens = inlineState.dismissedTokens.filter(d => {
          const slice = rawText.substring(d.start, d.start + d.text.length);
          return slice.toLowerCase() === d.text.toLowerCase();
        });
      }

      const caret = getCaretOffset(inputEl);
      const parsedInfo = parseTaskInputTokens(rawText, inlineState.dismissedTokens);
      inlineState.activeTokens = parsedInfo.tokens || [];

      // State synchronization (reverts to default if keyword is deleted or dismissed)
      inlineState.cleanTitle = parsedInfo.cleanTitle;
      inlineState.dueDate = parsedInfo.dueDate;
      inlineState.dueTime = parsedInfo.dueTime;
      inlineState.priority = parsedInfo.priority;
      inlineState.recurring = parsedInfo.recurring;
      inlineState.tags = parsedInfo.tags;

      if (parsedInfo.projectName) {
        const matchedProj = state.projects.find(p => p.name.toLowerCase() === parsedInfo.projectName.toLowerCase());
        if (matchedProj) {
          inlineState.projectId = matchedProj.id;
          const updatedLoc = getLocationInfo();
          const locTextEl = inlineCard.querySelector('#inline-loc-text');
          if (locTextEl) locTextEl.textContent = updatedLoc.text;
        }
      }

      // Check if rendered highlight HTML changed
      const targetHtml = parsedInfo.highlightHtml || escHtml(rawText);
      if (inputEl.innerHTML !== targetHtml) {
        isUpdating = true;
        inputEl.innerHTML = targetHtml;
        restoreCaretOffset(inputEl, caret);
        isUpdating = false;
      }

      updateDateButton();
      updateExtraChips();
    });

    inputEl.addEventListener('keydown', async (e) => {
      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel && sel.isCollapsed && inlineState.activeTokens && inlineState.activeTokens.length > 0) {
          const caret = getCaretOffset(inputEl);
          // Check if cursor is right after an active bubble token, or anywhere inside it
          const targetToken = inlineState.activeTokens.find(t => caret === t.end || (caret > t.start && caret <= t.end));
          if (targetToken) {
            e.preventDefault();
            if (!inlineState.dismissedTokens) inlineState.dismissedTokens = [];
            inlineState.dismissedTokens.push({
              start: targetToken.start,
              end: targetToken.end,
              text: targetToken.text
            });

            const rawText = inputEl.innerText.replace(/\u00A0/g, ' ').replace(/\r?\n|\r/g, ' ');
            const parsedInfo = parseTaskInputTokens(rawText, inlineState.dismissedTokens);
            inlineState.activeTokens = parsedInfo.tokens || [];

            inlineState.cleanTitle = parsedInfo.cleanTitle;
            inlineState.dueDate = parsedInfo.dueDate;
            inlineState.dueTime = parsedInfo.dueTime;
            inlineState.priority = parsedInfo.priority;
            inlineState.recurring = parsedInfo.recurring;
            inlineState.tags = parsedInfo.tags;

            isUpdating = true;
            inputEl.innerHTML = parsedInfo.highlightHtml || escHtml(rawText);
            restoreCaretOffset(inputEl, caret);
            isUpdating = false;

            updateDateButton();
            updateExtraChips();
            return;
          }
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        await submitInlineTask();
      } else if (e.key === 'Escape') {
        closeAllQuickPopovers();
        closeInlineCreate();
      }
    });
  }

  function closeInlineCreate() {
    closeAllQuickPopovers();
    inlineCard.remove();
    if (triggerBtn) triggerBtn.style.display = '';
  }

  const cancelBtn = inlineCard.querySelector('#inline-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeInlineCreate);

  const submitBtn = inlineCard.querySelector('#inline-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      await submitInlineTask();
    });
  }

  async function submitInlineTask() {
    const raw = (inputEl ? inputEl.innerText.replace(/\u00A0/g, ' ').replace(/\r?\n|\r/g, ' ') : inlineState.rawText).trim();
    if (!raw) {
      showToast('Task name is required', 'error');
      return;
    }

    const parsed = typeof parseTaskInputTokens === 'function' ? parseTaskInputTokens(raw, inlineState.dismissedTokens) : { cleanTitle: raw };
    const title = inlineState.cleanTitle || parsed.cleanTitle || raw;

    const nowIso = new Date().toISOString();
    const newTask = {
      id: generateId(),
      title: title,
      description: '',
      priority: inlineState.priority || 'P4',
      tags: inlineState.tags || [],
      projectId: inlineState.projectId || null,
      sectionId: inlineState.sectionId || null,
      parentTaskId: null,
      dueDate: inlineState.dueDate || null,
      dueTime: inlineState.dueTime || null,
      recurring: inlineState.recurring || null,
      completed: false,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      profileId: inlineState.profileId || getActiveProfileId()
    };

    state.tasks.push(newTask);
    await saveTasks();
    closeInlineCreate();
    renderView();
    if (typeof renderSidebarTags === 'function') renderSidebarTags();
    showToast('Task created!', 'success');
  }
}

/**
 * Inline Task Creator inside a flat list
 */
function openInlineTaskListCreate(containerEl, initialData = {}) {
  const existing = containerEl.querySelector('.inline-section-create-card');
  if (existing) { existing.remove(); return; }

  const dummyBtn = document.createElement('div');
  containerEl.insertBefore(dummyBtn, containerEl.firstChild);
  openInlineTaskCreate(dummyBtn, initialData);
  dummyBtn.remove();
}

/**
 * Dropdown helper to pick project / profile / section
 */
function showQuickLocationSelector(anchorEl, currentState, onSelect) {
  const existing = document.getElementById('qc-loc-dropdown');
  if (existing) { existing.remove(); return; }

  const rect = anchorEl.getBoundingClientRect();
  const dropdown = document.createElement('div');
  dropdown.id = 'qc-loc-dropdown';
  Object.assign(dropdown.style, {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    background: '#1c1c1e',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    boxShadow: '0 12px 30px rgba(0,0,0,0.7)',
    zIndex: '10000',
    minWidth: '220px',
    maxHeight: '260px',
    overflowY: 'auto',
    padding: '6px 0',
    fontSize: '12px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#eee'
  });

  let itemsHtml = `
    <div style="padding:4px 12px;font-size:11px;color:var(--text-tertiary);font-weight:600;text-transform:uppercase;">Profiles</div>
  `;

  (state.profiles || []).filter(p => p.id !== 'all').forEach(prof => {
    const isSel = !currentState.projectId && currentState.profileId === prof.id;
    itemsHtml += `
      <div class="qc-loc-opt" data-type="profile" data-id="${prof.id}" style="padding:6px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;background:${isSel ? 'rgba(255,255,255,0.08)' : 'transparent'};">
        <img src="assets/icons/Task.png" style="width:14px;height:14px;opacity:0.8;" />
        <span style="flex:1;">${escHtml(prof.name)}</span>
        ${isSel ? '<span style="color:var(--accent);">✓</span>' : ''}
      </div>
    `;
  });

  const activeProjs = (state.projects || []).filter(p => !p.archived);
  if (activeProjs.length > 0) {
    itemsHtml += `<div style="padding:8px 12px 4px 12px;font-size:11px;color:var(--text-tertiary);font-weight:600;text-transform:uppercase;">Projects</div>`;
    activeProjs.forEach(proj => {
      const isSel = currentState.projectId === proj.id;
      itemsHtml += `
        <div class="qc-loc-opt" data-type="project" data-id="${proj.id}" style="padding:6px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;background:${isSel ? 'rgba(255,255,255,0.08)' : 'transparent'};">
          <span style="color:${proj.color || '#5cb8ff'};font-size:10px;">●</span>
          <span style="flex:1;">${escHtml(proj.name)}</span>
          ${isSel ? '<span style="color:var(--accent);">✓</span>' : ''}
        </div>
      `;
    });
  }

  dropdown.innerHTML = itemsHtml;
  document.body.appendChild(dropdown);

  dropdown.querySelectorAll('.qc-loc-opt').forEach(opt => {
    opt.addEventListener('mouseenter', () => opt.style.background = 'rgba(255,255,255,0.12)');
    opt.addEventListener('mouseleave', () => opt.style.background = 'transparent');
    opt.addEventListener('click', () => {
      const type = opt.dataset.type;
      const id = opt.dataset.id;
      if (type === 'project') {
        onSelect(id, null, null);
      } else {
        onSelect(null, null, id);
      }
      dropdown.remove();
    });
  });

  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && !anchorEl.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 10);
}
