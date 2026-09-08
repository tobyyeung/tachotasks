const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
  const context = vm.createContext({ state: { projects: [{ id: 'work', name: 'Work project' }], archivedTasks: [
    { id: 'a', title: 'First', projectId: 'work', description: 'Meeting notes', completedAt: '2026-09-08T10:00:00Z', updatedAt: '2026-09-08T10:00:00Z' },
    { id: 'a', title: 'Duplicate', completedAt: '2020-01-01', updatedAt: '2020-01-01' },
    { id: 'b', title: 'First', tags: ['home'], completedAt: '2026-08-01T10:00:00Z' },
    { id: 'c', title: 'Unknown date', completedAt: null }
  ] }, escHtml: s => String(s).replaceAll('<','&lt;'), escAttr: s => String(s).replaceAll('"','&quot;'), getPriorityColor: () => '#fff', getTaskLocationHtml: () => '', Date });
  vm.runInContext(fs.readFileSync('js/utils.js','utf8'), context);
  vm.runInContext(fs.readFileSync('js/views/archive.js','utf8'), context);
  return context;
}
test('archive deduplicates stable IDs, preserves separate same-title tasks and sorts dates', () => {
  const c=fixture(); const tasks=c.filteredArchiveTasks(); assert.equal(tasks.length,3); assert.equal(tasks[0].id,'a'); assert.equal(tasks[1].id,'b');
});
test('archive combines search, location and date filters', () => {
  const c=fixture(); vm.runInContext("archiveFilters.search='notes'; archiveFilters.project='work'; archiveFilters.range='month';",c);
  assert.equal(c.filteredArchiveTasks(new Date('2026-09-08T23:59:00Z')).length,1);
  vm.runInContext("archiveFilters.project='standalone';",c); assert.equal(c.filteredArchiveTasks().length,0);
});
test('archive renders missing dates and readable escaped task titles', () => {
  const c=fixture(); c.state.archivedTasks.push({ id:'x', title:'<script>unsafe</script>' });
  const html=c.renderArchive(); assert.ok(html.includes('Completion date unavailable')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('data-archive-restore')); assert.ok(!html.includes('data-task-toggle'));
});
test('archive keeps captured source and original due time after later task edits', () => {
  const c=fixture();
  const task={id:'history',projectId:'deleted-project',dueDate:'2030-01-01',dueTime:'08:00',completionDueDate:'2026-09-08',completionDueTime:'15:00',completionSource:{kind:'project',name:'Old project',section:'Review',color:'#48dbfb'}};
  assert.ok(c.archiveTaskSource(task).includes('Old project')); assert.ok(c.archiveTaskSource(task).includes('Review'));
  assert.ok(c.archiveOriginalDue(task).includes('3:00 PM')); assert.ok(!c.archiveOriginalDue(task).includes('2030'));
  assert.ok(c.archiveTaskSource({projectId:'missing'}).includes('Unavailable project'));
});
