import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function load(path){
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 const {code:outputText}=await transformWithOxc(source,'test.ts',{target:'es2022'});
 return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {convertLeaderToKnight,nearestEnemy,advanceKnightCombat,combatStrength}=await load('../src/knights.ts');
const {Leadership}=await load('../src/leadership.ts');
const actor=(population='red',x=0,power=10)=>({population,tile:{x,z:0},characterPower:power,home:null,knight:false,survival:{phase:'alive',elapsed:0}});
const tileOf=actor=>actor.tile;

test('Knight costs exactly 1000 and permanently multiplies current HP/power once',()=>{
 const leader=actor('red',0,20);let power=10000;
 const pay=()=>{power-=1000;return true;};
 assert.equal(convertLeaderToKnight(leader,pay),'converted');
 assert.equal(power,9000);assert.equal(leader.characterPower,30);assert.equal(leader.knight,true);
 assert.equal(convertLeaderToKnight(leader,pay),'already-knight');
 assert.equal(power,9000);assert.equal(leader.characterPower,30);
});

test('invalid, housed, dead, drowning, and unaffordable leaders do not transform or spend',()=>{
 let calls=0;const pay=()=>{calls++;return true;};
 assert.equal(convertLeaderToKnight(null,pay),'no-leader');
 const leader=actor();leader.home={};
 assert.equal(convertLeaderToKnight(leader,pay),'housed');
 leader.home=null;leader.survival.phase='drowning';
 assert.equal(convertLeaderToKnight(leader,pay),'unavailable');
 leader.survival.phase='dead';assert.equal(convertLeaderToKnight(leader,pay),'unavailable');
 assert.equal(calls,0);leader.survival.phase='alive';
 assert.equal(convertLeaderToKnight(leader,()=>false),'insufficient');
 assert.equal(leader.knight,false);assert.equal(leader.characterPower,10);
});

test('knights target living enemies, never their own population',()=>{
 const knight=actor(),friend=actor('red',1),far=actor('blue',5),near=actor('blue',2),dead=actor('blue',0);
 dead.survival.phase='dead';
 assert.equal(nearestEnemy(knight,[knight,friend,far,near,dead],tileOf),near);
 assert.equal(nearestEnemy(knight,[knight,friend,dead],tileOf),null);
});

test('melee applies 1.5x starting knight damage and simultaneous enemy retaliation',()=>{
 const knight=actor(),enemy=actor('blue',1);convertLeaderToKnight(knight,()=>true);
 assert.deepEqual(advanceKnightCombat([knight,enemy],1,tileOf),[]);
 assert.equal(knight.characterPower,14);assert.equal(enemy.characterPower,8.5);
 const friend=actor('red',0);const before=knight.characterPower;
 advanceKnightCombat([knight,friend],10,tileOf);
 assert.equal(knight.characterPower,before);assert.equal(friend.characterPower,10);
});

test('two opposing knights fight once per pair, independent of array order',()=>{
 const a=actor(),b=actor('blue',1);convertLeaderToKnight(a,()=>true);convertLeaderToKnight(b,()=>true);
 advanceKnightCombat([a,b],1,tileOf);
 assert.equal(a.characterPower,13.5);assert.equal(b.characterPower,13.5);
 for(let i=0;i<10;i++)advanceKnightCombat([a,b],1,tileOf);
 assert.equal(a.characterPower,0);assert.equal(b.characterPower,0);
});

test('conversion multiplies combat power by 1.5 even for wounded or accumulated leaders',()=>{
 for(const hp of [2,10,20,240]){
  const leader=actor('red',0,hp),before=combatStrength(leader);
  convertLeaderToKnight(leader,()=>true);
  assert.equal(combatStrength(leader),before*1.5);
 }
});

test('death and pole pickup do not transfer knighthood to a successor',()=>{
 const state=new Leadership(),knight=actor(),successor=actor();
 state.appoint(knight);convertLeaderToKnight(knight,()=>true);
 knight.characterPower=0;knight.survival.phase='dead';state.drop(knight,knight.tile);
 assert.equal(state.encounter(successor,knight.tile),'picked-up');
 assert.equal(state.leader,successor);assert.equal(successor.knight,false);assert.equal(successor.characterPower,10);
});

test('combat defeats zero-HP characters, but cannot hit distant enemies or advance while paused',()=>{
 const knight=actor(),enemy=actor('blue',1,0.1);convertLeaderToKnight(knight,()=>true);
 assert.deepEqual(advanceKnightCombat([knight,enemy],0,tileOf),[]);
 assert.deepEqual(advanceKnightCombat([knight,enemy],1,tileOf),[enemy]);
 const far=actor('blue',10);advanceKnightCombat([knight,far],10,tileOf);assert.equal(far.characterPower,10);
});
