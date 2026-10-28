import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function load(path){const {code}=await transformWithOxc(await readFile(new URL(path,import.meta.url),'utf8'),'test.ts',{target:'es2022'});return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);}
const {Armageddon,armageddonLand}=await load('../src/armageddon.ts');
const {TerrainSurface}=await load('../src/terrain-surface.ts');
const {Leadership}=await load('../src/leadership.ts');
function actor(population,power=10,phase='alive'){return{population,characterPower:power,knight:false,home:null,survival:{phase,elapsed:0},tile:{x:2,z:2}};}

test('Armageddon validates both populations and charges exactly once without granting HP',()=>{
 const red=actor('red',27),blue=actor('blue',31),spell=new Armageddon();let balance=10000,calls=0;const spend=()=>{calls++;if(balance<6000)return false;balance-=6000;return true;};
 assert.equal(spell.start([red],new Map(),spend),'missing-population');assert.equal(calls,0);
 assert.equal(spell.start([red,blue],new Map([['red',red],['blue',blue]]),spend),'started');assert.equal(balance,4000);assert.equal(red.characterPower,27);assert.equal(blue.characterPower,31);
 assert.equal(spell.start([red,blue],new Map(),spend),'active');assert.equal(calls,1);
});
test('failed payment leaves the world mode and leader assignments unchanged',()=>{
 const spell=new Armageddon();assert.equal(spell.start([actor('red'),actor('blue')],new Map(),()=>false),'insufficient');assert.equal(spell.active,false);assert.equal(spell.leaders.size,0);
});
test('existing leaders are preserved; missing leaders are selected from living characters, not corpses',()=>{
 const red=actor('red',10),strong=actor('red',40),blue=actor('blue',25,'drowning'),dead=actor('blue',100,'dead'),spell=new Armageddon();
 spell.start([red,strong,blue,dead],new Map([['red',red]]),()=>true);assert.equal(spell.leaders.get('red'),red);assert.equal(spell.leaders.get('blue'),blue);
});
test('followers move exactly 5% faster and leaders retain normal speed',()=>{
 const red=actor('red'),blue=actor('blue'),follower=actor('blue'),spell=new Armageddon();spell.start([red,blue,follower],new Map([['red',red],['blue',blue]]),()=>true);
 assert.equal(spell.movementMultiplier(red),1);assert.equal(spell.movementMultiplier(blue),1);assert.equal(spell.movementMultiplier(follower),1.05);
 assert.ok(Math.abs(.65*spell.movementMultiplier(follower)-.6825)<1e-12);spell.reset();assert.equal(spell.movementMultiplier(follower),1);
});
test('both populations merge full remaining follower HP into their own leaders',()=>{
 for(const color of ['red','blue']){
  const leader=actor(color,30),follower=actor(color,7.5),state=new Leadership();state.appoint(leader);state.rallying=true;
  assert.equal(state.encounter(follower,leader.tile,leader.tile),'absorbed');assert.equal(leader.characterPower,37.5);assert.equal(follower.characterPower,0);
 }
});
test('a fallen leader ends the game for the other side, and a simultaneous fall is a draw',()=>{
 for(const loser of ['red','blue','both']){
  const red=actor('red'),blue=actor('blue'),spell=new Armageddon();spell.start([red,blue],new Map(),()=>true);assert.equal(spell.resolve(),null);
  if(loser!=='blue')red.characterPower=0;if(loser!=='red')blue.characterPower=0;
  assert.equal(spell.resolve(),loser==='both'?'draw':loser==='red'?'blue':'red');assert.equal(spell.finished,true);spell.reset();assert.equal(spell.finished,false);assert.equal(spell.leaders.size,0);
 }
});
test('nearby water becomes height-one dry land, with unique changed points and no damage to high ground',()=>{
 const size=16,surface=new TerrainSurface(size,new Uint8Array((size+1)**2),.65);surface.editCorner(13,13,4);const before=surface.levels.slice();
 assert.equal(armageddonLand(surface,[{x:3.5,z:3.5},{x:12.5,z:12.5}]),true);
 for(let z=1;z<=5;z++)for(let x=1;x<=5;x++)assert.equal(surface.sample(x+.5,z+.5),.65);
 assert.equal(surface.level(13,13),4);assert.equal(surface.level(0,0),0);
 assert.equal(new Set(surface.changedPoints.map(p=>`${p.x},${p.z}`)).size,surface.changedPoints.length);
 for(let i=0;i<before.length;i++)if(before[i]>0)assert.equal(surface.levels[i],before[i]);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++)for(const[dx,dz]of [[1,0],[0,1],[1,1]])assert.ok(Math.abs(surface.level(x,z)-surface.level(x+dx,z+dz))<=1);
 assert.equal(armageddonLand(surface,[{x:3.5,z:3.5},{x:12.5,z:12.5}]),false);assert.equal(surface.changedPoints.length,0);
});
test('moving leaders extend their land corridor and edge-of-world raises remain in bounds',()=>{
 const surface=new TerrainSurface(10,new Uint8Array(121),.65);armageddonLand(surface,[{x:0,z:0}]);assert.equal(surface.sample(.5,.5),.65);
 armageddonLand(surface,[{x:4,z:0}]);assert.equal(surface.sample(5.5,.5),.65);assert.equal(surface.level(10,10),0);
});
