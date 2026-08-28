# TachoTasks - Todo & Productivity App

A modern, high-performance desktop & web productivity app built with Vanilla JavaScript, HTML5, CSS3, Google Calendar API, and Firebase Firestore cloud synchronization.

---

## JavaScript Architecture & File Reference

### Core & State (`js/`)

- **[`js/app.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/app.js)**
  Main application coordinator. Initializes the app, manages view routing (`dashboard`, `tasks`, `project`, `calendar`, `planner`, `settings`, `archive`), handles the authentication lifecycle and login overlay, and binds global UI event listeners.

- **[`js/browser-api.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/browser-api.js)**
  Client-side platform API adapter exposed via `window.api`. Handles Firebase Authentication (Google OAuth), Google Identity Services (GSI) client-side token refresh loop, Firestore background synchronization, Google Calendar API v3 integrations, and `localStorage` persistence.

- **[`js/data.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/data.js)**
  Core data persistence helper layer. Provides helper functions to save, update, complete, and delete tasks, refresh data from storage, and manage tag indexing across the application.

- **[`js/state.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/state.js)**
  Global reactive state repository. Stores active view mode, loaded tasks, archived tasks, projects, profiles, calendar events, active filters, sorting preferences, and user configuration.

- **[`js/utils.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/utils.js)**
  Shared utility library. Contains date/time formatting (12-hour AM/PM, short dates, ISO parsers), HTML escaping, ID generators, priority color mappings, and location breadcrumb builders (`Profile / Section` vs `Project / Section`).

---

### Components (`js/components/`)

- **[`js/components/modal-base.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/modal-base.js)**
  Foundation for modals, popups, and feedback. Provides standard modal overlay controls (`openModal`, `closeModal`), the physics-based floating window engine (`openDraggablePopup`), inspector sidebar controls, and toast notifications (`showToast`).

- **[`js/components/task-modal.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/task-modal.js)**
  The comprehensive Task Editor & Creator popup (`showTaskModal`). Supports task titles, multi-line descriptions, Due Date & Planned Date selector integration, priority flag selection (P1–P4), tags, project assignment, task duplication, and deletion.

- **[`js/components/project-modal.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/project-modal.js)**
  Project and List creation dialog (`showProjectModal`). Provides project name inputs, sub-list parenting, and custom color swatch palette selection.

- **[`js/components/event-popover.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/event-popover.js)**
  Interactive calendar event preview card (`showEventPopover`). Displays event color bars, formatted start/end times, venue & street address separation, recurring patterns, and direct links to Google Calendar.

- **[`js/components/date-selector.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/date-selector.js)**
  Interactive date and time selector popover (`showDateSelector`). Features a monthly mini-calendar grid, time input, quick presets (*Today*, *Tomorrow*, *Next Week*), recurring options, and staged save/cancel actions.

- **[`js/components/task-menu.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/task-menu.js)**
  Custom right-click context menu for task items (`openTaskMenu`). Enables quick priority changes, section reassignment, project moving, duplication, and deletion.

- **[`js/components/sidebar.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/sidebar.js)**
  Left sidebar controller. Renders navigation links, global projects with hierarchical sub-lists, active tag filters, Google Calendar toggles, and user account status.

- **[`js/components/quick-add.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/quick-add.js)**
  Bottom quick-entry bar (`setupQuickAdd`). Parses natural language inputs (e.g. *"Review draft tomorrow at 3pm p1 @deep_work"*) into structured tasks with dates, times, priority levels, and labels.

- **[`js/components/drag-drop.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/components/drag-drop.js)**
  Drag-and-drop engine (`setupDragAndDrop`). Manages reordering tasks across custom sections, scheduling onto calendar time-grid slots, and dropping onto weekly planner day columns.

---

### Views (`js/views/`)

- **[`js/views/dashboard.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/views/dashboard.js)**
  Dashboard view. Displays a greeting, daily progress ring, scheduled tasks for today, high-priority action items, and an upcoming deadlines breakdown.

- **[`js/views/tasks.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/views/tasks.js)**
  Main standalone tasks page. Renders tasks organized by customizable sections or simple list mode, with profile switching (*All*, *Personal*, *School*, *Work*), tag filtering, and inline task creation.

- **[`js/views/project.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/views/project.js)**
  Dedicated Project view. Renders global project tasks, sub-list navigation chips, tag filter bar, sort controls, and an upcoming project deadlines card.

- **[`js/views/calendar.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/views/calendar.js)**
  Interactive multi-mode calendar (Day, Week, Month). Handles hourly time-grids, all-day event bars, smart event overlap & collision layout algorithms, and Google Calendar event overlays.

- **[`js/views/planner.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/views/planner.js)**
  7-day weekly planner view. Visualizes scheduled tasks and events in side-by-side day columns for rapid weekly review and planning.

- **[`js/views/settings.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/views/settings.js)**
  Settings & Preferences view. Allows customization of theme aesthetics, priority colors (P1–P3), default profiles, Google account synchronization, and data backups/resets.

- **[`js/views/archive.js`](file:///c:/Users/tobyy/OneDrive/Desktop/tachotasks/js/views/archive.js)**
  Archive view. Displays archived and completed tasks with search, restore, and permanent deletion capabilities.

---

## Pending Updates & Roadmap

- [ ] Create icon for quick change dates for tasks (find all svg imgs)
- [ ] Create a timestamp-based sync & conflict resolution system to ensure older device tasks never override newer updates
- [ ] Add a postpone function where it would move any old task to be due today instead etc
- [ ] fix settings ui
