import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path) {
  const source = await readFile(new URL(path,import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {TerrainSurface}=await loadModule('../src/terrain-surface.ts');
const {earthquake,mountain,SPELL_COSTS}=await loadModule('../src/spells.ts');
function randomGenerator(){
  let seed=42;
  return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
}
function assertSlopes(surface){
  for(let z=0;z<=surface.size;z++)for(let x=0;x<=surface.size;x++){
    const h=surface.level(x,z);
    assert.ok(h>=0 && h<=8);
    for(const [dx,dz] of [[1,0],[0,1],[1,1],[-1,1]]){
      if(x+dx>=0 && x+dx<=surface.size && z+dz<=surface.size)assert.ok(Math.abs(h-surface.level(x+dx,z+dz))<=1);
    }
  }
}

test('spell costs are 500 for Earthquake and 2000 for Mountain',()=>{
  assert.deepEqual(SPELL_COSTS,{earthquake:500,mountain:2000});
});

test('earthquake reshapes the focus area, preserving all neighboring height limits',()=>{
  const surface=new TerrainSurface(20,new Uint8Array(441).fill(3),0.65);
  const before=surface.levels.slice();
  assert.equal(earthquake(surface,{x:10,z:10},randomGenerator()),true);
  assertSlopes(surface);
  assert.ok(surface.changedPoints.length>10);
  assert.equal(surface.level(0,0),3);
  const actual=[];
  for(let i=0;i<before.length;i++)if(before[i]!==surface.levels[i])actual.push(i);
  assert.equal(surface.changedPoints.length,actual.length);
  for(const point of surface.changedPoints)assert.notEqual(surface.level(point.x,point.z),before[point.z*21+point.x]);
});

test('earthquake still affects flat water and unlucky random sequences',()=>{
  const surface=new TerrainSurface(10,new Uint8Array(121),0.65);
  assert.equal(earthquake(surface,{x:5,z:5},()=>0),true);
  assertSlopes(surface);
  assert.ok(surface.levels.some(height=>height>0));
});

test('Mountain raises three supplied visible points to maximum height with valid slopes',()=>{
  const surface=new TerrainSurface(20,new Uint8Array(441),0.65);
  const visible=[{x:4,z:4},{x:10,z:10},{x:16,z:16}];
  assert.equal(mountain(surface,visible,()=>0),true);
  for(const point of visible)assert.equal(surface.level(point.x,point.z),8);
  assertSlopes(surface);
  assert.ok(surface.changedPoints.length>3);
});

test('targeted Mountain always prioritizes the nearest corner to the clicked tile',()=>{
  const surface=new TerrainSurface(24,new Uint8Array(625),0.65);
  const candidates=[{x:0,z:0},{x:3,z:0},{x:6,z:0},{x:20,z:20}];
  assert.equal(mountain(surface,candidates,()=>0,{x:20.5,z:20.5}),true);
  assert.equal(surface.level(20,20),8);
  assertSlopes(surface);
});

test('Mountain cannot modify terrain when no eligible points are in view',()=>{
  const surface=new TerrainSurface(4,new Uint8Array(25).fill(8),0.65);
  const before=surface.levels.slice();
  assert.equal(mountain(surface,[],()=>0),false);
  assert.equal(mountain(surface,[{x:2,z:2}],()=>0),false);
  assert.deepEqual(surface.levels,before);
});
