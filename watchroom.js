/* Room credentials are read from private Firebase storage for this visit only.
 * Never put them in public configuration, browser storage, or a cached response.
 */
(function (root) {
  "use strict";
  const WATCHROOM_URL = "https://solomonmm876.github.io/watchroom/";
  function roomTarget(room, name) {
    if (!room || typeof room.roomId !== "string" || room.roomId.length !== 32 || !/^[a-f0-9]{32}$/.test(room.roomId) || typeof room.roomSecret !== "string" || room.roomSecret.length !== 48 || !/^[a-f0-9]{48}$/.test(room.roomSecret)) return null;
    const displayName = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32) : "";
    const target = new URL(WATCHROOM_URL);
    target.hash = new URLSearchParams({ room: room.roomId, key: room.roomSecret, shared: "1", auto: "1", name: displayName || "You" }).toString();
    return target.href;
  }
  const core = { roomTarget };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.MOLOMON_WATCHROOM_CORE = core;
  if (!root.document?.getElementById("watchroom-status")) return;

  const $ = id => document.getElementById(id);
  const firebaseConfig = root.MOLOMON_CONFIG?.notes?.firebase || {};
  const configured = ["apiKey", "authDomain", "projectId", "appId"].every(key => typeof firebaseConfig[key] === "string" && firebaseConfig[key].trim());
  const state = { sdk: null, loading: configured, checking: false, popup: false, generation: 0, user: null, error: "", setup: !configured };
  let sdkLoading;
  function render() {
    const signedIn = Boolean(state.sdk?.auth.currentUser);
    $("watchroom-status").textContent = state.error || (!configured ? "Our shared Watchroom needs a one-time setup before it can open." : state.loading ? "Loading Google sign-in…" : state.checking ? "Opening our shared room…" : state.popup ? "Waiting for Google sign-in…" : "Sign in with one of our two Google accounts to open the shared room.");
    $("watchroom-status").classList.toggle("error", Boolean(state.error));
    $("watchroom-sign-in").hidden = !configured || state.loading || state.checking;
    $("watchroom-sign-in").disabled = !state.sdk || state.popup;
    $("watchroom-sign-in").textContent = signedIn ? "Use another Google account" : "Sign in with Google";
    $("watchroom-retry").hidden = !configured || !state.error || state.checking || state.popup;
    $("watchroom-sign-out").hidden = !signedIn || state.checking;
    $("watchroom-sign-out").disabled = state.popup;
    $("watchroom-help").hidden = !state.setup;
    $("watchroom-actions").hidden = ["watchroom-sign-in", "watchroom-retry", "watchroom-sign-out"].every(id => $(id).hidden);
  }
  function friendly(error) {
    const code = String(error?.code || "");
    if (code.includes("permission-denied")) return "This Google account has not been given access to our shared room.";
    if (code.includes("unauthorized-domain")) return "Google sign-in needs setup for this website address.";
    if (code.includes("popup-closed")) return "Google sign-in was closed. Try again when you’re ready.";
    if (code.includes("popup-blocked")) return "Allow the Google sign-in popup, then try again.";
    if (code.includes("cancelled-popup")) return "Google sign-in was interrupted. Try again.";
    return "Our shared room could not be opened. Check your connection and try again.";
  }
  function current(uid, generation) {
    return state.generation === generation && state.user?.uid === uid && state.sdk?.auth.currentUser?.uid === uid;
  }
  async function authorize(user) {
    const generation = ++state.generation;
    state.user = user; state.error = ""; state.setup = false; state.checking = Boolean(user); render();
    if (!user) return;
    const uid = user.uid, sdk = state.sdk;
    try {
      // Backend rules, including the private two-account allowlist, authorize
      // this server read. No invitation is restored from a device cache.
      const access = await sdk.fs.getDocFromServer(sdk.fs.doc(sdk.db, "access", "molomon"));
      if (!current(uid, generation)) return;
      if (!access.exists() || access.data().ready !== true) {
        state.setup = true; state.error = "Our shared access needs a one-time setup before Watchroom can open.";
      } else {
        const target = roomTarget(access.data().watchroom, user.displayName);
        if (!target) {
          state.setup = true; state.error = "Our shared Watchroom needs a one-time setup before it can open.";
        } else {
          if (current(uid, generation)) root.location.replace(target);
          return;
        }
      }
    } catch (error) {
      if (!current(uid, generation)) return;
      state.error = friendly(error);
    }
    if (current(uid, generation)) { state.checking = false; render(); }
  }
  async function initializeCloud() {
    if (!sdkLoading) {
      state.loading = true; render();
      sdkLoading = (async () => {
        const base = "https://www.gstatic.com/firebasejs/12.19.0/";
        const [appSdk, authSdk, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
        const app = appSdk.getApps().find(app => app.name === "molomon-notes") || appSdk.initializeApp(firebaseConfig, "molomon-notes");
        const auth = authSdk.getAuth(app), db = fs.getFirestore(app);
        await auth.authStateReady();
        state.sdk = { authSdk, auth, fs, db }; state.loading = false;
        authSdk.onAuthStateChanged(auth, user => authorize(user)); render();
        return state.sdk;
      })().catch(error => { sdkLoading = null; state.loading = false; state.error = friendly(error); render(); throw error; });
    }
    return sdkLoading;
  }
  $("watchroom-sign-in").addEventListener("click", () => {
    const sdk = state.sdk;
    if (!sdk || state.popup) return;
    state.popup = true; state.error = ""; render();
    const provider = new sdk.authSdk.GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
    // Invoke the popup directly in the click. Awaiting SDK loading here loses
    // user activation in some phone browsers, so it is preloaded on page entry.
    sdk.authSdk.signInWithPopup(sdk.auth, provider).then(result => {
      if (sdk.auth.currentUser?.uid === result.user?.uid) return authorize(result.user);
    }).catch(error => {
      state.error = friendly(error); render();
    }).finally(() => { state.popup = false; render(); });
  });
  $("watchroom-retry").addEventListener("click", () => state.sdk ? authorize(state.sdk.auth.currentUser || null) : initializeCloud().catch(() => {}));
  $("watchroom-sign-out").addEventListener("click", () => {
    ++state.generation; state.user = null; state.checking = false; state.error = ""; state.setup = false; render();
    state.sdk.authSdk.signOut(state.sdk.auth).catch(error => { state.error = friendly(error); render(); });
  });
  render();
  if (configured) initializeCloud().catch(() => {});
})(typeof globalThis !== "undefined" ? globalThis : this);
