/**
 * state.js
 * Central application state store, SVG icons dictionary, and profile filtering helpers.
 */

var state = {
  currentView: 'dashboard',
  tasks: [],
  projects: [],
  profiles: [],
  reminders: [],
  archivedTasks: [],
  settings: {},
  gcalEvents: [],
  activeGcalIds: [],
  gcalCalendars: [],
  fetchedGcalIds: new Set(),
  tasksViewMode: 'section', // 'section' | 'list'
  calendarDate: new Date(),
  filterPriority: null,
  filterTag: null,
  filterProject: null,
  activeMode: 'all', // 'all' | 'profile-work' | 'profile-personal' | 'profile-school'
  dragTaskId: null,
};

var icons = {
  chevronLeft: '<img src="assets/icons/Down.png" alt="Previous" style="width:100%;height:100%;object-fit:contain;transform:rotate(90deg);" />',
  chevronRight: '<img src="assets/icons/Down.png" alt="Next" style="width:100%;height:100%;object-fit:contain;transform:rotate(-90deg);" />',
  plus: '<img src="assets/icons/Add.png" alt="Add" style="width:100%;height:100%;object-fit:contain;" />',
  trash: '<img src="assets/icons/Trash.png" alt="Trash" style="width:100%;height:100%;object-fit:contain;" />',
  edit: '<img src="assets/icons/Edit.png" alt="Edit" style="width:100%;height:100%;object-fit:contain;" />',
  gift: '<img src="assets/icons/Gift.png" alt="Gift" style="width:100%;height:100%;object-fit:contain;" />',
  heart: '<img src="assets/icons/Heart.png" alt="Heart" style="width:100%;height:100%;object-fit:contain;" />',
  star: '<img src="assets/icons/Star.png" alt="Star" style="width:100%;height:100%;object-fit:contain;" />',
  box: '<img src="assets/icons/Box.png" alt="Box" style="width:100%;height:100%;object-fit:contain;" />',
  party: '<img src="assets/icons/Party.png" alt="Party Horn" style="width:100%;height:100%;object-fit:contain;" />',
  calendar: '<img src="assets/icons/Calendar.png" alt="Calendar" style="width:100%;height:100%;object-fit:contain;" />',
  target: '<img src="assets/icons/Target.png" alt="Target" style="width:100%;height:100%;object-fit:contain;" />'
};

/**
 * Filters an array of items (tasks, projects, reminders) based on the active profile mode.
 * Items without a profileId (created in 'all') pass through to every profile view.
 * @param {Array} items - Items to filter.
 * @returns {Array} Filtered list of items.
 */
function getFilteredByMode(items) {
  if (!items) return [];
  if (state.activeMode === 'all') return items;
  return items.filter(item => {
    if (!item.profileId) return true;
    if (item.profileId === state.activeMode) return true;
    if (item.projectId) {
      const proj = state.projects.find(p => p.id === item.projectId);
      if (proj && (!proj.profileId || proj.profileId === state.activeMode)) return true;
    }
    return false;
  });
}

/**
 * Returns Google Calendar events for calendars selected as active by the user.
 * @returns {Array} Filtered Google Calendar events.
 */
function getActiveGcalEvents() {
  const activeIds = Array.isArray(state.activeGcalIds) ? state.activeGcalIds : (state.settings.activeGcalIds || []);
  return state.gcalEvents.filter(e => activeIds.includes(e.calendarId));
}
