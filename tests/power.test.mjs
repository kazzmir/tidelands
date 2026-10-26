import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { PowerMeter } = await loadModule('../src/power.ts');
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
