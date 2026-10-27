import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithOxc } from 'vite';

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { code: outputText } = await transformWithOxc(source, 'test.ts', { target: 'es2022' });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { PowerMeter } = await loadModule('../src/power.ts');
const { TerrainSurface } = await loadModule('../src/terrain-surface.ts');
const { totalBuildingPower } = await loadModule('../src/settlement.ts');

test('power sums housed building levels, including castles, but not roaming settlers', () => {
  assert.equal(totalBuildingPower([{home:{},power:1},{home:{},power:3},{home:{},power:5},{home:null,power:0}]),9);
  assert.equal(totalBuildingPower([]),0);
});

test('income pays every five simulation seconds and retains fractional time', () => {
  const meter = new PowerMeter();
  meter.advance(4.9,9);
  assert.equal(meter.value,0);
  meter.advance(0.2,9);
  assert.equal(meter.value,9);
  meter.advance(4.9,9);
  assert.equal(meter.value,18);
});

test('payouts use the current building power and account for multiple intervals', () => {
  const meter = new PowerMeter();
  meter.advance(4,10);
  meter.advance(1,3);
  assert.equal(meter.value,3);
  meter.advance(10,7);
  assert.equal(meter.value,17);
  meter.advance(5,0);
  assert.equal(meter.value,17);
});

test('paused time earns nothing and speed multiplies simulation time', () => {
  const paused = new PowerMeter();
  paused.advance(0,5);
  assert.equal(paused.value,0);
  const normal = new PowerMeter();
  const fast = new PowerMeter();
  for (let i=0;i<100;i++) {
    normal.advance(0.05,2);
    fast.advance(0.05*4,2);
  }
  assert.equal(normal.value,2);
  assert.equal(fast.value,8);
});

test('player budgets start and reset at 10000, and cannot be overspent', () => {
  const meter = new PowerMeter(5,10_000);
  assert.equal(meter.value,10_000);
  assert.equal(meter.spend(1),true);
  assert.equal(meter.value,9_999);
  assert.equal(meter.spend(10_000),false);
  assert.equal(meter.spend(-1),false);
  assert.equal(meter.value,9_999);
  meter.reset();
  assert.equal(meter.value,10_000);
});

test('corner cascades are charged in full and reject unaffordable edits atomically', () => {
  const surface = new TerrainSurface(4,new Uint8Array(25),0.65);
  surface.editCorner(2,2,1);
  const before = surface.levels.slice();
  const poor = new PowerMeter(5,8);
  assert.deepEqual(surface.terraform(2,2,1,false,poor),{status:'insufficient',cost:9});
  assert.deepEqual(surface.levels,before);
  assert.equal(surface.changedPoints.length,0);
  assert.equal(poor.value,8);
  const exact = new PowerMeter(5,9);
  assert.deepEqual(surface.terraform(2,2,1,false,exact),{status:'changed',cost:9});
  assert.equal(exact.value,0);
  assert.equal(surface.level(2,2),2);
  assert.equal(surface.changedPoints.length,9);
});

test('lowering and Shift surface cascades also require the complete budget', () => {
  const lowered = new TerrainSurface(4,new Uint8Array(25).fill(3),0.65);
  lowered.editCorner(2,2,-1);
  const poor = new PowerMeter(5,8);
  const before = lowered.levels.slice();
  assert.deepEqual(lowered.terraform(2,2,-1,false,poor),{status:'insufficient',cost:9});
  assert.deepEqual(lowered.levels,before);
  const exact = new PowerMeter(5,9);
  assert.equal(lowered.terraform(2,2,-1,false,exact).status,'changed');
  assert.equal(exact.value,0);
  const shifted = new TerrainSurface(5,new Uint8Array(36),0.65);
  shifted.editTile(2,2,1);
  const levels = shifted.levels.slice();
  assert.deepEqual(shifted.terraform(2,2,1,true,new PowerMeter(5,15)),{status:'insufficient',cost:16});
  assert.deepEqual(shifted.levels,levels);
  const budget = new PowerMeter(5,16);
  assert.equal(shifted.terraform(2,2,1,true,budget).status,'changed');
  assert.equal(budget.value,0);
});

test('single points cost one and edits at height limits cost nothing', () => {
  const surface = new TerrainSurface(2,new Uint8Array(9),0.65);
  const meter = new PowerMeter(5,500);
  assert.deepEqual(surface.terraform(1,1,-1,false,meter),{status:'limit',cost:0});
  assert.equal(meter.value,500);
  assert.deepEqual(surface.terraform(1,1,1,false,meter),{status:'changed',cost:1});
  assert.equal(meter.value,499);
});

test('new worlds reset both the balance and the collection timer', () => {
  const meter = new PowerMeter();
  meter.advance(9,8);
  meter.reset();
  assert.equal(meter.value,0);
  meter.advance(1,8);
  assert.equal(meter.value,0);
  meter.advance(4,8);
  assert.equal(meter.value,8);
});
