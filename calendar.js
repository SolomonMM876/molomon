/* Shared week read straight from Google Calendar in this browser. Settings
 * stay on this device; events and the Google token stay in memory only.
 */
(function () {
  "use strict";
  const C = globalThis.MolomonCalendarCore, G = globalThis.MolomonCalendarGoogle;
  const { validZone, parts, localDate, addDays, monday, boundary, weekRange, queryRange, merge, freeWindows, calendarBlocks } = C;
  const MINUTE = 60000;
  const config = globalThis.MOLOMON_CONFIG || {}, deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const $ = selector => document.querySelector(selector);
  const STORAGE = "molomon-calendar-preferences", clientId = config.calendar?.googleClientId || "";
  const defaults = name => ({ name, zone: deviceZone, from: "09:00", to: "21:00", days: [0,1,2,3,4,5,6], calendars: [] });
  let saved = {}, savedNames = [];
  try { savedNames = JSON.parse(localStorage.getItem("molomon-names") || "[]"); saved = JSON.parse(localStorage.getItem(STORAGE) || "{}") || {}; } catch { /* Optional saved settings. */ }
  const viewZone = validZone(saved.viewZone) ? saved.viewZone : deviceZone;
  const ownName = Array.isArray(savedNames) && typeof savedNames[0] === "string" && savedNames[0].trim() ? savedNames[0].trim().slice(0, 80) : "You";
  // hint is the Google account last connected here, so Google can skip its account chooser.
  const state = { week: monday(localDate(Date.now(), viewZone)), viewZone, duration: 30, people: [G.preferences(saved.people?.[0], defaults(ownName)), G.preferences(saved.people?.[1], defaults("Partner"))], hint: typeof saved.hint === "string" && saved.hint.length <= 320 ? saved.hint : "", calendarList: null, sources: [null,null], sourceErrors: ["",""], loaded: [false,false], busy: [[],[]], ready: false, working: false, expired: false, refresh: null, generation: 0 };
  const connection = G.createConnection({ clientId, document });
  const reader = G.createReader({ fetch: (url, options) => fetch(url, options), token: connection.token });
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function status(message, error = false) { $("#page-status").textContent = message; $("#page-status").classList.toggle("error", error); }
  function save() { try { localStorage.setItem(STORAGE, JSON.stringify({ viewZone: state.viewZone, hint: state.hint, people: state.people })); } catch { /* Storage is optional. */ } }
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Pacific/Honolulu","America/New_York","Europe/London","Asia/Tokyo","Australia/Sydney"];
  for (const zone of [...new Set([deviceZone,"UTC",...zones])]) { const option = element("option"); option.value = zone; $("#time-zones").append(option); }
  $("#week-date").value = state.week; $("#display-zone").value = state.viewZone;
  $("#display-zone").addEventListener("input", () => $("#display-zone").setCustomValidity(""));
  function personPanel(index) {
    const panel = element("article", "person-panel"); panel.id = `person-panel-${index}`;
    panel.setAttribute("aria-labelledby", `person-heading-${index}`);
    panel.innerHTML = `<div class="person-heading"><span class="person-dot" aria-hidden="true"></span><h2 id="person-heading-${index}"></h2></div><p class="panel-owner">${index ? "Your partner · from the calendar they share with you in Google" : "You · settings are saved on this device"}</p>
      <div class="person-fields"><label for="name-${index}">Name<input id="name-${index}" type="text" maxlength="80" autocomplete="off"></label><label for="zone-${index}">Time zone<input id="zone-${index}" type="text" list="time-zones" spellcheck="false" autocomplete="off" required></label></div>
      <div class="hours-row"><label for="from-${index}">Available from<input id="from-${index}" type="time" required></label><label for="to-${index}">Until<input id="to-${index}" type="time" required></label></div>
      <fieldset class="days-select"><legend>Available days · in this person's time zone</legend><div class="day-options" id="days-${index}"></div></fieldset>
      <fieldset class="calendar-picker" id="calendars-${index}"><legend>${index ? "Your partner's calendars" : "Your Google calendars"}</legend><div id="calendar-options-${index}"></div></fieldset><p class="source-status" id="source-${index}" role="status" aria-live="polite"></p>`;
    $("#people").append(panel);
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach((day,value) => { const label = element("label"), input = element("input"); input.type = "checkbox"; input.value = value; input.setAttribute("aria-label", `${day} available for ${index ? "your partner" : "you"}`); label.append(input,document.createTextNode(day)); $(`#days-${index}`).append(label); input.addEventListener("change", () => readPanel(index)); });
    for (const field of ["name","zone","from","to"]) { $(`#${field}-${index}`).addEventListener("input", () => $(`#${field}-${index}`).setCustomValidity("")); $(`#${field}-${index}`).addEventListener("change", () => readPanel(index)); }
    fillPerson(index); picker(index);
  }
  function fillPerson(index) {
    const person = state.people[index]; $(`#person-heading-${index}`).textContent = person.name;
    for (const field of ["name","zone","from","to"]) $(`#${field}-${index}`).value = person[field];
    for (const input of $(`#days-${index}`).querySelectorAll("input")) input.checked = person.days.includes(Number(input.value));
  }
  // Names, zones, hours and days save as soon as they change.
  function readPanel(index) {
    const zone = $(`#zone-${index}`).value.trim(); $(`#zone-${index}`).setCustomValidity(validZone(zone) ? "" : "Use an IANA time zone such as Pacific/Honolulu.");
    for (const field of ["zone","from","to"]) if (!$(`#${field}-${index}`).reportValidity()) return;
    Object.assign(state.people[index], { name: $(`#name-${index}`).value.trim().slice(0, 80) || (index ? "Partner" : "You"), zone, from: $(`#from-${index}`).value, to: $(`#to-${index}`).value, days: [...$(`#days-${index}`).querySelectorAll("input:checked")].map(input => Number(input.value)) });
    save(); $(`#person-heading-${index}`).textContent = state.people[index].name; render();
  }
  function picker(index) {
    const container = $(`#calendar-options-${index}`), person = state.people[index], focused = container.contains(document.activeElement) ? document.activeElement.value : null;
    container.replaceChildren();
    if (!state.calendarList) {
      container.append(element("p", "muted", person.calendars.length ? `Showing ${person.calendars.map(item => item.name).join(", ")}. Connect Google Calendar to change this.` : index ? "Connect Google Calendar, then tick the calendar your partner shares with you." : "Connect Google Calendar to choose your calendars."));
      return;
    }
    // Your own main calendar is never offered as your partner's.
    const options = state.calendarList.filter(calendar => !index || !calendar.primary);
    for (const calendar of options) { const label = element("label"), input = element("input"); input.type = "checkbox"; input.value = calendar.id; input.checked = person.calendars.some(item => item.id === calendar.id); input.setAttribute("aria-label", `Show ${calendar.name} for ${index ? "your partner" : "you"}`); input.addEventListener("change", () => chooseCalendars(index)); label.append(input,document.createTextNode(calendar.name)); container.append(label); }
    if (index && !options.length) container.append(element("p", "muted", "No shared calendars yet. Ask your partner to share their calendar with you in Google Calendar, accept the emailed link, then press Refresh."));
    if (focused) [...container.querySelectorAll("input")].find(input => input.value === focused)?.focus();
  }
  function chooseCalendars(index) {
    const ids = [...$(`#calendar-options-${index}`).querySelectorAll("input:checked")].map(input => input.value);
    if (ids.length > G.MAX_CALENDARS) { status(`Choose at most ${G.MAX_CALENDARS} calendars.`, true); picker(index); return; }
    state.people[index].calendars = state.calendarList.filter(calendar => ids.includes(calendar.id)).map(({ id, name }) => ({ id, name }));
    save(); state.generation++; state.refresh = null; state.sources[index] = null; state.sourceErrors[index] = ""; render(); refreshWeek();
  }
  function changeWeek(week) { state.week = monday(week); $("#week-date").value = state.week; state.generation++; state.refresh = null; state.sources = [null,null]; state.sourceErrors = ["",""]; status(connection.token() ? "Loading both calendars…" : ""); render(); refreshWeek(); }
  $("#week-form").addEventListener("submit", event => { event.preventDefault(); const zone = $("#display-zone").value.trim(); $("#display-zone").setCustomValidity(validZone(zone) ? "" : "Use a valid IANA time zone."); if (!$("#display-zone").reportValidity()) return; try { state.viewZone = zone; state.duration = Number($("#duration").value); save(); changeWeek($("#week-date").value); } catch (error) { status(error.message,true); } });
  $("#previous-week").addEventListener("click", () => changeWeek(addDays(state.week,-7)));
  $("#next-week").addEventListener("click", () => changeWeek(addDays(state.week,7)));
  $("#today-week").addEventListener("click", () => changeWeek(localDate(Date.now(),state.viewZone)));
  function formatTime(timestamp, zone) { return new Intl.DateTimeFormat("en", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(timestamp)); }
  function formatFull(timestamp, zone) { return new Intl.DateTimeFormat("en", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp)); }
  function windowText(start, end, zone) { return `${formatFull(start, zone)} – ${localDate(start, zone) === localDate(end, zone) ? formatTime(end, zone) : formatFull(end, zone)}`; }
  let activeEventKey = null;
  function showEvent(index, event) {
    activeEventKey = JSON.stringify([index, event.start, event.end, event.title]);
    $("#event-title").textContent = event.title;
    $("#event-person").textContent = state.people[index].name;
    $("#event-time").textContent = `${windowText(event.start, event.end, state.viewZone)} · ${state.viewZone}${event.allDay ? " · All day" : ""}`;
    $("#event-local-time").textContent = state.people[index].zone === state.viewZone ? "" : `${windowText(event.start, event.end, state.people[index].zone)} · ${state.people[index].zone}`;
    $("#event-calendar").textContent = event.calendar;
    $("#event-availability").textContent = event.free ? "Marked free · available for plans." : "Busy · included when finding free time.";
    $("#calendar-event").showModal();
  }
  $("#close-event").addEventListener("click", () => $("#calendar-event").close());
  $("#calendar-event").addEventListener("close", () => {
    for (const id of ["event-title", "event-person", "event-time", "event-local-time", "event-calendar", "event-availability"]) $(`#${id}`).textContent = "";
    const trigger = [...document.querySelectorAll(".calendar-busy")].find(block => block.dataset.eventKey === activeEventKey);
    activeEventKey = null; trigger?.focus({ preventScroll: true });
  });
  function sourceData(index, range) {
    const source = state.sources[index];
    if (source?.kind !== "google" || !state.people[index].calendars.length) return { loaded: false, busy: [] };
    const covered = !!source.coverage && source.coverage.start <= range.start && source.coverage.end >= range.end;
    return { loaded: covered && !source.stale && navigator.onLine && Date.now() - Date.parse(source.updatedAt) < 300000, busy: covered ? merge(source.busy, range) : [] };
  }
  function render() {
    const range = weekRange(state.week, state.viewZone), dataRange = queryRange(state.week), connected = !!connection.token();
    for (let index = 0; index < 2; index++) {
      const data = sourceData(index, dataRange), source = state.sources[index], chosen = state.people[index].calendars.length > 0;
      state.busy[index] = data.busy; state.loaded[index] = data.loaded;
      let message = chosen ? (connected ? "Loading this week…" : "Connect Google Calendar to load this week.") : index ? "Tick the calendar your partner shares with you to see their week." : connected ? "Tick at least one of your calendars." : "Connect Google Calendar, then choose your calendars.";
      if (state.sourceErrors[index]) message = state.sourceErrors[index];
      else if (source && chosen) message = `Updated ${formatFull(Date.parse(source.updatedAt), state.viewZone)} · ${data.loaded ? "Refreshes each minute while this page is open." : "Not current. Connect Google Calendar again to refresh."}${source.detailsMessage ? " " + source.detailsMessage : ""}`;
      $(`#source-${index}`).textContent = message;
    }
    $("#auth-status").textContent = !clientId ? "Google Calendar needs its client ID in config.js." : connected ? "Google Calendar connected. Both calendars refresh each minute while this page is open." : state.hint ? "Connect Google Calendar to load this week. Your calendar choices are remembered." : "Connect Google Calendar to see both of your weeks.";
    $("#google-connect").disabled = !clientId || !state.ready || state.working;
    $("#google-connect").textContent = connected ? "Refresh" : "Connect Google Calendar";
    $("#google-disconnect").hidden = !connected && !state.hint; $("#google-disconnect").disabled = state.working;
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
        const source = state.sources[index];
        const events = source?.kind === "google" && source.coverage?.start <= start && source.coverage?.end >= end ? source.events || [] : [];
        const blocks = calendarBlocks(state.busy[index], events, { start, end });
        if (!state.loaded[index] || !blocks.length) column.append(element("div", `day-note${index ? " second" : ""}`, `${state.people[index].name}: ${state.loaded[index] ? "No busy events" : "Not loaded"}`));
        for (const event of blocks) {
          const { from, to } = event;
          const fromParts = parts(from, state.viewZone), toParts = parts(to, state.viewZone);
          const fromMinute = from === start ? 0 : fromParts.hour * 60 + fromParts.minute + fromParts.second / 60;
          let toMinute = to === end ? 1440 : toParts.hour * 60 + toParts.minute + toParts.second / 60;
          // Fall-back folds can run backwards on a wall-clock grid. Keep the
          // block visible with actual duration; its label retains exact times.
          if (toMinute <= fromMinute) toMinute = Math.min(1440, fromMinute + (to - from) / MINUTE);
          const block = element("button", `calendar-busy${index ? " second" : ""}${event.free ? " free-event" : ""}`); block.type = "button";
          block.dataset.eventKey = JSON.stringify([index, event.start, event.end, event.title]);
          block.style.left = `calc(${index * 50 + event.lane * 50 / event.columns}% + 3px)`;
          block.style.width = `calc(${50 / event.columns}% - 5px)`;
          block.style.top = `${fromMinute * .8}px`; block.style.height = `${Math.max(20, (toMinute - fromMinute) * .8)}px`;
          const gridTime = value => new Intl.DateTimeFormat("en-GB", { timeZone: state.viewZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
          block.append(element("strong", "", event.title), element("span", "block-time", gridTime(from)), element("span", "block-time", `– ${to === end ? "24:00" : gridTime(to)}`));
          block.title = `${state.people[index].name}: ${event.title} · ${windowText(event.start, event.end, state.people[index].zone)} · ${state.people[index].zone}`;
          block.setAttribute("aria-label", `${state.people[index].name}: ${event.title}, ${event.free ? "free" : "busy"}, ${windowText(event.start, event.end, state.viewZone)} in ${state.viewZone}. View event.`);
          block.setAttribute("aria-haspopup", "dialog"); block.addEventListener("click", () => showEvent(index, event)); column.append(block);
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
      container.append(card);
    }
  }

  function friendly(error) { return error instanceof G.GoogleError ? error.message : "The calendar could not load. Try again."; }
  // work() starts inside the click, so Google's popup is not blocked.
  async function action(work) { if (state.working) return; state.working = true; render(); try { await work(); } catch (error) { if (error.reconnect) connection.clear(); status(friendly(error),true); } finally { state.working = false; render(); } }
  async function loadList() {
    const generation = ++state.generation; state.refresh = null;
    const list = await reader.list();
    if (generation !== state.generation) return;
    const primary = list.find(calendar => calendar.primary);
    state.calendarList = list; if (primary) state.hint = primary.id;
    // Keep saved choices that Google still lists; names follow Google.
    state.people.forEach((person, index) => { person.calendars = list.filter(calendar => (!index || !calendar.primary) && person.calendars.some(item => item.id === calendar.id)).slice(0, G.MAX_CALENDARS).map(({ id, name }) => ({ id, name })); });
    if (!state.people[0].calendars.length && primary) state.people[0].calendars = [{ id: primary.id, name: primary.name }];
    save(); picker(0); picker(1);
  }
  function settle() {
    const error = state.sourceErrors.find(Boolean);
    if (error) status(error,true);
    else if (state.loaded.every(Boolean)) status("Both calendars are up to date.");
    else if (!state.people[0].calendars.length) status("Tick at least one of your own calendars.");
    else if (!state.people[1].calendars.length) status("Your week is loaded. Tick your partner's shared calendar to compare.");
  }
  async function refreshWeek() {
    if (!connection.token() || !navigator.onLine) { render(); return; }
    const key = state.week + ":" + state.generation;
    if (state.refresh?.key === key) return state.refresh.promise;
    const generation = state.generation, week = state.week, record = { key };
    state.refresh = record;
    record.promise = (async () => {
      await Promise.all(state.people.map(async (person, index) => {
        if (!person.calendars.length) return;
        try { const source = await reader.collect(person.calendars, week); if (generation === state.generation) { state.sources[index] = source; state.sourceErrors[index] = ""; } }
        catch (error) { if (generation !== state.generation) return; if (error.reconnect) connection.clear(); if (state.sources[index]) state.sources[index].stale = true; state.sourceErrors[index] = friendly(error); }
      }));
      if (state.refresh === record) state.refresh = null;
      if (generation === state.generation) { render(); settle(); }
    })();
    return record.promise;
  }
  personPanel(0); personPanel(1); render();
  $("#google-connect").addEventListener("click", () => action(async () => {
    if (!connection.token()) { status("Waiting for Google sign-in…"); await connection.connect(state.hint); }
    state.expired = false; status("Loading your calendars…");
    await loadList(); await refreshWeek();
  }));
  $("#google-disconnect").addEventListener("click", () => { if (confirm("Disconnect Google Calendar on this device? Calendar choices here are forgotten; names and hours stay.")) action(async () => {
    state.generation++; state.refresh = null; await connection.disconnect();
    state.hint = ""; state.calendarList = null; state.sources = [null,null]; state.sourceErrors = ["",""]; for (const person of state.people) person.calendars = [];
    save(); picker(0); picker(1); status("Google Calendar disconnected on this device.");
  }); });
  if (clientId) connection.load().then(() => { state.ready = true; render(); }, error => status(friendly(error),true));
  function tick() {
    if (document.visibilityState !== "visible") return;
    if (!connection.token() && state.sources.some(Boolean) && !state.expired) { state.expired = true; status("Google's sign-in lasts about an hour and has ended. Press Connect Google Calendar to refresh.",true); }
    refreshWeek();
  }
  setInterval(tick,60000); document.addEventListener("visibilitychange", tick);
  window.addEventListener("online", () => refreshWeek()); window.addEventListener("offline", () => { status("Offline. Events shown may be out of date; free time is not confirmed.",true); render(); });
})();
