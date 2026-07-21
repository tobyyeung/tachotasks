/**
 * utils.js
 * Utility functions for date/time formatting, filtering, ID generation, and HTML escaping.
 */

/**
 * Returns the active profile ID or the configured default profile ID if currently in 'all' mode.
 * @returns {string} Profile ID to assign to new items.
 */
function getActiveProfileId() {
  if (state.activeMode && state.activeMode !== 'all') {
    return state.activeMode;
  }
  return (state.settings && state.settings.defaultProfileId) || 'profile-personal';
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
 * Gets the Date object representing Monday of the given date's week.
 * @param {Date} date - Input date.
 * @returns {Date} Monday of that week.
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Formats date to long readable format (e.g. Monday, July 20, 2026).
 * @param {Date} d - Target Date.
 * @returns {string}
 */
function formatDateFull(d) {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

/**
 * Formats date to short format (e.g. Jul 20).
 * @param {Date} d - Target Date.
 * @returns {string}
 */
function formatDateShort(d) {
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
  return { text: formatDateShort(new Date(task.dueDate)), class: '' };
}

/**
 * Maps priority level string to hex color code.
 * @param {string} priority - 'P1', 'P2', 'P3'.
 * @returns {string|null} Hex color code.
 */
function getPriorityColor(priority) {
  switch (priority) {
    case 'P1': return '#ff5c5c';
    case 'P2': return '#ffb347';
    case 'P3': return '#5cb8ff';
    default: return null;
  }
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
