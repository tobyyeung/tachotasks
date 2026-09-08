const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ Date, state: { settings: {}, projects: [], profiles: [] } });
vm.runInContext(fs.readFileSync('js/utils.js','utf8'),context);
const now = new Date(2026,8,8,16,30);
test('same-day deadlines become overdue only once their local time has passed', () => {
  for (const [time, overdue] of [['15:00',true],['16:29',true],['16:30',false],['17:00',false]]) {
    const task={dueDate:'2026-09-08',dueTime:time};
    assert.equal(context.isTaskOverdue(task,now),overdue,time);
    assert.equal(context.getDueLabel(task,now).text,overdue?'Overdue':'Today');
  }
});
test('date-only tasks stay due today until the local day ends', () => {
  assert.equal(context.isTaskOverdue({dueDate:'2026-09-08'},now),false);
  assert.equal(context.isTaskOverdue({dueDate:'2026-09-07'},now),true);
  assert.equal(context.isTaskOverdue({dueDate:'2026-09-09',dueTime:'00:01'},now),false);
  assert.equal(context.isTaskOverdue({dueDate:'2026-09-08'},new Date(2026,8,9,0,0)),true);
});
test('completed, pending-animation, missing and invalid deadlines are not overdue', () => {
  for (const task of [{dueDate:'2026-09-08',dueTime:'15:00',completed:true},{dueDate:'2026-09-08',dueTime:'15:00',isCompleting:true},{},{dueDate:'2026-02-30'},{dueDate:'2026-09-08',dueTime:'oops'}]) assert.equal(context.isTaskOverdue(task,now),false);
  assert.notEqual(context.getDueLabel({completed:true,dueDate:'2026-09-01'},now).text,'Overdue');
});
test('completion captures due date and source before metadata can change', () => {
  context.state.projects=[{id:'p',name:'Launch',color:'#48dbfb',sections:[{id:'s',name:'Review'}]}];
  const saved=context.captureTaskCompletionContext({projectId:'p',sectionId:'s',dueDate:'2026-09-08',dueTime:'15:00'});
  context.state.projects[0].name='Renamed';
  assert.equal(saved.completionSource.name,'Launch'); assert.equal(saved.completionSource.section,'Review');
  assert.equal(saved.completionDueDate,'2026-09-08'); assert.equal(saved.completionDueTime,'15:00');
});
