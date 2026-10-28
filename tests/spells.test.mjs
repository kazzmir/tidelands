import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';

async function loadModule(path) {
  const source = await readFile(new URL(path,import.meta.url),'utf8');
  const {code:outputText}=await transformWithOxc(source,'test.ts',{target:'es2022'});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {TerrainSurface}=await loadModule('../src/terrain-surface.ts');
const {earthquake,flood,volcano,SPELL_COSTS}=await loadModule('../src/spells.ts');
function randomGenerator(){
  let seed=42;
  return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
}
function assertSlopes(surface){
  for(let z=0;z<=surface.size;z++)for(let x=0;x<=surface.size;x++){
    const h=surface.level(x,z);
    assert.ok(h>=0 && h<=surface.maxHeight);
    for(const [dx,dz] of [[1,0],[0,1],[1,1],[-1,1]]){
      if(x+dx>=0 && x+dx<=surface.size && z+dz<=surface.size)assert.ok(Math.abs(h-surface.level(x+dx,z+dz))<=1);
    }
  }
}

test('spells have their configured fixed power costs',()=>{
  assert.deepEqual(SPELL_COSTS,{pole:100,earthquake:500,knight:1000,volcano:2000,flood:3000,swamp:1500,armageddon:6000});
});

test('Flood lowers every terrain point globally by one and clamps at water level',()=>{
  const levels=Uint8Array.from({length:441},(_,i)=>i%9);
  const surface=new TerrainSurface(20,levels,0.65);
  surface.enforceSlopeLimit();
  const before=levels.slice();
  assert.equal(flood(surface),true);
  for(let i=0;i<levels.length;i++)assert.equal(levels[i],Math.max(0,before[i]-1));
  assert.equal(surface.changedPoints.length,before.filter(height=>height>0).length);
  assertSlopes(surface);
});

test('repeated Flood casts can submerge the entire world and stop changing empty water',()=>{
  const surface=new TerrainSurface(10,new Uint8Array(121).fill(2),0.65);
  assert.equal(flood(surface),true);
  assert.ok(surface.levels.every(height=>height===1));
  assert.equal(flood(surface),true);
  assert.ok(surface.levels.every(height=>height===0));
  assert.equal(flood(surface),false);
  assert.equal(surface.changedPoints.length,0);
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

test('earthquake can raise water when the roll falls in the 10 percent uplift chance',()=>{
  const surface=new TerrainSurface(10,new Uint8Array(121),0.65);
  assert.equal(earthquake(surface,{x:5,z:5},()=>0),true);
  assertSlopes(surface);
  assert.ok(surface.levels.some(height=>height>0));
});

test('earthquake uses a 10 percent raise / 90 percent lower distribution',()=>{
  const random=randomGenerator();
  let rises=0, falls=0, flooded=0;
  for(let i=0;i<1000;i++){
    const surface=new TerrainSurface(4,new Uint8Array(25).fill(4),0.65);
    earthquake(surface,{x:2,z:2},random,0);
    const height=surface.level(2,2);
    if(height>4)rises++;
    if(height<4)falls++;
    if(height===0)flooded++;
    assertSlopes(surface);
  }
  assert.ok(rises>=75 && rises<=125,`unexpected uplift count ${rises}`);
  assert.equal(falls,1000-rises);
  assert.ok(flooded>100);
});

test('earthquake subsidence can flood the affected area all the way to water',()=>{
  const surface=new TerrainSurface(20,new Uint8Array(441).fill(3),0.65);
  assert.equal(earthquake(surface,{x:10,z:10},()=>0.9),true);
  assert.equal(surface.level(10,10),0);
  assert.equal(surface.level(0,0),3);
  assertSlopes(surface);
  const water=new TerrainSurface(4,new Uint8Array(25),0.65);
  assert.equal(earthquake(water,{x:2,z:2},()=>0.9),false);
  assert.ok(water.levels.every(height=>height===0));
});

test('Volcano raises three supplied points to height 14 with valid slopes',()=>{
  const surface=new TerrainSurface(20,new Uint8Array(441),0.65);
  const visible=[{x:4,z:4},{x:10,z:10},{x:16,z:16}];
  assert.equal(volcano(surface,visible,()=>0),true);
  for(const point of visible)assert.equal(surface.level(point.x,point.z),14);
  assertSlopes(surface);
  assert.ok(surface.changedPoints.length>3);
});

test('targeted Volcano prioritizes the clicked tile and reaches six levels above the old maximum',()=>{
  const surface=new TerrainSurface(24,new Uint8Array(625),0.65);
  const candidates=[{x:0,z:0},{x:3,z:0},{x:6,z:0},{x:20,z:20}];
  assert.equal(volcano(surface,candidates,()=>0,{x:20.5,z:20.5}),true);
  assert.equal(surface.level(20,20),8+6);
  assertSlopes(surface);
});

test('Volcano cannot modify terrain when no eligible points are in view',()=>{
  const surface=new TerrainSurface(4,new Uint8Array(25).fill(14),0.65);
  const before=surface.levels.slice();
  assert.equal(volcano(surface,[],()=>0),false);
  assert.equal(volcano(surface,[{x:2,z:2}],()=>0),false);
  assert.deepEqual(surface.levels,before);
});
