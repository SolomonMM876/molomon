"use strict";

const assert = require("node:assert/strict");
const { content, roomFrom, parseBackup, stale, exportData } = require("../notes.js");
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

console.log(`\n${passed} focused Notes tests passed.`);
