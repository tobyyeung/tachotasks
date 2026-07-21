const fs = require('fs');
const path = require('path');

const rendererPath = path.join(__dirname, 'renderer.js');
const source = fs.readFileSync(rendererPath, 'utf8');

const getSection = (startMarker, endMarker) => {
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) return '';
  
  let endIndex;
  if (endMarker) {
    endIndex = source.indexOf(endMarker, startIndex);
    if (endIndex === -1) endIndex = source.length;
  } else {
    endIndex = source.length;
  }
  
  return source.substring(startIndex, endIndex);
};

// Map of files to sections
const fileMap = {
  'js/views/tasks.js': [
    getSection('// ===== TASKS VIEW =====', '// ===== REMINDERS VIEW ====='),
    getSection('// ===== KANBAN BOARD =====', '// ===== CALENDAR VIEW =====')
  ].join('\n'),
  
  'js/views/reminders.js': getSection('// ===== REMINDERS VIEW =====', '// ===== ARCHIVE VIEW ====='),
  'js/views/archive.js': getSection('// ===== ARCHIVE VIEW =====', '// ===== KANBAN BOARD ====='),
  'js/views/calendar.js': getSection('// ===== CALENDAR VIEW =====', '// ===== INBOX VIEW ====='),
  'js/views/inbox.js': getSection('// ===== INBOX VIEW =====', '// ===== PLANNER VIEW ====='),
  'js/views/planner.js': getSection('// ===== PLANNER VIEW =====', '// ===== SETTINGS VIEW ====='),
  'js/views/settings.js': getSection('// ===== SETTINGS VIEW =====', '// ===== EVENT LISTENERS (per-view) ====='),
  
  'js/components/modals.js': [
    getSection('// ===== MODALS =====', '// ===== SIDEBAR RENDERING ====='),
    getSection('// ===== TOAST NOTIFICATIONS =====', '// ===== PERSISTENCE HELPERS =====')
  ].join('\n'),
  
  'js/components/sidebar.js': getSection('// ===== SIDEBAR RENDERING =====', '// ===== TOAST NOTIFICATIONS ====='),
  
  'js/app.js': [
    getSection('// ===== INITIALIZATION =====', '// ===== NAVIGATION ====='),
    getSection('// ===== NAVIGATION =====', '// ===== MODE SWITCHER (Category Profiles) ====='),
    getSection('// ===== MODE SWITCHER (Category Profiles) =====', '// ===== AUTH & SYNC ====='),
    getSection('// ===== AUTH & SYNC =====', '// ===== QUICK-ADD BAR ====='),
    getSection('// ===== QUICK-ADD BAR =====', '// ===== DASHBOARD VIEW ====='),
    getSection('// ===== EVENT LISTENERS (per-view) =====', '// ===== DRAG AND DROP ====='),
    getSection('// ===== DRAG AND DROP =====', '// ===== TASK OPERATIONS ====='),
    getSection('// Initialize app when DOM is ready', '') // gets the rest up to end of file
  ].join('\n')
};

// Write files
for (const [filePath, content] of Object.entries(fileMap)) {
  const fullPath = path.join(__dirname, filePath);
  fs.writeFileSync(fullPath, content);
  console.log('Wrote', filePath);
}
