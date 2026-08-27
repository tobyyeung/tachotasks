/**
 * task-modal.js
 * Task creation & editing interface:
 * 1. Inline Section Task Creator (matches screenshot inside section containers with live NLP token highlight boxes) when adding a new task.
 * 2. Full Task Editor Modal (Split-pane detailed editor) when editing an existing task or clicking [+] expand.
 */

function toISODate(d) {
  if (!d) return null;
  const dt = new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Natural language token parser & highlight generator
 */
function parseTaskInputTokens(text, dismissedTokens = []) {
  if (!text) {
    return {
      cleanTitle: '',
      dueDate: null,
      dueTime: null,
      priority: null,
      tags: [],
      projectName: null,
      highlightHtml: '',
      tokens: []
    };
  }

  const isDismissed = (start, end, tokenText) => {
    if (!dismissedTokens || dismissedTokens.length === 0) return false;
    return dismissedTokens.some(d => {
      return d.start === start && d.text.toLowerCase() === tokenText.toLowerCase();
    });
  };

  const tokens = [];
  const today = new Date();

  // 1. Priority: \b(p[1-4])\b or !!! or !!
  let m;
  const prioRegex = /\b(p[1-4])\b/gi;
  while ((m = prioRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'prio',
        value: m[1].toUpperCase(),
        text: m[0]
      });
    }
  }

  const exclRegex = /(!{2,3})/g;
  while ((m = exclRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'prio',
        value: m[0].length === 3 ? 'P1' : 'P2',
        text: m[0]
      });
    }
  }

  // 2. Tags: @\w+
  const tagRegex = /@(\w+)/g;
  while ((m = tagRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'tag',
        value: '@' + m[1],
        text: m[0]
      });
    }
  }

  // 3. Project: #\w+
  const projRegex = /#(\w+)/g;
  while ((m = projRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'project',
        value: m[1],
        text: m[0]
      });
    }
  }

  // 4. Dates:
  // "today", "tod"
  const todayRegex = /\b(today|tod)\b/gi;
  while ((m = todayRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'date',
        value: toISODate(today),
        text: m[0]
      });
    }
  }

  // "tomorrow", "tmr", "tmrw"
  const tmrRegex = /\b(tomorrow|tmr|tmrw)\b/gi;
  while ((m = tmrRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'date',
        value: toISODate(d),
        text: m[0]
      });
    }
  }

  // "yesterday"
  const yestRegex = /\b(yesterday)\b/gi;
  while ((m = yestRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'date',
        value: toISODate(d),
        text: m[0]
      });
    }
  }

  // "in X days" / "in X weeks" / "in a week"
  const inDaysRegex = /\bin\s+(?:(\d+)\s+(days?|weeks?)|a\s+week)\b/gi;
  while ((m = inDaysRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const d = new Date(today);
      if (m[0].toLowerCase().includes('week')) {
        const numWeeks = m[1] ? parseInt(m[1], 10) : 1;
        d.setDate(d.getDate() + numWeeks * 7);
      } else if (m[1]) {
        d.setDate(d.getDate() + parseInt(m[1], 10));
      }
      tokens.push({
        start,
        end,
        type: 'date',
        value: toISODate(d),
        text: m[0]
      });
    }
  }

  // Month lookup map
  const monthMap = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };
  const monthNamesPattern = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec';

  // Month + Day: "sep 01", "sep 1", "sep1", "sep01", "sept 1st", "september 15", "Oct 03 2026", "jul 4th", etc.
  const monthDayRegex = new RegExp(`\\b(${monthNamesPattern})\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'gi');
  while ((m = monthDayRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const monthStr = m[1].toLowerCase();
      const monthIdx = monthMap[monthStr];
      const day = parseInt(m[2], 10);
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        const year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
        const d = new Date(year, monthIdx, day);
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (!m[3] && d < todayZero) {
          d.setFullYear(d.getFullYear() + 1);
        }
        tokens.push({
          start,
          end,
          type: 'date',
          value: toISODate(d),
          text: m[0]
        });
      }
    }
  }

  // Day + Month: "01 sep", "1 sep", "1sep", "01sep", "1st sep", "15th september", "3 oct 2026"
  const dayMonthRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${monthNamesPattern})(?:\\s*,?\\s*(\\d{4}))?\\b`, 'gi');
  while ((m = dayMonthRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const day = parseInt(m[1], 10);
      const monthStr = m[2].toLowerCase();
      const monthIdx = monthMap[monthStr];
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        const year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
        const d = new Date(year, monthIdx, day);
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (!m[3] && d < todayZero) {
          d.setFullYear(d.getFullYear() + 1);
        }
        tokens.push({
          start,
          end,
          type: 'date',
          value: toISODate(d),
          text: m[0]
        });
      }
    }
  }

  // Day names: "next friday", "friday", "fri", etc.
  const dayNamesFull = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayRegex = /\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/gi;
  while ((m = dayRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const isNext = m[0].toLowerCase().startsWith('next');
      const rawDay = m[1].toLowerCase();
      let targetDay = dayNamesFull.findIndex(d => d.startsWith(rawDay.slice(0, 3)));
      if (targetDay !== -1) {
        const d = new Date(today);
        let diff = targetDay - d.getDay();
        if (diff <= 0 || isNext) diff += (isNext && diff > 0 ? 0 : (diff <= 0 ? 7 : 0));
        d.setDate(d.getDate() + diff);
        tokens.push({
          start,
          end,
          type: 'date',
          value: toISODate(d),
          text: m[0]
        });
      }
    }
  }

  // 5. Times:
  // Format A: 3-4 digits followed by am/pm/a/p (e.g. "915pm", "915p", "915a", "915am", "1130p", "100p", "1200a")
  const compactTimeRegex = /\b(?:at\s+)?([1-9]|1[0-2])([0-5]\d)\s*(am|pm|a|p)\b/gi;
  while ((m = compactTimeRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const ampm = m[3].toLowerCase();
      if ((ampm === 'pm' || ampm === 'p') && h < 12) h += 12;
      if ((ampm === 'am' || ampm === 'a') && h === 12) h = 0;
      tokens.push({
        start,
        end,
        type: 'time',
        value: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        text: m[0]
      });
    }
  }

  // Format B: 1-2 digits with optional :MM followed by am/pm/a/p (e.g. "3pm", "3p", "3a", "9:15pm", "9:15p", "10:30am", "10:30a")
  const standardTimeRegex = /\b(?:at\s+)?([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm|a|p)\b/gi;
  while ((m = standardTimeRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      let h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const ampm = m[3].toLowerCase();
      if ((ampm === 'pm' || ampm === 'p') && h < 12) h += 12;
      if ((ampm === 'am' || ampm === 'a') && h === 12) h = 0;
      tokens.push({
        start,
        end,
        type: 'time',
        value: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        text: m[0]
      });
    }
  }

  // Format C: 24-hour time (e.g. "14:00", "09:15", "at 14:00")
  const militaryTimeRegex = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/gi;
  while ((m = militaryTimeRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      tokens.push({
        start,
        end,
        type: 'time',
        value: `${String(m[1]).padStart(2, '0')}:${String(m[2]).padStart(2, '0')}`,
        text: m[0]
      });
    }
  }

  // Sort tokens by start position
  tokens.sort((a, b) => a.start - b.start);

  // Filter overlapping tokens
  const nonOverlapping = [];
  let lastEnd = 0;
  for (const t of tokens) {
    if (t.start >= lastEnd) {
      nonOverlapping.push(t);
      lastEnd = t.end;
    }
  }

  // Build clean title and highlight HTML
  let highlightHtml = '';
  let cleanTitle = '';
  let currentIdx = 0;

  let finalDueDate = null;
  let finalDueTime = null;
  let finalPriority = null;
  const finalTags = [];
  let finalProjectName = null;

  for (const t of nonOverlapping) {
    if (t.start > currentIdx) {
      const normalPart = text.substring(currentIdx, t.start);
      highlightHtml += escHtml(normalPart);
      cleanTitle += normalPart;
    }

    let kwClass = 'kw-date';
    if (t.type === 'prio') {
      kwClass = 'kw-prio';
      finalPriority = t.value;
    } else if (t.type === 'date') {
      kwClass = 'kw-date';
      finalDueDate = t.value;
    } else if (t.type === 'time') {
      kwClass = 'kw-time';
      finalDueTime = t.value;
    } else if (t.type === 'tag') {
      kwClass = 'kw-tag';
      finalTags.push(t.value);
    } else if (t.type === 'project') {
      kwClass = 'kw-proj';
      finalProjectName = t.value;
    }

    highlightHtml += `<span class="nlp-highlight-match ${kwClass}" data-highlighted-match="true">${escHtml(t.text)}</span>`;
    currentIdx = t.end;
  }

  if (currentIdx < text.length) {
    const normalPart = text.substring(currentIdx);
    highlightHtml += escHtml(normalPart);
    cleanTitle += normalPart;
  }

  cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();

  // If a time was specified without an explicit date, default the due date to today
  if (finalDueTime && !finalDueDate) {
    finalDueDate = toISODate(today);
  }

  return {
    cleanTitle,
    dueDate: finalDueDate,
    dueTime: finalDueTime,
    priority: finalPriority,
    tags: finalTags,
    projectName: finalProjectName,
    highlightHtml,
    tokens: nonOverlapping
  };
}

/**
 * Caret helper for contenteditable using TreeWalker
 */
function getCaretOffset(element) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function restoreCaretOffset(element, offset) {
  element.focus();
  let charCount = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  let textNode = walker.nextNode();
  let lastNode = null;

  while (textNode) {
    lastNode = textNode;
    const nextCount = charCount + textNode.length;
    if (offset >= charCount && offset <= nextCount) {
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(textNode, offset - charCount);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    charCount = nextCount;
    textNode = walker.nextNode();
  }

  if (lastNode) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(lastNode, lastNode.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// Entry point router: routes to Inline Section Creator for new tasks, or Full Split Editor for existing tasks.
function showTaskModal(taskId, initialData = {}) {
  if (taskId) {
    showTaskEditorModal(taskId, initialData);
  } else {
    const inlineBtn = document.querySelector('.add-task-inline-btn');
    if (inlineBtn && state.currentView === 'tasks' && state.tasksViewMode !== 'list') {
      openInlineTaskCreate(inlineBtn, initialData);
    } else {
      const taskList = document.querySelector('.task-list');
      if (taskList) {
        openInlineTaskListCreate(taskList, initialData);
      } else {
        showTaskEditorModal(null, initialData);
      }
    }
  }
}

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
        ${inlineState.dueDate ? '<span class="chip-close" id="inline-date-clear" style="margin-left:4px;opacity:0.7;font-size:12px;">✕</span>' : ''}
      </div>
      <div id="inline-extra-chips" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"></div>
      <button class="inline-create-plus-btn" id="inline-expand-btn" title="Open full task editor">+</button>
    </div>

    <div class="inline-create-actions">
      <button class="inline-create-cancel-btn" id="inline-cancel-btn" title="Cancel">✕</button>
      <button class="inline-create-submit-btn" id="inline-submit-btn" title="Add task">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
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
      closeInlineCreate();
      showTaskEditorModal(null, {
        title: inlineState.cleanTitle || inlineState.rawText,
        dueDate: inlineState.dueDate,
        dueTime: inlineState.dueTime,
        priority: inlineState.priority,
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

    const title = inlineState.cleanTitle.trim() || raw;
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
      recurring: null,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
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

  if (state.projects && state.projects.length > 0) {
    itemsHtml += `<div style="padding:8px 12px 4px 12px;font-size:11px;color:var(--text-tertiary);font-weight:600;text-transform:uppercase;">Projects</div>`;
    state.projects.forEach(proj => {
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

/**
 * Full Split-Pane Task Editor Modal (used when editing existing tasks or clicking [+] expand)
 */
function showTaskEditorModal(taskId, initialData = {}) {
  let task = null;
  let isArchived = false;
  if (taskId) {
    task = state.tasks.find(t => t.id === taskId);
    if (!task) {
      task = state.archivedTasks.find(t => t.id === taskId);
      if (task) isArchived = true;
    }
  }
  const isNew = !task;
  const ro = isArchived ? 'disabled' : '';

  const activeProjId = task ? task.projectId : ((initialData && initialData.projectId) !== undefined ? initialData.projectId : (state.filterProject || null));
  const initialSectionId = (initialData && initialData.sectionId) !== undefined ? initialData.sectionId : (task ? task.sectionId : null);
  const locHtml = getTaskLocationHtml(task || { projectId: activeProjId, sectionId: initialSectionId });
  const defaultProfId = (state.settings && state.settings.defaultProfileId) || 'profile-personal';
  const profId = (task && task.profileId) || (initialData && initialData.profileId) || defaultProfId;
  const prof = (state.profiles || []).find(p => p.id === profId);
  const profName = prof ? prof.name : 'Personal';

  const projectOptions = state.projects.map(p =>
    `<option value="${p.id}" ${activeProjId === p.id ? 'selected' : ''}>📂 ${escHtml(p.name)}</option>`
  ).join('');

  const currentTags = task ? task.tags.join(', ') : ((initialData && initialData.tags) ? initialData.tags.join(', ') : '');
  const currentPriority = task ? (task.priority || 'P4') : ((initialData && initialData.priority) || 'P4');
  const currentTitle = task ? task.title : ((initialData && initialData.title) || '');
  const currentDueDate = task ? (task.dueDate || '') : ((initialData && initialData.dueDate) || '');
  const currentDueTime = task ? (task.dueTime || '') : ((initialData && initialData.dueTime) || '');
  const currentPlannedDate = task ? (task.plannedDate || '') : ((initialData && initialData.plannedDate) || '');
  const currentPlannedTime = task ? (task.plannedTime || '') : ((initialData && initialData.plannedTime) || '');

  // Format creation timestamp
  let createdText = 'New Task';
  if (task && task.createdAt) {
    try {
      const cDate = new Date(task.createdAt);
      createdText = 'Created ' + cDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + cDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (e) {
      createdText = 'Created recently';
    }
  }

  const html = `
    <div class="task-modal-split">
      <!-- Left Main Panel -->
      <div class="task-modal-left">
        <div class="task-modal-top-bar">
          <div class="task-breadcrumb">
            <span>${locHtml}</span>
          </div>
          <div class="task-top-actions">
            <div class="more-options-wrapper" style="position:relative;">
              <button class="task-action-btn" id="modal-more-options-btn" title="More options">•••</button>
              
              <!-- Options Dropdown Menu (•••) -->
              <div id="task-options-menu" class="task-options-menu hidden">
                <div class="task-options-header">${createdText}</div>
                <div class="task-options-divider"></div>
                ${!isNew ? `
                  <button class="task-options-item" id="opt-duplicate-btn">
                    <img src="assets/icons/Duplicate.png" alt="Duplicate" style="width:18px;height:18px;object-fit:contain;" />
                    Duplicate Task
                  </button>
                  <div class="task-options-divider"></div>
                  <button class="task-options-item danger" id="opt-delete-btn">
                    <img src="assets/icons/Trash.png" alt="Delete" style="width:18px;height:18px;object-fit:contain;" />
                    Delete Task
                  </button>
                ` : `<div style="padding:4px 14px;font-size:12px;color:var(--text-tertiary);">Save task to enable options</div>`}
              </div>
            </div>

            <button class="task-action-btn modal-close" id="modal-close-btn" title="Close">✕</button>
          </div>
        </div>

        <div class="task-title-row">
          <div class="task-circle-check" id="modal-toggle-check" title="Toggle completion">
            ${task && task.completed ? '✓' : ''}
          </div>
          <input class="task-title-input" id="modal-title" value="${escAttr(currentTitle)}" placeholder="Task name" autofocus ${ro} />
        </div>

        <div class="task-desc-container">
          <div class="task-desc-icon">
            <img src="assets/icons/Edit.png" alt="Desc" style="width:20px;height:20px;object-fit:contain;" />
          </div>
          <textarea class="task-desc-textarea" id="modal-desc" placeholder="Description" ${ro}>${task ? escHtml(task.description) : ''}</textarea>
        </div>
      </div>

      <!-- Right Metadata Sidebar -->
      <div class="task-modal-right">
        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Project</label>
          <select class="sidebar-select-input" id="modal-project" ${ro}>
            <option value="" ${!activeProjId ? 'selected' : ''}>${escHtml(profName)}</option>
            ${projectOptions}
          </select>
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Due Date</label>
          <div class="dt-trigger-capsule" id="modal-due-dt-picker" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:5px 8px;cursor:pointer;">
            <span id="modal-due-dt-text" style="font-size:12px;${currentDueDate ? 'color:var(--text-primary);' : 'color:var(--text-tertiary);'}">${currentDueDate ? formatDateShort(currentDueDate) + (currentDueTime ? ' at ' + formatTime12(currentDueTime) : '') : 'e.g. Jul 24, 9:30 AM'}</span>
            <img src="assets/icons/Calendar.png" alt="Calendar" style="width:16px;height:16px;object-fit:contain;" />
          </div>
          <input type="hidden" id="modal-due-date" value="${currentDueDate}" />
          <input type="hidden" id="modal-due-time" value="${currentDueTime}" />
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Planned Date</label>
          <div class="dt-trigger-capsule" id="modal-planned-dt-picker" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:5px 8px;cursor:pointer;">
            <span id="modal-planned-dt-text" style="font-size:12px;${currentPlannedDate ? 'color:var(--text-primary);' : 'color:var(--text-tertiary);'}">${currentPlannedDate ? formatDateShort(currentPlannedDate) + (currentPlannedTime ? ' at ' + formatTime12(currentPlannedTime) : '') : 'e.g. Jul 25, 2:00 PM'}</span>
            <img src="assets/icons/Calendar.png" alt="Calendar" style="width:16px;height:16px;object-fit:contain;" />
          </div>
          <input type="hidden" id="modal-planned-date" value="${currentPlannedDate}" />
          <input type="hidden" id="modal-planned-time" value="${currentPlannedTime}" />
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Priority</label>
          <div class="priority-flag-selector">
            ${['P1', 'P2', 'P3', 'P4'].map(p => {
              const selected = currentPriority === p ? 'selected' : '';
              const colorClass = getPriorityColorClass(p);
              const flagSrc = p === 'P4' ? 'assets/icons/Flag.png' : 'assets/icons/Flag filled.png';
              return `<button class="priority-flag-btn ${colorClass} ${selected}" data-priority="${p}" title="Priority ${p.replace('P', '')}">
                <img src="${flagSrc}" alt="${p}" style="width:16px;height:16px;object-fit:contain;" />
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="sidebar-property-row">
          <label class="sidebar-property-label">Labels / Tags</label>
          <input class="sidebar-date-input" id="modal-tags" value="${escAttr(currentTags)}" placeholder="@deep_work, @errands" ${ro} />
        </div>

        <div style="flex:1"></div>

        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:16px;">
          <button class="btn-secondary" id="modal-cancel-btn" style="padding:5px 12px;font-size:11px;">Cancel</button>
          ${!isArchived ? `<button class="btn-primary" id="modal-save-btn" style="padding:5px 14px;font-size:11px;">${isNew ? 'Add Task' : 'Save'}</button>` : ''}
        </div>
      </div>
    </div>
  `;

  openDraggablePopup(html, 'task-popup');

  // Priority flag selector logic
  if (!isArchived) {
    document.querySelectorAll('.priority-flag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.priority-flag-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // DateTimePicker triggers
  const duePickerBtn = document.getElementById('modal-due-dt-picker');
  if (duePickerBtn && !isArchived) {
    duePickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isImgClick = !!(e.target && e.target.closest('img'));
      const todayStr = toISODate(new Date());
      const curDate = isImgClick ? todayStr : document.getElementById('modal-due-date').value;
      const curTime = document.getElementById('modal-due-time').value;
      showDateSelector({
        targetElement: duePickerBtn,
        initialDate: curDate,
        initialTime: curTime,
        initialRepeat: task ? task.recurring : null,
        onSelect: ({ date, time, repeat }) => {
          document.getElementById('modal-due-date').value = date || '';
          document.getElementById('modal-due-time').value = time || '';
          if (task) task.recurring = repeat;
          const textEl = document.getElementById('modal-due-dt-text');
          if (textEl) {
            textEl.textContent = date ? formatDateShort(date) + (time ? ' at ' + formatTime12(time) : '') : 'e.g. Jul 24, 9:30 AM';
            textEl.style.color = date ? 'var(--text-primary)' : 'var(--text-tertiary)';
          }
        },
        onClear: () => {
          document.getElementById('modal-due-date').value = '';
          document.getElementById('modal-due-time').value = '';
          const textEl = document.getElementById('modal-due-dt-text');
          if (textEl) {
            textEl.textContent = 'e.g. Jul 24, 9:30 AM';
            textEl.style.color = 'var(--text-tertiary)';
          }
        }
      });
    });
  }

  const plannedPickerBtn = document.getElementById('modal-planned-dt-picker');
  if (plannedPickerBtn && !isArchived) {
    plannedPickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isImgClick = !!(e.target && e.target.closest('img'));
      const todayStr = toISODate(new Date());
      const curDate = isImgClick ? todayStr : document.getElementById('modal-planned-date').value;
      const curTime = document.getElementById('modal-planned-time').value;
      showDateSelector({
        targetElement: plannedPickerBtn,
        initialDate: curDate,
        initialTime: curTime,
        initialRepeat: null,
        onSelect: ({ date, time }) => {
          document.getElementById('modal-planned-date').value = date || '';
          document.getElementById('modal-planned-time').value = time || '';
          const textEl = document.getElementById('modal-planned-dt-text');
          if (textEl) {
            textEl.textContent = date ? formatDateShort(date) + (time ? ' at ' + formatTime12(time) : '') : 'e.g. Jul 25, 2:00 PM';
            textEl.style.color = date ? 'var(--text-primary)' : 'var(--text-tertiary)';
          }
        },
        onClear: () => {
          document.getElementById('modal-planned-date').value = '';
          document.getElementById('modal-planned-time').value = '';
          const textEl = document.getElementById('modal-planned-dt-text');
          if (textEl) {
            textEl.textContent = 'e.g. Jul 25, 2:00 PM';
            textEl.style.color = 'var(--text-tertiary)';
          }
        }
      });
    });
  }

  // Toggle check inside modal
  const checkBtn = document.getElementById('modal-toggle-check');
  if (checkBtn && !isNew) {
    checkBtn.addEventListener('click', async () => {
      await toggleTask(taskId);
      closeModal();
    });
  }

  // Options menu (•••) toggle
  const moreBtn = document.getElementById('modal-more-options-btn');
  const optionsMenu = document.getElementById('task-options-menu');
  if (moreBtn && optionsMenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      optionsMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!optionsMenu.contains(e.target) && e.target !== moreBtn) {
        optionsMenu.classList.add('hidden');
      }
    });
  }

  // Duplicate task option
  const dupBtn = document.getElementById('opt-duplicate-btn');
  if (dupBtn && task) {
    dupBtn.addEventListener('click', async () => {
      const dupTask = {
        ...task,
        id: generateId(),
        title: task.title + ' (Copy)',
        createdAt: new Date().toISOString()
      };
      state.tasks.push(dupTask);
      await saveTasks();
      closeModal();
      renderView();
      showToast('Task duplicated!', 'success');
    });
  }

  // Delete task option
  const delBtn = document.getElementById('opt-delete-btn');
  if (delBtn && task) {
    delBtn.addEventListener('click', () => {
      deleteTask(taskId);
      closeModal();
    });
  }

  // Save Task
  const saveBtn = document.getElementById('modal-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const title = document.getElementById('modal-title').value.trim();
      if (!title) { showToast('Title is required', 'error'); return; }

      const selectedPriorityBtn = document.querySelector('.priority-flag-btn.selected');
      const selectedPriority = selectedPriorityBtn ? selectedPriorityBtn.dataset.priority : 'P4';
      const tagsInput = document.getElementById('modal-tags').value;
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

      const data = {
        title,
        description: document.getElementById('modal-desc').value,
        priority: selectedPriority,
        plannedDate: document.getElementById('modal-planned-date').value || null,
        plannedTime: document.getElementById('modal-planned-time').value || null,
        dueDate: document.getElementById('modal-due-date').value || null,
        dueTime: document.getElementById('modal-due-time').value || null,
        projectId: document.getElementById('modal-project').value || null,
        tags
      };

      if (isNew) {
        const newTask = {
          id: generateId(),
          ...data,
          sectionId: initialSectionId || null,
          parentTaskId: null,
          recurring: null,
          completed: false,
          completedAt: null,
          createdAt: new Date().toISOString(),
          profileId: (initialData && initialData.profileId) || getActiveProfileId()
        };
        state.tasks.push(newTask);
      } else {
        if (!task.profileId || task.profileId === 'all') {
          task.profileId = getActiveProfileId();
        }
        Object.assign(task, data);
      }

      await saveTasks();
      closeModal();
      renderView();
      renderSidebarTags();
      showToast(isNew ? 'Task created!' : 'Task updated!', 'success');
    });
  }

  // Close buttons
  const cancelBtn = document.getElementById('modal-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
}
