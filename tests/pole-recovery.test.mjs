import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function load(path){const {code}=await transformWithOxc(await readFile(new URL(path,import.meta.url),'utf8'),'test.ts',{target:'es2022'});return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);}
const {nearestPoleCollector}=await load('../src/pole-recovery.ts');
const {Leadership}=await load('../src/leadership.ts');
function actor(population,x,z=0,extra={}){return{population,x,z,tile:{x:Math.floor(x),z:Math.floor(z)},home:null,characterPower:10,survival:{phase:'alive',elapsed:0},...extra};}

test('closest friendly roaming character is selected by actual distance, for either population',()=>{
 for(const color of ['red','blue']){
  const near=actor(color,2),far=actor(color,7),enemy=actor(color==='red'?'blue':'red',.1);
  assert.equal(nearestPoleCollector({x:0,z:0},color,[far,enemy,near],a=>a,()=>true),near);
  far.x=1;assert.equal(nearestPoleCollector({x:0,z:0},color,[far,enemy,near],a=>a,()=>true),far);
 }
});
test('occupied buildings, dead/drowning characters, zero-HP characters and busy fighters are not dispatched',()=>{
 const walker=actor('red',5),home=actor('red',0,0,{home:{}}),dead=actor('red',1,0,{survival:{phase:'dead',elapsed:0}}),drowning=actor('red',2,0,{survival:{phase:'drowning',elapsed:0}}),empty=actor('red',3,0,{characterPower:0}),busy=actor('red',4);
 const list=[home,dead,drowning,empty,busy,walker];
 assert.equal(nearestPoleCollector({x:0,z:0},'red',list,a=>a,a=>a!==busy),walker);assert.ok(home.home);
 assert.equal(nearestPoleCollector({x:0,z:0},'red',list.slice(0,-1),a=>a,a=>a!==busy),null);
});
test('a replaced same-tile holder cannot instantly reclaim the pole; the next eligible walker can',()=>{
 const state=new Leadership(),tile={x:0,z:0},owner=actor('red',.5,.5),next=actor('red',1.5,.5);owner.tile=tile;state.appoint(owner);state.relocate(tile,()=>true);
 const choose=()=>nearestPoleCollector({x:.5,z:.5},'red',[owner,next],a=>a,a=>state.canRecover(a,a.tile));
 assert.equal(choose(),next);assert.equal(state.encounter(next,tile),'picked-up');assert.equal(state.leader,next);assert.equal(state.canRecover(owner,owner.tile),false);
});
test('collector selection reassigns after death and retains deterministic tie order',()=>{
 const a=actor('blue',-1),b=actor('blue',1),choose=()=>nearestPoleCollector({x:0,z:0},'blue',[a,b],c=>c,()=>true);
 assert.equal(choose(),a);a.survival.phase='dead';assert.equal(choose(),b);
});
