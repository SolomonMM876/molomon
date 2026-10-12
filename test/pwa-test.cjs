"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const listeners = {};
const stored = new Map();
let online = true, value = "published-v1", networkRequests = 0;
const cache = { async put(url, response) { stored.set(url, response.clone()); }, async keys() { return [...stored.keys()].map(url => new Request(url)); } };
const scope = "https://solomonmm876.github.io/molomon/";
vm.runInNewContext(fs.readFileSync(require.resolve("../service-worker.js"), "utf8"), {
  self: { registration: { scope }, addEventListener(type, callback) { listeners[type] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
  caches: { open: async () => cache, match: async url => stored.has(url) ? stored.get(url).clone() : undefined, keys: async () => ["molomon-static-v1"], delete: async () => true },
  fetch: async () => { networkRequests++; if (!online) throw new Error("Offline"); return new Response(value); },
  URL, Request, Response, Set, Promise
});
async function request(path) { let response; listeners.fetch({ request: new Request(new URL(path, scope)), respondWith(result) { response = result; } }); return response ? await response : null; }
(async () => {
  const manifest = JSON.parse(fs.readFileSync(require.resolve("../manifest.webmanifest"), "utf8"));
  assert.equal(new URL(manifest.scope, scope + "manifest.webmanifest").href, scope);
  assert.equal(new URL(manifest.start_url, scope + "manifest.webmanifest").href, scope);
  assert.equal(await (await request("config.js")).text(), "published-v1");
  value = "published-v2";
  assert.equal(await (await request("config.js")).text(), "published-v2", "refresh fetches the latest config");
  online = false;
  assert.equal(await (await request("config.js")).text(), "published-v2", "offline fallback uses the last public config");
  online = true;
  assert.equal(await (await request("category.html?section=play")).text(), "published-v2");
  online = false;
  assert.equal(await (await request("category.html?section=play")).text(), "published-v2", "public category selection works offline");
  const count = networkRequests;
  assert.equal(await request("calendar.html?code=private-oauth-code"), null);
  assert.equal(await request("notes.html?token=private-token"), null);
  assert.equal(await request("category.html?section=play&token=private-token"), null);
  assert.equal(await request("category.html?section=play&section=talk"), null);
  assert.equal(await request("category.html?section=unknown"), null);
  assert.equal(await request("notes-data.json"), null);
  assert.equal(await request("https://www.googleapis.com/calendar/v3/calendars/primary/events"), null);
  assert.equal(networkRequests, count, "worker does not handle query, API, or non-allowlisted requests");
  assert.ok([...stored.keys()].every(url => url.startsWith(scope) && (!new URL(url).search || url === scope + "category.html?section=play")));
  console.log("PWA checks passed: /molomon/ scope, network-first refresh, public category offline fallback, and no OAuth/API/private-data caching.");
})().catch(error => { console.error(error); process.exitCode = 1; });
