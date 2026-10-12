/* Calendar data and Google tokens are memory-only. Preferences alone use storage.
 * ICS parsing: local ICAL.js 2.2.1, MPL-2.0 (assets/vendor/ical-LICENSE.txt).
 */
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
    // local minute. Recurring events use strict zonedTime instead (RFC5545).
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
  // lets partners view the same snapshot in different zones without edge loss.
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

  function calendarBusy(text, fallbackZone, range) {
    if (!globalThis.ICAL) throw new Error("The local calendar parser could not load. Refresh and try again.");
    const ICAL = globalThis.ICAL;
    const parsed = new ICAL.Component(ICAL.parse(text));
    if (parsed.name !== "vcalendar") throw new Error("Import a valid .ics calendar file.");
    ICAL.TimezoneService.reset();
    for (const component of parsed.getAllSubcomponents("vtimezone")) {
      const zone = new ICAL.Timezone(component);
      ICAL.TimezoneService.register(zone.tzid, zone);
    }
    const calendarZone = parsed.getFirstPropertyValue("x-wr-timezone");
    const defaultZone = validZone(calendarZone) ? calendarZone : fallbackZone;
    const components = parsed.getAllSubcomponents("vevent");
    if (components.length > 50000) throw new Error("This export is too large. Import a smaller calendar.");
    // Some exports reference IANA zones without VTIMEZONE definitions. Give
    // the parser an Intl-backed zone before it expands RRULE/UNTIL; converting
    // only the final intervals would incorrectly compare local dates to UTC.
    for (const component of components) for (const property of component.getAllProperties()) {
      const hint = property.getParameter("tzid");
      if (!hint || ICAL.TimezoneService.has(hint) || !validZone(hint)) continue;
      const zone = new ICAL.Timezone({ tzid: hint });
      zone.utcOffset = time => {
        const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour || 0, time.minute || 0, time.second || 0);
        if (time.zone?.tzid === "UTC") return (wallStamp(parts(wall, hint)) - wall) / 1000;
        const date = isoDate(time), clock = `${String(time.hour || 0).padStart(2, "0")}:${String(time.minute || 0).padStart(2, "0")}:${String(time.second || 0).padStart(2, "0")}`;
        const actual = zonedTime(date, clock, hint);
        return actual === null ? (wallStamp(parts(wall, hint)) - wall) / 1000 : (wall - actual) / 1000;
      };
      ICAL.TimezoneService.register(hint, zone);
    }
    const masters = [], exceptions = new Map();
    for (const component of components) {
      const event = new ICAL.Event(component, { strictExceptions: true });
      if (event.isRecurrenceException()) {
        if (!exceptions.has(event.uid)) exceptions.set(event.uid, []);
        exceptions.get(event.uid).push(event);
      } else masters.push(event);
    }
    const result = [];
    let iterations = 0;
    function instant(time, event, isEnd) {
      if (!time) throw new Error("A calendar event is missing its start time.");
      const property = event.component.getFirstProperty(isEnd ? "dtend" : "dtstart") || event.component.getFirstProperty("dtstart");
      const hint = property && property.getParameter("tzid");
      if (time.zone && time.zone.tzid === "UTC") return time.toUnixTime() * 1000;
      if (!time.isDate && hint && ICAL.TimezoneService.has(hint)) {
        if (validZone(hint)) {
          const date = isoDate(time), clock = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:${String(time.second).padStart(2, "0")}`;
          if (zonedTime(date, clock, hint) === null) return null;
        }
        return time.toUnixTime() * 1000;
      }
      if (time.isDate || !hint || validZone(hint)) {
        const zone = time.isDate ? defaultZone : (hint || defaultZone);
        const date = `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
        const local = time.isDate ? "00:00:00" : `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:${String(time.second).padStart(2, "0")}`;
        return zonedTime(date, local, zone, isEnd);
      }
      if (!ICAL.TimezoneService.has(hint)) throw new Error(`The export uses an unknown time zone: ${hint}. Re-export it with timezone definitions.`);
      return time.toUnixTime() * 1000;
    }
    function include(event, startDate, endDate) {
      const component = event.component;
      if (String(component.getFirstPropertyValue("status")).toUpperCase() === "CANCELLED" || String(component.getFirstPropertyValue("transp")).toUpperCase() === "TRANSPARENT") return;
      const start = instant(startDate, event, false), end = instant(endDate, event, true);
      // Invalid recurrence times in DST gaps are ignored, per RFC5545.
      if (start === null || end === null) return;
      if (end < start) throw new Error("An event ends before it starts. Check the calendar export.");
      if (end > range.start && start < range.end && end > start) result.push([start, end]);
    }
    for (const event of masters) {
      if (!event.component.getFirstProperty("dtstart")) {
        if (String(event.component.getFirstPropertyValue("status")).toUpperCase() === "CANCELLED") continue;
        throw new Error("A calendar event is missing DTSTART.");
      }
      for (const exception of exceptions.get(event.uid) || []) event.relateException(exception);
      if (!event.isRecurring()) { include(event, event.startDate, event.endDate); continue; }
      const iterator = event.iterator();
      let occurrence;
      while ((occurrence = iterator.next())) {
        if (++iterations > 150000) throw new Error("This calendar has too many recurrence instances. Use Google connection or a smaller export.");
        const originalStart = instant(occurrence, event, false);
        if (originalStart !== null && originalStart >= range.end) break;
        const detail = event.getOccurrenceDetails(occurrence);
        include(detail.item, detail.startDate, detail.endDate);
      }
    }
    // Moved occurrences can fall into this week even when their original
    // recurrence lies beyond it. Also include stand-alone exceptions.
    for (const values of exceptions.values()) for (const event of values) {
      if (event.component.getFirstProperty("dtstart")) include(event, event.startDate, event.endDate);
    }
    return merge(result, range);
  }

  function encodeSnapshot(snapshot) {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return "M1." + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeSnapshot(code) {
    if (code.length > 200000 || !/^M1\.[A-Za-z0-9_-]+$/.test(code)) throw new Error("Paste a complete Molomon availability code.");
    let value;
    try {
      const binary = atob(code.slice(3).replace(/-/g, "+").replace(/_/g, "/"));
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0))));
    } catch (_) { throw new Error("The availability code could not be read."); }
    if (value.v !== 1 || typeof value.name !== "string" || value.name.length > 80 || !validZone(value.zone) || !validDate(value.week) || monday(value.week) !== value.week || !Array.isArray(value.busy) || value.busy.length > 15000 || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error("The availability code contains invalid calendar data.");
    const expected = queryRange(value.week);
    if (!Array.isArray(value.range) || value.range[0] !== expected.start || value.range[1] !== expected.end) throw new Error("This code has an unsupported week range.");
    for (const interval of value.busy) if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(Number.isFinite) || interval[1] <= interval[0] || interval[0] < expected.start || interval[1] > expected.end) throw new Error("The availability code contains invalid busy intervals.");
    return { v: 1, name: value.name, zone: value.zone, week: value.week, updatedAt: value.updatedAt, range: value.range, busy: merge(value.busy, expected) };
  }
  globalThis.MolomonCalendarCore = { validZone, parts, zonedTime, boundary, localDate, addDays, monday, weekRange, queryRange, merge, subtract, intersect, availableWindows, freeWindows, calendarBusy, encodeSnapshot, decodeSnapshot };
  if (typeof document === "undefined") return;

  const config = globalThis.MOLOMON_CONFIG || {};
  const googleClientId = config.calendar && config.calendar.googleClientId || "";
  const SCOPES = ["https://www.googleapis.com/auth/calendar.events.freebusy", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"];
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const $ = selector => document.querySelector(selector);
  const state = { week: monday(localDate(Date.now(), deviceZone)), viewZone: deviceZone, duration: 30, people: [], sources: [null, null], tokens: [null, null], busy: [[], []], loaded: [false, false], requests: [null, null], revisions: [0, 0], calendarLists: [null, null] };
  let preferences = {}, savedNames = [];
  try {
    const saved = JSON.parse(localStorage.getItem("molomon-calendar-preferences") || "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) preferences = saved;
    const storedNames = JSON.parse(localStorage.getItem("molomon-names") || "[]");
    if (Array.isArray(storedNames)) savedNames = storedNames;
  } catch (_) { /* Storage is optional. */ }
  const names = savedNames.length ? savedNames : config.partners || [];
  for (let index = 0; index < 2; index++) {
    const saved = Array.isArray(preferences.people) ? preferences.people[index] || {} : {};
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    state.people.push({ name: String(names[index] || saved.name || (index ? "Partner" : "You")).slice(0, 80), zone: validZone(saved.zone) ? saved.zone : deviceZone, from: timePattern.test(saved.from) ? saved.from : "09:00", to: timePattern.test(saved.to) ? saved.to : "21:00", days: Array.isArray(saved.days) ? saved.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [0, 1, 2, 3, 4, 5, 6], ids: typeof saved.ids === "string" && saved.ids.length < 15000 ? saved.ids : "primary" });
  }
  if (validZone(preferences.viewZone)) state.viewZone = preferences.viewZone;
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function status(message, error = false) { const node = $("#page-status"); node.textContent = message; node.classList.toggle("error", error); }
  function savePreferences() {
    try { localStorage.setItem("molomon-calendar-preferences", JSON.stringify({ viewZone: state.viewZone, people: state.people.map(person => ({ name: person.name, zone: person.zone, from: person.from, to: person.to, days: person.days, ids: person.ids })) })); } catch (_) { /* Private browsing may disable storage. */ }
  }
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Pacific/Honolulu", "America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney"];
  for (const zone of [...new Set([deviceZone, "UTC", ...zones])]) { const option = element("option"); option.value = zone; $("#time-zones").append(option); }
  $("#week-date").value = state.week; $("#display-zone").value = state.viewZone;
  $("#display-zone").addEventListener("input", () => $("#display-zone").setCustomValidity(""));
  function personPanel(index) {
    const panel = element("article", "person-panel");
    panel.innerHTML = `<div class="person-heading"><span class="person-dot" aria-hidden="true"></span><h2 id="person-heading-${index}"></h2></div>
      <div class="person-fields"><label for="name-${index}">Name<input id="name-${index}" type="text" maxlength="80" autocomplete="off"></label><label for="zone-${index}">Time zone<input id="zone-${index}" type="text" list="time-zones" spellcheck="false" autocomplete="off" required></label></div>
      <div class="hours-row"><label for="from-${index}">Available from<input id="from-${index}" type="time" required></label><label for="to-${index}">Until<input id="to-${index}" type="time" required></label></div>
      <fieldset class="days-select"><legend>Available days · in this person's time zone</legend><div class="day-options" id="days-${index}"></div></fieldset>
      <p class="source-status" id="source-${index}" role="status" aria-live="polite"></p>
      <div class="person-actions"><button class="calendar-button google-connect" id="google-${index}" type="button">Sign in with Google</button><button class="calendar-button secondary" id="shared-${index}" type="button" disabled>Load shared calendar</button><button class="calendar-button secondary" id="refresh-${index}" type="button" disabled>Refresh Google</button><button class="calendar-button secondary" id="clear-${index}" type="button" disabled>Forget calendar</button></div>
      <fieldset class="calendar-picker" id="calendars-${index}" hidden><legend>Google calendars</legend><div id="calendar-options-${index}"></div></fieldset>
      <label class="calendar-ids" for="ids-${index}">Google calendar IDs · comma-separated<input id="ids-${index}" type="text" value="primary" autocomplete="off" spellcheck="false"></label>
      <label class="import-label" for="file-${index}">Import calendar .ics files<input id="file-${index}" type="file" accept=".ics,text/calendar" multiple></label>
      <details class="share-panel"><summary>Share availability</summary><p class="muted">A snapshot for this week. Send privately; refresh it after calendar changes.</p><div class="person-actions"><button class="calendar-button secondary" id="create-code-${index}" type="button" disabled>Create code</button><button class="calendar-button secondary" id="copy-code-${index}" type="button" disabled>Copy code</button></div><label for="share-${index}">Availability code<textarea id="share-${index}" spellcheck="false" autocomplete="off" placeholder="Create a code or paste your partner's code"></textarea></label><div class="person-actions"><button class="calendar-button secondary" id="load-code-${index}" type="button">Load pasted code</button></div></details>`;
    panel.setAttribute("aria-labelledby", `person-heading-${index}`);
    const person = state.people[index];
    $("#people").append(panel);
    $(`#person-heading-${index}`).textContent = person.name;
    for (const [field, value] of [["name", person.name], ["zone", person.zone], ["from", person.from], ["to", person.to]]) $(`#${field}-${index}`).value = value;
    $(`#ids-${index}`).value = person.ids;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    days.forEach((day, value) => {
      const label = element("label"), input = element("input"); input.type = "checkbox"; input.value = value; input.checked = person.days.includes(value); input.setAttribute("aria-label", `${day} available for ${person.name}`); label.append(input, document.createTextNode(day)); $(`#days-${index}`).append(label);
      input.addEventListener("change", () => updatePerson(index));
    });
    for (const field of ["name", "zone", "from", "to"]) $(`#${field}-${index}`).addEventListener("change", () => updatePerson(index));
    $(`#ids-${index}`).addEventListener("change", () => selectionChanged(index));
    $(`#google-${index}`).disabled = !googleClientId;
    $(`#google-${index}`).addEventListener("click", () => connectGoogle(index));
    $(`#shared-${index}`).addEventListener("click", () => {
      const ids = $(`#ids-${index}`).value.split(",").map(value => value.trim()).filter(Boolean);
      const token = state.tokens[1 - index];
      if (!ids.length || ids.includes("primary")) { status("For a shared calendar, replace primary with your partner's explicit Google calendar ID.", true); $(`#ids-${index}`).focus(); return; }
      if (!token || token.expires <= Date.now() + 30000) { status("Connect your own Google account in the other panel first.", true); return; }
      invalidateRequest(index);
      state.tokens[index] = token;
      state.calendarLists[index] = state.calendarLists[1 - index];
      renderCalendarPicker(index);
      fetchGoogleBusy(index);
    });
    $(`#refresh-${index}`).addEventListener("click", () => refreshGoogle(index));
    $(`#clear-${index}`).addEventListener("click", () => { invalidateRequest(index); state.sources[index] = null; state.tokens[index] = null; state.calendarLists[index] = null; $(`#calendars-${index}`).hidden = true; $(`#share-${index}`).value = ""; $(`#file-${index}`).value = ""; $(`#copy-code-${index}`).disabled = true; render(); status(`${person.name}'s calendar data was removed from this page.`); });
    $(`#file-${index}`).addEventListener("change", event => importFiles(index, event.target.files));
    $(`#create-code-${index}`).addEventListener("click", () => createCode(index));
    $(`#copy-code-${index}`).addEventListener("click", async () => { const textarea = $(`#share-${index}`); try { await navigator.clipboard.writeText(textarea.value); status("Availability code copied. Send it privately to your partner."); } catch (_) { textarea.focus(); textarea.select(); status("Code selected. Use your device's Copy command."); } });
    $(`#load-code-${index}`).addEventListener("click", () => loadCode(index));
  }
  function updatePerson(index) {
    const person = state.people[index], zoneInput = $(`#zone-${index}`), zone = zoneInput.value.trim();
    zoneInput.setCustomValidity(validZone(zone) ? "" : "Use an IANA zone such as Pacific/Honolulu or Europe/London.");
    if (!zoneInput.reportValidity()) return;
    const from = $(`#from-${index}`).value, to = $(`#to-${index}`).value;
    if (!from || !to) { status("Choose both available-hour boundaries.", true); return; }
    person.name = $(`#name-${index}`).value.trim() || (index ? "Partner" : "You"); person.zone = zone; person.from = from; person.to = to;
    person.days = [...$(`#days-${index}`).querySelectorAll("input:checked")].map(input => Number(input.value));
    $(`#person-heading-${index}`).textContent = person.name;
    savePreferences(); render();
    status(to <= from ? "This window crosses midnight. Days refer to when the window starts." : "Available hours updated in each person's time zone.");
  }
  $("#week-form").addEventListener("submit", event => {
    event.preventDefault(); const zoneInput = $("#display-zone"), zone = zoneInput.value.trim();
    zoneInput.setCustomValidity(validZone(zone) ? "" : "Use a valid IANA time zone.");
    if (!zoneInput.reportValidity()) return;
    try { const oldWeek = state.week; state.week = monday($("#week-date").value); state.viewZone = zone; state.duration = Number($("#duration").value); $("#week-date").value = state.week; if (oldWeek !== state.week) { invalidateRequest(0); invalidateRequest(1); } savePreferences(); render(); refreshGoogleSources(true); status("Week updated. Connected Google calendars refresh automatically; shared codes must match this week."); }
    catch (error) { status(error.message, true); }
  });
  function changeWeek(week) {
    state.week = monday(week); $("#week-date").value = state.week; invalidateRequest(0); invalidateRequest(1); render(); refreshGoogleSources(true);
    status("Week updated. Connected Google calendars refresh automatically; shared codes must match this week.");
  }
  $("#previous-week").addEventListener("click", () => changeWeek(addDays(state.week, -7)));
  $("#next-week").addEventListener("click", () => changeWeek(addDays(state.week, 7)));
  $("#today-week").addEventListener("click", () => changeWeek(localDate(Date.now(), state.viewZone)));

  function formatTime(timestamp, zone) { return new Intl.DateTimeFormat("en", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(timestamp)); }
  function formatFull(timestamp, zone) { return new Intl.DateTimeFormat("en", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp)); }
  function windowText(start, end, zone) { return `${formatFull(start, zone)} – ${localDate(start, zone) === localDate(end, zone) ? formatTime(end, zone) : formatFull(end, zone)}`; }
  function sourceData(index, range) {
    const source = state.sources[index];
    if (!source) return { loaded: false, busy: [] };
    if (source.kind === "ics") return { loaded: true, busy: merge(source.files.flatMap(file => calendarBusy(file.text, state.people[index].zone, range)), range) };
    const covered = !!source.coverage && source.coverage.start <= range.start && source.coverage.end >= range.end;
    return { loaded: covered && !source.stale, busy: covered ? merge(source.busy, range) : [] };
  }
  function render() {
    const range = weekRange(state.week, state.viewZone), importedRange = queryRange(state.week);
    for (let index = 0; index < 2; index++) {
      let data;
      try { data = sourceData(index, importedRange); }
      catch (error) { data = { loaded: false, busy: [], error: error.message }; status(`${state.people[index].name}: ${error.message}`, true); }
      state.busy[index] = data.busy; state.loaded[index] = data.loaded;
      const source = state.sources[index];
      let message = "No calendar loaded. Import files or paste a share code.";
      if (source) {
        const label = source.kind === "ics" ? `${source.files.length} .ics file${source.files.length === 1 ? "" : "s"}` : source.kind === "google" ? "Google calendars" : "Shared snapshot";
        message = `${label} · ${source.kind === "ics" ? "Imported" : "Updated"} ${formatFull(Date.parse(source.updatedAt), state.viewZone)}. ${source.liveError ? source.liveError : data.error ? `Cannot read this week: ${data.error}` : data.loaded ? `Loaded for week of ${state.week}.${source.kind === "google" ? " Updates each minute while this tab is visible." : ""}` : `Not loaded for this week. ${source.kind === "google" ? "Refresh Google." : "Ask for a new share code."}`}`;
      }
      if (!googleClientId) message += " Google sign-in needs setup; file import works now.";
      $(`#source-${index}`).textContent = message;
      $(`#clear-${index}`).disabled = !source;
      $(`#google-${index}`).disabled = !googleClientId || !!state.requests[index];
      $(`#refresh-${index}`).disabled = !googleClientId || !state.tokens[index] || !!state.requests[index];
      $(`#shared-${index}`).disabled = !googleClientId || !state.tokens[1 - index] || !!state.requests[index];
      $(`#create-code-${index}`).disabled = !data.loaded;
    }
    $("#week-label").textContent = `${state.week} – ${addDays(state.week, 6)} · ${state.viewZone}`;
    const legend = $("#calendar-legend"); legend.replaceChildren();
    state.people.forEach((person, index) => {
      const item = element("span", "legend-person"); item.append(element("span", `person-dot${index ? " second" : ""}`), document.createTextNode(person.name)); legend.append(item);
    });
    const calendar = $("#week-calendar"), scrollPosition = calendar.dataset.ready ? calendar.scrollTop : 8 * 48;
    calendar.replaceChildren();
    const head = element("div", "week-head"), body = element("div", "week-body"), gutter = element("div", "time-gutter");
    const zoneName = new Intl.DateTimeFormat("en", { timeZone: state.viewZone, timeZoneName: "short" }).formatToParts(new Date(range.start)).find(part => part.type === "timeZoneName").value;
    head.append(element("div", "gutter-heading", zoneName));
    for (let hour = 0; hour < 24; hour++) gutter.append(element("div", "time-label", `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`));
    gutter.setAttribute("aria-hidden", "true"); body.append(gutter);
    for (let day = 0; day < 7; day++) {
      const date = addDays(state.week, day), start = boundary(date, "00:00", state.viewZone), end = boundary(addDays(date, 1), "00:00", state.viewZone, true);
      const reference = new Date(`${date}T12:00:00Z`), today = date === localDate(Date.now(), state.viewZone);
      const heading = element("h3", `week-date-heading${today ? " today" : ""}`), number = element("strong", "", String(reference.getUTCDate()));
      heading.append(document.createTextNode(new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "short" }).format(reference)), number);
      heading.setAttribute("aria-label", new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(reference)); head.append(heading);
      const column = element("div", "week-day-column"); column.setAttribute("role", "group"); column.setAttribute("aria-label", heading.getAttribute("aria-label"));
      for (let index = 0; index < 2; index++) {
        const blocks = merge(state.busy[index], { start, end });
        if (!state.loaded[index] || !blocks.length) column.append(element("div", `day-note${index ? " second" : ""}`, `${state.people[index].name}: ${state.loaded[index] ? "No busy events" : "Not loaded"}`));
        for (const [from, to] of blocks) {
          const fromParts = parts(from, state.viewZone), toParts = parts(to, state.viewZone);
          const fromMinute = from === start ? 0 : fromParts.hour * 60 + fromParts.minute + fromParts.second / 60;
          let toMinute = to === end ? 1440 : toParts.hour * 60 + toParts.minute + toParts.second / 60;
          // Fall-back folds can run backwards on a wall-clock grid. Keep the
          // block visible with actual duration; its label retains exact times.
          if (toMinute <= fromMinute) toMinute = Math.min(1440, fromMinute + (to - from) / MINUTE);
          const block = element("div", `calendar-busy${index ? " second" : ""}`);
          block.style.top = `${fromMinute * .8}px`; block.style.height = `${Math.max(20, (toMinute - fromMinute) * .8)}px`;
          const gridTime = value => new Intl.DateTimeFormat("en-GB", { timeZone: state.viewZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
          block.append(element("strong", "", "Busy"), element("span", "block-time", gridTime(from)), element("span", "block-time", `– ${to === end ? "24:00" : gridTime(to)}`));
          block.title = `${state.people[index].name}: ${windowText(from, to, state.people[index].zone)} · ${state.people[index].zone}`;
          block.setAttribute("aria-label", `${state.people[index].name}: busy, ${windowText(from, to, state.viewZone)} in ${state.viewZone}. ${windowText(from, to, state.people[index].zone)} in ${state.people[index].zone}.`);
          block.tabIndex = 0; column.append(block);
        }
      }
      body.append(column);
    }
    calendar.append(head, body); calendar.scrollTop = scrollPosition; calendar.dataset.ready = "true";
    calendar.tabIndex = 0; calendar.setAttribute("aria-label", "Week calendar. Scroll vertically for other hours and horizontally on narrow screens.");
    const container = $("#free-slots"); container.replaceChildren();
    if (!state.loaded.every(Boolean)) {
      $("#free-count").textContent = "Waiting for both calendars";
      container.append(element("p", "empty-message", "Load both people's calendars for this week to find free time. No availability is assumed for a calendar that has not been loaded.")); return;
    }
    const slots = freeWindows(state.people, state.busy, range, state.duration);
    $("#free-count").textContent = `${slots.length} window${slots.length === 1 ? "" : "s"} · ${state.duration}+ minutes`;
    if (!slots.length) container.append(element("p", "empty-message", "No shared window fits these hours and this duration. Adjust your available days, hours, or minimum time."));
    for (const [start, end] of slots) {
      const card = element("article", "free-slot");
      card.append(element("h3", "", windowText(start, end, state.viewZone)));
      for (const person of state.people) { const row = element("p"), name = element("strong", "", `${person.name}: `); row.append(name, document.createTextNode(`${windowText(start, end, person.zone)} · ${person.zone}`)); card.append(row); }
      const button = element("button", "calendar-button secondary", `Add ${state.duration} minutes to calendars`); button.type = "button"; button.addEventListener("click", () => downloadPlan(start, start + state.duration * MINUTE)); card.append(button); container.append(card);
    }
  }

  async function importFiles(index, files) {
    if (!files.length) return;
    invalidateRequest(index); const revision = state.revisions[index];
    try {
      const loaded = [];
      for (const file of files) {
        if (!/\.ics$/i.test(file.name)) throw new Error("Unzip Google exports and select the .ics files inside.");
        if (file.size > 8000000) throw new Error("Each calendar file must be under 8 MB. Choose a smaller export.");
        const text = await file.text();
        calendarBusy(text, state.people[index].zone, queryRange(state.week));
        loaded.push({ name: file.name, text });
      }
      if (revision !== state.revisions[index]) return;
      state.sources[index] = { kind: "ics", files: loaded, updatedAt: new Date().toISOString() }; render(); status(`${state.people[index].name}'s calendar files loaded. Titles stay out of the shared view.`);
    } catch (error) { status(error.message, true); }
    finally { $(`#file-${index}`).value = ""; }
  }
  function createCode(index) {
    if (!state.loaded[index]) return;
    const person = state.people[index], range = queryRange(state.week), source = state.sources[index];
    $(`#share-${index}`).value = encodeSnapshot({ v: 1, name: person.name, zone: person.zone, week: state.week, range: [range.start, range.end], busy: merge(state.busy[index], range), updatedAt: source.updatedAt });
    $(`#copy-code-${index}`).disabled = false; status(`Availability code created for ${state.week}. It includes busy times only, with boundary coverage for time-zone changes.`);
  }
  function loadCode(index) {
    try {
      const value = decodeSnapshot($(`#share-${index}`).value.trim());
      if (value.week !== state.week) throw new Error(`This code is for the week of ${value.week}; the selected week is ${state.week}. Select that week first, or ask for a new code.`);
      invalidateRequest(index);
      const person = state.people[index]; person.name = value.name || "Partner"; person.zone = value.zone;
      $(`#name-${index}`).value = person.name; $(`#zone-${index}`).value = person.zone; $(`#person-heading-${index}`).textContent = person.name;
      state.sources[index] = { kind: "share", busy: value.busy, coverage: { start: value.range[0], end: value.range[1] }, updatedAt: value.updatedAt };
      savePreferences(); render(); status(`Loaded ${person.name}'s snapshot for ${value.week}. It will not update automatically.`);
    } catch (error) { status(error.message, true); }
  }
  let gisLoading;
  function loadGoogleLibrary() {
    if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
    if (!gisLoading) gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true;
      const timeout = setTimeout(() => reject(new Error("Google sign-in did not load. Check your connection or import an .ics file.")), 15000);
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); gisLoading = null; reject(new Error("Google sign-in could not load. File import still works.")); };
      document.head.append(script);
    });
    return gisLoading;
  }
  // Preload only configured integrations so the eventual token popup can be
  // opened synchronously by the user's click, as required by popup blockers.
  function invalidateRequest(index) {
    state.revisions[index]++;
    if (state.requests[index]) state.requests[index].controller.abort();
    state.requests[index] = null;
  }
  function selectedIds(index) { return [...new Set($(`#ids-${index}`).value.split(",").map(value => value.trim()).filter(Boolean))]; }
  function selectionChanged(index) {
    state.people[index].ids = $(`#ids-${index}`).value;
    invalidateRequest(index); savePreferences();
    if (state.sources[index]?.kind === "google") { state.sources[index].coverage = null; state.sources[index].liveError = "Calendar selection changed. Loading selected calendars…"; }
    renderCalendarPicker(index); render();
    if (state.tokens[index]) fetchGoogleBusy(index); else status("Calendar selection saved. Sign in with Google to load it.");
  }
  function renderCalendarPicker(index) {
    const calendars = state.calendarLists[index], panel = $(`#calendars-${index}`), container = $(`#calendar-options-${index}`);
    if (!calendars) { panel.hidden = true; return; }
    const focusedId = container.contains(document.activeElement) ? document.activeElement.value : null;
    panel.hidden = false; container.replaceChildren();
    const selected = selectedIds(index);
    if (!calendars.length) container.append(element("p", "muted", "No calendars listed. Enter a calendar ID below."));
    for (const calendar of calendars) {
      const label = element("label"), checkbox = element("input"); checkbox.type = "checkbox"; checkbox.value = calendar.id;
      checkbox.checked = selected.includes(calendar.id) || (calendar.primary && selected.includes("primary"));
      label.append(checkbox, document.createTextNode(calendar.name)); label.title = calendar.id; container.append(label);
      checkbox.addEventListener("change", () => {
        $(`#ids-${index}`).value = [...container.querySelectorAll("input:checked")].map(input => input.value).join(", ");
        selectionChanged(index);
      });
    }
    if (focusedId) [...container.querySelectorAll("input")].find(input => input.value === focusedId)?.focus();
  }
  function expireToken(token) {
    for (let index = 0; index < 2; index++) if (state.tokens[index] === token) {
      invalidateRequest(index); state.tokens[index] = null;
      if (state.sources[index]?.kind === "google") { state.sources[index].stale = true; state.sources[index].liveError = "Sign in with Google to resume live updates. Previous busy blocks are a snapshot."; }
    }
    render();
  }
  async function loadCalendarList(index, token, revision) {
    const calendars = []; let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const parameters = new URLSearchParams({ maxResults: "250", minAccessRole: "freeBusyReader", showHidden: "true", fields: "items(id,summary,primary),nextPageToken" });
      if (pageToken) parameters.set("pageToken", pageToken);
      const response = await fetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${parameters}`, { headers: { Authorization: `Bearer ${token.value}` } });
      if (response.status === 401) { expireToken(token); throw new Error("Google sign-in expired. Sign in again to choose calendars."); }
      if (!response.ok) throw new Error("Google could not list calendars. You can still enter calendar IDs manually.");
      const value = await response.json();
      if (!Array.isArray(value.items)) throw new Error("Google returned an invalid calendar list. Enter IDs manually.");
      for (const item of value.items) if (typeof item.id === "string" && item.id) calendars.push({ id: item.id, name: String(item.summary || item.id).slice(0, 200), primary: !!item.primary });
      pageToken = value.nextPageToken || "";
      if (!pageToken) break;
      if (page === 9) throw new Error("This account lists too many calendars. Use calendar IDs manually.");
    }
    if (revision !== state.revisions[index] || state.tokens[index] !== token) return;
    state.calendarLists[index] = calendars; renderCalendarPicker(index);
  }
  function connectGoogle(index) {
    if (!googleClientId) return;
    if (!globalThis.google?.accounts?.oauth2) { loadGoogleLibrary().then(() => status("Google sign-in is ready. Press Sign in with Google again.")).catch(error => status(error.message, true)); return; }
    invalidateRequest(index); const revision = state.revisions[index];
    const api = globalThis.google.accounts.oauth2;
    const client = api.initTokenClient({ client_id: googleClientId, scope: SCOPES.join(" "), include_granted_scopes: false,
      callback: async response => {
        if (revision !== state.revisions[index]) return;
        if (response.error || !response.access_token || !api.hasGrantedAllScopes(response, ...SCOPES)) { status("Google calendar permissions were not granted. File import still works.", true); return; }
        const token = { value: response.access_token, expires: Date.now() + Number(response.expires_in || 3600) * 1000 };
        state.tokens[index] = token;
        try { await loadCalendarList(index, token, revision); }
        catch (error) { status(error.message, true); }
        if (revision !== state.revisions[index] || state.tokens[index] !== token) return;
        await fetchGoogleBusy(index);
      }, error_callback: error => status(error.type === "popup_closed" ? "Google sign-in was closed." : "Google sign-in could not open. Allow its popup or import files.", true)
    });
    client.requestAccessToken({ prompt: "select_account" });
  }
  async function refreshGoogle(index) {
    if (!state.tokens[index] || state.tokens[index].expires <= Date.now() + 30000) { connectGoogle(index); return; }
    await fetchGoogleBusy(index, true);
  }
  async function fetchGoogleBusy(index, quiet = false) {
    const token = state.tokens[index]; if (!token) return;
    if (token.expires <= Date.now() + 30000) { expireToken(token); status("Google sign-in expired. Sign in again to resume live updates.", true); return; }
    const range = queryRange(state.week), requestedWeek = state.week;
    const ids = selectedIds(index);
    if (!ids.length || ids.length > 50) {
      if (state.sources[index]?.kind === "google") { state.sources[index].stale = true; state.sources[index].liveError = "Choose between 1 and 50 calendars to load busy time."; }
      render(); if (!quiet) status("Choose between 1 and 50 Google calendars, or enter their IDs.", true); return;
    }
    const key = JSON.stringify([requestedWeek, ids]);
    const previous = state.requests[index];
    if (previous && previous.key === key && previous.token === token) return previous.promise;
    if (previous) invalidateRequest(index);
    const record = { key, token, revision: state.revisions[index], controller: new AbortController() };
    state.requests[index] = record; render();
    if (!quiet) status(`Loading ${state.people[index].name}'s Google busy time…`);
    const current = () => state.requests[index] === record && state.revisions[index] === record.revision && state.week === requestedWeek && state.tokens[index] === token && JSON.stringify(selectedIds(index)) === JSON.stringify(ids);
    record.promise = (async () => {
      try {
        const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", { method: "POST", signal: record.controller.signal, headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" }, body: JSON.stringify({ timeMin: new Date(range.start).toISOString(), timeMax: new Date(range.end).toISOString(), timeZone: "UTC", calendarExpansionMax: 50, items: ids.map(id => ({ id })) }) });
        if (!current()) return;
        if (!response.ok) {
          if (response.status === 401) { expireToken(token); status("Google sign-in expired. Sign in again to resume live updates.", true); return; }
          throw new Error(`Google could not load busy time (${response.status}). Check calendar access or import files.`);
        }
        const value = await response.json(), intervals = [];
        for (const id of ids) {
          const calendar = value.calendars && value.calendars[id];
          if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error(`Google could not read calendar ${id}. Check its ID and sharing permissions.`);
          for (const item of calendar.busy) {
            const start = Date.parse(item.start), end = Date.parse(item.end);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Google returned an invalid busy interval.");
            intervals.push([start, end]);
          }
        }
        if (!current()) return;
        state.sources[index] = { kind: "google", busy: merge(intervals, range), coverage: range, updatedAt: new Date().toISOString(), stale: false };
        if (!quiet) status(`Google busy time loaded for ${requestedWeek}. It updates each minute while this tab is visible.`);
      } catch (error) {
        if (error.name === "AbortError" || !current()) return;
        if (state.sources[index]?.kind === "google") { state.sources[index].stale = true; state.sources[index].liveError = "Live update failed. Previous busy blocks are a snapshot; retry or check calendar access."; }
        status(error.message, true);
      } finally {
        if (state.requests[index] === record) { state.requests[index] = null; render(); }
      }
    })();
    return record.promise;
  }
  function refreshGoogleSources(force = false) {
    if (document.hidden) return;
    for (let index = 0; index < 2; index++) if (state.sources[index]?.kind === "google" && state.tokens[index]) {
      if (force || Date.now() - Date.parse(state.sources[index].updatedAt) >= 45000 || state.sources[index].stale) fetchGoogleBusy(index, true);
    }
  }
  function downloadPlan(start, end) {
    const stamp = value => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const uid = (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`) + "@molomon";
    const text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Molomon//Shared plan//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, "SUMMARY:Molomon", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" })), link = element("a"); link.href = url; link.download = "molomon-plan.ics"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Plan downloaded. Import it into your calendars to reserve this time; it has not been booked automatically.");
  }
  personPanel(0); personPanel(1); render();
  if (googleClientId) loadGoogleLibrary().catch(error => status(error.message, true));
  setInterval(() => refreshGoogleSources(), 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshGoogleSources(true); });
  window.addEventListener("focus", () => refreshGoogleSources(true));
})();
