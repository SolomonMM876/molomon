/* Reads Google Calendar straight from this browser: no backend, no stored
 * events. The Google access token lives in memory for this visit only.
 */
(function () {
  "use strict";
  const C = typeof module === "object" && module.exports ? require("./calendar-core.js") : globalThis.MolomonCalendarCore;
  const BUSY_SCOPES = ["https://www.googleapis.com/auth/calendar.events.freebusy", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"];
  const SCOPES = [...BUSY_SCOPES, "https://www.googleapis.com/auth/calendar.events.readonly"];
  const API = "https://www.googleapis.com/calendar/v3/";
  const MAX_CALENDARS = 50; // Google's freeBusy limit for one request.
  class GoogleError extends Error {
    constructor(message, { reconnect = false, status = 0 } = {}) { super(message); this.reconnect = reconnect; this.status = status; }
  }

  // Saved settings come from this device's storage, so every field is checked
  // and replaced by its fallback rather than trusted.
  function preferences(value, fallback) {
    const source = value && typeof value === "object" ? value : {};
    const time = text => typeof text === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text);
    const name = typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, 80) : fallback.name;
    const days = Array.isArray(source.days) && source.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) ? [...new Set(source.days)].sort() : fallback.days;
    const calendars = [], seen = new Set();
    for (const item of Array.isArray(source.calendars) ? source.calendars : []) {
      if (!item || typeof item.id !== "string" || !item.id || item.id.length > 300 || seen.has(item.id) || calendars.length >= MAX_CALENDARS) continue;
      seen.add(item.id); calendars.push({ id: item.id, name: String(item.name || item.id).slice(0, 200) });
    }
    return { name, zone: C.validZone(source.zone) ? source.zone : fallback.zone, from: time(source.from) ? source.from : fallback.from, to: time(source.to) ? source.to : fallback.to, days, calendars };
  }

  // token() returns the current access token or null. fetch is injected so the
  // reader can be checked locally without Google.
  function createReader({ fetch, token, now = Date.now }) {
    async function request(path, params, body) {
      const access = token();
      if (!access) throw new GoogleError("Connect Google Calendar to load events.", { reconnect: true });
      const url = new URL(API + path);
      if (params) url.search = new URLSearchParams(params).toString();
      let response;
      try { response = await fetch(url.href, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${access}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
      catch { throw new GoogleError("Google Calendar could not be reached. Check your connection."); }
      if (response.status === 401) throw new GoogleError("Google sign-in expired. Connect Google Calendar again.", { reconnect: true, status: 401 });
      if (!response.ok) throw new GoogleError("Google could not load this calendar. Try again.", { status: response.status });
      return response.json();
    }
    async function list() {
      const calendars = []; let pageToken;
      for (let page = 0; page < 10; page++) {
        const data = await request("users/me/calendarList", { maxResults: "250", minAccessRole: "freeBusyReader", showHidden: "true", fields: "items(id,summary,primary),nextPageToken", ...(pageToken ? { pageToken } : {}) });
        if (data.items !== undefined && !Array.isArray(data.items)) throw new GoogleError("Google returned an invalid calendar list.");
        for (const item of data.items || []) if (typeof item.id === "string" && item.id) calendars.push({ id: item.id, name: String(item.summary || item.id).slice(0, 200), primary: item.primary === true });
        pageToken = data.nextPageToken;
        if (!pageToken) return calendars;
      }
      throw new GoogleError("Too many Google calendars. Reduce the list in Google Calendar.");
    }
    // One person's selected calendars for the week, in the same shape the page
    // renders: merged busy time plus event names where Google shares them.
    async function collect(calendars, week) {
      if (!calendars.length || calendars.length > MAX_CALENDARS) throw new GoogleError(`Choose between 1 and ${MAX_CALENDARS} calendars.`);
      const range = C.queryRange(week), span = { timeMin: new Date(range.start).toISOString(), timeMax: new Date(range.end).toISOString() };
      const data = await request("freeBusy", null, { ...span, items: calendars.map(item => ({ id: item.id })) });
      const busy = [], events = []; let detailsUnavailable = false;
      for (const calendar of calendars) {
        const entry = data.calendars?.[calendar.id];
        if (!entry || entry.errors?.length || !Array.isArray(entry.busy)) throw new GoogleError(`“${calendar.name}” could not be read. Check that it is still shared with this Google account, or untick it.`);
        for (const item of entry.busy) {
          const pair = [Date.parse(item.start), Date.parse(item.end)];
          if (!pair.every(Number.isFinite) || pair[1] <= pair[0]) throw new GoogleError("Google returned invalid availability.");
          busy.push(pair);
        }
        try {
          let pageToken;
          for (let page = 0; page < 10; page++) {
            const result = await request(`calendars/${encodeURIComponent(calendar.id)}/events`, { ...span, singleEvents: "true", orderBy: "startTime", maxResults: "250", fields: "items(summary,start,end,visibility,transparency,status),timeZone,accessRole,nextPageToken", ...(pageToken ? { pageToken } : {}) });
            // Both people look at this page together, so private titles stay
            // hidden even on the owner's own device.
            events.push(...C.googleEvents({ ...result, items: result.items || [], accessRole: ["none", "freeBusyReader"].includes(result.accessRole) ? result.accessRole : "reader" }, calendar.name, range));
            if (events.length > 3000) throw new GoogleError("Too many events. Choose fewer calendars.");
            pageToken = result.nextPageToken;
            if (!pageToken) break;
            if (page === 9) throw new GoogleError("Too many events. Choose fewer calendars.");
          }
        } catch (error) {
          // A calendar may share busy time without event details.
          if (![403, 404].includes(error.status)) throw error;
          detailsUnavailable = true;
        }
      }
      return { kind: "google", coverage: range, busy: C.merge(busy, range), events, updatedAt: new Date(now()).toISOString(), detailsMessage: detailsUnavailable ? "Some calendars share busy time only." : "" };
    }
    return { list, collect };
  }

  // Google Identity Services token popup. The library is preloaded so the
  // popup opens synchronously inside the user's click, as popup blockers need.
  function createConnection({ clientId, document, now = Date.now, library = () => globalThis.google?.accounts?.oauth2 }) {
    let current = null, loading = null;
    function load() {
      if (library()) return Promise.resolve();
      if (!loading) loading = new Promise((resolve, reject) => {
        const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true;
        script.onload = () => resolve();
        script.onerror = () => { loading = null; reject(new GoogleError("Google sign-in could not load. Check your connection and reload.")); };
        document.head.append(script);
      });
      return loading;
    }
    function token() { return current && current.expires > now() + 30000 ? current.value : null; }
    // hint is the Google account used last time on this device; with it Google
    // can skip its account chooser. Without it the chooser is always shown.
    function connect(hint = "") {
      const api = library();
      if (!api) return Promise.reject(new GoogleError("Google sign-in is still loading. Try again in a moment."));
      return new Promise((resolve, reject) => {
        const client = api.initTokenClient({ client_id: clientId, scope: SCOPES.join(" "), include_granted_scopes: false, ...(hint ? { login_hint: hint } : {}),
          callback: response => {
            if (response.error || !response.access_token) { reject(new GoogleError(response.error === "access_denied" ? "Google Calendar access was not allowed." : "Google sign-in did not finish. Try again.")); return; }
            if (!api.hasGrantedAllScopes(response, ...BUSY_SCOPES)) { reject(new GoogleError("Allow the read-only Calendar permissions, then connect again.")); return; }
            current = { value: response.access_token, expires: now() + Number(response.expires_in || 3600) * 1000 }; resolve();
          },
          error_callback: error => reject(new GoogleError(error?.type === "popup_closed" ? "Google sign-in was closed." : "Google sign-in could not open. Allow its popup, then try again."))
        });
        client.requestAccessToken({ prompt: hint ? "" : "select_account" });
      });
    }
    function clear() { current = null; }
    // Withdraws Molomon's Google permission as well as forgetting the token.
    function disconnect() {
      const value = current?.value; current = null;
      return new Promise(resolve => { const api = library(); if (value && api) api.revoke(value, () => resolve()); else resolve(); });
    }
    return { load, token, connect, clear, disconnect };
  }

  const api = { SCOPES, MAX_CALENDARS, GoogleError, preferences, createReader, createConnection };
  if (typeof module === "object" && module.exports) module.exports = api;
  else globalThis.MolomonCalendarGoogle = api;
})();
