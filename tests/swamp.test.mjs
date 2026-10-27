import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path){
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {TerrainSurface}=await loadModule('../src/terrain-surface.ts');
const {swampTargets,clearSubmergedSwamps}=await loadModule('../src/spells.ts');
const {advanceSickness}=await loadModule('../src/sickness.ts');
const {trySettle,reconcileSettlements,fertileLand}=await loadModule('../src/settlement.ts');
const world=(size=8)=>{
  const surface=new TerrainSurface(size,new Uint8Array((size+1)**2).fill(2),0.65);
  const tiles=Array.from({length:size**2},(_,i)=>({x:i%size,z:Math.floor(i/size),swamp:false,tree:false,house:false}));
  const lookup=(x,z)=>x>=0 && z>=0 && x<size && z<size?tiles[z*size+x]:undefined;
  const resident=(x,z)=>({tile:lookup(x,z),home:null,power:0,homeLevel:null,characterPower:10});
  return{surface,tiles,lookup,resident};
};

test('Swamp plans a 75 percent conversion inside a 20-tile circle without mutating land',()=>{
  const {surface,tiles,lookup}=world(50);
  const chosen=swampTargets(surface,{x:25,z:25},lookup,()=>0.749);
  assert.equal(chosen.length,1257);
  assert.ok(chosen.every(tile=>Math.hypot(tile.x-25,tile.z-25)<=20));
  assert.equal(swampTargets(surface,{x:25,z:25},lookup,()=>0.75).length,0);
  assert.ok(tiles.every(tile=>!tile.swamp));
  surface.levels.fill(0);
  assert.equal(swampTargets(surface,{x:25,z:25},lookup,()=>0).length,0);
});

test('sickness infects on contact and permanently drains one character-power HP per second',()=>{
  const character={characterPower:10,sick:false};
  assert.equal(advanceSickness(character,0,true),false);
  assert.equal(character.sick,true);
  advanceSickness(character,2.5,true);
  assert.equal(character.characterPower,7.5);
  advanceSickness(character,1,false);
  assert.equal(character.characterPower,6.5);
  advanceSickness(character,0,false);
  assert.equal(character.characterPower,6.5);
  assert.equal(advanceSickness(character,10,false),true);
  assert.equal(character.characterPower,0);
  const healthy={characterPower:10,sick:false};
  advanceSickness(healthy,100,false);
  assert.equal(healthy.characterPower,10);
});

test('swamp underneath a building releases the resident and prevents rebuilding',()=>{
  const {surface,tiles,lookup,resident}=world();
  const owner=resident(4,4);
  assert.equal(trySettle(owner,surface),true);
  owner.home.swamp=true;
  reconcileSettlements([owner],tiles,surface,lookup);
  assert.equal(owner.home,null);
  assert.equal(owner.tile.house,false);
  assert.equal(owner.characterPower,10);
  assert.equal(trySettle(owner,surface),false);
});

test('one swamp tile in the castle footprint downgrades it and cannot be farmed',()=>{
  const {surface,tiles,lookup,resident}=world();
  const owner=resident(4,4);
  trySettle(owner,surface);
  reconcileSettlements([owner],tiles,surface,lookup);
  assert.equal(owner.power,5);
  const swamp=lookup(3,3);swamp.swamp=true;
  reconcileSettlements([owner],tiles,surface,lookup);
  assert.equal(owner.power,4);
  assert.ok(owner.home);
  assert.equal(tiles.some(tile=>tile.reserved || tile.castleGap),false);
  assert.ok(!fertileLand([owner],surface,lookup).some(point=>point.x===3 && point.z===3));
});

test('zero-HP residents lose their buildings and all castle reservations',()=>{
  const {surface,tiles,lookup,resident}=world();
  const owner=resident(4,4);
  trySettle(owner,surface);reconcileSettlements([owner],tiles,surface,lookup);
  owner.characterPower=0;
  reconcileSettlements([owner],tiles,surface,lookup);
  assert.equal(owner.home,null);
  assert.equal(tiles.some(tile=>tile.house || tile.reserved || tile.castleGap),false);
});

test('swamp survives dry terrain changes but submerging it destroys it permanently',()=>{
  const {surface,lookup}=world();
  const tile=lookup(3,3);tile.swamp=true;
  const swamps=new Set([tile]);
  surface.editCorner(3,3,1);
  clearSubmergedSwamps(surface,swamps);
  assert.equal(tile.swamp,true);
  surface.editCorner(3,3,-1);
  surface.editTile(3,3,-2);
  clearSubmergedSwamps(surface,swamps);
  assert.equal(tile.swamp,false);
  assert.equal(swamps.size,0);
  surface.editTile(3,3,1);
  assert.equal(tile.swamp,false);
});
