const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const path = require('node:path');
const projectDir = path.resolve(__dirname, '..');
const context = { Intl, Date, TextEncoder, TextDecoder, btoa, atob, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectDir, 'assets/vendor/ical.min.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(projectDir, 'calendar.js'), 'utf8'), context);
const C = context.MolomonCalendarCore;
assert.equal(C.validZone(undefined), false);
assert.equal(C.zonedTime('2026-03-08', '02:30', 'America/New_York'), null);
assert.equal(new Date(C.zonedTime('2026-11-01', '01:30', 'America/New_York')).toISOString(), '2026-11-01T05:30:00.000Z');
assert.equal(new Date(C.zonedTime('2026-11-01', '01:30', 'America/New_York', true)).toISOString(), '2026-11-01T06:30:00.000Z');
assert.equal(C.weekRange('2026-03-02', 'America/New_York').end - C.weekRange('2026-03-02', 'America/New_York').start, 167 * 3600000);
const ics = events => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR\r\n`;
const event = lines => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT`;
let range = C.queryRange('2026-03-09');
let busy = C.calendarBusy(ics(event(['UID:weekly','DTSTART;TZID=America/New_York:20260302T090000','DTEND;TZID=America/New_York:20260302T100000','RRULE:FREQ=WEEKLY;COUNT=4','EXDATE;TZID=America/New_York:20260316T090000'])), 'Pacific/Honolulu', range);
assert.equal(new Date(busy[0][0]).toISOString(), '2026-03-09T13:00:00.000Z');
assert.equal(busy[0][1] - busy[0][0], 3600000);
busy = C.calendarBusy(ics(event(['UID:all-day','DTSTART;VALUE=DATE:20260310','DTEND;VALUE=DATE:20260312'])), 'Pacific/Honolulu', range);
assert.equal(new Date(busy[0][0]).toISOString(), '2026-03-10T10:00:00.000Z');
assert.equal(new Date(busy[0][1]).toISOString(), '2026-03-12T10:00:00.000Z');
busy = C.calendarBusy(ics(event(['UID:utc','DTSTART:20260310T100000Z','DTEND:20260310T110000Z','TRANSP:TRANSPARENT'])), 'Pacific/Honolulu', range);
assert.equal(busy.length, 0);
const recurring = event(['UID:override','DTSTART;TZID=America/New_York:20260302T090000','DTEND;TZID=America/New_York:20260302T100000','RRULE:FREQ=WEEKLY;COUNT=4']);
const override = event(['UID:override','RECURRENCE-ID;TZID=America/New_York:20260309T090000','DTSTART;TZID=America/New_York:20260309T110000','DTEND;TZID=America/New_York:20260309T120000']);
busy = C.calendarBusy(ics(recurring + '\r\n' + override), 'Pacific/Honolulu', range);
assert.equal(busy.some(pair => new Date(pair[0]).toISOString() === '2026-03-09T13:00:00.000Z'), false);
assert.equal(busy.some(pair => new Date(pair[0]).toISOString() === '2026-03-09T15:00:00.000Z'), true);
assert.throws(() => C.calendarBusy(ics(event(['UID:bad-zone','DTSTART;TZID=Madeup/Zone:20260310T100000','DTEND;TZID=Madeup/Zone:20260310T110000'])), 'UTC', range), /unknown time zone/);
const people = [{zone:'Pacific/Honolulu', from:'09:00', to:'12:00', days:[1]}, {zone:'America/New_York', from:'15:00', to:'18:00', days:[1]}];
const free = C.freeWindows(people, [[], [[Date.parse('2026-03-09T20:00Z'),Date.parse('2026-03-09T20:30Z')]]], C.weekRange('2026-03-09', 'UTC'), 30);
assert.equal(free.length, 2);
assert.equal(new Date(free[0][0]).toISOString(), '2026-03-09T19:00:00.000Z');
assert.equal(new Date(free[1][1]).toISOString(), '2026-03-09T22:00:00.000Z');
const snapshot = {v:1,name:'Sol 🌱',zone:'Pacific/Honolulu',week:'2026-03-09',range:[range.start,range.end],busy:[],updatedAt:new Date().toISOString()};
assert.equal(C.decodeSnapshot(C.encodeSnapshot(snapshot)).name, snapshot.name);
assert.throws(() => C.decodeSnapshot('M1.Zm9v'), /could not be read/);
console.log('Passed: DST gap/fold and 167-hour week; timezone weekly recurrence; all-day exclusive end; transparent events; recurrence override; unknown zone rejection; free-window intersection/subtraction; Unicode share-code validation.');
{
  const untilCalendar = ics(event(['UID:until-bound','DTSTART;TZID=America/New_York:20260302T090000','DTEND;TZID=America/New_York:20260302T100000','RRULE:FREQ=WEEKLY;UNTIL=20260309T100000Z']));
  assert.equal(C.calendarBusy(untilCalendar, 'UTC', C.weekRange('2026-03-09','UTC')).length, 0);
  const customZone = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VTIMEZONE','TZID:Custom/Nook','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0200','TZOFFSETTO:+0200','END:STANDARD','END:VTIMEZONE','BEGIN:VEVENT','UID:embedded','DTSTART;TZID=Custom/Nook:20260310T090000','DTEND;TZID=Custom/Nook:20260310T100000','END:VEVENT','END:VCALENDAR'].join('\r\n');
  assert.equal(new Date(C.calendarBusy(customZone, 'UTC', C.weekRange('2026-03-09','UTC'))[0][0]).toISOString(), '2026-03-10T07:00:00.000Z');
  console.log('Passed: UTC UNTIL for IANA TZID without VTIMEZONE; embedded custom VTIMEZONE.');
}
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
