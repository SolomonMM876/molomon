/* Plain-text notes. Firebase is loaded only after cloud configuration is supplied.
 * Each shared note has its own document and revision. Transactions reject stale
 * edits; they never silently replace a partner's newer text. */
(function (root) {
  "use strict";
  const MAX_TITLE = 160, MAX_BODY = 20000, MAX_IMPORT = 200;
  const validId = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
  function content(title, body) {
    if (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE || typeof body !== "string" || body.length > MAX_BODY) throw new Error("Use a title up to 160 characters and a note up to 20,000 characters.");
    return { title: title.trim(), body };
  }
  function roomFrom(value) {
    let text = String(value || "").trim();
    if (text.includes("#")) text = text.slice(text.indexOf("#") + 1);
    if (text.startsWith("space=")) text = text.slice(6);
    return validId(text.toLowerCase()) ? text.toLowerCase() : null;
  }
  function parseBackup(text) {
    if (typeof text !== "string" || text.length > 5000000) throw new Error("Choose a Molomon JSON backup under 5 MB.");
    let value;
    try { value = JSON.parse(text); } catch (_) { throw new Error("This backup is not valid JSON."); }
    if (!value || value.format !== "molomon-notes" || value.version !== 1 || !Array.isArray(value.notes) || value.notes.length > MAX_IMPORT) throw new Error("Choose a Molomon notes backup with up to 200 notes.");
    const books = Array.isArray(value.books) ? value.books : [];
    if (books.length > 50 || books.some(book => !book || !validId(book.id) || typeof book.name !== "string" || !book.name.trim() || book.name.length > 80)) throw new Error("This backup contains an invalid book.");
    return value.notes.map(note => {
      if (!note || typeof note !== "object") throw new Error("A note in this backup is invalid.");
      const fields = content(note.title, note.body);
      if (typeof note.authorName !== "string" || note.authorName.length > 80) throw new Error("A backup author name is invalid.");
      return { ...fields, authorName: note.authorName || "You", notebookName: books.find(book => book.id === note.notebookId)?.name || "" };
    });
  }
  function stale(current, baseRevision) { return !current || current.deleted || current.revision !== baseRevision; }
  function exportData(records, books = []) {
    return { format: "molomon-notes", version: 1, exportedAt: new Date().toISOString(), books: books.filter(book => !book.deleted).map(book => ({ id: book.id, name: book.name })), notes: records.filter(note => !note.deleted).map(note => ({ title: note.title, body: note.body, authorName: note.authorName, notebookId: note.notebookId || "default", createdAt: note.createdAt, updatedAt: note.updatedAt })) };
  }
  const core = { content, roomFrom, parseBackup, stale, exportData };
  root.MolomonNotesCore = core;
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (typeof document === "undefined") return;

  const $ = id => document.getElementById(id);
  const firebaseConfig = root.MOLOMON_CONFIG?.notes?.firebase || {};
  const configured = ["apiKey", "authDomain", "projectId", "appId"].every(key => typeof firebaseConfig[key] === "string" && firebaseConfig[key].trim());
  const state = { mode: "device", room: null, records: [], books: [], book: "default", connected: false, busy: false, unsubscribe: null, unsubscribeBooks: null, editor: null, bookEditor: null, firebase: null, uid: null, locked: configured, authGeneration: 0, observedAuthUid: null };
  const localKey = "molomon-notes-device";
  function read(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value === null ? fallback : value; } catch (_) { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function remove(key) { try { localStorage.removeItem(key); } catch (_) { /* The current visit still works. */ } }
  function cacheKey() { return state.mode === "device" ? localKey : "molomon-notes-space-" + state.room; }
  function booksKey() { return cacheKey() + "-books"; }
  function draftKey(id) { return "molomon-notes-draft-" + (state.room || "device") + "-" + (id || "new"); }
  function cachedRecords(key) {
    const records = read(key, []);
    if (!Array.isArray(records)) return [];
    return records.filter(note => note && validId(note.id) && typeof note.title === "string" && typeof note.body === "string" && note.title.length <= MAX_TITLE && note.body.length <= MAX_BODY && Number.isInteger(note.revision) && note.revision > 0 && typeof note.authorName === "string" && note.authorName.length <= 80);
  }
  function cachedBooks(key) {
    const books = read(key, []);
    return Array.isArray(books) ? books.filter(book => book && validId(book.id) && typeof book.name === "string" && book.name.length > 0 && book.name.length <= 80 && Number.isInteger(book.revision) && book.revision > 0) : [];
  }
  function allBooks() { return [{ id: "default", name: "General" }, ...state.books.filter(book => !book.deleted)]; }
  function resolvedBook(note) { return allBooks().some(book => book.id === note.notebookId) ? note.notebookId : "default"; }
  function randomId() { return [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, "0")).join(""); }
  function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; }
  function message(text, error = false) { $("message").textContent = text || ""; $("message").hidden = !text; $("message").classList.toggle("error", error); }
  function author() { return $("author-name").value.trim().slice(0, 80) || "You"; }
  function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
  function writable() { return !state.locked && (state.mode === "device" || (state.connected && navigator.onLine)); }
  function syncStatus() {
    const status = $("sync-status");
    status.classList.toggle("offline", state.mode === "cloud" && !state.connected);
    status.textContent = state.locked ? "Sign in with one of your two authorized Google accounts." : state.mode === "device" ? (configured ? "Device notes · saved in this browser." : "Device preview · shared storage needs setup.") : state.busy ? "Saving to shared space…" : state.connected && navigator.onLine ? "Shared notes · connected." : "Shared notes · offline or connecting. Cached notes and drafts stay on this device.";
    $("save-note").disabled = state.busy || !writable();
    $("delete-note").disabled = state.busy || !writable();
    $("save-separate").disabled = state.busy || !writable();
    $("new-note").disabled = state.busy || state.locked;
    $("create-space").disabled = !configured || state.busy || state.locked;
    $("join-space").disabled = !configured || state.busy || state.locked;
    $("import-notes").disabled = state.busy || !writable();
    $("export-notes").disabled = state.busy || state.locked;
    $("add-book").disabled = state.busy || !writable();
    $("rename-book").disabled = state.busy || !writable() || state.book === "default";
    $("save-book").disabled = state.busy || !writable();
    $("delete-book").disabled = state.busy || !writable();
    $("sign-in").hidden = !configured || !state.locked;
    $("sign-in").disabled = state.busy;
    $("sign-out").hidden = !configured || state.locked;
  }
  function render() {
    syncStatus();
    $("sharing-title").textContent = state.mode === "cloud" ? "Shared space" : "Device notes";
    $("sharing-description").textContent = state.mode === "cloud" ? "Both of you can edit here. Share the invitation privately." : "Saved in this browser. Export a backup to keep a copy.";
    $("list-heading").textContent = state.mode === "cloud" ? "Shared books" : "Your books";
    $("note-list").hidden = state.locked;
    $("use-device").hidden = state.mode !== "cloud";
    $("retry-space").hidden = state.mode !== "cloud" || state.connected;
    $("private-invite").hidden = state.mode !== "cloud" || state.locked;
    $("setup-help").hidden = configured;
    if (state.room) $("invite-link").value = location.href.split("#")[0] + "#space=" + state.room;
    if (!allBooks().some(book => book.id === state.book)) state.book = "default";
    const tabs = $("book-tabs"); tabs.replaceChildren();
    allBooks().forEach((book, index) => {
      const tab = node("button", "book-tab", book.name); tab.type = "button"; tab.id = "book-tab-" + book.id; tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", "notes-grid"); tab.setAttribute("aria-selected", String(book.id === state.book)); tab.tabIndex = book.id === state.book ? 0 : -1;
      tab.addEventListener("click", () => { state.book = book.id; render(); $("book-tab-" + book.id).focus(); });
      tab.addEventListener("keydown", event => { const books = allBooks(); let next; if (event.key === "ArrowRight") next = (index + 1) % books.length; if (event.key === "ArrowLeft") next = (index + books.length - 1) % books.length; if (event.key === "Home") next = 0; if (event.key === "End") next = books.length - 1; if (next !== undefined) { event.preventDefault(); state.book = books[next].id; render(); $("book-tab-" + state.book).focus(); } });
      tabs.append(tab);
    });
    $("notes-grid").setAttribute("aria-labelledby", "book-tab-" + state.book);
    const notes = state.records.filter(note => !note.deleted && resolvedBook(note) === state.book).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
    $("note-count").textContent = `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
    const grid = $("notes-grid"); grid.replaceChildren();
    if (!notes.length) grid.append(node("p", "notes-empty", "No notes yet. Add a note, a plan, or a list."));
    for (const note of notes) {
      const card = node("article", "note-card"), list = node("ul", "note-preview");
      const lines = note.body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      lines.slice(0, 7).forEach(line => list.append(node("li", "", line.length > 180 ? line.slice(0, 180) + "…" : line)));
      if (lines.length > 7) list.append(node("li", "", "…"));
      card.append(node("h3", "", note.title), list, node("p", "note-meta", `${note.authorName || "You"} · ${dateLabel(note.updatedAt)}`));
      const edit = node("button", "notes-button", "Open"); edit.type = "button"; edit.setAttribute("aria-label", `Open note ${note.title}`); edit.addEventListener("click", () => openEditor(note.id)); card.append(edit); grid.append(card);
    }
    if (state.editor?.id) {
      const current = state.records.find(note => note.id === state.editor.id);
      if (stale(current, state.editor.baseRevision)) conflict(current?.deleted ? "This note was deleted while you were editing. Your draft is still here." : "This note changed while you were editing. Your draft is still here.");
    }
  }
  function saveDraft() {
    if (!state.editor) return;
    const value = { id: state.editor.id, baseRevision: state.editor.baseRevision, title: $("note-title").value, body: $("note-body").value, notebookId: $("note-book").value };
    const saved = write(draftKey(state.editor.id), value);
    $("draft-hint").textContent = saved ? (writable() ? "Draft saved on this device. Press Save to finish." : "Offline draft saved on this device. Reconnect to save shared changes.") : "This draft could not be saved on this device. Keep it open or copy its text.";
  }
  function conflict(text) { $("edit-conflict").hidden = false; $("conflict-text").textContent = text; $("save-note").disabled = true; }
  function openEditor(id = null, skipDraft = false) {
    if (state.locked) return;
    const note = id ? state.records.find(item => item.id === id && !item.deleted) : null;
    if (id && !note) { message("This note was deleted. Refresh your shared space.", true); return; }
    const stored = skipDraft ? null : read(draftKey(id), null);
    const draft = stored && typeof stored.title === "string" && typeof stored.body === "string" && stored.title.length <= MAX_TITLE && stored.body.length <= MAX_BODY && stored.id === id && Number.isInteger(stored.baseRevision) ? stored : null;
    state.editor = { id, baseRevision: draft?.baseRevision ?? note?.revision ?? 0 };
    $("editor-title").textContent = draft ? "Your draft" : note ? "Edit note" : "New note";
    $("note-title").value = draft?.title ?? note?.title ?? "";
    $("note-body").value = draft?.body ?? note?.body ?? "";
    $("note-book").replaceChildren(); allBooks().forEach(book => { const option = node("option", "", book.name); option.value = book.id; $("note-book").append(option); });
    const bookId = draft?.notebookId || note?.notebookId || state.book; $("note-book").value = allBooks().some(book => book.id === bookId) ? bookId : "default";
    $("delete-note").hidden = !id;
    $("edit-conflict").hidden = true;
    syncStatus(); saveDraft();
    if (id && stale(note, state.editor.baseRevision)) conflict("This note changed since your draft was started. Your draft is still here.");
    if (!$("note-editor").open) $("note-editor").showModal();
    $("note-title").focus();
  }
  function closeEditor() { saveDraft(); $("note-editor").close(); state.editor = null; }
  function ask(title, description, action) {
    $("confirm-title").textContent = title; $("confirm-description").textContent = description; $("confirm-action").textContent = action;
    return new Promise(resolve => { const dialog = $("confirm-dialog"); dialog.returnValue = "cancel"; dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }); dialog.showModal(); });
  }
  function serialized(snapshot) {
    const value = snapshot.data();
    return { id: snapshot.id, title: value.title, body: value.body, notebookId: value.notebookId || "default", name: value.name, authorName: value.authorName, revision: value.revision, deleted: value.deleted, createdAt: value.createdAt?.toDate?.().toISOString() || "", updatedAt: value.updatedAt?.toDate?.().toISOString() || "" };
  }
  async function persistNote(id, fields, baseRevision, deleted = false) {
    if (!writable()) throw new Error("Reconnect to save this shared note. Your draft stays on this device.");
    const noteId = id || randomId();
    if (state.mode === "device") {
      const records = cachedRecords(localKey), current = records.find(note => note.id === noteId), now = new Date().toISOString();
      if (id && stale(current, baseRevision)) { state.records = records; const error = new Error("This note changed. Your draft is still here."); error.code = "note-conflict"; throw error; }
      const record = { id: noteId, ...fields, authorName: fields.authorName || author(), revision: (current?.revision || 0) + 1, deleted, createdAt: current?.createdAt || now, updatedAt: now };
      const next = records.filter(note => note.id !== noteId); next.push(record);
      if (!write(localKey, next)) throw new Error("This browser could not save the note. Export a backup or copy your draft.");
      state.records = next; render(); return;
    }
    const { fs, db } = state.firebase, uid = state.uid;
    await fs.runTransaction(db, async transaction => {
      const ref = fs.doc(db, "rooms", state.room, "notes", noteId), existing = await transaction.get(ref);
      const current = existing.exists() ? existing.data() : null;
      if (id && stale(current, baseRevision)) { if (existing.exists()) state.records = [...state.records.filter(note => note.id !== id), serialized(existing)]; const error = new Error("Your partner changed this note. Your draft is still here."); error.code = "note-conflict"; throw error; }
      if (!id && current) throw new Error("This note ID already exists. Try saving again.");
      const record = { ...fields, authorName: fields.authorName || author(), revision: (current?.revision || 0) + 1, deleted, createdBy: current?.createdBy || uid, createdAt: current?.createdAt || fs.serverTimestamp(), updatedBy: uid, updatedAt: fs.serverTimestamp() };
      transaction.set(ref, record);
    });
  }
  async function saveEditor(asNew = false) {
    if (!state.editor || state.busy) return;
    try {
      const fields = { ...content($("note-title").value, $("note-body").value), notebookId: $("note-book").value }, editing = { ...state.editor };
      state.busy = true; syncStatus();
      await persistNote(asNew ? null : editing.id, fields, asNew ? 0 : editing.baseRevision);
      remove(draftKey(editing.id)); $("note-editor").close(); state.editor = null; message(asNew ? "Your draft was saved as a separate note." : "Note saved.");
    } catch (error) {
      if (error.code === "note-conflict") conflict(error.message);
      else message(friendlyError(error), true);
      saveDraft();
    } finally { state.busy = false; render(); if (!$("edit-conflict").hidden) $("save-note").disabled = true; }
  }
  function friendlyError(error) {
    const code = error?.code || "";
    if (code.includes("permission-denied")) return "The shared space could not be accessed. Check the private invitation and the published storage rules.";
    if (code.includes("operation-not-allowed")) return "Shared sign-in is not enabled yet. Follow the setup instructions.";
    if (code.includes("unauthorized-domain")) return "This website address needs to be added to the shared storage setup.";
    if (code.includes("unavailable") || code.includes("network")) return "Connection unavailable. Your draft stays on this device; reconnect and save again.";
    return error?.message || "The note could not save. Your draft is still here.";
  }
  async function persistBook(id, name, baseRevision, deleted = false) {
    if (!writable()) throw new Error("Reconnect to save this book.");
    name = String(name || "").trim();
    if (!name || name.length > 80) throw new Error("Use a book name up to 80 characters.");
    const bookId = id || randomId();
    if (state.mode === "device") {
      const books = cachedBooks(booksKey()), current = books.find(book => book.id === bookId), now = new Date().toISOString();
      if (id && stale(current, baseRevision)) { state.books = books; throw new Error("This book changed. Close and reopen it to load the latest name."); }
      const record = { id: bookId, name, revision: (current?.revision || 0) + 1, deleted, authorName: author(), createdAt: current?.createdAt || now, updatedAt: now };
      const next = [...books.filter(book => book.id !== bookId), record];
      if (!write(booksKey(), next)) throw new Error("This browser could not save the book.");
      state.books = next;
    } else {
      const { fs, db } = state.firebase;
      let preview;
      await fs.runTransaction(db, async transaction => {
        const ref = fs.doc(db, "rooms", state.room, "books", bookId), existing = await transaction.get(ref), current = existing.exists() ? existing.data() : null;
        if (id && stale(current, baseRevision)) { if (existing.exists()) state.books = [...state.books.filter(book => book.id !== id), serialized(existing)]; throw new Error("Your partner changed this book. Close and reopen it to load the latest name."); }
        if (!id && current) throw new Error("This book ID already exists. Try saving again.");
        transaction.set(ref, { name, revision: (current?.revision || 0) + 1, deleted, authorName: author(), createdBy: current?.createdBy || state.uid, createdAt: current?.createdAt || fs.serverTimestamp(), updatedBy: state.uid, updatedAt: fs.serverTimestamp() });
        preview = { id: bookId, name, revision: (current?.revision || 0) + 1, deleted, authorName: author(), createdAt: current?.createdAt?.toDate?.().toISOString() || new Date().toISOString(), updatedAt: new Date().toISOString() };
      });
      state.books = [...state.books.filter(book => book.id !== bookId), preview];
    }
    return bookId;
  }
  function openBookEditor(id = null) {
    if (!writable()) return;
    const book = id && state.books.find(item => item.id === id && !item.deleted);
    if (id && !book) return;
    state.bookEditor = { id, baseRevision: book?.revision || 0 };
    $("book-editor-title").textContent = id ? "Edit book" : "Add book"; $("book-name").value = book?.name || ""; $("book-error").hidden = true; $("delete-book").hidden = !id; $("book-editor").showModal(); $("book-name").focus();
  }
  let firebaseLoading;
  async function cloud(interactive = false) {
    if (!configured) throw new Error("Shared storage needs setup. Device notes still work.");
    // Start an already-loaded Google popup synchronously from the click. An
    // awaited CDN request first can lose mobile browsers' user activation.
    let loginPromise;
    if (interactive && state.firebase) { const provider = new state.firebase.authSdk.GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" }); loginPromise = state.firebase.authSdk.signInWithPopup(state.firebase.auth, provider); }
    if (!firebaseLoading) firebaseLoading = (async () => {
      const version = "12.19.0", base = "https://www.gstatic.com/firebasejs/" + version + "/";
      const [appSdk, authSdk, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
      const app = appSdk.initializeApp(firebaseConfig, "molomon-notes"), auth = authSdk.getAuth(app), db = fs.getFirestore(app);
      await auth.authStateReady();
      authSdk.onAuthStateChanged(auth, user => {
        const uid = user?.uid || null;
        if (state.observedAuthUid !== uid) { state.observedAuthUid = uid; state.authGeneration++; }
        if (state.uid && (!user || user.uid !== state.uid)) {
          if (state.editor) closeEditor(); if ($("book-editor").open) $("book-editor").close();
          stopListening(); state.locked = true; state.uid = null; state.records = []; state.books = []; state.room = null; state.mode = "device"; render();
        }
      });
      state.firebase = { fs, db, authSdk, auth }; return state.firebase;
    })().catch(error => { firebaseLoading = null; throw error; });
    const sdk = await firebaseLoading;
    if (interactive && !loginPromise) throw new Error("Google sign-in is ready. Press Sign in with Google again.");
    if (loginPromise) await loginPromise;
    if (!sdk.auth.currentUser) throw new Error("Sign in with one of your two authorized Google accounts.");
    const checkedUid = sdk.auth.currentUser.uid, generation = state.authGeneration;
    // Authorization comes from private backend rules, never a public email
    // list or a client-side password. A server-confirmed check precedes cache.
    let access;
    try { access = await sdk.fs.getDocFromServer(sdk.fs.doc(sdk.db, "access", "molomon")); }
    catch (error) { if (String(error.code).includes("permission-denied")) throw new Error("This Google account has not been given access."); throw error; }
    if (!access.exists() || access.data().ready !== true) throw new Error("Shared access needs setup. Create the private access document described in the setup instructions.");
    if (sdk.auth.currentUser?.uid !== checkedUid || state.authGeneration !== generation) throw new Error("The Google account changed while connecting. Sign in again.");
    state.uid = checkedUid; state.locked = false; return sdk;
  }
  function stopListening() { if (state.unsubscribe) state.unsubscribe(); if (state.unsubscribeBooks) state.unsubscribeBooks(); state.unsubscribe = state.unsubscribeBooks = null; state.connected = false; }
  async function openSpace(room, create = false) {
    if (state.busy) return;
    if (state.editor) closeEditor();
    // An already-authorized page may restore its own cache before reconnecting.
    // Fresh pages remain locked until the private server access check succeeds.
    if (!create && !state.locked) { stopListening(); state.mode = "cloud"; state.room = room; state.records = cachedRecords(cacheKey()); state.books = cachedBooks(booksKey()); }
    state.busy = true; message("Connecting to shared storage…"); syncStatus();
    render();
    try {
      const { fs, db } = await cloud(), ref = fs.doc(db, "rooms", room);
      const generation = state.authGeneration, uid = state.uid;
      await fs.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        if (create) {
          if (snapshot.exists()) throw new Error("This space already exists. Create another.");
          transaction.set(ref, { members: [state.uid], createdBy: state.uid, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
        } else {
          if (!snapshot.exists()) throw new Error("This invitation has no shared space. Check the complete link.");
          const data = snapshot.data();
          if (!data.members.includes(state.uid)) {
            if (data.members.length >= 2) throw new Error("This space already belongs to two Google accounts.");
            transaction.update(ref, { members: [...data.members, state.uid], updatedAt: fs.serverTimestamp() });
          }
        }
      });
      if (state.locked || state.authGeneration !== generation || state.firebase.auth.currentUser?.uid !== uid) throw new Error("The Google account changed while opening the space. Sign in again.");
      stopListening(); state.mode = "cloud"; state.room = room; state.records = cachedRecords(cacheKey()); state.books = cachedBooks(booksKey());
      write("molomon-notes-last-space", room); location.hash = "space=" + room;
      state.unsubscribe = fs.onSnapshot(fs.collection(db, "rooms", room, "notes"), { includeMetadataChanges: true }, snapshot => {
        if (state.locked || state.room !== room || state.authGeneration !== generation) return;
        state.records = snapshot.docs.map(serialized); state.connected = !snapshot.metadata.fromCache && navigator.onLine;
        if (!write(cacheKey(), state.records)) message("Shared notes loaded. This browser could not keep an offline cache; export a backup.", true);
        render();
      }, error => { state.connected = false; render(); message(friendlyError(error), true); });
      state.unsubscribeBooks = fs.onSnapshot(fs.collection(db, "rooms", room, "books"), snapshot => { if (state.locked || state.room !== room || state.authGeneration !== generation) return; state.books = snapshot.docs.map(serialized); write(booksKey(), state.books); render(); }, error => message(friendlyError(error), true));
      message(create ? "Shared space created. Send its private invitation to your partner." : "Shared space opened.");
    } catch (error) { message(friendlyError(error), true); }
    finally { state.busy = false; render(); }
  }
  function useDevice() {
    if (state.locked) return;
    if (state.editor) closeEditor(); stopListening(); state.mode = "device"; state.room = null; state.records = cachedRecords(localKey); state.books = cachedBooks(booksKey()); state.book = "default";
    remove("molomon-notes-last-space"); history.replaceState(null, "", location.pathname + location.search); message("Device notes opened. Shared notes stay in their space."); render();
  }
  async function importBackup(file) {
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error("Choose a backup under 5 MB.");
      const notes = parseBackup(await file.text());
      if (!notes.length) { message("This backup has no notes to import."); return; }
      if (!await ask("Import notes", `Add ${notes.length} ${notes.length === 1 ? "note" : "notes"} to ${state.mode === "cloud" ? "this shared space" : "this device"}? Existing notes stay in place.`, "Import")) return;
      state.busy = true; syncStatus();
      let added = 0;
      try {
        const bookMap = new Map(allBooks().map(book => [book.name, book.id]));
        for (const note of notes) {
          let notebookId = "default";
          if (note.notebookName) { if (!bookMap.has(note.notebookName)) bookMap.set(note.notebookName, await persistBook(null, note.notebookName, 0)); notebookId = bookMap.get(note.notebookName); }
          await persistNote(null, { title: note.title, body: note.body, authorName: note.authorName, notebookId }, 0); added++;
        }
        message(`Imported ${added} ${added === 1 ? "note" : "notes"}.`);
      }
      catch (error) { throw new Error(`Imported ${added} of ${notes.length} notes. ${friendlyError(error)} Re-importing the backup adds duplicates; keep this count before retrying.`); }
    } catch (error) { message(friendlyError(error), true); }
    finally { state.busy = false; $("import-notes").value = ""; render(); }
  }
  $("new-note").addEventListener("click", () => openEditor());
  $("close-editor").addEventListener("click", closeEditor); $("cancel-editor").addEventListener("click", closeEditor);
  $("note-editor").addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
  $("note-title").addEventListener("input", saveDraft); $("note-body").addEventListener("input", saveDraft);
  $("note-book").addEventListener("change", saveDraft);
  $("note-form").addEventListener("submit", event => { event.preventDefault(); saveEditor(); });
  $("save-separate").addEventListener("click", () => saveEditor(true));
  $("load-latest").addEventListener("click", async () => {
    const id = state.editor?.id;
    if (!id) return;
    if (!await ask("Load latest note", "Replace your current draft with the latest shared version?", "Load latest")) return;
    const current = state.records.find(note => note.id === id && !note.deleted);
    if (!current) { message("This note was deleted. Save your draft as a new note to keep it.", true); return; }
    remove(draftKey(id)); openEditor(id, true);
  });
  $("delete-note").addEventListener("click", async () => {
    const editing = state.editor, current = editing && state.records.find(note => note.id === editing.id);
    if (!editing?.id || !current || state.busy || !writable()) return;
    if (!await ask("Delete note", `Delete “${current.title}”${state.mode === "cloud" ? " for both of you" : " from this device"}?`, "Delete")) return;
    try { state.busy = true; syncStatus(); await persistNote(editing.id, { title: current.title, body: current.body, notebookId: current.notebookId || "default" }, editing.baseRevision, true); remove(draftKey(editing.id)); $("note-editor").close(); state.editor = null; message("Note deleted."); }
    catch (error) { if (error.code === "note-conflict") conflict(error.message); else message(friendlyError(error), true); }
    finally { state.busy = false; render(); }
  });
  $("author-name").addEventListener("change", () => { $("author-name").value = author(); write("molomon-notes-author", author()); });
  $("add-book").addEventListener("click", () => openBookEditor()); $("rename-book").addEventListener("click", () => openBookEditor(state.book));
  $("close-book").addEventListener("click", () => { $("book-editor").close(); state.bookEditor = null; });
  $("book-form").addEventListener("submit", async event => {
    event.preventDefault(); if (!state.bookEditor || state.busy) return;
    try { state.busy = true; syncStatus(); const id = await persistBook(state.bookEditor.id, $("book-name").value, state.bookEditor.baseRevision); state.book = id; $("book-editor").close(); state.bookEditor = null; message("Book saved."); }
    catch (error) { $("book-error").textContent = friendlyError(error); $("book-error").hidden = false; }
    finally { state.busy = false; render(); }
  });
  $("delete-book").addEventListener("click", async () => {
    const editing = state.bookEditor, book = editing && state.books.find(item => item.id === editing.id);
    if (!editing?.id || !book || state.busy) return;
    if (!await ask("Delete book", `Delete “${book.name}”? Its notes move into General.`, "Delete book")) return;
    try { state.busy = true; syncStatus(); await persistBook(editing.id, book.name, editing.baseRevision, true); state.book = "default"; $("book-editor").close(); state.bookEditor = null; message("Book deleted. Its notes are in General."); }
    catch (error) { $("book-error").textContent = friendlyError(error); $("book-error").hidden = false; }
    finally { state.busy = false; render(); }
  });
  $("sign-in").addEventListener("click", async () => {
    try { state.busy = true; render(); await cloud(true); state.records = cachedRecords(localKey); state.books = cachedBooks(booksKey()); message("Signed in."); }
    catch (error) { state.locked = true; state.records = []; state.books = []; message(friendlyError(error), true); }
    finally { state.busy = false; render(); }
    const room = roomFrom(location.hash) || roomFrom(read("molomon-notes-last-space", "")); if (!state.locked && room) openSpace(room);
  });
  $("sign-out").addEventListener("click", async () => {
    state.authGeneration++;
    if (state.editor) closeEditor(); if ($("book-editor").open) $("book-editor").close(); stopListening(); state.locked = true; state.records = []; state.books = []; state.room = null; state.mode = "device"; render();
    if (state.firebase) await state.firebase.authSdk.signOut(state.firebase.auth); message("Signed out. Private notes are hidden.");
  });
  $("create-space").addEventListener("click", () => openSpace(randomId(), true));
  $("join-form").addEventListener("submit", event => { event.preventDefault(); const room = roomFrom($("space-code").value); if (!room) { message("Paste a complete private invitation or its 32-character space code.", true); $("space-code").focus(); return; } openSpace(room); });
  $("use-device").addEventListener("click", useDevice); $("retry-space").addEventListener("click", () => state.room && openSpace(state.room));
  $("invite-link").addEventListener("focus", event => event.target.select());
  $("copy-invite").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("invite-link").value); message("Invitation copied. Send it privately to your partner."); } catch (_) { $("invite-link").focus(); $("invite-link").select(); message("Invitation selected. Use your device’s Copy command."); } });
  $("export-notes").addEventListener("click", () => {
    const data = JSON.stringify(exportData(state.records, state.books), null, 2), url = URL.createObjectURL(new Blob([data], { type: "application/json" })), link = node("a");
    link.href = url; link.download = "molomon-notes-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); message("Backup downloaded. Keep it privately; it contains your note text.");
  });
  $("import-notes").addEventListener("change", event => importBackup(event.target.files[0]));
  window.addEventListener("offline", () => { if (state.mode === "cloud") { state.connected = false; render(); saveDraft(); } });
  window.addEventListener("online", () => { if (state.mode === "cloud") { render(); message("Connection restored. Waiting for shared storage; reconnect if needed."); } });
  window.addEventListener("storage", event => { if (state.locked) return; if (event.key === cacheKey()) { state.records = cachedRecords(cacheKey()); render(); } if (event.key === booksKey()) { state.books = cachedBooks(booksKey()); render(); } });
  const names = read("molomon-names", []), savedAuthor = read("molomon-notes-author", "");
  $("author-name").value = typeof savedAuthor === "string" && savedAuthor ? savedAuthor.slice(0, 80) : Array.isArray(names) && typeof names[0] === "string" && names[0] ? names[0].slice(0, 80) : "You";
  if (!state.locked) { state.records = cachedRecords(localKey); state.books = cachedBooks(booksKey()); } render();
  const invited = roomFrom(location.hash), remembered = roomFrom(read("molomon-notes-last-space", ""));
  if (invited) $("space-code").value = invited;
  if (configured && (invited || remembered)) openSpace(invited || remembered);
  else if (configured) cloud().then(() => { state.records = cachedRecords(localKey); state.books = cachedBooks(booksKey()); render(); }).catch(error => { message(friendlyError(error), true); render(); });
  else if (invited) message("This private invitation will work after shared storage is configured. Device notes still work.");
})(typeof window === "undefined" ? globalThis : window);
