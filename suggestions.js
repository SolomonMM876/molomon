/* Private request queue. Firebase enforces the two Google accounts; a server
 * access check happens before any private browser cache is displayed. */
(function (root) {
  "use strict";
  const STATUSES = ["Pending", "Preparing", "Ready", "Done", "Needs input"];
  const MAX_TEXT = 4000, MAX_RESPONSE = 4000;
  const validId = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
  function text(value) {
    if (typeof value !== "string" || !value.trim() || value.length > MAX_TEXT) throw new Error("Describe a change in 4,000 characters or fewer.");
    return value.trim();
  }
  function author(value) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 80) throw new Error("Use a name with 80 characters or fewer.");
    return value.trim();
  }
  function update(status, response, expectedRevision) {
    if (!STATUSES.includes(status)) throw new Error("Choose Pending, Preparing, Ready, Done, or Needs input.");
    if (typeof response !== "string" || response.length > MAX_RESPONSE) throw new Error("Use a response with 4,000 characters or fewer.");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Supply the request's current revision.");
    return { status, response: response.trim(), revision: expectedRevision + 1 };
  }
  const core = { STATUSES: Object.freeze(STATUSES.slice()), validId, text, author, update };
  root.MolomonSuggestionsCore = core;
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (typeof document === "undefined") return;

  const $ = id => document.getElementById(id);
  const firebaseConfig = root.MOLOMON_CONFIG?.notes?.firebase || {};
  const configured = ["apiKey", "authDomain", "projectId", "appId"].every(key => typeof firebaseConfig[key] === "string" && firebaseConfig[key].trim());
  const state = { sdk: null, uid: null, generation: 0, locked: true, loading: false, checking: false, submitting: false, connected: false, records: [], unsubscribe: null, draftOwner: null, error: "" };
  let sdkLoading;
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function remove(key) { try { localStorage.removeItem(key); } catch (_) { /* Storage is optional. */ } }
  function cacheKey(uid) { return `molomon-suggestions-cache-${uid}`; }
  function draftKey() { return `molomon-suggestions-draft-${state.draftOwner || "device"}`; }
  function node(tag, className, value) { const item = document.createElement(tag); if (className) item.className = className; if (value !== undefined) item.textContent = value; return item; }
  function message(value, error = false) { $("suggestions-message").textContent = value || ""; $("suggestions-message").hidden = !value; $("suggestions-message").classList.toggle("error", error); }
  function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
  function cachedRecords(uid) {
    const records = read(cacheKey(uid), []);
    if (!Array.isArray(records)) return [];
    return records.filter(record => record && validId(record.id) && typeof record.text === "string" && record.text.length <= MAX_TEXT && STATUSES.includes(record.status) && typeof record.response === "string" && record.response.length <= MAX_RESPONSE && typeof record.authorName === "string" && record.authorName.length <= 80 && Number.isSafeInteger(record.revision) && record.revision > 0);
  }
  function serialized(snapshot) {
    const value = snapshot.data();
    return { id: snapshot.id, text: value.text, authorName: value.authorName, status: value.status, response: value.response, revision: value.revision, createdBy: value.createdBy, createdAt: value.createdAt?.toDate?.().toISOString() || "", updatedBy: value.updatedBy, updatedAt: value.updatedAt?.toDate?.().toISOString() || "" };
  }
  function saveDraft() {
    const saved = write(draftKey(), { text: $("request-text").value, authorName: $("request-author").value });
    $("draft-status").textContent = saved ? (state.locked ? "Local draft only. Sign in after setup to submit it." : "Draft saved on this device.") : "Draft could not be saved here. Keep it open or copy its text.";
    $("request-count").textContent = `${$("request-text").value.length.toLocaleString()} / 4,000`;
  }
  function loadDraft(fallbackText = "") {
    const draft = read(draftKey(), null);
    $("request-text").value = draft && typeof draft.text === "string" && draft.text.length <= MAX_TEXT ? draft.text : fallbackText;
    if (draft && typeof draft.authorName === "string" && draft.authorName.trim() && draft.authorName.length <= 80) $("request-author").value = draft.authorName;
    $("request-count").textContent = `${$("request-text").value.length.toLocaleString()} / 4,000`;
  }
  function stopListening() { if (state.unsubscribe) state.unsubscribe(); state.unsubscribe = null; state.connected = false; }
  function lock() {
    if (state.draftOwner) { saveDraft(); $("request-text").value = ""; }
    state.generation++; stopListening(); state.locked = true; state.uid = null; state.records = []; state.draftOwner = null;
  }
  function render() {
    $("request-sign-in").hidden = !configured || !state.locked;
    $("request-sign-in").disabled = state.loading || state.checking || state.submitting;
    $("request-sign-out").hidden = !configured || (state.locked && !state.sdk?.auth.currentUser);
    $("request-sign-out").disabled = state.submitting;
    $("submit-request").disabled = !configured || state.locked || state.submitting || !navigator.onLine;
    $("access-status").textContent = !configured ? "Private storage needs setup. You can keep a draft on this device." : state.loading ? "Loading Google sign-in…" : state.checking ? "Checking private access…" : state.locked ? "Sign in with one of your two authorized Google accounts." : "Private request queue open.";
    $("connection-status").textContent = state.error || (state.locked ? "" : state.submitting ? "Submitting…" : state.connected && navigator.onLine ? "Connected · new requests and responses appear here." : "Offline or connecting · showing the last authorized cache.");
    $("queue-explanation").textContent = state.locked ? "This is a local draft. It has not been submitted or scheduled for an agent." : "Submitted requests are checked about every 15 minutes when Codex and the signed-in browser are running. Publishing needs your approval.";
    const list = $("request-list"); list.replaceChildren();
    $("queue-count").textContent = state.locked ? "" : `${state.records.length} request${state.records.length === 1 ? "" : "s"}`;
    if (state.locked) { list.append(node("p", "requests-empty", "Sign in after private storage is configured to see requests.")); return; }
    const records = state.records.slice().sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    if (!records.length) list.append(node("p", "requests-empty", "No requests yet."));
    for (const record of records) {
      const card = node("article", "request-card"), heading = node("div", "request-card-header"), badge = node("span", `request-status ${record.status.toLowerCase().replace(/ /g, "-")}`, record.status);
      card.dataset.requestId = record.id; card.dataset.revision = String(record.revision);
      heading.append(badge, node("p", "request-meta", `${record.authorName} · ${dateLabel(record.createdAt)}`));
      card.append(heading, node("p", "request-body", record.text));
      if (record.response) { const response = node("div", "request-response"); response.append(node("h3", "", "Response"), node("p", "", record.response), node("p", "request-meta", `Updated ${dateLabel(record.updatedAt)}`)); card.append(response); }
      list.append(card);
    }
  }
  function friendly(error) {
    const code = String(error?.code || "");
    if (code.includes("permission-denied")) return "This account cannot access private requests. Check the two-account storage rules.";
    if (code.includes("unauthorized-domain")) return "Add this website's hostname to Firebase Authentication's authorized domains.";
    if (code.includes("unavailable") || code.includes("network")) return "Private storage is unavailable. Your draft stays on this device.";
    if (code.includes("popup-closed")) return "Google sign-in was closed.";
    return error?.message || "Private storage could not be reached.";
  }
  function session(uid, generation) { return !state.locked && state.uid === uid && state.generation === generation && state.sdk?.auth.currentUser?.uid === uid; }
  async function authorize(user) {
    const deviceDraft = state.draftOwner ? "" : $("request-text").value;
    lock(); const generation = state.generation;
    state.error = "";
    if (!user) { state.checking = false; loadDraft(); render(); return; }
    const uid = user.uid; state.checking = true; render();
    try {
      const { fs, db, auth } = state.sdk;
      const access = await fs.getDocFromServer(fs.doc(db, "access", "molomon"));
      if (generation !== state.generation || auth.currentUser?.uid !== uid) return;
      if (!access.exists() || access.data().ready !== true) throw new Error("Private storage needs its access/molomon ready document. Follow the setup instructions.");
      state.uid = uid; state.locked = false; state.checking = false; state.draftOwner = uid;
      loadDraft(deviceDraft); state.records = cachedRecords(uid); render();
      state.unsubscribe = fs.onSnapshot(fs.collection(db, "requests"), { includeMetadataChanges: true }, snapshot => {
        if (!session(uid, generation)) return;
        state.records = snapshot.docs.map(serialized); state.connected = !snapshot.metadata.fromCache && navigator.onLine;
        write(cacheKey(uid), state.records); render();
      }, error => {
        if (!session(uid, generation)) return;
        state.connected = false;
        if (String(error.code).includes("permission-denied")) { lock(); state.error = friendly(error); }
        else state.error = friendly(error);
        render();
      });
    } catch (error) {
      if (generation !== state.generation) return;
      state.checking = false; state.error = friendly(error); render();
    }
  }
  async function initializeCloud() {
    if (!configured) throw new Error("Configure private Firebase storage before submitting requests.");
    if (state.sdk) return state.sdk;
    if (!sdkLoading) {
      state.loading = true; render();
      sdkLoading = (async () => {
        const base = "https://www.gstatic.com/firebasejs/12.19.0/";
        const [appSdk, authSdk, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
        const app = appSdk.getApps().find(app => app.name === "molomon-notes") || appSdk.initializeApp(firebaseConfig, "molomon-notes");
        const auth = authSdk.getAuth(app), db = fs.getFirestore(app);
        await auth.authStateReady();
        state.sdk = { authSdk, fs, auth, db }; state.loading = false;
        authSdk.onAuthStateChanged(auth, user => authorize(user)); render(); return state.sdk;
      })().catch(error => { sdkLoading = null; state.loading = false; state.error = friendly(error); render(); throw error; });
    }
    return sdkLoading;
  }
  async function serverAuthorized() {
    if (!configured || state.locked || !state.uid || !state.sdk) throw new Error("Sign in with an authorized Google account before accessing requests.");
    if (!navigator.onLine) throw new Error("Reconnect to private storage first.");
    const uid = state.uid, generation = state.generation, sdk = state.sdk;
    let access;
    try { access = await sdk.fs.getDocFromServer(sdk.fs.doc(sdk.db, "access", "molomon")); }
    catch (error) { if (session(uid, generation) && String(error.code).includes("permission-denied")) { lock(); state.error = friendly(error); render(); } throw error; }
    if (!session(uid, generation)) throw new Error("The account changed. Sign in again.");
    if (!access.exists() || access.data().ready !== true) { lock(); render(); throw new Error("Private storage access is not ready."); }
    return { uid, generation, ...sdk };
  }
  async function submitRequest(event) {
    event.preventDefault(); if (state.submitting) return;
    saveDraft();
    try {
      const requestText = text($("request-text").value), authorName = author($("request-author").value);
      state.submitting = true; state.error = ""; render();
      const { fs, db, uid, generation } = await serverAuthorized();
      const id = [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, "0")).join("");
      await fs.runTransaction(db, async transaction => {
        if (!session(uid, generation)) throw new Error("The account changed before submission.");
        const ref = fs.doc(db, "requests", id), existing = await transaction.get(ref);
        if (!session(uid, generation)) throw new Error("The account changed before submission.");
        if (existing.exists()) throw new Error("This request ID already exists. Submit again.");
        transaction.set(ref, { text: requestText, authorName, status: "Pending", response: "", revision: 1, createdBy: uid, createdAt: fs.serverTimestamp(), updatedBy: uid, updatedAt: fs.serverTimestamp() });
      });
      if (!session(uid, generation)) return;
      remove(draftKey()); $("request-text").value = ""; $("request-count").textContent = "0 / 4,000"; $("draft-status").textContent = "Request submitted.";
      message("Submitted. It is pending preparation; nothing has been published.");
    } catch (error) { message(friendly(error), true); }
    finally { state.submitting = false; render(); }
  }
  root.MolomonSuggestions = Object.freeze({
    async listPending() {
      const { fs, db, uid, generation } = await serverAuthorized();
      const snapshot = await fs.getDocsFromServer(fs.query(fs.collection(db, "requests"), fs.where("status", "==", "Pending")));
      if (!session(uid, generation)) throw new Error("The account changed while reading requests.");
      return snapshot.docs.map(serialized).sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
    },
    async getRequest(id) {
      if (!validId(id)) throw new Error("Use a valid request ID.");
      const { fs, db, uid, generation } = await serverAuthorized();
      const snapshot = await fs.getDocFromServer(fs.doc(db, "requests", id));
      if (!session(uid, generation)) throw new Error("The account changed while reading the request.");
      if (!snapshot.exists()) throw new Error("This request no longer exists.");
      return serialized(snapshot);
    },
    async updateRequest(id, status, response, expectedRevision) {
      if (!validId(id)) throw new Error("Use a valid request ID.");
      const fields = update(status, response, expectedRevision);
      const { fs, db, uid, generation } = await serverAuthorized();
      await fs.runTransaction(db, async transaction => {
        if (!session(uid, generation)) throw new Error("The account changed before updating the request.");
        const ref = fs.doc(db, "requests", id), current = await transaction.get(ref);
        if (!session(uid, generation)) throw new Error("The account changed before updating the request.");
        if (!current.exists() || current.data().revision !== expectedRevision) { const error = new Error("The request changed. Read its current revision before updating it."); error.code = "request-conflict"; throw error; }
        transaction.update(ref, { ...fields, updatedBy: uid, updatedAt: fs.serverTimestamp() });
      });
      if (!session(uid, generation)) throw new Error("The account changed while updating the request.");
      return { id, ...fields };
    }
  });
  $("request-form").addEventListener("submit", submitRequest);
  $("request-text").addEventListener("input", saveDraft); $("request-author").addEventListener("change", saveDraft);
  $("clear-request-draft").addEventListener("click", () => { remove(draftKey()); $("request-text").value = ""; $("request-count").textContent = "0 / 4,000"; $("draft-status").textContent = "Draft cleared."; });
  $("request-sign-in").addEventListener("click", async () => {
    try {
      if (!state.sdk) { await initializeCloud(); message("Google sign-in is ready. Press Sign in with Google again."); return; }
      const provider = new state.sdk.authSdk.GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
      await state.sdk.authSdk.signInWithPopup(state.sdk.auth, provider);
    } catch (error) { message(friendly(error), true); }
  });
  $("request-sign-out").addEventListener("click", async () => { lock(); state.checking = false; state.error = ""; loadDraft(); render(); if (state.sdk) await state.sdk.authSdk.signOut(state.sdk.auth); message("Signed out. Private requests are hidden."); });
  window.addEventListener("offline", () => { state.connected = false; render(); });
  window.addEventListener("online", () => render());
  const names = read("molomon-names", []);
  if (Array.isArray(names) && typeof names[0] === "string" && names[0].trim()) $("request-author").value = names[0].slice(0, 80);
  loadDraft(); render();
  if (configured) initializeCloud().catch(error => message(friendly(error), true));
})(typeof window === "undefined" ? globalThis : window);
