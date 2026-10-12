/* Molomon Backgammon. Pure rules first; DOM and PeerJS below.
 * Rules reference: https://usbgf.org/backgammon-basics-how-to-play/
 * Cream (seat 0) moves 24 -> 1; Clay (seat 1) moves 1 -> 24.
 * No cube: each game ends when one player bears off all 15 checkers.
 */
(function (root) {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  const sign = seat => seat === 0 ? 1 : -1;
  const owner = value => value > 0 ? 0 : value < 0 ? 1 : null;
  function create(names = ["Cream", "Clay"]) {
    const points = Array(24).fill(0);
    points[23] = 2; points[12] = 5; points[7] = 3; points[5] = 5;
    points[0] = -2; points[11] = -5; points[16] = -3; points[18] = -5;
    return { points, bar: [0, 0], off: [0, 0], names: names.slice(0, 2), turn: null, phase: "opening", dice: [], rolled: [], winner: null, revision: 0, last: "Opening roll: the higher die starts." };
  }
  function allHome(g, seat) {
    return !g.bar[seat] && g.points.every((n, i) => owner(n) !== seat || (seat === 0 ? i <= 5 : i >= 18));
  }
  function singleMoves(g, seat, die) {
    if (!Number.isInteger(die) || die < 1 || die > 6) return [];
    const sources = g.bar[seat] ? ["bar"] : g.points.flatMap((n, i) => owner(n) === seat ? [i] : []);
    const home = allHome(g, seat);
    return sources.flatMap(from => {
      const to = from === "bar" ? (seat === 0 ? 24 - die : die - 1) : from + (seat === 0 ? -die : die);
      if (to >= 0 && to < 24) {
        if (owner(g.points[to]) === 1 - seat && Math.abs(g.points[to]) >= 2) return [];
        return [{ from, to, die }];
      }
      if (!home || from === "bar") return [];
      const distance = seat === 0 ? from + 1 : 24 - from;
      const farther = g.points.some((n, i) => owner(n) === seat && (seat === 0 ? i > from : i < from));
      return die === distance || (die > distance && !farther) ? [{ from, to: "off", die }] : [];
    });
  }
  function moveUnchecked(g, seat, move) {
    const result = copy(g);
    if (move.from === "bar") result.bar[seat]--;
    else result.points[move.from] -= sign(seat);
    if (move.to === "off") result.off[seat]++;
    else {
      if (owner(result.points[move.to]) === 1 - seat) { result.points[move.to] = 0; result.bar[1 - seat]++; }
      result.points[move.to] += sign(seat);
    }
    return result;
  }
  function without(dice, value) { const next = dice.slice(); next.splice(next.indexOf(value), 1); return next; }
  // A permitted move must leave a continuation that uses the maximum number
  // of dice. Looking ahead prevents an attractive move from wasting a die.
  function legalMoves(g) {
    if (g.phase !== "moving" || !g.dice.length || g.turn === null) return [];
    const seat = g.turn;
    const memo = new Map();
    function longest(position, dice) {
      if (!dice.length || position.off[seat] === 15) return 0;
      const key = position.points.join(",") + "/" + position.bar.join(",") + "/" + position.off[seat] + "/" + dice.slice().sort().join(",");
      if (memo.has(key)) return memo.get(key);
      let best = 0;
      for (const die of new Set(dice)) {
        for (const move of singleMoves(position, seat, die)) {
          best = Math.max(best, 1 + longest(moveUnchecked(position, seat, move), without(dice, die)));
        }
      }
      memo.set(key, best);
      return best;
    }
    const best = longest(g, g.dice);
    if (!best) return [];
    let moves = [];
    for (const die of new Set(g.dice)) {
      for (const move of singleMoves(g, seat, die)) {
        if (1 + longest(moveUnchecked(g, seat, move), without(g.dice, die)) === best) moves.push(move);
      }
    }
    if (best === 1 && g.dice.length === 2 && g.dice[0] !== g.dice[1]) {
      const higher = Math.max(...moves.map(move => move.die));
      moves = moves.filter(move => move.die === higher);
    }
    return moves;
  }
  function nextTurn(g) { g.turn = 1 - g.turn; g.phase = "rolling"; g.dice = []; }
  function apply(state, seat, action, dieRoll = () => Math.floor(Math.random() * 6) + 1) {
    if (!action || typeof action !== "object" || ![0, 1].includes(seat)) return { error: "Unknown move." };
    if (state.phase === "won") return { error: "This game is over." };
    const g = copy(state);
    if (action.type === "roll") {
      if (g.phase === "opening") {
        if (seat !== 0) return { error: "The host makes the opening roll." };
        const a = dieRoll(), b = dieRoll();
        if (![a, b].every(n => Number.isInteger(n) && n >= 1 && n <= 6)) return { error: "Invalid dice." };
        g.rolled = [a, b];
        if (a === b) { g.last = `Opening tie: ${a} and ${b}. Roll again.`; g.revision++; return { state: g }; }
        g.turn = a > b ? 0 : 1; g.dice = [a, b]; g.phase = "moving";
        g.last = `${g.names[0]} rolled ${a}; ${g.names[1]} rolled ${b}. ${g.names[g.turn]} starts.`;
      } else {
        if (g.turn !== seat) return { error: "It is the other player's turn." };
        if (g.phase !== "rolling") return { error: "Use your remaining dice first." };
        const a = dieRoll(), b = dieRoll();
        if (![a, b].every(n => Number.isInteger(n) && n >= 1 && n <= 6)) return { error: "Invalid dice." };
        g.rolled = [a, b]; g.dice = a === b ? [a, a, a, a] : [a, b]; g.phase = "moving";
        g.last = `${g.names[seat]} rolled ${a} and ${b}${a === b ? " — four moves" : ""}.`;
      }
      if (!legalMoves(g).length) { g.last += " No legal moves; turn passed."; nextTurn(g); }
    } else if (action.type === "move") {
      if (g.turn !== seat) return { error: "It is the other player's turn." };
      const move = legalMoves(g).find(m => m.from === action.from && m.to === action.to && m.die === action.die);
      if (!move) return { error: "That move cannot use the dice legally." };
      const moved = moveUnchecked(g, seat, move);
      g.points = moved.points; g.bar = moved.bar; g.off = moved.off; g.dice = without(g.dice, move.die);
      const label = value => value === "bar" ? "the bar" : value === "off" ? "off" : `point ${value + 1}`;
      g.last = `${g.names[seat]}: ${label(move.from)} → ${label(move.to)} (die ${move.die}).`;
      if (g.off[seat] === 15) { g.winner = seat; g.phase = "won"; g.dice = []; g.last += ` ${g.names[seat]} wins.`; }
      else if (!g.dice.length || !legalMoves(g).length) { if (g.dice.length) g.last += " Remaining dice are blocked."; nextTurn(g); }
    } else return { error: "Unknown move." };
    g.revision++;
    return { state: g };
  }
  const engine = { create, apply, legalMoves, singleMoves, allHome, moveUnchecked };
  root.MolomonBackgammon = engine;
  if (typeof module !== "undefined" && module.exports) module.exports = engine;
  if (typeof document === "undefined") return;

  const $ = id => document.getElementById(id);
  const VERSION = "1";
  const PREFIX = "molomon-bg1-";
  const STORAGE = "molomon:backgammon:host";
  const saved = { get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Play still works when storage is blocked. */ } } };
  function randomHex(bytes) { return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, "0")).join(""); }
  function randomDie() { let n; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= 4294967292); return n % 6 + 1; }
  function cleanName(value, fallback) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, 30) || fallback; }
  const ui = { mode: null, seat: 0, game: null, room: null, selected: null, connected: false, waiting: false, peer: null, conn: null, retry: null, heartbeat: null, lastHeard: 0, token: null, pending: false };
  function node(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
  function status(text) { $("connection").textContent = text; }
  function error(text) { $("error").textContent = text || ""; $("error").hidden = !text; }
  function stopNetwork() {
    clearTimeout(ui.retry); clearInterval(ui.heartbeat); ui.retry = ui.heartbeat = null;
    const old = ui.peer; ui.peer = null; ui.conn = null; ui.connected = false;
    if (old) old.destroy();
  }
  function persist() { if (ui.mode === "host") saved.set(STORAGE, { room: ui.room, game: ui.game, guestToken: ui.token }); }
  function sendMessage(conn, message) { if (conn && conn.open) { try { conn.send(message); return true; } catch { /* A connection event or heartbeat reports loss. */ } } return false; }
  function broadcast() { persist(); render(); sendMessage(ui.conn, { type: "state", game: ui.game, version: VERSION }); }
  function remoteAction(seat, action, revision) {
    if (revision !== undefined && revision !== ui.game.revision) return "The board changed. Try your move again.";
    if (!ui.connected) return "Wait for your partner to connect.";
    const result = apply(ui.game, seat, action, randomDie);
    if (result.error) return result.error;
    ui.game = result.state; ui.selected = null; broadcast(); return null;
  }
  function act(action) {
    error("");
    if (ui.mode === "guest") {
      if (!ui.connected || ui.pending) { error("Wait for the connection or current move."); return; }
      ui.pending = true;
      if (!sendMessage(ui.conn, { type: "action", action, revision: ui.game.revision })) { ui.pending = false; error("Connection lost. Rejoining…"); }
      render();
    } else if (ui.mode === "host") error(remoteAction(0, action));
    else {
      const result = apply(ui.game, ui.game.phase === "opening" ? 0 : ui.game.turn, action, randomDie);
      if (result.error) error(result.error); else { ui.game = result.state; ui.selected = null; render(); }
    }
  }
  function startHost(table) {
    stopNetwork();
    ui.mode = "host"; ui.seat = 0; ui.room = table.room; ui.game = table.game; ui.token = table.guestToken || null; ui.selected = null; ui.waiting = true;
    location.hash = "room=" + ui.room; persist(); render(); openHost();
  }
  function openHost() {
    if (ui.mode !== "host") return;
    if (!root.Peer) { status("Connection library could not load. Refresh, or play on one screen."); return; }
    status("Opening remote table…");
    const peer = new root.Peer(PREFIX + ui.room, { debug: 0 }); ui.peer = peer;
    peer.on("open", () => { if (ui.peer === peer) status(ui.connected ? "Connected · you are Cream." : "Table ready · waiting for your partner."); });
    peer.on("connection", conn => {
      let accepted = false;
      // Allow ICE negotiation to finish before timing the application hello.
      let timeout;
      conn.on("open", () => { timeout = setTimeout(() => { if (!accepted) conn.close(); }, 12000); });
      conn.on("data", msg => {
        if (ui.peer !== peer || !msg || typeof msg !== "object") return;
        if (msg.type === "hello") {
          if (msg.version !== VERSION) { sendMessage(conn, { type: "error", message: "Versions differ. Refresh both pages." }); return; }
          if (typeof msg.token !== "string" || !/^[a-f0-9]{32}$/.test(msg.token)) return;
          if ((ui.token && ui.token !== msg.token) || (ui.conn && ui.conn !== conn && ui.connected)) { sendMessage(conn, { type: "full" }); return; }
          clearTimeout(timeout); accepted = true; if (ui.conn && ui.conn !== conn) ui.conn.close();
          ui.conn = conn; ui.token = msg.token; ui.connected = true; ui.waiting = false; ui.lastHeard = Date.now();
          ui.game.names[1] = cleanName(msg.name, "Clay"); status("Connected · you are Cream."); error(""); broadcast(); return;
        }
        if (!accepted || ui.conn !== conn) return;
        ui.lastHeard = Date.now();
        if (msg.type === "ping") sendMessage(conn, { type: "pong" });
        else if (msg.type === "action") { const message = remoteAction(1, msg.action, msg.revision); if (message) { sendMessage(conn, { type: "error", message }); sendMessage(conn, { type: "state", game: ui.game, version: VERSION }); } }
      });
      const lost = () => { clearTimeout(timeout); if (ui.conn !== conn) return; ui.connected = false; ui.conn = null; status("Partner disconnected · waiting for them to rejoin."); render(); };
      conn.on("close", lost); conn.on("error", lost);
    });
    peer.on("disconnected", () => { if (ui.peer === peer && !peer.destroyed) { status("Connection server disconnected · retrying…"); setTimeout(() => { if (ui.peer === peer && peer.disconnected) peer.reconnect(); }, 2000); } });
    peer.on("error", event => {
      if (ui.peer !== peer) return;
      status(event.type === "unavailable-id" ? "Table is open in another tab. Close that tab, then resume here." : "Remote connection unavailable. Retrying; try another network if needed.");
      if (["unavailable-id", "server-error", "socket-error", "socket-closed", "network"].includes(event.type)) { peer.destroy(); ui.peer = null; ui.connected = false; render(); clearTimeout(ui.retry); ui.retry = setTimeout(openHost, 5000); }
    });
    clearInterval(ui.heartbeat);
    ui.heartbeat = setInterval(() => { if (ui.connected && Date.now() - ui.lastHeard > 16000) { ui.connected = false; if (ui.conn) ui.conn.close(); ui.conn = null; status("Partner disconnected · waiting for them to rejoin."); render(); } }, 4000);
  }
  function startGuest(room) {
    stopNetwork(); ui.mode = "guest"; ui.seat = 1; ui.room = room; ui.game = null; ui.waiting = true; ui.pending = false; ui.selected = null;
    ui.name = cleanName($("player-name").value, "Clay");
    ui.token = saved.get("molomon:bg:guest:" + room) || randomHex(16); saved.set("molomon:bg:guest:" + room, ui.token);
    location.hash = "room=" + room; render(); openGuest();
  }
  function retryGuest(fresh = false) {
    if (ui.mode !== "guest" || ui.retry) return;
    ui.retry = setTimeout(() => { ui.retry = null; if (ui.mode !== "guest") return; if (fresh || !ui.peer || ui.peer.destroyed) openGuest(); else if (ui.peer.disconnected) ui.peer.reconnect(); else connectGuest(); }, 4000);
  }
  function openGuest() {
    if (ui.mode !== "guest") return;
    if (!root.Peer) { status("Connection library could not load. Refresh, or play on one screen."); return; }
    status("Connecting to the host…");
    if (ui.peer) ui.peer.destroy();
    const peer = new root.Peer({ debug: 0 }); ui.peer = peer;
    peer.on("open", () => { if (ui.peer === peer) connectGuest(); });
    peer.on("disconnected", () => { if (ui.peer === peer) retryGuest(); });
    peer.on("error", event => {
      if (ui.peer !== peer) return;
      ui.connected = false; ui.pending = false;
      status(event.type === "peer-unavailable" ? "Host is offline. Waiting for their tab to open…" : "Connection unavailable. Retrying; try another network if needed."); render();
      retryGuest(["server-error", "socket-error", "socket-closed", "network"].includes(event.type));
    });
    clearInterval(ui.heartbeat);
    ui.heartbeat = setInterval(() => {
      if (!ui.connected) return;
      if (Date.now() - ui.lastHeard > 16000) { ui.connected = false; ui.pending = false; status("Connection lost · rejoining…"); const old = ui.conn; ui.conn = null; if (old) old.close(); render(); retryGuest(); }
      else sendMessage(ui.conn, { type: "ping" });
    }, 4000);
  }
  function connectGuest() {
    const peer = ui.peer;
    if (!peer || peer.destroyed || peer.disconnected || ui.mode !== "guest") return;
    if (ui.conn) { const old = ui.conn; ui.conn = null; old.close(); }
    const conn = peer.connect(PREFIX + ui.room, { reliable: true }); ui.conn = conn;
    const timeout = setTimeout(() => { if (ui.conn === conn && !ui.connected) { status("Still connecting. A firewall may be blocking the connection; try another network."); retryGuest(); } }, 30000);
    conn.on("open", () => { if (ui.conn === conn) sendMessage(conn, { type: "hello", token: ui.token, name: ui.name, version: VERSION }); });
    conn.on("data", msg => {
      if (ui.conn !== conn || !msg || typeof msg !== "object") return;
      ui.lastHeard = Date.now();
      if (msg.type === "state") {
        if (msg.version !== VERSION) { error("Versions differ. Refresh both pages."); return; }
        clearTimeout(timeout); ui.connected = true; ui.waiting = false; ui.pending = false; ui.game = msg.game; ui.selected = null; status("Connected · you are Clay."); render();
      } else if (msg.type === "error") { ui.pending = false; error(String(msg.message)); render(); }
      else if (msg.type === "full") { clearTimeout(timeout); stopNetwork(); status("This table already has a partner. Ask the host to start another game."); }
    });
    const lost = () => { clearTimeout(timeout); if (ui.conn !== conn || ui.mode !== "guest") return; ui.connected = false; ui.pending = false; ui.conn = null; status("Connection lost · rejoining…"); render(); retryGuest(); };
    conn.on("close", lost); conn.on("error", lost);
  }
  function roomFrom(value) {
    let text = String(value || "").trim();
    if (text.includes("#")) text = text.slice(text.indexOf("#") + 1);
    if (text.startsWith("room=")) text = text.slice(5);
    return /^[a-f0-9]{20}$/i.test(text) ? text.toLowerCase() : null;
  }
  function canPlay() { return ui.game && !ui.pending && (ui.mode === "local" || (ui.connected && (ui.game.phase === "opening" ? ui.seat === 0 : ui.game.turn === ui.seat))); }
  function currentMoves() { return canPlay() ? legalMoves(ui.game) : []; }
  function pointLabel(value) { return value === "bar" ? "Bar" : value === "off" ? "Bear off" : `Point ${value + 1}`; }
  function color(seat) { return seat === 0 ? "cream" : "clay"; }
  function select(value) {
    const moves = currentMoves();
    const destinations = moves.filter(move => move.from === ui.selected && move.to === value);
    if (destinations.length === 1) { act({ type: "move", ...destinations[0] }); return; }
    if (destinations.length > 1) { renderOptions(destinations); $("move-help").textContent = "Choose which die to use below the board."; $("move-options").querySelector("button").focus(); return; }
    if (moves.some(move => move.from === value)) { ui.selected = ui.selected === value ? null : value; renderBoard(); renderOptions(); }
  }
  function checker(seat, text) { const n = node("span", "checker " + color(seat), text); n.setAttribute("aria-hidden", "true"); return n; }
  function point(index, col, row, moves) {
    const n = ui.game.points[index], seat = owner(n), count = Math.abs(n);
    const source = moves.some(move => move.from === index), dest = moves.some(move => move.from === ui.selected && move.to === index);
    const button = node("button", `point${index % 2 ? " alternate" : ""}${row === 2 ? " bottom" : ""}${dest ? " destination" : ""}`);
    button.type = "button"; button.style.gridColumn = col; button.style.gridRow = row;
    button.disabled = !source && !dest;
    button.dataset.point = index;
    button.setAttribute("aria-label", `Point ${index + 1}: ${count ? `${count} ${color(seat)} checkers` : "empty"}${source ? ". Select checker" : ""}${dest ? ". Valid destination" : ""}`);
    button.setAttribute("aria-pressed", String(ui.selected === index));
    button.append(node("span", "point-number", index + 1));
    const stack = node("span", "checkers");
    for (let i = 0; i < Math.min(count, 5); i++) stack.append(checker(seat, i === 4 && count > 5 ? String(count) : ""));
    button.append(stack); button.addEventListener("click", () => select(index)); return button;
  }
  function tray(type, seat, moves) {
    const activeSeat = ui.game.turn, count = ui.game[type][seat];
    const source = type === "bar" && seat === activeSeat && moves.some(move => move.from === "bar");
    const dest = type === "off" && seat === activeSeat && moves.some(move => move.from === ui.selected && move.to === "off");
    const button = node("button", `tray${dest ? " destination" : ""}`); button.type = "button"; button.disabled = !source && !dest;
    button.setAttribute("aria-label", `${color(seat)} ${type}: ${count} checkers${source ? ". Select to enter" : ""}${dest ? ". Valid bear-off destination" : ""}`);
    button.setAttribute("aria-pressed", String(type === "bar" && seat === activeSeat && ui.selected === "bar"));
    button.dataset.tray = type + seat;
    button.append(node("span", "", type === "off" ? "Off" : "Bar"), checker(seat, count));
    button.addEventListener("click", () => select(type === "bar" ? "bar" : "off")); return button;
  }
  function renderBoard() {
    const previous = document.activeElement && document.activeElement.dataset;
    const focusKey = previous && (previous.point !== undefined ? ["point", previous.point] : previous.tray ? ["tray", previous.tray] : null);
    const board = $("board"); board.replaceChildren();
    const moves = currentMoves();
    [12,13,14,15,16,17,18,19,20,21,22,23].forEach((index, i) => board.append(point(index, i < 6 ? i + 1 : i + 2, 1, moves)));
    [11,10,9,8,7,6,5,4,3,2,1,0].forEach((index, i) => board.append(point(index, i < 6 ? i + 1 : i + 2, 2, moves)));
    const bar = node("div", "bar-space"); bar.append(tray("bar", 1, moves), tray("bar", 0, moves));
    const off = node("div", "off-space"); off.append(tray("off", 1, moves), tray("off", 0, moves)); board.append(bar, off);
    if (focusKey) {
      const previousTarget = board.querySelector(`[data-${focusKey[0]}="${focusKey[1]}"]`);
      const target = previousTarget && !previousTarget.disabled ? previousTarget : board.querySelector("button:not(:disabled)") || (!$("roll").disabled ? $("roll") : $("turn-status"));
      target.focus({ preventScroll: true });
    }
    $("move-help").textContent = ui.selected !== null ? `${pointLabel(ui.selected)} selected. Choose a highlighted destination, or a move below.` : canPlay() && ui.game.phase === "moving" ? "Select a checker on the board or below, then choose its destination." : ui.game.phase === "won" ? "All 15 checkers are off." : "The board highlights legal moves after the roll.";
  }
  function renderOptions(choices) {
    const options = $("move-options");
    const restoreFocus = options.contains(document.activeElement);
    options.replaceChildren();
    const restore = () => { if (restoreFocus) (options.querySelector("button") || (!$("roll").disabled ? $("roll") : $("turn-status"))).focus({ preventScroll: true }); };
    if (!choices && ui.selected === null) {
      for (const source of new Set(currentMoves().map(move => move.from))) {
        const button = node("button", "", `Select ${pointLabel(source).toLowerCase()}`);
        button.addEventListener("click", () => { select(source); const first = options.querySelector("button"); if (first) first.focus({ preventScroll: true }); });
        options.append(button);
      }
      restore(); return;
    }
    const moves = choices || currentMoves().filter(move => move.from === ui.selected);
    for (const move of moves) {
      const button = node("button", "", `${pointLabel(move.from)} → ${pointLabel(move.to)} · die ${move.die}`);
      button.addEventListener("click", () => act({ type: "move", ...move })); options.append(button);
    }
    restore();
  }
  function render() {
    const g = ui.game;
    $("setup").hidden = ui.mode !== null;
    $("cancel-connection").hidden = !ui.waiting;
    $("game").hidden = !g || ui.waiting;
    $("invitation").hidden = ui.mode !== "host";
    if (ui.mode === "host") $("invite-link").value = location.href.split("#")[0] + "#room=" + ui.room;
    if (!g || ui.waiting) return;
    $("players").replaceChildren();
    g.names.forEach((name, seat) => {
      const item = node("div", "player" + (g.turn === seat ? " active" : ""));
      item.append(node("span", "player-marker " + color(seat)));
      const labels = node("div"); labels.append(node("strong", "", `${name}${ui.mode !== "local" && seat === ui.seat ? " (you)" : ""}`), node("small", "", `${color(seat)} · ${g.off[seat]}/15 off · ${g.bar[seat]} on bar`)); item.append(labels); $("players").append(item);
    });
    $("turn-status").textContent = g.phase === "won" ? `${g.names[g.winner]} wins.` : g.phase === "opening" ? "Opening roll" : `${g.names[g.turn]}'s turn${ui.mode !== "local" && g.turn !== ui.seat ? " · waiting" : ""}`;
    $("last-action").textContent = g.last;
    $("dice-label").textContent = g.phase === "opening" ? "Opening dice: Cream / Clay" : g.phase === "moving" ? "Dice remaining" : "Last roll";
    $("dice").replaceChildren();
    const dice = g.phase === "moving" ? g.dice : g.rolled;
    dice.forEach(die => $("dice").append(node("span", "die" + (g.phase === "rolling" || g.phase === "won" ? " used" : ""), String(die))));
    if (!dice.length) $("dice").append(node("span", "dice-note", "Ready"));
    $("roll").textContent = g.phase === "opening" ? "Roll to start" : "Roll dice";
    $("roll").disabled = !canPlay() || !["opening", "rolling"].includes(g.phase);
    $("new-game").disabled = ui.mode === "guest";
    renderBoard(); renderOptions();
  }
  $("start-local").addEventListener("click", () => { stopNetwork(); ui.mode = "local"; ui.game = create([cleanName($("player-name").value, "Cream"), cleanName($("other-name").value, "Clay")]); ui.waiting = false; ui.selected = null; history.replaceState(null, "", location.pathname + location.search); status("One-screen play · take turns on this device."); error(""); render(); });
  $("start-remote").addEventListener("click", () => { error(""); startHost({ room: randomHex(10), game: create([cleanName($("player-name").value, "Cream"), "Clay"]), guestToken: null }); });
  $("join-form").addEventListener("submit", event => { event.preventDefault(); const room = roomFrom($("join-code").value); if (!room) { error("Paste a complete invitation or its 20-character room code."); return; } error(""); startGuest(room); });
  $("resume").hidden = !saved.get(STORAGE);
  $("resume").addEventListener("click", () => { const table = saved.get(STORAGE); if (table && table.game && roomFrom(table.room)) { error(""); startHost(table); } });
  $("copy-invite").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("invite-link").value); $("copy-invite").textContent = "Copied"; setTimeout(() => { $("copy-invite").textContent = "Copy link"; }, 2000); } catch { $("invite-link").focus(); $("invite-link").select(); status("Select and copy the invitation above."); } });
  $("invite-link").addEventListener("focus", event => event.target.select());
  $("roll").addEventListener("click", () => act({ type: "roll" }));
  $("new-game").addEventListener("click", () => { if (ui.mode === "guest") return; if (ui.game.phase !== "won" && !confirm("Start a new game? The current board will be replaced.")) return; ui.game = create(ui.game.names); ui.selected = null; error(""); if (ui.mode === "host") broadcast(); else render(); });
  $("leave-game").addEventListener("click", () => { stopNetwork(); ui.mode = null; ui.game = null; ui.selected = null; ui.pending = false; history.replaceState(null, "", location.pathname + location.search); $("resume").hidden = !saved.get(STORAGE); status("Choose how to play."); error(""); render(); });
  $("cancel-connection").addEventListener("click", () => $("leave-game").click());
  document.addEventListener("keydown", event => { if (event.key === "Escape" && ui.selected !== null) { ui.selected = null; renderBoard(); renderOptions(); } });
  const invited = roomFrom(location.hash.slice(1));
  const names = saved.get("molomon-names");
  if (Array.isArray(names)) { $("player-name").value = cleanName(names[0], "Cream"); $("other-name").value = cleanName(names[1], "Clay"); }
  if (invited) { $("join-code").value = invited; if (!Array.isArray(names)) $("player-name").value = "Clay"; status("Invitation ready · enter your name, then Join."); }
  render();
})(typeof window !== "undefined" ? window : globalThis);
