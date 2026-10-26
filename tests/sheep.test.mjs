import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../src/sheep.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
const {planFlock,grazingNeighbors}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const field=()=>Array.from({length:16},(_,i)=>({x:i%4,z:Math.floor(i/4),blocked:false}));
const canGraze=tile=>!tile.blocked;
const sheep=tile=>({tile,target:null});

test('flocks never exceed two sheep per building',()=>{
  const tiles=field(),farm=new Set(tiles);
  for(let buildings=0;buildings<=4;buildings++){
    const plan=planFlock([],farm,buildings,canGraze);
    assert.equal(plan.spawn.length,buildings*2);
    assert.equal(new Set(plan.spawn).size,plan.spawn.length);
  }
});

test('losing buildings immediately shrinks the flock to its new cap',()=>{
  const tiles=field(),farm=new Set(tiles);
  const flock=tiles.slice(0,8).map(sheep);
  const plan=planFlock(flock,farm,2,canGraze);
  assert.equal(plan.keep.length,4);
  assert.equal(plan.spawn.length,0);
  assert.equal(planFlock(flock,farm,0,canGraze).keep.length,0);
});

test('sheep on tiles that stop being farmland disappear',()=>{
  const tiles=field();
  const removed=sheep(tiles[0]),survivor=sheep(tiles[1]);
  const plan=planFlock([removed,survivor],new Set([tiles[1]]),2,canGraze);
  assert.deepEqual(plan.keep,[survivor]);
  assert.equal(plan.spawn.length,0);
});

test('spawning avoids buildings, occupied tiles and walking destinations',()=>{
  const tiles=field();tiles[0].blocked=true;
  const animal={tile:tiles[1],target:tiles[2]};
  const plan=planFlock([animal],new Set(tiles),2,canGraze);
  assert.equal(plan.keep.length+plan.spawn.length,4);
  assert.ok(plan.spawn.every(tile=>tile!==tiles[0] && tile!==tiles[1] && tile!==tiles[2]));
});

test('grazing paths use only adjacent farm tiles, never water or non-farmed ground',()=>{
  const tiles=field();
  const farm=new Set([tiles[5],tiles[4],tiles[6],tiles[1],tiles[9],tiles[10]]);
  tiles[6].blocked=true;
  const lookup=(x,z)=>x>=0 && z>=0 && x<4 && z<4?tiles[z*4+x]:undefined;
  const options=grazingNeighbors(tiles[5],farm,lookup,canGraze);
  assert.deepEqual(new Set(options),new Set([tiles[4],tiles[1],tiles[9]]));
  farm.clear();
  assert.deepEqual(grazingNeighbors(tiles[5],farm,lookup,canGraze),[]);
});

test('limited grazing area does not force sheep onto non-farmland',()=>{
  const tiles=field();
  const plan=planFlock([],new Set([tiles[0]]),10,canGraze);
  assert.deepEqual(plan.spawn,[tiles[0]]);
});
