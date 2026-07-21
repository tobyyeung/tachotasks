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
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 6 15 12 9 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  party: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5.8 11.3 2 22l10.7-3.79M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10M22 13l-2.24-.75a2.9 2.9 0 0 0-1.96-3.12v0c-.1-.86-.57-1.63-1.45-1.63h-.38c-.86 0-1.6-.6-1.76-1.44L14 5M11.5 6l2.12-2.12c.58-.59 1.53-.59 2.12 0l3.76 3.76c.59.58.59 1.53 0 2.12L17.38 11.9"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
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
  if (!state.settings.activeGcalIds) return [];
  return state.gcalEvents.filter(e => state.settings.activeGcalIds.includes(e.calendarId));
}
