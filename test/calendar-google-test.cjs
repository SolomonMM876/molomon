"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const G = require("../calendar-google.js");

const WEEK = "2026-03-09", TOKEN = "synthetic-access-token";
const fallback = { name: "You", zone: "UTC", from: "09:00", to: "21:00", days: [0, 1, 2, 3, 4, 5, 6], calendars: [] };
const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
// Routes requests by path; every call is recorded for assertions.
function google(routes, token = () => TOKEN) {
  const calls = [];
  const fetch = async (href, options) => {
    const url = new URL(href); calls.push({ url, options });
    const route = Object.keys(routes).find(key => url.pathname.endsWith(key));
    if (!route) throw new Error(`Unexpected request: ${url.pathname}`);
    return routes[route](url, options);
  };
  return { calls, reader: G.createReader({ fetch, token, now: () => Date.parse("2026-03-10T12:00:00Z") }) };
}
const timed = (summary, start, end, extra = {}) => ({ summary, start: { dateTime: start }, end: { dateTime: end }, ...extra });

test("saved settings are cleaned field by field", () => {
  assert.deepEqual(G.preferences(undefined, fallback), fallback);
  assert.deepEqual(G.preferences("text", fallback), fallback);
  const cleaned = G.preferences({ name: "  Sol  ", zone: "Pacific/Honolulu", from: "08:30", to: "25:00", days: [1, 1, 5, 2], calendars: [{ id: "a@example.invalid", name: "Main" }, { id: "a@example.invalid", name: "Duplicate" }, { id: 7 }, null, { id: "b@example.invalid" }] }, fallback);
  assert.deepEqual(cleaned, { name: "Sol", zone: "Pacific/Honolulu", from: "08:30", to: "21:00", days: [1, 2, 5], calendars: [{ id: "a@example.invalid", name: "Main" }, { id: "b@example.invalid", name: "b@example.invalid" }] });
  assert.deepEqual(G.preferences({ zone: "Madeup/Zone", days: [9], name: "" }, fallback), fallback, "invalid values fall back");
  assert.deepEqual(G.preferences({ name: "Old", ids: "primary, other@example.invalid" }, fallback).calendars, [], "the previous page's typed calendar IDs are not carried over");
  const many = Array.from({ length: 80 }, (_, index) => ({ id: `c${index}@example.invalid`, name: "C" }));
  assert.equal(G.preferences({ calendars: many }, fallback).calendars.length, G.MAX_CALENDARS);
});

test("the calendar list follows Google's pages and sends the token only as a header", async () => {
  const { reader, calls } = google({ "/users/me/calendarList": url => json(url.searchParams.get("pageToken") ? { items: [{ id: "partner@example.invalid", summary: "Partner" }, { id: "" }] } : { items: [{ id: "own@example.invalid", summary: "Mine", primary: true }], nextPageToken: "next" }) });
  assert.deepEqual(await reader.list(), [{ id: "own@example.invalid", name: "Mine", primary: true }, { id: "partner@example.invalid", name: "Partner", primary: false }]);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url.origin, "https://www.googleapis.com");
    assert.equal(call.options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!call.url.href.includes(TOKEN), "the token never enters a URL");
    assert.equal(call.options.method, "GET");
  }
  await assert.rejects(google({ "/users/me/calendarList": () => json({ items: "none" }) }).reader.list(), /invalid calendar list/);
});

test("a week combines busy time with event names and keeps private titles hidden", async () => {
  const calendars = [{ id: "own@example.invalid", name: "Mine" }, { id: "partner@example.invalid", name: "Partner" }];
  const { reader, calls } = google({
    "/freeBusy": () => json({ calendars: {
      "own@example.invalid": { busy: [{ start: "2026-03-10T19:00:00Z", end: "2026-03-10T20:00:00Z" }, { start: "2026-03-10T19:30:00Z", end: "2026-03-10T21:00:00Z" }] },
      "partner@example.invalid": { busy: [{ start: "2026-03-11T10:00:00Z", end: "2026-03-11T11:00:00Z" }] } } }),
    "/calendars/own%40example.invalid/events": () => json({ timeZone: "UTC", accessRole: "owner", items: [timed("Movie night", "2026-03-10T19:00:00Z", "2026-03-10T20:00:00Z"), timed("Surprise plan", "2026-03-10T19:30:00Z", "2026-03-10T21:00:00Z", { visibility: "private" })] }),
    "/calendars/partner%40example.invalid/events": () => json({ error: "forbidden" }, 403)
  });
  const source = await reader.collect(calendars, WEEK);
  assert.equal(source.kind, "google");
  assert.deepEqual(source.busy.map(pair => pair.map(value => new Date(value).toISOString())), [["2026-03-10T19:00:00.000Z", "2026-03-10T21:00:00.000Z"], ["2026-03-11T10:00:00.000Z", "2026-03-11T11:00:00.000Z"]]);
  assert.deepEqual(source.events.map(event => event.title), ["Movie night", "Private event"], "the owner's own private title is hidden too");
  assert.equal(source.detailsMessage, "Some calendars share busy time only.");
  assert.equal(source.updatedAt, "2026-03-10T12:00:00.000Z");
  const range = require("../calendar-core.js").queryRange(WEEK);
  assert.deepEqual(source.coverage, range);
  const freeBusy = calls.find(call => call.url.pathname.endsWith("/freeBusy"));
  assert.equal(freeBusy.options.method, "POST");
  assert.deepEqual(JSON.parse(freeBusy.options.body), { timeMin: new Date(range.start).toISOString(), timeMax: new Date(range.end).toISOString(), items: [{ id: "own@example.invalid" }, { id: "partner@example.invalid" }] });
  const events = calls.find(call => call.url.pathname.includes("/events"));
  assert.equal(events.url.searchParams.get("singleEvents"), "true");
  assert.ok(!JSON.stringify(source).includes(TOKEN));
});

test("failures are explained without leaking the token, and an expired sign-in asks to reconnect", async () => {
  const one = [{ id: "partner@example.invalid", name: "Partner" }];
  await assert.rejects(google({ "/freeBusy": () => json({ calendars: { "partner@example.invalid": { errors: [{ reason: "notFound" }] } } }) }).reader.collect(one, WEEK), error => error instanceof G.GoogleError && /“Partner” could not be read/.test(error.message) && !error.reconnect);
  await assert.rejects(google({ "/freeBusy": () => json({ calendars: { "partner@example.invalid": { busy: [{ start: "bad", end: "worse" }] } } }) }).reader.collect(one, WEEK), /invalid availability/);
  await assert.rejects(google({ "/freeBusy": () => json({}, 401) }).reader.collect(one, WEEK), error => error.reconnect === true && error.status === 401 && !error.message.includes(TOKEN));
  await assert.rejects(google({ "/freeBusy": () => json({ calendars: { "partner@example.invalid": { busy: [] } } }), "/events": () => json({}, 401) }).reader.collect(one, WEEK), error => error.reconnect === true, "an expired token during event loading is not mistaken for a busy-only calendar");
  await assert.rejects(google({ "/freeBusy": () => json({}, 500) }).reader.collect(one, WEEK), error => !error.reconnect && error.status === 500);
  await assert.rejects(google({ "/freeBusy": () => { throw new Error(`socket failed for ${TOKEN}`); } }).reader.collect(one, WEEK), error => /could not be reached/.test(error.message) && !error.message.includes(TOKEN));
  const signedOut = google({}, () => null);
  await assert.rejects(signedOut.reader.collect(one, WEEK), error => error.reconnect === true);
  assert.equal(signedOut.calls.length, 0, "nothing is requested without a token");
  await assert.rejects(google({}).reader.collect([], WEEK), /Choose between 1 and 50 calendars/);
});

// A stand-in for Google Identity Services' oauth2 namespace.
function identity(respond) {
  const log = { configs: [], requests: [], revoked: [] };
  const api = {
    initTokenClient(config) { log.configs.push(config); return { requestAccessToken(options) { log.requests.push(options); respond(config); } }; },
    hasGrantedAllScopes: (response, ...scopes) => scopes.every(scope => String(response.scope || "").split(" ").includes(scope)),
    revoke(token, done) { log.revoked.push(token); done(); }
  };
  return { api, log };
}
const granted = { access_token: TOKEN, expires_in: 3600, scope: G.SCOPES.join(" ") };

test("connecting asks for read-only scopes and skips the account chooser only with a saved account", async () => {
  let time = 1000;
  const { api, log } = identity(config => config.callback(granted));
  const connection = G.createConnection({ clientId: "client-id", document: null, now: () => time, library: () => api });
  assert.equal(connection.token(), null);
  await connection.connect();
  assert.equal(connection.token(), TOKEN);
  assert.equal(log.configs[0].client_id, "client-id");
  assert.deepEqual(log.configs[0].scope.split(" "), G.SCOPES);
  assert.ok(G.SCOPES.every(scope => /\.(readonly|freebusy)$/.test(scope)), "no scope can create or edit events");
  assert.ok(!("login_hint" in log.configs[0]));
  assert.deepEqual(log.requests[0], { prompt: "select_account" });
  await connection.connect("own@example.invalid");
  assert.equal(log.configs[1].login_hint, "own@example.invalid");
  assert.deepEqual(log.requests[1], { prompt: "" });
  time += 3600000 - 29000;
  assert.equal(connection.token(), null, "a token about to expire is not used");
  await connection.connect("own@example.invalid"); connection.clear();
  assert.equal(connection.token(), null);
  await connection.connect("own@example.invalid"); await connection.disconnect();
  assert.deepEqual(log.revoked, [TOKEN]);
  assert.equal(connection.token(), null);
  await connection.disconnect();
  assert.equal(log.revoked.length, 1, "nothing to revoke without a token");
});

test("declined, partial, closed, and unloaded sign-ins leave no token", async () => {
  const attempt = async (respond, pattern) => {
    const { api } = identity(respond), connection = G.createConnection({ clientId: "client-id", document: null, library: () => api });
    await assert.rejects(connection.connect(), error => error instanceof G.GoogleError && pattern.test(error.message));
    assert.equal(connection.token(), null);
  };
  await attempt(config => config.callback({ error: "access_denied" }), /was not allowed/);
  await attempt(config => config.callback({ access_token: TOKEN, scope: G.SCOPES[2] }), /read-only Calendar permissions/);
  await attempt(config => config.error_callback({ type: "popup_closed" }), /was closed/);
  await attempt(config => config.error_callback({ type: "popup_failed_to_open" }), /Allow its popup/);
  await assert.rejects(G.createConnection({ clientId: "client-id", document: null, library: () => undefined }).connect(), /still loading/);
});
