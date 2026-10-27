import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';

async function loadModule(path){
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  const {code:outputText}=await transformWithOxc(source,'test.ts',{target:'es2022'});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {Leadership,buildRallyField,rallySteps}=await loadModule('../src/leadership.ts');
const {TerrainSurface}=await loadModule('../src/terrain-surface.ts');
const {growPopulation}=await loadModule('../src/population.ts');
const {trySettle,reconcileSettlements,evacuateSettlements}=await loadModule('../src/settlement.ts');
const character=(tile,power=10)=>({tile,characterPower:power});

test('a population can appoint only one leader at a time',()=>{
  const state=new Leadership(),tile={x:1,z:1};
  const a=character(tile),b=character(tile);
  assert.equal(state.appoint(a),true);
  assert.equal(state.appoint(b),false);
  assert.equal(state.leader,a);
  assert.equal(state.encounter(b,tile),'none');
});

test('death drops the object on its actual tile, including water, for exactly one new owner',()=>{
  const state=new Leadership(),land={x:1,z:1},water={x:2,z:1,water:true};
  const a=character(land),b=character(land),c=character(land);
  state.appoint(a);
  assert.equal(state.drop(b,land),false);
  assert.equal(state.drop(a,water),true);
  assert.equal(state.leader,null);
  assert.equal(state.droppedTile,water);
  assert.equal(state.appoint(b),false);
  assert.equal(state.encounter(b,land),'none');
  assert.equal(state.encounter(b,water),'picked-up');
  assert.equal(state.leader,b);
  assert.equal(state.droppedTile,null);
  assert.equal(state.encounter(c,water),'none');
  assert.equal(state.leader,b);
});

test('gathering absorbs a follower once and transfers all remaining HP/power',()=>{
  const state=new Leadership(),tile={x:1,z:1};
  const leader=character(tile,12.5),follower=character(tile,7.25);
  state.appoint(leader);state.rallying=true;
  assert.equal(state.encounter(follower,tile),'absorbed');
  assert.equal(leader.characterPower,19.75);
  assert.equal(follower.characterPower,0);
  assert.equal(state.encounter(follower,tile),'none');
  assert.equal(state.encounter(leader,tile),'none');
  assert.equal(leader.characterPower,19.75);
});

test('turning gathering off prevents absorption without losing the leader',()=>{
  const state=new Leadership(),tile={x:1,z:1};
  const leader=character(tile),follower=character(tile);
  state.appoint(leader);state.rallying=true;state.rallying=false;
  assert.equal(state.encounter(follower,tile),'none');
  assert.equal(follower.characterPower,10);
  assert.equal(state.leader,leader);
  state.reset();
  assert.equal(state.leader,null);assert.equal(state.droppedTile,null);assert.equal(state.rallying,false);
});

test('a lone leader can settle and regrow the population after gathering is disabled',()=>{
  const surface=new TerrainSurface(8,new Uint8Array(81).fill(2),0.65);
  const tile={x:4,z:4,tree:false,house:false};
  const leader={tile,home:null,power:0,homeLevel:null,characterPower:70};
  const state=new Leadership();state.appoint(leader);
  assert.equal(trySettle(leader,surface),true);
  const births=growPopulation([leader],0.01,()=>({x:3,z:4,tree:false,house:false}));
  assert.ok(births.length>0);
  assert.equal(state.leader,leader);
  assert.ok(leader.characterPower<=20);
});

test('reverse rally routes detour around obstacles and always approach the target',()=>{
  const tiles=Array.from({length:25},(_,i)=>({x:i%5,z:Math.floor(i/5)}));
  const blocked=new Set([2,7,12,17]);
  const neighbors=tile=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>{
    const x=tile.x+dx,z=tile.z+dz;
    return x>=0 && z>=0 && x<5 && z<5 && !blocked.has(z*5+x)?tiles[z*5+x]:null;
  }).filter(Boolean);
  const goal=tiles[4],field=buildRallyField([goal],neighbors);
  let current=tiles[0],steps=0;
  while(current!==goal && steps<30){
    const options=rallySteps(current,neighbors(current),field);
    assert.ok(options.length);
    const next=options[0];
    assert.ok(field.get(next)<field.get(current));
    current=next;steps++;
  }
  assert.equal(current,goal);
  assert.equal(steps,12);
  const isolated={x:20,z:20};
  assert.deepEqual(rallySteps(isolated,[],field),[]);
});

test('rally evacuation preserves character power and clears houses and castle reservations',()=>{
  const surface=new TerrainSurface(8,new Uint8Array(81).fill(2),0.65);
  const tiles=Array.from({length:64},(_,i)=>({x:i%8,z:Math.floor(i/8),tree:false,house:false}));
  const lookup=(x,z)=>x>=0 && z>=0 && x<8 && z<8?tiles[z*8+x]:undefined;
  const follower={tile:lookup(4,4),home:null,power:0,homeLevel:null,characterPower:24.5};
  trySettle(follower,surface);reconcileSettlements([follower],tiles,surface,lookup);
  assert.equal(follower.power,5);
  evacuateSettlements([follower],lookup);
  assert.equal(follower.home,null);
  assert.equal(follower.characterPower,24.5);
  assert.equal(tiles.some(tile=>tile.house || tile.reserved || tile.castleGap),false);
});
