"use strict";

const assert = require("node:assert/strict");
const { content, roomFrom, parseBackup, stale, exportData, MEMORY_BOOK, validMemoryDate, memoryBody, readMemory, memoryTime } = require("../notes.js");
let passed = 0;
function test(name, run) { run(); passed++; console.log(`✓ ${name}`); }
const bookId = "a".repeat(32);
const backup = notes => JSON.stringify({ format: "molomon-notes", version: 1, notes });
const note = (overrides = {}) => ({ title: "Plan", body: "Movie\nGames", authorName: "Sam", ...overrides });

test("Unicode and HTML-looking text survive export/import without interpretation", () => {
  const original = note({ title: "旅行 🍄🐱", body: "Visit Zürich\n<script>cat & mushroom</script>\n静かな夜", authorName: "José" });
  const exported = exportData([original]);
  const restored = parseBackup(JSON.stringify(exported));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].title, original.title);
  assert.equal(restored[0].body, original.body);
  assert.equal(restored[0].authorName, original.authorName);
});

test("Book assignments roundtrip while deleted notes and books stay out of backups", () => {
  const exported = exportData([
    note({ notebookId: bookId }),
    note({ title: "Removed", deleted: true })
  ], [{ id: bookId, name: "Trips" }, { id: "b".repeat(32), name: "Removed book", deleted: true }]);
  assert.equal(exported.notes.length, 1);
  assert.deepEqual(exported.books, [{ id: bookId, name: "Trips" }]);
  assert.equal(exported.notes[0].notebookId, bookId);
  assert.equal(parseBackup(JSON.stringify(exported))[0].notebookName, "Trips");
});

test("Legacy backups without books import into General without losing their text", () => {
  const restored = parseBackup(backup([note()]));
  assert.equal(restored[0].notebookName, "");
  assert.equal(restored[0].body, "Movie\nGames");
  const missingBook = parseBackup(backup([note({ notebookId: bookId })]));
  assert.equal(missingBook[0].notebookName, "");
});

test("Export omits room invitations and credentials carried on source records", () => {
  const exported = exportData([note({ room: "private-room", token: "private-token", revision: 7, deleted: false })]);
  const json = JSON.stringify(exported);
  assert.equal(json.includes("private-room"), false);
  assert.equal(json.includes("private-token"), false);
  assert.equal(exported.notes[0].notebookId, "default");
});

test("Title, body, author, note count, and file limits reject oversized or malformed input", () => {
  assert.deepEqual(content("  Plan  ", "One\nTwo"), { title: "Plan", body: "One\nTwo" });
  assert.doesNotThrow(() => content("x".repeat(160), "x".repeat(20000)));
  assert.throws(() => content(" ", ""));
  assert.throws(() => content("x".repeat(161), ""));
  assert.throws(() => content("Plan", "x".repeat(20001)));
  assert.throws(() => parseBackup(backup([note({ body: 3 })])));
  assert.throws(() => parseBackup(backup([note({ authorName: "x".repeat(81) })])));
  assert.throws(() => parseBackup(backup(Array(201).fill(note()))));
  assert.throws(() => parseBackup("x".repeat(5000001)));
  assert.throws(() => parseBackup("not JSON"));
  assert.throws(() => parseBackup(JSON.stringify({ format: "other-app", version: 1, notes: [] })));
});

test("Book metadata rejects malformed IDs, blank/long names, and excessive categories", () => {
  const withBooks = books => JSON.stringify({ format: "molomon-notes", version: 1, notes: [], books });
  assert.throws(() => parseBackup(withBooks([{ id: "invalid", name: "Trips" }])));
  assert.throws(() => parseBackup(withBooks([{ id: bookId, name: " " }])));
  assert.throws(() => parseBackup(withBooks([{ id: bookId, name: "x".repeat(81) }])));
  assert.throws(() => parseBackup(withBooks(Array(51).fill({ id: bookId, name: "Trips" }))));
});

test("Missing, newer, and deleted versions conflict; the matching live revision is editable", () => {
  assert.equal(stale({ revision: 3, deleted: false }, 3), false);
  assert.equal(stale({ revision: 4, deleted: false }, 3), true);
  assert.equal(stale({ revision: 3, deleted: true }, 3), true);
  assert.equal(stale(null, 3), true);
  assert.equal(stale(undefined, 3), true);
});

test("Space invitations accept complete random IDs and reject incomplete/non-space values", () => {
  assert.equal(roomFrom(`https://example.com/notes.html#space=${bookId}`), bookId);
  assert.equal(roomFrom("A".repeat(32)), bookId);
  assert.equal(roomFrom("space=" + bookId), bookId);
  assert.equal(roomFrom("a".repeat(31)), null);
  assert.equal(roomFrom("javascript:alert(1)"), null);
  assert.equal(roomFrom(""), null);
});

test("Memory dates and prose survive a combined backup without a cloud schema change", () => {
  assert.match(MEMORY_BOOK, /^[a-f0-9]{32}$/);
  const original = note({ title: "A past moment", body: memoryBody("2020-02-29", "A little note\n<script>plain text</script> 🐱"), notebookId: MEMORY_BOOK });
  const exported = exportData([original, note({ title: "Ordinary note" })]);
  assert.deepEqual(exported.books, [{ id: MEMORY_BOOK, name: "Memories" }]);
  const restored = parseBackup(JSON.stringify(exported));
  assert.equal(restored[0].notebookName, "Memories");
  assert.deepEqual(readMemory(restored[0].body), { date: "2020-02-29", body: "A little note\n<script>plain text</script> 🐱" });
  assert.equal(restored[1].notebookName, "");
  assert.equal(exported.notes[0].memoryDate, undefined);
  const collision = parseBackup(JSON.stringify(exportData([original, note({ notebookId: bookId })], [{ id: bookId, name: "Memories" }])));
  assert.equal(collision[0].memory, true);
  assert.equal(collision[1].memory, undefined);
});

test("Memory dates reject impossible days and leave undated or legacy text intact", () => {
  for (const date of ["2023-02-29", "2026-02-30", "2026-13-01", "10/12/2026"]) {
    assert.equal(validMemoryDate(date), false);
    assert.throws(() => memoryBody(date, "Moment"));
  }
  assert.equal(validMemoryDate("2024-02-29"), true);
  assert.deepEqual(readMemory(memoryBody("", "No exact date\nTwo lines")), { date: "", body: "No exact date\nTwo lines" });
  assert.deepEqual(readMemory("Date: 2026-02-30\n\nText"), { date: "", body: "Date: 2026-02-30\n\nText" });
  assert.throws(() => content("Moment", memoryBody("2026-10-12", "x".repeat(20000))));
});

test("Editing an old memory does not move it ahead of a more recent moment", () => {
  const old = note({ body: memoryBody("2019-06-12", "Then"), createdAt: "2026-10-12T12:00:00Z", updatedAt: "2026-10-13T12:00:00Z" });
  const recent = note({ body: memoryBody("2025-06-12", "Later"), createdAt: "2026-10-11T12:00:00Z" });
  assert.ok(memoryTime(old) < memoryTime(recent));
  assert.equal(memoryTime(note({ body: "Undated", createdAt: "2020-01-01T12:00:00Z" })), Date.parse("2020-01-01T12:00:00Z"));
});

console.log(`\n${passed} focused Notes tests passed.`);
