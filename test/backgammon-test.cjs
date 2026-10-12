"use strict";
const assert = require("node:assert/strict");
const E = require("../backgammon.js");
let checked = 0;
function test(name, run) { run(); checked++; console.log("PASS " + name); }
function position(seat, points, dice, bar = [0, 0], off = [0, 0]) {
  const g = E.create(); g.points.fill(0);
  for (const [index, count] of points) g.points[index] = count;
  Object.assign(g, { turn: seat, phase: "moving", dice, bar, off }); return g;
}
function roll(values) { let i = 0; return () => values[i++]; }
function move(g, seat, m) { const r = E.apply(g, seat, { type: "move", ...m }); assert.ok(!r.error, r.error); return r.state; }
test("initial layout contains 15 checkers each", () => {
  const g = E.create(); assert.equal(g.points.filter(n => n > 0).reduce((a, b) => a + b, 0), 15); assert.equal(g.points.filter(n => n < 0).reduce((a, b) => a - b, 0), 15);
  assert.deepEqual([g.points[23],g.points[12],g.points[7],g.points[5]], [2,5,3,5]);
});
test("opening tie retries; higher die wins and both opening dice are used", () => {
  let g = E.apply(E.create(), 0, { type: "roll" }, roll([4,4])).state; assert.equal(g.phase, "opening");
  g = E.apply(g, 0, { type: "roll" }, roll([2,5])).state; assert.equal(g.turn, 1); assert.deepEqual(g.dice, [2,5]);
});
test("doubles grant four dice", () => {
  const g = E.create(); g.phase = "rolling"; g.turn = 0;
  assert.deepEqual(E.apply(g, 0, { type: "roll" }, roll([3,3])).state.dice, [3,3,3,3]);
});
test("bar entry has priority; blocked entries cannot move", () => {
  const g = position(0, [[10,14],[23,-2]], [1,2], [1,0]);
  const m = E.legalMoves(g); assert.ok(m.length); assert.ok(m.every(x => x.from === "bar" && x.die === 2 && x.to === 22));
});
test("hitting a blot sends it to the opposing bar", () => {
  const g = position(0, [[10,1],[8,-1]], [2]); const next = move(g,0,{from:10,to:8,die:2});
  assert.equal(next.points[8],1); assert.equal(next.bar[1],1);
});
test("landing on two opposing checkers is rejected without mutating state", () => {
  const g = position(0, [[10,1],[8,-2]], [2]); const before = JSON.stringify(g);
  assert.ok(E.apply(g,0,{type:"move",from:10,to:8,die:2}).error); assert.equal(JSON.stringify(g),before);
});
test("lookahead forces both dice when playing the larger first would waste one", () => {
  // Enter with 1; a separate checker can then use 2. Entering with 2
  // leaves the 1 blocked from both checkers.
  const g = position(0, [[21,-2],[10,1],[9,-2]], [1,2], [1,0]);
  const m = E.legalMoves(g); assert.deepEqual(m,[{from:"bar",to:23,die:1}]);
});
test("when only one die can be used, the larger is required", () => {
  // Either die can bear off the final checker. The larger is mandatory.
  const race = position(0,[[0,1]],[1,2],[0,0],[14,15]);
  assert.deepEqual(E.legalMoves(race),[{from:0,to:"off",die:2}]);
});
test("smaller die is allowed if larger has no legal entry", () => {
  const g = position(0,[[22,-2],[21,-2]],[1,2],[1,0]); assert.deepEqual(E.legalMoves(g),[{from:"bar",to:23,die:1}]);
});
test("larger die is mandatory when either bar entry can use only one die", () => {
  const g = position(0,[[21,-2]],[1,2],[1,0]); assert.deepEqual(E.legalMoves(g),[{from:"bar",to:22,die:2}]);
});
test("bearing off requires every checker home and no bar checker", () => {
  const outside = position(0,[[0,1],[6,1]],[1]); assert.ok(!E.singleMoves(outside,0,1).some(m=>m.to==="off"));
  const barred = position(0,[[0,1]],[1],[1,0]); assert.ok(!E.singleMoves(barred,0,1).some(m=>m.to==="off"));
});
test("overshoot is allowed only from the farthest occupied point", () => {
  const g = position(0,[[1,1],[4,1]],[6]); const m = E.legalMoves(g);
  assert.ok(!m.some(x=>x.from===1&&x.to==="off")); assert.ok(m.some(x=>x.from===4&&x.to==="off"));
});
test("Clay bearing off mirrors Cream", () => {
  const g = position(1,[[19,-1],[22,-1]],[6]); const m = E.legalMoves(g);
  assert.ok(!m.some(x=>x.from===22&&x.to==="off")); assert.ok(m.some(x=>x.from===19&&x.to==="off"));
});
test("blocked roll passes turn", () => {
  const g = position(0,[[23,-2],[22,-2]],[],[1,0]); g.phase="rolling";
  const next = E.apply(g,0,{type:"roll"},roll([1,2])).state; assert.equal(next.turn,1); assert.equal(next.phase,"rolling"); assert.deepEqual(next.dice,[]);
});
test("out-of-turn moves and rolls are rejected", () => {
  const g = position(0,[[10,1]],[2]); assert.ok(E.apply(g,1,{type:"move",from:10,to:8,die:2}).error);
  g.phase="rolling"; assert.ok(E.apply(g,1,{type:"roll"},roll([1,2])).error);
});
test("last bear-off wins and prevents further actions", () => {
  const g = position(0,[[0,1]],[1],[0,0],[14,0]); const next = move(g,0,{from:0,to:"off",die:1});
  assert.equal(next.winner,0); assert.equal(next.off[0],15); assert.equal(next.phase,"won"); assert.ok(E.apply(next,0,{type:"roll"}).error);
});
test("legal gameplay preserves checker totals across a full simulated game", () => {
  let g=E.create(); let seed=1729;
  const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return 1+(seed%6);};
  for(let i=0;i<4000&&g.phase!=="won";i++) {
    if(g.phase==="opening"||g.phase==="rolling") { const result=E.apply(g,g.phase==="opening"?0:g.turn,{type:"roll"},rng); assert.ok(!result.error);g=result.state; }
    else { const legal=E.legalMoves(g);assert.ok(legal.length);g=move(g,g.turn,legal[seed%legal.length]); }
    for(const seat of [0,1]) assert.equal(g.points.reduce((total,n)=>total+(seat===0?Math.max(0,n):Math.max(0,-n)),0)+g.bar[seat]+g.off[seat],15);
  }
  assert.equal(g.phase,"won");
});
console.log(`${checked} Backgammon rules checks passed.`);
