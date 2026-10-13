"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { roomTarget } = require("../watchroom.js");

// Replace only SDK loading. All authorization, popup, rendering, and redirect
// behavior runs from the real launcher without Firebase or network access.
const imports = 'await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")])';
const source = fs.readFileSync(require.resolve("../watchroom.js"), "utf8");
assert.equal(source.split(imports).length, 2, "the pinned SDK-loading seam must match exactly once");
const launcher = source.replace(imports, "await loadSdk()");
const flush = () => new Promise(resolve => setImmediate(resolve));
const approved = { uid: "approved-account", displayName: "Our Name" };
const room = { roomId: "a".repeat(32), roomSecret: "b".repeat(48) };
const access = (settings = room) => ({ exists: () => true, data: () => ({ ready: true, watchroom: settings }) });

function fixture({ user = null, read = () => Promise.resolve(access()), failSdkOnce = false } = {}) {
  const ids = ["watchroom-status", "watchroom-sign-in", "watchroom-retry", "watchroom-sign-out", "watchroom-help", "watchroom-actions"];
  const elements = Object.fromEntries(ids.map(id => [id, {
    hidden: false, disabled: false, textContent: "", classList: { toggle() {} },
    addEventListener(type, callback) { this[type] = callback; }
  }]));
  const auth = { currentUser: user, authStateReady: async () => {} };
  let observer, reads = 0, popupCalls = 0, sdkLoads = 0;
  const destinations = [];
  const authSdk = {
    getAuth: () => auth,
    onAuthStateChanged(_, callback) { observer = callback; callback(auth.currentUser); },
    GoogleAuthProvider: class {
      setCustomParameters(parameters) { assert.equal(parameters.prompt, "select_account"); }
    },
    signInWithPopup() { popupCalls++; return Promise.reject({ code: "auth/popup-closed-by-user" }); },
    async signOut() { auth.currentUser = null; observer(null); }
  };
  const firestore = {
    getFirestore: () => ({}),
    doc(_, ...path) { assert.deepEqual(path, ["access", "molomon"]); return {}; },
    getDocFromServer() { reads++; return read(); }
  };
  const unexpectedStorage = () => { throw new Error("The launcher must not read or persist room credentials in browser storage."); };
  const storage = { getItem: unexpectedStorage, setItem: unexpectedStorage, removeItem: unexpectedStorage };
  const unexpectedLog = () => { throw new Error("The launcher must not log private room settings."); };
  const appSdk = { getApps: () => [{ name: "molomon-notes" }], initializeApp() { throw new Error("Reuse the existing Firebase app."); } };
  vm.runInNewContext(launcher, {
    document: { getElementById: id => elements[id] },
    MOLOMON_CONFIG: { notes: { firebase: { apiKey: "public", authDomain: "public", projectId: "public", appId: "public" } } },
    URL, URLSearchParams, Promise,
    location: { replace: destination => destinations.push(destination) },
    localStorage: storage, sessionStorage: storage,
    console: { log: unexpectedLog, info: unexpectedLog, warn: unexpectedLog, error: unexpectedLog },
    async loadSdk() {
      sdkLoads++;
      if (failSdkOnce && sdkLoads === 1) throw { code: "auth/network-request-failed" };
      return [appSdk, authSdk, firestore];
    }
  });
  return {
    elements, destinations,
    get reads() { return reads; },
    get popupCalls() { return popupCalls; },
    get sdkLoads() { return sdkLoads; },
    changeUser(next) { auth.currentUser = next; observer(next); }
  };
}

(async () => {
  const target = new URL(roomTarget(room, "Name & key=other"));
  assert.equal(target.origin, "https://solomonmm876.github.io");
  assert.equal(target.pathname, "/watchroom/");
  assert.equal(target.search, "", "room credentials must only be in the fragment");
  const params = new URLSearchParams(target.hash.slice(1));
  assert.equal(params.get("room"), room.roomId);
  assert.equal(params.get("key"), room.roomSecret);
  assert.equal(params.get("shared"), "1");
  assert.equal(params.get("auto"), "1");
  assert.equal(params.get("name"), "Name & key=other", "a display name cannot inject invitation fields");
  assert.equal(params.size, 5);
  assert.equal(new URLSearchParams(new URL(roomTarget(room, "\n")).hash.slice(1)).get("name"), "You");

  let f = fixture(); await flush();
  assert.equal(f.reads, 0, "signed-out visits do not request private room settings");
  assert.equal(f.destinations.length, 0);
  assert.equal(f.elements["watchroom-sign-in"].hidden, false);
  f.elements["watchroom-sign-in"].click();
  assert.equal(f.popupCalls, 1, "the popup starts synchronously during the click");
  await flush();
  assert.equal(f.reads, 0);
  assert.equal(f.destinations.length, 0);

  f = fixture({ user: approved }); await flush();
  assert.equal(f.reads, 1, "approved visits fetch settings from the server");
  assert.equal(f.destinations.length, 1, "a signed-in visit redirects without a startup action");
  assert.equal(new URLSearchParams(new URL(f.destinations[0]).hash.slice(1)).get("name"), approved.displayName);

  f = fixture({ user: approved, read: () => Promise.reject({ code: "permission-denied", message: room.roomSecret }) }); await flush();
  assert.equal(f.destinations.length, 0, "unauthorized users never receive a redirect invitation");
  assert.match(f.elements["watchroom-status"].textContent, /not been given access/);
  assert.ok(!Object.values(f.elements).some(element => element.textContent.includes(room.roomSecret)), "private values cannot appear in error messages");

  const invalidSettings = [undefined, null, {}, { ...room, roomId: room.roomId + "\n" }, { ...room, roomSecret: room.roomSecret + "\n" }, { ...room, roomId: room.roomId.slice(1) }, { ...room, roomId: "A".repeat(32) }, { ...room, roomSecret: "https://example.com/" }];
  for (const settings of invalidSettings) {
    assert.equal(roomTarget(settings, "You"), null, "invalid settings cannot create an invitation");
    f = fixture({ user: approved, read: () => Promise.resolve({ exists: () => true, data: () => ({ ready: true, watchroom: settings }) }) }); await flush();
    assert.equal(f.destinations.length, 0);
    assert.equal(f.elements["watchroom-help"].hidden, false);
    assert.match(f.elements["watchroom-status"].textContent, /one-time setup/);
  }

  let resolveRead;
  f = fixture({ user: approved, read: () => new Promise(resolve => { resolveRead = resolve; }) }); await flush();
  f.changeUser(null); resolveRead(access()); await flush();
  assert.equal(f.destinations.length, 0, "sign-out invalidates a pending private server read");
  assert.equal(f.elements["watchroom-sign-in"].hidden, false);

  f = fixture({ failSdkOnce: true }); await flush();
  assert.equal(f.elements["watchroom-retry"].hidden, false, "failed SDK loading leaves a usable retry");
  assert.equal(f.elements["watchroom-sign-in"].disabled, true);
  f.elements["watchroom-retry"].click(); await flush();
  assert.equal(f.sdkLoads, 2, "retry reloads the SDK when initialization failed");
  assert.equal(f.elements["watchroom-sign-in"].disabled, false);
  assert.equal(f.reads, 0);

  console.log("Watchroom launcher checks passed: private authorization, fixed shared-room redirect, strict room settings, sign-out race, synchronous popup, and SDK retry.");
})().catch(error => { console.error(error); process.exitCode = 1; });
