# Agent Rules & Behavioral Guidelines

## Persistence & Cloud Sync Verification Rule
When removing properties, fields, or features from data structures or local storage files (e.g. `tasks.json`):
1. **Sanitize Cloud Pull**: Update cloud synchronization background scripts (e.g. `cloud-bg.js` `syncFromCloud`) to strip deleted/deprecated properties from remote documents when pulled.
2. **Push Updated Schema to Cloud**: Ensure cloud push (`performSyncToCloud` / `syncToCloud`) is triggered so remote cloud documents (e.g. Firebase Firestore) are updated immediately to prevent old fields from being restored on app refresh or restart.
3. **Verify Refresh Resilience**: Always verify that reloading the page or pulling from sync does not restore deleted fields or views.
