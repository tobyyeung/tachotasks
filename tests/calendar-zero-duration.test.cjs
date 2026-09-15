const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function collect(file, event) {
  const source = fs.readFileSync(file, 'utf8');
  const schedule = file.includes('schedule');
  const name = schedule ? 'addScheduleEvent' : 'addEventItems';
  const start = source.indexOf(`  const ${name} =`);
  const end = source.indexOf('  state.events.forEach', start);
  const days = ['2026-09-15', '2026-09-16'];
  const context = vm.createContext({
    event, days, items: [], itemsByDate: Object.fromEntries(days.map(day => [day, []])),
    monthDays: days.map(day => new Date(`${day}T12:00:00`)),
    toDateStr: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  });
  vm.runInContext(`${source.slice(start, end)}; ${name}(event, 'gcal_event', '#4285f4');`, context);
  return schedule ? Object.values(context.itemsByDate).flat() : context.items;
}

for (const file of ['js/views/calendar.js', 'js/views/calendar-schedule.js']) {
  test(`${file}: equal same-day times stay on one day, including midnight`, () => {
    for (const time of ['09:30', '00:00']) {
      const items = collect(file, { id: 'event', date: '2026-09-15', endDate: '2026-09-15', startTime: time, endTime: time });
      assert.equal(items.length, 1);
      assert.equal(items[0].startTime, time);
      assert.equal(items[0].endTime, time);
      assert.equal(items[0].type, 'gcal_event');
    }
  });
  test(`${file}: actual overnight and 24-hour events retain both segments`, () => {
    for (const [endDate, startTime, endTime] of [['2026-09-15', '22:00', '09:30'], ['2026-09-16', '09:30', '09:30']]) {
      assert.equal(collect(file, { id: 'event', date: '2026-09-15', endDate, startTime, endTime }).length, 2);
    }
  });
}

test('compact event detection excludes all-day and multi-day events', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('js/views/calendar-grid.js', 'utf8'), context);
  const event = { date: '2026-09-15', startTime: '09:30', endTime: '09:30' };
  assert.equal(context.isZeroDurationCalendarEvent(event), true);
  assert.equal(context.isZeroDurationCalendarEvent({ ...event, isAllDay: true }), false);
  assert.equal(context.isZeroDurationCalendarEvent({ ...event, endDate: '2026-09-16' }), false);
  vm.runInContext(fs.readFileSync('js/views/calendar-schedule.js', 'utf8'), context);
  context.formatTimeShort = time => time;
  assert.equal(context.formatScheduleTimeRange('09:30', '09:30', false), '09:30');
});
