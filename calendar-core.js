/* Pure calendar time-zone, availability, and display helpers. */
(function () {
  "use strict";
  const MINUTE = 60000, DAY = 86400000;
  const formats = new Map();

  function validZone(zone) {
    if (typeof zone !== "string" || !zone.trim() || zone.length > 100) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); return true; }
    catch (_) { return false; }
  }
  function parts(timestamp, zone) {
    if (!formats.has(zone)) formats.set(zone, new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }));
    const result = {};
    for (const item of formats.get(zone).formatToParts(new Date(timestamp))) {
      if (item.type !== "literal") result[item.type] = Number(item.value);
    }
    return result;
  }
  function wallStamp(value) { return Date.UTC(value.year, value.month - 1, value.day, value.hour || 0, value.minute || 0, value.second || 0); }
  function isoDate(value) { return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`; }
  function localDate(timestamp, zone) { return isoDate(parts(timestamp, zone)); }
  function validDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date; }
  function addDays(date, count) { return new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10); }
  function monday(date) {
    if (!validDate(date)) throw new Error("Choose a valid date.");
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return addDays(date, -((weekday + 6) % 7));
  }
  // Resolve a wall-clock time using the browser's IANA timezone data. The two
  // possible offsets at a DST fold are tested; nonexistent times return null.
  function zonedTime(date, time, zone, endBoundary = false) {
    if (!validZone(zone) || !validDate(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) throw new Error("Use a valid date, time, and IANA time zone.");
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute, second = 0] = time.split(":").map(Number);
    if (hour > 23 || minute > 59 || second > 59) throw new Error("Use a valid time.");
    const wall = Date.UTC(year, month - 1, day, hour, minute, second);
    const offsets = new Set();
    for (let delta = -36; delta <= 36; delta += 12) {
      const sample = wall + delta * 3600000;
      offsets.add(wallStamp(parts(sample, zone)) - sample);
    }
    const candidates = [...offsets].map(offset => wall - offset).filter(candidate => wallStamp(parts(candidate, zone)) === wall).sort((a, b) => a - b);
    return candidates.length ? candidates[endBoundary ? candidates.length - 1 : 0] : null;
  }
  function boundary(date, time, zone, end = false) {
    let candidate = zonedTime(date, time, zone, end);
    if (candidate !== null) return candidate;
    // A daily window boundary in a spring-forward gap starts at the next real
    // local minute. Google supplies expanded event times separately.
    let wall = Date.parse(`${date}T${time}:00Z`);
    for (let i = 1; i <= 180; i++) {
      wall += MINUTE;
      const shifted = new Date(wall).toISOString();
      candidate = zonedTime(shifted.slice(0, 10), shifted.slice(11, 16), zone, end);
      if (candidate !== null) return candidate;
    }
    throw new Error(`Cannot resolve this time in ${zone}.`);
  }
  function weekRange(week, zone) { return { start: boundary(week, "00:00", zone), end: boundary(addDays(week, 7), "00:00", zone, true) }; }
  // This covers the selected local week for every current IANA UTC offset. It
  // lets partners view the same Google data in different zones without edge loss.
  function queryRange(week) { return { start: Date.parse(`${week}T00:00:00Z`) - 14 * 3600000, end: Date.parse(`${addDays(week, 7)}T00:00:00Z`) + 12 * 3600000 }; }
  function merge(intervals, range) {
    const sorted = intervals.map(pair => [Math.max(pair[0], range ? range.start : -Infinity), Math.min(pair[1], range ? range.end : Infinity)])
      .filter(pair => Number.isFinite(pair[0]) && Number.isFinite(pair[1]) && pair[1] > pair[0]).sort((a, b) => a[0] - b[0]);
    const result = [];
    for (const pair of sorted) {
      const last = result[result.length - 1];
      if (last && pair[0] <= last[1]) last[1] = Math.max(last[1], pair[1]);
      else result.push(pair.slice());
    }
    return result;
  }
  function subtract(available, busy) {
    const result = [];
    for (const [start, end] of available) {
      let cursor = start;
      for (const [busyStart, busyEnd] of busy) {
        if (busyEnd <= cursor) continue;
        if (busyStart >= end) break;
        if (busyStart > cursor) result.push([cursor, Math.min(end, busyStart)]);
        cursor = Math.max(cursor, busyEnd);
        if (cursor >= end) break;
      }
      if (cursor < end) result.push([cursor, end]);
    }
    return result;
  }
  function intersect(left, right) {
    const result = []; let a = 0, b = 0;
    while (a < left.length && b < right.length) {
      const start = Math.max(left[a][0], right[b][0]), end = Math.min(left[a][1], right[b][1]);
      if (end > start) result.push([start, end]);
      if (left[a][1] < right[b][1]) a++; else b++;
    }
    return result;
  }
  function availableWindows(person, range) {
    const windows = [];
    let date = addDays(localDate(range.start, person.zone), -1);
    const lastDate = addDays(localDate(range.end, person.zone), 1);
    while (date <= lastDate) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (person.days.includes(weekday)) {
        const endDate = person.to <= person.from ? addDays(date, 1) : date;
        windows.push([boundary(date, person.from, person.zone), boundary(endDate, person.to, person.zone, true)]);
      }
      date = addDays(date, 1);
    }
    return merge(windows, range);
  }
  function freeWindows(people, busy, range, duration) {
    const available = people.map((person, i) => subtract(availableWindows(person, range), merge(busy[i], range)));
    return intersect(available[0], available[1]).filter(pair => pair[1] - pair[0] >= duration * MINUTE);
  }

  function googleEvents(value, calendarName, range) {
    if (!Array.isArray(value.items)) throw new Error("Google returned an invalid event list.");
    if (value.accessRole === "freeBusyReader" || value.accessRole === "none") return [];
    const zone = value.timeZone || "UTC", events = [];
    const privateAccess = ["owner", "writer"].includes(value.accessRole);
    for (const item of value.items) {
      if (item.status === "cancelled") continue;
      const allDay = !!item.start?.date;
      const start = allDay ? boundary(item.start.date, "00:00", zone) : Date.parse(item.start?.dateTime);
      const end = allDay ? boundary(item.end?.date, "00:00", zone, true) : Date.parse(item.end?.dateTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Google returned an invalid event time.");
      if (end <= range.start || start >= range.end) continue;
      const hidden = !privateAccess && ["private", "confidential"].includes(item.visibility);
      events.push({ start, end, title: hidden ? "Private event" : String(item.summary || "Untitled event").slice(0, 1000), calendar: calendarName, allDay, free: item.transparency === "transparent" });
    }
    return events;
  }
  function calendarBlocks(busy, events, range) {
    const blocks = events.filter(event => event.end > range.start && event.start < range.end).map(event => ({ ...event, from: Math.max(event.start, range.start), to: Math.min(event.end, range.end) }));
    const uncovered = subtract(merge(busy, range), merge(events.filter(event => !event.free).map(event => [event.start, event.end]), range));
    for (const [from, to] of uncovered) blocks.push({ from, to, start: from, end: to, title: "Busy", calendar: "", free: false });
    blocks.sort((a, b) => a.from - b.from || b.to - a.to);
    let group = [], groupEnd = -Infinity, lanes = [];
    const finish = () => { for (const block of group) block.columns = lanes.length; };
    for (const block of blocks) {
      if (block.from >= groupEnd) { finish(); group = []; lanes = []; groupEnd = -Infinity; }
      let lane = lanes.findIndex(end => end <= block.from);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = block.to; block.lane = lane; group.push(block); groupEnd = Math.max(groupEnd, block.to);
    }
    finish(); return blocks;
  }

  function googleSelection(ids, calendars, { choosePrimary = false, excludePrimary = false } = {}) {
    const wanted = Array.isArray(ids) ? ids : String(ids || "").split(",").map(id => id.trim());
    const allowed = calendars.filter(calendar => !excludePrimary || !calendar.primary);
    const selected = allowed.filter(calendar => wanted.includes(calendar.id) || (choosePrimary && calendar.primary && wanted.includes("primary"))).map(calendar => calendar.id);
    if (!selected.length && choosePrimary) { const primary = allowed.find(calendar => calendar.primary); if (primary) selected.push(primary.id); }
    return [...new Set(selected)];
  }
  const api = { validZone, parts, zonedTime, boundary, localDate, addDays, monday, weekRange, queryRange, merge, subtract, intersect, availableWindows, freeWindows, googleEvents, calendarBlocks, googleSelection };

  if (typeof module === "object" && module.exports) module.exports = api;
  else globalThis.MolomonCalendarCore = api;
})();
