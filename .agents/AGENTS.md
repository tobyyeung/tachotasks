# Agent Rules & Behavioral Guidelines

## Persistence & Cloud Sync Verification Rule
When removing properties, fields, or features from data structures or local storage files (e.g. `tasks.json`):
1. **Sanitize Cloud Pull**: Update cloud synchronization background scripts (e.g. `cloud-bg.js` `syncFromCloud`) to strip deleted/deprecated properties from remote documents when pulled.
2. **Push Updated Schema to Cloud**: Ensure cloud push (`performSyncToCloud` / `syncToCloud`) is triggered so remote cloud documents (e.g. Firebase Firestore) are updated immediately to prevent old fields from being restored on app refresh or restart.
3. **Verify Refresh Resilience**: Always verify that reloading the page or pulling from sync does not restore deleted fields or views.

---

## Architectural & Design Invariants

### 1. Global Projects & Tasks-Only Profile Scoping
- **Global Projects**: Projects are global across the entire workspace and are never partitioned or filtered by profile (`project.profileId` is deprecated/null).
- **Tasks View Profile Scoping**: Profiles (`All`, `Personal`, `School`, `Work`) strictly apply to standalone non-project tasks on the Tasks page (`!task.projectId && task.profileId === state.activeProfileId`). Outside the Tasks page (Dashboard, Calendar, Planner, Projects), tasks and projects are global.
- **Project View**: A Project view strictly shows tasks belonging to that specific project (`task.projectId === activeProjectId`) globally.

### 2. Location Formatting (`js/utils.js`)
- Non-Project Profile Tasks: `<img src="..." class="custom-emoji" /><span style="color:#ff6b00;font-weight:600;">Profile Name</span><span style="color:var(--text-tertiary);"> / Section Name</span>`
- Project Tasks: `<span style="color:ProjectColor;font-weight:600;">● Project Name</span><span style="color:var(--text-tertiary);"> / Section Name</span>`

### 3. Task Cards & Priority System
- **Priority Customization**: Priorities P1, P2, P3 colors are customizable (`red`, `orange`, `yellow`, `green`, `blue`, `purple`). Priority P4 is fixed to Slate.
- **Task List Views**: Priority is visually indicated ONLY by the colored checkbox circle border/fill (`.task-circle-check`). P1-P4 text badges or flag icons MUST NOT be rendered on task list cards.
- **Task Editor Modal**: Flag buttons (`.modal-flag-btn`) represent priorities P1-P4 in the modal.

### 4. Component & File Naming Architecture
- Date & Time Selector: `js/components/date-selector.js` (`showDateSelector`, `#date-selector-popover`).
- Right-Click Context Menu: `js/components/task-menu.js` (`openTaskMenu`, `#task-menu`).
- Editor Modal Options Menu: `#task-options-menu` (triggered via `•••`).
- Date Pickers in Editor Modal: Labels are strictly `Due Date` and `Planned Date`, both using `assets/icons/Calendar.png`. Clicking the calendar icon opens `date-selector` pre-set to Today without saving until the user clicks Save in the date selector UI.

### 5. Automated Verification
- Run `node -c <file>` syntax checks proactively without requiring manual confirmation whenever JavaScript files are modified.
