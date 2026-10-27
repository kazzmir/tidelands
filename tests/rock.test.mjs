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
const {volcano}=await loadModule('../src/spells.ts');
const {markVolcanicRock,clearSubmergedRock}=await loadModule('../src/rock.ts');
const {trySettle,totalBuildingPower}=await loadModule('../src/settlement.ts');
const {birthInterval,characterGrowthRate,growPopulation}=await loadModule('../src/population.ts');
const {PowerMeter}=await loadModule('../src/power.ts');
const world=(size=8,height=2)=>{
  const surface=new TerrainSurface(size,new Uint8Array((size+1)**2).fill(height),0.65);
  const tiles=Array.from({length:size**2},(_,i)=>({x:i%size,z:Math.floor(i/size),tree:false,house:false,rock:false,swamp:false}));
  const lookup=(x,z)=>x>=0 && z>=0 && x<size && z<size?tiles[z*size+x]:undefined;
  return{surface,tiles,lookup};
};

test('Volcano converts its entire cascaded land area to rock, replacing swamp',()=>{
  const {surface,lookup}=world(40,0);
  const swamp=lookup(20,20);swamp.swamp=true;
  const swamps=new Set([swamp]),rocks=new Set();
  volcano(surface,[{x:20,z:20}],()=>0);
  const before=surface.levels.slice();
  markVolcanicRock(surface,lookup,rocks,swamps);
  assert.ok(rocks.size>100);
  assert.equal(lookup(20,20).rock,true);
  assert.equal(lookup(8,20).rock,true,'propagated slopes must also become rock');
  assert.equal(lookup(0,0).rock,false);
  assert.equal(swamp.swamp,false);
  assert.equal(swamps.size,0);
  assert.deepEqual(surface.levels,before);
});

test('flat rock remains buildable',()=>{
  const {surface,lookup}=world();
  const tile=lookup(4,4);tile.rock=true;
  const resident={tile,home:null,power:0,homeLevel:null,characterPower:10};
  assert.equal(trySettle(resident,surface),true);
  assert.equal(resident.home,tile);
});

test('rock doubles birth intervals and halves resident power growth at every building level',()=>{
  for(let level=1;level<=5;level++){
    assert.equal(birthInterval(level,true),birthInterval(level)*2);
    assert.equal(characterGrowthRate(level,true),characterGrowthRate(level)/2);
    const tile={x:1,z:1,rock:true,house:true,tree:false};
    const resident={tile,home:tile,power:level,homeLevel:2,characterPower:10};
    const interval=birthInterval(level,true);
    assert.equal(growPopulation([resident],interval-0.01,()=>tile).length,0);
    assert.equal(growPopulation([resident],0.02,()=>tile).length,1);
  }
});

test('rock building income pays every ten seconds while ordinary income pays every five',()=>{
  const ordinary={home:{rock:false},power:2},rock={home:{rock:true},power:3};
  const residents=[ordinary,rock];
  assert.equal(totalBuildingPower(residents),5);
  assert.equal(totalBuildingPower(residents,'normal'),2);
  assert.equal(totalBuildingPower(residents,'rock'),3);
  const meter=new PowerMeter();
  meter.advance(5,2,3);
  assert.equal(meter.value,2);
  meter.advance(5,2,3);
  assert.equal(meter.value,7);
  const onlyRock=new PowerMeter();
  onlyRock.advance(5,0,3);assert.equal(onlyRock.value,0);
  onlyRock.advance(5,0,3);assert.equal(onlyRock.value,3);
  onlyRock.reset();
  onlyRock.advance(5,0,3);assert.equal(onlyRock.value,0);
});

test('dry edits retain rock, but submerging and raising it again restores ordinary land',()=>{
  const {surface,lookup}=world();
  const tile=lookup(3,3);tile.rock=true;
  const rocks=new Set([tile]);
  surface.editCorner(3,3,1);
  clearSubmergedRock(surface,rocks);
  assert.equal(tile.rock,true);
  surface.editCorner(3,3,-1);
  surface.editTile(3,3,-2);
  clearSubmergedRock(surface,rocks);
  assert.equal(tile.rock,false);
  assert.equal(rocks.size,0);
  surface.editTile(3,3,1);
  assert.equal(tile.rock,false);
});
