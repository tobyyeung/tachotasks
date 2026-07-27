# Agent Rules & Behavioral Guidelines

## Persistence & Cloud Sync Verification Rule
When removing properties, fields, or features from data structures or local storage files (e.g. `tasks.json`):
1. **Sanitize Cloud Pull**: Update cloud synchronization background scripts (e.g. `cloud-bg.js` `syncFromCloud`) to strip deleted/deprecated properties from remote documents when pulled.
2. **Push Updated Schema to Cloud**: Ensure cloud push (`performSyncToCloud` / `syncToCloud`) is triggered so remote cloud documents (e.g. Firebase Firestore) are updated immediately to prevent old fields from being restored on app refresh or restart.
3. **Verify Refresh Resilience**: Always verify that reloading the page or pulling from sync does not restore deleted fields or views.

---

## Architectural & Design Invariants

### 1. Profile vs. Project Ownership & Task Isolation
- **Hierarchy**: Projects belong to Profiles (`project.profileId`), but Profiles and Projects are distinct containers.
- **Tasks View (Profile Filtered)**: When viewing a Profile (e.g. `Personal`), the Tasks view MUST ONLY show non-project profile tasks (`!task.projectId && task.profileId === activeProfileId`). Tasks belonging to a Project (`task.projectId`) MUST NOT bleed into the profile's task view.
- **Project View**: A Project view strictly shows tasks belonging to that specific project (`task.projectId === activeProjectId`). Non-project profile tasks MUST NOT bleed into Project views.

### 2. Profile & Task Location Formatting
- **Data Model**: Profile objects strictly contain `{ id, name, image }`. The deprecated `icon` property is permanently forbidden.
- **Icon Rendering**: Use custom PNG image assets (`assets/profiles/personal.png`, `work.png`, `school.png`, `logo.png`) formatted with the `.custom-emoji` CSS class for seamless text baseline alignment. Native text emojis (`👤`, `💼`, `🎓`) are strictly forbidden.
- **Location Strings (`js/utils.js`)**:
  - Non-Project Profile Tasks: `<img src="..." class="custom-emoji" /><span style="color:#ff6b00;font-weight:600;">Profile Name</span><span style="color:var(--text-tertiary);"> / Section Name</span>`
  - Project Tasks: `<span style="color:ProjectColor;font-weight:600;">● Project Name</span><span style="color:var(--text-tertiary);"> / Section Name</span>`
- **Project Select Dropdowns**: Render clean profile names (`Personal`, `Work`, `School`) without `(No Project)` or `Inbox` suffixes.

### 3. Task Cards & Priority System
- **Priority Customization**: Priorities P1, P2, P3 colors are customizable (`red`, `orange`, `yellow`, `green`, `blue`, `purple`). Priority P4 is fixed to Slate.
- **Task List Views**: Priority is visually indicated ONLY by the colored checkbox circle border/fill (`.task-circle-check`). P1-P4 text badges or flag icons MUST NOT be rendered on task list cards.
- **Task Editor Modal**: Flag buttons (`.modal-flag-btn`) represent priorities P1-P4 in the modal.

### 4. Component & File Naming Architecture
- Date & Time Selector: `js/components/date-selector.js` (`showDateSelector`, `#date-selector-popover`).
- Right-Click Context Menu: `js/components/task-menu.js` (`openTaskMenu`, `#task-menu`).
- Editor Modal Options Menu: `#task-options-menu` (triggered via `•••`).
- Date Pickers in Editor Modal: Labels are strictly `Due Date` and `Planned Date`, both using `assets/icons/Calendar.png`. Clicking the calendar icon opens `date-selector` pre-set to Today without saving until the user clicks Save in the date selector UI.
