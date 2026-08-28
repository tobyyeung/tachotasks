/**
 * Returns default profile templates (All, Personal, Work, School).
 * @returns {Array} Default profiles array.
 */
function getDefaultProfiles() {
  return [
    { id: 'all', name: 'All', icon: '', image: 'assets/brand/logo.png' },
    { id: 'profile-personal', name: 'Personal', icon: '', image: 'assets/profiles/personal.png' },
    { id: 'profile-work', name: 'Work', icon: '', image: 'assets/profiles/work.png' },
    { id: 'profile-school', name: 'School', icon: '', image: 'assets/profiles/school.png' }
  ];
}

/**
 * Ensures required default profiles (Personal, Work, School) always exist in a profiles list.
 * @param {Array} profiles - Existing profile list.
 * @returns {Array} Profiles list with defaults guaranteed.
 */
function ensureDefaultProfiles(profiles = []) {
  const defaults = getDefaultProfiles();
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return defaults;
  }
  const result = [...profiles];
  const defaultImages = {
    'all': 'assets/brand/logo.png',
    'profile-personal': 'assets/profiles/personal.png',
    'profile-work': 'assets/profiles/work.png',
    'profile-school': 'assets/profiles/school.png'
  };
  for (const def of defaults) {
    const existing = result.find(p => p.id === def.id || (p.name && p.name.toLowerCase() === def.name.toLowerCase()));
    if (!existing) {
      result.push(def);
    } else {
      if (!existing.image && defaultImages[existing.id]) {
        existing.image = defaultImages[existing.id];
      }
    }
  }
  return result;
}

/**
 * Returns the active profile ID or the configured default profile ID if currently in 'all' mode.
 * @returns {string} Profile ID to assign to new items.
 */
function getActiveProfileId() {
  if (state.activeProfileId && state.activeProfileId !== 'all') {
    return state.activeProfileId;
  }
  return (state.settings && state.settings.defaultProfileId) || 'profile-personal';
}

/**
 * Checks if a project is currently active/visible based on sidebar checkbox toggles.
 * @param {string} projId - Project ID.
 * @returns {boolean} True if project is active/visible or not associated with a project.
 */
function isProjectActive(projId) {
  if (!projId) return true;
  const hidden = (state.settings && state.settings.hiddenProjectIds) || [];
  return !hidden.includes(projId);
}

/**
 * Applies active priority, tag, and project filters to a list of tasks.
 * @param {Array} tasks - Tasks to filter.
 * @returns {Array} Filtered task array.
 */
function applyFilters(tasks) {
  let filtered = tasks;
  if (state.filterPriority) {
    filtered = filtered.filter(t => t.priority === state.filterPriority);
  }
  if (state.filterTag) {
    filtered = filtered.filter(t => t.tags.includes(state.filterTag));
  }
  if (state.filterProject) {
    filtered = filtered.filter(t => t.projectId === state.filterProject);
  }
  return filtered;
}

/**
 * Retrieves a sorted unique list of all tags present across all active tasks.
 * @returns {Array<string>} Array of tag strings.
 */
function getAllTags() {
  const tags = new Set();
  state.tasks.forEach(t => t.tags.forEach(tag => tags.add(tag)));
  return [...tags].sort();
}

/**
 * Returns today's date formatted as YYYY-MM-DD.
 * @returns {string}
 */
function getTodayStr() {
  return toDateStr(new Date());
}

/**
 * Formats a JS Date object as YYYY-MM-DD.
 * @param {Date} d - Target Date.
 * @returns {string}
 */
function toDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Gets the Date object representing Sunday of the given date's week.
 * @param {Date} date - Input date.
 * @returns {Date} Sunday of that week.
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Safely parses a YYYY-MM-DD string or Date object into a local Date (00:00:00 local time).
 * Prevents UTC timezone parsing offsets that shift dates back 1 day in western timezones.
 * @param {string|Date} dateVal
 * @returns {Date}
 */
function parseDateLocal(dateVal) {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  if (typeof dateVal === 'string' && dateVal.includes('-')) {
    const cleanStr = dateVal.split('T')[0];
    const parts = cleanStr.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  return new Date(dateVal);
}

/**
 * Formats date to long readable format (e.g. Monday, July 20, 2026).
 * @param {string|Date} dateVal - Target Date or YYYY-MM-DD string.
 * @returns {string}
 */
function formatDateFull(dateVal) {
  const d = parseDateLocal(dateVal);
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

/**
 * Formats date to short format (e.g. Jul 20).
 * @param {string|Date} dateVal - Target Date or YYYY-MM-DD string.
 * @returns {string}
 */
function formatDateShort(dateVal) {
  const d = parseDateLocal(dateVal);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Converts 24-hour time string ("14:30") to 12-hour format ("2:30 PM").
 * @param {string} timeStr - 24h time string.
 * @returns {string} 12h time string.
 */
function formatTime12(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Adds minutes to a 24h time string and returns new 24h time string.
 * @param {string} timeStr - 24h time string.
 * @param {number} mins - Minutes to add.
 * @returns {string}
 */
function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Determines relative due date label and CSS badge class.
 * @param {Object} task - Task object.
 * @returns {Object|null} Label object with text and class properties.
 */
function getDueLabel(task) {
  if (!task.dueDate) return null;
  const today = getTodayStr();
  const tomorrow = toDateStr(new Date(Date.now() + 86400000));
  if (task.dueDate === today) return { text: 'Today', class: 'today' };
  if (task.dueDate === tomorrow) return { text: 'Tomorrow', class: '' };
  if (task.dueDate < today) return { text: 'Overdue', class: 'overdue' };
  return { text: formatDateShort(task.dueDate), class: '' };
}

/**
 * Maps priority level string to flag color CSS class name.
 * @param {string} priority - 'P1', 'P2', 'P3', 'P4'.
 * @returns {string} CSS class name.
 */
function getPriorityColorClass(priority) {
  if (priority === 'P4' || !priority) return 'flag-color-slate';
  const custom = state.settings && state.settings.priorityColors && state.settings.priorityColors[priority];
  if (custom) return `flag-color-${custom}`;
  if (priority === 'P1') return 'flag-color-red';
  if (priority === 'P2') return 'flag-color-orange';
  if (priority === 'P3') return 'flag-color-blue';
  return 'flag-color-slate';
}

/**
 * Maps priority level string to hex color code.
 * @param {string} priority - 'P1', 'P2', 'P3', 'P4'.
 * @returns {string} Hex color code.
 */
function getPriorityColor(priority) {
  const colorMap = {
    red: '#ff4757',
    orange: '#ffa502',
    yellow: '#ffd32a',
    green: '#2ed573',
    blue: '#1e90ff',
    purple: '#9c88ff',
    slate: '#a0a0a0'
  };
  if (priority === 'P4' || !priority) return colorMap.slate;
  const custom = state.settings && state.settings.priorityColors && state.settings.priorityColors[priority];
  if (custom && colorMap[custom]) return colorMap[custom];
  if (priority === 'P1') return colorMap.red;
  if (priority === 'P2') return colorMap.orange;
  if (priority === 'P3') return colorMap.blue;
  return colorMap.slate;
}

/**
 * Returns formatted location HTML for a task:
 * - If in project: Project Name (project color) / Section Name (gray)
 * - If not in project: Profile Name (white) / Section Name (gray)
 * @param {Object} task
 * @returns {string} HTML string
 */
function getTaskLocationHtml(task) {
  if (!task) return '';

  if (task.projectId) {
    const proj = (state.projects || []).find(p => p.id === task.projectId);
    if (proj) {
      let secName = 'Uncategorized';
      if (task.sectionId && task.sectionId !== 'unsectioned' && proj.sections) {
        const sec = proj.sections.find(s => s.id === task.sectionId);
        if (sec) secName = sec.name;
      }
      return `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="color:${proj.color || 'var(--text-primary)'};font-weight:600;">● ${escHtml(proj.name)}</span><span style="color:var(--text-tertiary);"> / ${escHtml(secName)}</span></span>`;
    }
  }

  // Not in a project (Task under profile)
  const defaultProfId = (state.settings && state.settings.defaultProfileId) || 'profile-personal';
  const profId = task.profileId || defaultProfId;
  const prof = (state.profiles || []).find(p => p.id === profId);
  const profName = prof ? prof.name : 'Personal';

  let profImg = (prof && prof.image) ? prof.image : null;
  if (!profImg) {
    const idLower = String(profId).toLowerCase();
    const nameLower = String(profName).toLowerCase();
    if (idLower.includes('work') || nameLower.includes('work')) profImg = 'assets/profiles/work.png';
    else if (idLower.includes('school') || nameLower.includes('school')) profImg = 'assets/profiles/school.png';
    else profImg = 'assets/profiles/personal.png';
  }

  let secName = 'Uncategorized';
  if (task.sectionId && task.sectionId !== 'unsectioned' && state.settings && state.settings.taskSections) {
    const sec = state.settings.taskSections.find(s => s.id === task.sectionId);
    if (sec) secName = sec.name;
  }

  return `<img src="${profImg}" alt="${escAttr(profName)}" class="custom-emoji" /><span style="color:#ff6b00;font-weight:600;">${escHtml(profName)}</span><span style="color:var(--text-tertiary);"> / ${escHtml(secName)}</span>`;
}

/**
 * Generates a unique string identifier.
 * @returns {string}
 */
function generateId() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Escapes special HTML characters in text.
 * @param {string} str - Input text.
 * @returns {string} Escaped HTML string.
 */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Escapes special characters for HTML attribute values.
 * @param {string} str - Input text.
 * @returns {string} Escaped attribute string.
 */
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Extracts the short venue/building name from a location string (omits street addresses).
 * @param {string} locStr
 * @returns {string}
 */
function formatLocationShort(locStr) {
  if (!locStr) return '';
  let clean = locStr.trim();
  if (clean.includes('\n')) {
    clean = clean.split('\n')[0].trim();
  }
  if (clean.includes(',')) {
    const parts = clean.split(',');
    const first = parts[0].trim();
    if (first) {
      clean = first;
    }
  }
  return clean;
}

/**
 * Persists the user's active UI state (current view, tasks view mode, sort mode, active profile,
 * active project, calendar mode, calendar date, filter tag, dashboard layout, split ratio) to settings & cloud.
 */
function persistUIState() {
  if (!state.settings) state.settings = {};
  state.settings.currentView = state.currentView || 'dashboard';
  state.settings.activeProfileId = state.activeProfileId || 'all';
  state.settings.tasksViewMode = state.tasksViewMode || 'board';
  state.settings.tasksSortMode = state.tasksSortMode || 'dueDate';
  state.settings.filterTag = state.filterTag || null;
  state.settings.activeProjectId = state.filterProject || null;
  state.settings.calendarViewMode = state.calendarViewMode || 'weekly';

  if (state.calendarDate instanceof Date && !isNaN(state.calendarDate.getTime())) {
    state.settings.calendarDate = toDateStr(state.calendarDate);
  }
  if (state.plannerDate instanceof Date && !isNaN(state.plannerDate.getTime())) {
    state.settings.plannerDate = toDateStr(state.plannerDate);
  }
  if (state.dashboardUpcomingRange) {
    state.settings.dashboardUpcomingRange = state.dashboardUpcomingRange;
  }
  if (!state.settings.dashboardLayout) {
    state.settings.dashboardLayout = {
      left: ['upcoming-tasks', 'daily-tasks'],
      right: ['todays-schedule', 'birthdays']
    };
  }
  if (state.settings.dashboardSplitRatio === undefined) {
    state.settings.dashboardSplitRatio = 50;
  }

  if (window.api && window.api.saveSettings) {
    window.api.saveSettings(state.settings);
  }
}

/**
 * Formats 24hr time (HH:MM) to short 12hr format (e.g. '7am', '12:53am', '11:30pm').
 * @param {string} timeStr
 * @returns {string}
 */
function formatTimeShort(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':').map(Number);
  const hour = parts[0];
  const mins = parts[1] || 0;
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  if (mins === 0) return `${displayHour}${ampm}`;
  return `${displayHour}:${String(mins).padStart(2, '0')}${ampm}`;
}

/**
 * Returns either '#121212' or '#ffffff' depending on background luminance.
 * @param {string} colorStr
 * @returns {string}
 */
function getContrastTextColor(colorStr) {
  if (!colorStr) return '#ffffff';
  let r = 0, g = 0, b = 0;
  
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0], 10);
      g = parseInt(match[1], 10);
      b = parseInt(match[2], 10);
    }
  }
  
  // Standard perceived luminance formula (ITU-R BT.709)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#121212' : '#ffffff';
}

/**
 * Darkens a color (hex/rgb) for harmonious rendering in dark mode calendar.
 * @param {string} colorStr 
 * @param {number} factor - Brightness multiplier (default 0.52)
 * @returns {string}
 */
function darkenColor(colorStr, factor = 0.52) {
  if (!colorStr) return '#1a2736';
  if (typeof colorStr !== 'string') return '#1a2736';
  if (colorStr.startsWith('var(')) return '#1f3a5f';
  
  let r = 0, g = 0, b = 0;
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0], 10);
      g = parseInt(match[1], 10);
      b = parseInt(match[2], 10);
    }
  } else {
    return colorStr;
  }
  
  r = Math.min(255, Math.max(0, Math.round(r * factor)));
  g = Math.min(255, Math.max(0, Math.round(g * factor)));
  b = Math.min(255, Math.max(0, Math.round(b * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Checks if a task has any recurring schedule.
 * @param {Object} task 
 * @returns {boolean}
 */
function isTaskRecurring(task) {
  if (!task) return false;
  const r = task.recurring || task.repeat || task.recurrence;
  if (!r) return false;
  if (typeof r === 'string') {
    const s = r.toLowerCase().trim();
    return s !== '' && s !== 'none' && s !== 'never';
  }
  if (typeof r === 'object') {
    return !!(r.frequency || r.freq || r.type);
  }
  return false;
}

/**
 * Calculates the next occurrence date (YYYY-MM-DD) for a recurring rule.
 * @param {string} baseDateStr - Base date string (YYYY-MM-DD), defaults to today if past/missing.
 * @param {string|Object} recurringRule - The repeat rule.
 * @returns {string} Next date string in YYYY-MM-DD format.
 */
function getNextRecurringDate(baseDateStr, recurringRule) {
  if (!recurringRule) return null;
  const todayStr = getTodayStr();
  const refDateStr = (!baseDateStr || baseDateStr < todayStr) ? todayStr : baseDateStr;
  const base = parseDateLocal(refDateStr);
  if (!base || isNaN(base.getTime())) return todayStr;

  let ruleStr = '';
  if (typeof recurringRule === 'string') {
    ruleStr = recurringRule.toLowerCase().trim();
  } else if (typeof recurringRule === 'object') {
    ruleStr = (recurringRule.frequency || recurringRule.freq || recurringRule.type || '').toLowerCase().trim();
  }

  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  if (ruleStr === 'daily' || ruleStr === 'every day' || ruleStr === 'everyday' || ruleStr === 'day') {
    next.setDate(next.getDate() + 1);
  } else if (ruleStr === 'weekdays' || ruleStr === 'every weekday' || ruleStr === 'mon-fri') {
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() === 0 || next.getDay() === 6); // Skip Sun (0) and Sat (6)
  } else if (ruleStr === 'weekly' || ruleStr === 'every week' || ruleStr === 'week') {
    next.setDate(next.getDate() + 7);
  } else if (ruleStr === 'biweekly' || ruleStr === 'every 2 weeks') {
    next.setDate(next.getDate() + 14);
  } else if (ruleStr === 'monthly' || ruleStr === 'every month' || ruleStr === 'month') {
    next.setMonth(next.getMonth() + 1);
  } else if (ruleStr === 'yearly' || ruleStr === 'every year' || ruleStr === 'year') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setDate(next.getDate() + 1);
  }

  return toDateStr(next);
}
