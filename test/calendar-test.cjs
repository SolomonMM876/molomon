const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const path = require('node:path');
const projectDir = path.resolve(__dirname, '..');
const context = { Intl, Date, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectDir, 'calendar-core.js'), 'utf8'), context);
const C = context.MolomonCalendarCore;
{
  const calendars = [{id:'own@example.invalid',primary:true}, {id:'partner@example.invalid'}, {id:'music@example.invalid'}];
  const selected = (ids, options) => Array.from(C.googleSelection(ids, calendars, options));
  assert.deepEqual(selected('primary, manual@example.invalid', {choosePrimary:true}), ['own@example.invalid']);
  assert.deepEqual(selected('partner@example.invalid, manual@example.invalid'), ['partner@example.invalid']);
  assert.deepEqual(selected('primary, own@example.invalid, partner@example.invalid', {excludePrimary:true}), ['partner@example.invalid']);
  assert.deepEqual(selected('primary', {excludePrimary:true}), []);
  assert.deepEqual(selected(''), []);
  assert.deepEqual(selected(['partner@example.invalid','partner@example.invalid']), ['partner@example.invalid']);
  assert.deepEqual(Array.from(C.googleSelection('primary', [], {choosePrimary:true})), []);
  console.log('Passed: Google-only selections, saved-ID filtering, primary defaults, shared-panel isolation, and empty selections.');
}
assert.equal(C.validZone(undefined), false);
assert.equal(C.zonedTime('2026-03-08', '02:30', 'America/New_York'), null);
assert.equal(new Date(C.zonedTime('2026-11-01', '01:30', 'America/New_York')).toISOString(), '2026-11-01T05:30:00.000Z');
assert.equal(new Date(C.zonedTime('2026-11-01', '01:30', 'America/New_York', true)).toISOString(), '2026-11-01T06:30:00.000Z');
assert.equal(C.weekRange('2026-03-02', 'America/New_York').end - C.weekRange('2026-03-02', 'America/New_York').start, 167 * 3600000);
assert.equal(C.validZone('Madeup/Zone'), false);
{
  const spring = C.availableWindows({zone:'America/New_York',from:'02:30',to:'04:00',days:[0]}, C.weekRange('2026-03-02','America/New_York'));
  assert.equal(new Date(spring[0][0]).toISOString(), '2026-03-08T07:00:00.000Z');
  assert.equal(spring[0][1]-spring[0][0], 3600000);
  const fall = C.availableWindows({zone:'America/New_York',from:'01:30',to:'02:30',days:[0]}, C.weekRange('2026-10-26','America/New_York'));
  assert.equal(fall[0][1]-fall[0][0], 2*3600000);
  const covered = C.queryRange('2026-03-09');
  for (const zone of ['Pacific/Honolulu','Pacific/Kiritimati','America/New_York']) {
    const week = C.weekRange('2026-03-09',zone);
    assert.ok(covered.start <= week.start && covered.end >= week.end);
  }
}
const people = [{zone:'Pacific/Honolulu', from:'09:00', to:'12:00', days:[1]}, {zone:'America/New_York', from:'15:00', to:'18:00', days:[1]}];
const free = C.freeWindows(people, [[], [[Date.parse('2026-03-09T20:00Z'),Date.parse('2026-03-09T20:30Z')]]], C.weekRange('2026-03-09', 'UTC'), 30);
assert.equal(free.length, 2);
assert.equal(new Date(free[0][0]).toISOString(), '2026-03-09T19:00:00.000Z');
assert.equal(new Date(free[1][1]).toISOString(), '2026-03-09T22:00:00.000Z');
console.log('Passed: DST gap/fold and 167-hour week; free-window intersection/subtraction across time zones.');
{
  const range = C.queryRange('2026-03-09');
  const timed = (summary, start, end, extra = {}) => ({ summary, start: { dateTime: start }, end: { dateTime: end }, ...extra });
  const response = { timeZone: 'America/New_York', accessRole: 'reader', items: [
    timed('Movie night', '2026-03-10T19:00:00-04:00', '2026-03-10T20:00:00-04:00'),
    timed('Hidden title', '2026-03-10T20:00:00-04:00', '2026-03-10T21:00:00-04:00', { visibility: 'private' }),
    timed('Cancelled', '2026-03-10T21:00:00-04:00', '2026-03-10T22:00:00-04:00', { status: 'cancelled' }),
    timed('Optional walk', '2026-03-10T19:30:00-04:00', '2026-03-10T20:30:00-04:00', { transparency: 'transparent' }),
    { summary: 'Day away', start: { date: '2026-03-10' }, end: { date: '2026-03-11' } }
  ] };
  const events = C.googleEvents(response, 'Partner calendar', range);
  assert.equal(events.length, 4);
  assert.equal(events[0].title, 'Movie night');
  assert.equal(events[1].title, 'Private event');
  assert.equal(events[2].free, true);
  assert.equal(new Date(events[3].start).toISOString(), '2026-03-10T04:00:00.000Z');
  assert.equal(new Date(events[3].end).toISOString(), '2026-03-11T04:00:00.000Z');
  assert.equal(C.googleEvents({ ...response, accessRole: 'owner' }, 'Mine', range)[1].title, 'Hidden title');
  assert.equal(C.googleEvents({ ...response, accessRole: 'freeBusyReader' }, 'Partner', range).length, 0);
  assert.throws(() => C.googleEvents({ items: [timed('Bad', 'invalid', 'invalid')] }, 'Mine', range), /invalid event time/);
  const busy = [[events[0].start, events[1].end + 3600000]];
  const blocks = C.calendarBlocks(busy, events.slice(0, 3), range);
  assert.equal(blocks.filter(block => block.title === 'Busy').length, 1);
  assert.equal(blocks.find(block => block.title === 'Busy').start, events[1].end);
  assert.equal(blocks.find(block => block.title === 'Movie night').columns, 2);
  assert.notEqual(blocks.find(block => block.title === 'Movie night').lane, blocks.find(block => block.title === 'Optional walk').lane);
  assert.equal(C.calendarBlocks(busy, [], range)[0].title, 'Busy');
  assert.equal(C.calendarBlocks([], [events[2]], range)[0].free, true);
  console.log('Passed: Google event titles, private-event redaction, all-day timezone boundaries, cancelled/free events, overlap layout, and busy-only fallback.');
}
