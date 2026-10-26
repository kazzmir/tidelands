import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url),'utf8');
  const {outputText} = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {birthInterval,characterGrowthRate,growPopulation,INITIAL_CHARACTER_POWER} = await loadModule('../src/population.ts');
const {TerrainSurface} = await loadModule('../src/terrain-surface.ts');
const {trySettle,releaseInvalidHomes} = await loadModule('../src/settlement.ts');
const tile = {x:1,z:1,tree:false,house:false};
const resident = (level=1,power=INITIAL_CHARACTER_POWER) => ({tile,home:tile,power:level,homeLevel:2,characterPower:power});
const spawn = {x:2,z:1,tree:false,house:false};
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('birth intervals scale from 120 seconds at level 1 to 30 seconds for castles',()=>{
  for (const [index,interval] of [120,97.5,75,52.5,30].entries()) {
    const level = index+1;
    assert.equal(birthInterval(level),interval);
    const parent = resident(level);
    assert.equal(growPopulation([parent],interval-0.01,()=>spawn).length,0);
    const births = growPopulation([parent],0.02,()=>spawn);
    assert.equal(births.length,1);
    close(parent.characterPower,births[0].characterPower);
    close(parent.characterPower+births[0].characterPower,10+(interval+0.01)*characterGrowthRate(level));
  }
  assert.equal(characterGrowthRate(0),0);
});

test('castles produce a newborn while level-1 houses are still accumulating',()=>{
  const house = resident(1), castle = resident(5);
  const births = growPopulation([house,castle],30.1,()=>spawn);
  assert.equal(births.length,1);
  assert.equal(births[0].tile,spawn);
  close(castle.characterPower,births[0].characterPower);
  close(house.characterPower,10+30.1/12);
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
  close(normal.characterPower,10+characterGrowthRate(2));
  close(fast.characterPower,10+4*characterGrowthRate(2));
});

test('blocked births retain all power until a safe spawn tile is available',()=>{
  const parent = resident(3,19);
  assert.equal(growPopulation([parent],10,()=>null).length,0);
  close(parent.characterPower,19+10*characterGrowthRate(3));
  const births = growPopulation([parent],5,()=>spawn);
  assert.equal(births.length,1);
  close(parent.characterPower,10.5);
  close(births[0].characterPower,10.5);
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
  const births = growPopulation([parent],1200,()=>spawn);
  assert.equal(births.length,3);
  close(parent.characterPower+births.reduce((sum,birth)=>sum+birth.characterPower,0),110);
  assert.ok(parent.characterPower<=20);
});
