import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';

async function loadModule(path){
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  const {code:outputText}=await transformWithOxc(source,'test.ts',{target:'es2022'});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {Leadership,buildRallyField,buildPursuitField,rallySteps}=await loadModule('../src/leadership.ts');
const {TerrainSurface}=await loadModule('../src/terrain-surface.ts');
const {growPopulation}=await loadModule('../src/population.ts');
const {trySettle,reconcileSettlements,evacuateSettlements}=await loadModule('../src/settlement.ts');
const character=(tile,power=10)=>({tile,characterPower:power});

test('moving a held pole charges once and preserves the former holder position, home, power, and knighthood',()=>{
 const state=new Leadership(),tile={x:1,z:1},target={x:7,z:8},position={x:1.5,y:2.6,z:1.5},home={x:1,z:1};
 const owner={...character(tile,37.5),position,home,knight:true};state.appoint(owner);state.rallying=true;let balance=500;
 assert.equal(state.relocate(target,()=>{balance-=100;return true;}),'moved');assert.equal(balance,400);assert.equal(state.leader,null);assert.equal(state.droppedTile,target);
 assert.equal(owner.tile,tile);assert.equal(owner.position,position);assert.deepEqual(position,{x:1.5,y:2.6,z:1.5});assert.equal(owner.home,home);assert.equal(owner.characterPower,37.5);assert.equal(owner.knight,true);assert.equal(state.rallying,true);
});
test('an already dropped pole can move to water; invalid and unchanged casts do not charge',()=>{
 const state=new Leadership(),tile={x:1,z:1},water={x:9,z:9,water:true};let calls=0;const spend=()=>{calls++;return true;};
 assert.equal(state.relocate(tile,spend),'missing');assert.equal(calls,0);const owner=character(tile);state.appoint(owner);
 assert.equal(state.relocate(water,()=>false),'insufficient');assert.equal(state.leader,owner);assert.equal(state.droppedTile,null);
 state.drop(owner,tile);assert.equal(state.relocate(tile,spend),'unchanged');assert.equal(calls,0);assert.equal(state.relocate(water,spend),'moved');assert.equal(calls,1);assert.equal(state.droppedTile,water);
});
test('same-tile relocation releases the owner until they leave, and another walker may claim the pole',()=>{
 const tile={x:1,z:1},away={x:2,z:1},state=new Leadership(),owner=character(tile),other=character(tile);
 state.appoint(owner);state.relocate(tile,()=>true);assert.equal(state.encounter(owner,tile),'none');assert.equal(state.leader,null);
 assert.equal(state.encounter(owner,away),'none');assert.equal(state.encounter(owner,tile),'picked-up');
 state.relocate(tile,()=>true);assert.equal(state.encounter(other,tile),'picked-up');assert.equal(state.leader,other);assert.equal(owner.characterPower,10);
 state.reset();assert.equal(state.droppedTile,null);assert.equal(state.appoint(owner),true);
});
test('gather toggle leaves occupied buildings intact and routes followers to a housed leader',async()=>{
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 const toggle=main.slice(main.indexOf('function toggleRally()'),main.indexOf('const flock:'));
 assert.doesNotMatch(toggle,/evacuateSettlements|reconcileWorldSettlements|rebuildBuildings|syncResidentMeshes/);
 assert.match(main,/if \(leadership.leader\?\.home\) return pursuitOptions\(settler, leadership.leader\)/);
 assert.match(main,/touchesBuilding\(combatPosition\(settler\), owner.home, owner.power\)/);
});
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

test('pursuit advances to a reachable shore without walking into water, then uses a new causeway',()=>{
 const tiles=new Map([0,1,2,10,11].map(x=>[x,{x,z:0}]));
 const neighbors=tile=>[tiles.get(tile.x-1),tiles.get(tile.x+1)].filter(Boolean);
 const start=tiles.get(0),goal=tiles.get(11);
 const coast=buildPursuitField(start,[goal],goal,neighbors);
 assert.equal(coast.get(start),2);assert.deepEqual(rallySteps(tiles.get(2),neighbors(tiles.get(2)),coast),[]);
 for(let x=3;x<10;x++)tiles.set(x,{x,z:0});
 const bridge=buildPursuitField(start,[goal],goal,neighbors);
 assert.equal(bridge.get(start),11);assert.equal(bridge.get(goal),0);
});

test('explicit evacuation preserves character power and clears houses and castle reservations',()=>{
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
