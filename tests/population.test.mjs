import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url),'utf8');
  const {outputText} = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {growPopulation,INITIAL_CHARACTER_POWER} = await loadModule('../src/population.ts');
const {TerrainSurface} = await loadModule('../src/terrain-surface.ts');
const {trySettle,releaseInvalidHomes} = await loadModule('../src/settlement.ts');
const tile = {x:1,z:1,tree:false,house:false};
const resident = (level=1,power=INITIAL_CHARACTER_POWER) => ({tile,home:tile,power:level,homeLevel:2,characterPower:power});
const spawn = {x:2,z:1,tree:false,house:false};
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('resident power grows in proportion to building level; castles reach births sooner',()=>{
  const house = resident(1);
  const castle = resident(5);
  assert.equal(growPopulation([house,castle],2,()=>spawn).length,0);
  assert.equal(house.characterPower,12);
  assert.equal(castle.characterPower,20);
  const births = growPopulation([house,castle],0.1,()=>spawn);
  assert.equal(births.length,1);
  assert.equal(births[0].tile,spawn);
  close(castle.characterPower,10.25);
  close(births[0].characterPower,10.25);
  close(house.characterPower+castle.characterPower+births[0].characterPower,32.6);
});

test('walking settlers do not gain power or create offspring',()=>{
  const walker = {...resident(0),home:null};
  assert.equal(growPopulation([walker],100,()=>spawn).length,0);
  assert.equal(walker.characterPower,10);
});

test('pause stops growth; accelerated simulation time produces faster growth',()=>{
  const normal = resident(2), fast = resident(2);
  growPopulation([normal],0,()=>spawn);
  assert.equal(normal.characterPower,10);
  growPopulation([normal],1,()=>spawn);
  growPopulation([fast],4,()=>spawn);
  assert.equal(normal.characterPower,12);
  assert.equal(fast.characterPower,18);
});

test('blocked births retain all power until a safe spawn tile is available',()=>{
  const parent = resident(3,19);
  assert.equal(growPopulation([parent],1,()=>null).length,0);
  assert.equal(parent.characterPower,22);
  const births = growPopulation([parent],1,()=>spawn);
  assert.equal(births.length,1);
  assert.equal(parent.characterPower,12.5);
  assert.equal(births[0].characterPower,12.5);
});

test('character power is retained when building a house and leaving it',()=>{
  const surface = new TerrainSurface(3,new Uint8Array(16).fill(2),0.65);
  const walker = {...resident(0,17.5),tile:{...tile},home:null};
  assert.equal(trySettle(walker,surface),true);
  assert.equal(walker.characterPower,17.5);
  surface.editCorner(1,1,1);
  releaseInvalidHomes([walker],surface);
  assert.equal(walker.home,null);
  assert.equal(walker.characterPower,17.5);
});

test('large time steps still conserve power across all splits',()=>{
  const parent = resident(1);
  const births = growPopulation([parent],100,()=>spawn);
  assert.equal(births.length,3);
  close(parent.characterPower+births.reduce((sum,birth)=>sum+birth.characterPower,0),110);
  assert.ok(parent.characterPower<=20);
});
