import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/combat.ts',import.meta.url),'utf8'),'combat.ts',{target:'es2022'});
const {CombatSystem,combatClosingOffset}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('fighters close smoothly to striking distance without overshooting, moving while paused, or separating close pairs',()=>{
 const a={x:0,z:0},b={x:1.2,z:0};
 const small=combatClosingOffset(a,b,.05);assert.ok(small.x>0&&small.x<=.09+1e-10);assert.equal(small.z,0);
 const offset=combatClosingOffset(a,b,10);assert.ok(Math.abs((b.x-offset.x)-(a.x+offset.x)-.4)<1e-10);
 assert.deepEqual(combatClosingOffset(a,b,0),{x:0,z:0});
 assert.deepEqual(combatClosingOffset(a,{x:.2,z:0},1),{x:0,z:0});
 assert.deepEqual(combatClosingOffset(a,a,1),{x:0,z:0});
});
function actor(population,x,power=10,extra={}){return {population,x,z:0,characterPower:power,knight:false,home:null,survival:{phase:'alive',elapsed:0},...extra};}

test('nearby ordinary opponents engage and exchange simultaneous proportional damage',()=>{
 const a=actor('red',0,20),b=actor('blue',1),system=new CombatSystem();system.match([a,b],x=>x);
 assert.equal(system.opponent(a),b);assert.equal(system.opponent(b),a);
 system.advance(2);assert.equal(a.characterPower,18);assert.equal(b.characterPower,6);
 system.match([a,b],x=>x);system.advance(1);assert.equal(a.characterPower,17);assert.equal(b.characterPower,4);
});
test('low-power units also deal proportionally less damage, without a fixed damage floor',()=>{
 const a=actor('red',0,5),b=actor('blue',1),system=new CombatSystem();system.match([a,b],x=>x);system.advance(1);
 assert.equal(a.characterPower,4);assert.equal(b.characterPower,9.5);
});
test('equal opponents finish together; zero time and repeated death ticks cause no damage',()=>{
 const a=actor('red',0),b=actor('blue',1),system=new CombatSystem();system.match([a,b],x=>x);
 assert.deepEqual(system.advance(0),[]);assert.equal(a.characterPower,10);
 assert.deepEqual(system.advance(10),[a,b]);assert.equal(a.characterPower,0);assert.equal(b.characterPower,0);
 assert.deepEqual(system.advance(10),[]);assert.equal(system.opponent(a),null);
});
test('large time steps stop retaliation at death rather than letting a defeated unit keep attacking',()=>{
 const a=actor('red',0,20),b=actor('blue',1),system=new CombatSystem();system.match([a,b],x=>x);
 assert.deepEqual(system.advance(100),[b]);assert.equal(a.characterPower,15);
});
test('friendlies, distant characters, drowning and dead characters never engage',()=>{
 for(const b of [actor('red',1),actor('blue',3),actor('blue',1,10,{survival:{phase:'drowning',elapsed:0}}),actor('blue',1,0)]){
  const a=actor('red',0),system=new CombatSystem();system.match([a,b],x=>x);assert.equal(system.pairs.length,0);system.advance(1);assert.equal(a.characterPower,10);
 }
});
test('engagements remain mutual and stable rather than changing targets or stacking retaliation',()=>{
 const a=actor('red',0),b=actor('blue',1),c=actor('blue',1.1),system=new CombatSystem();system.match([a,b,c],x=>x);
 assert.equal(system.pairs.length,1);assert.equal(system.opponent(a),b);assert.equal(system.opponent(c),null);
 c.x=.2;system.match([c,b,a],x=>x);assert.equal(system.opponent(a),b);
 system.advance(1);assert.equal(a.characterPower,9);assert.equal(b.characterPower,9);assert.equal(c.characterPower,10);
 b.x=4;system.match([a,b,c],x=>x);assert.equal(system.opponent(a),c);
 system.reset();assert.equal(system.pairs.length,0);assert.equal(system.opponents.size,0);
});
test('damage does not depend on population array order',()=>{
 for(const reverse of [false,true]){
  const a=actor('red',0,20),b=actor('blue',1),system=new CombatSystem();system.match(reverse?[b,a]:[a,b],x=>x);system.advance(2);
  assert.equal(a.characterPower,18);assert.equal(b.characterPower,6);
 }
});
test('spatial buckets find opponents across boundaries and snapshot each position only once',()=>{
 const a=actor('red',-.1),b=actor('blue',1),distant=Array.from({length:200},(_,i)=>actor(i%2?'red':'blue',20+i*10));let calls=0;
 const system=new CombatSystem();system.match([a,b,...distant],character=>{calls++;return character;});
 assert.equal(calls,202);assert.equal(system.pairs.length,1);assert.equal(system.opponent(a),b);
});
test('additional gathered power increases attack strength once',()=>{
 const a=actor('red',0,15,{knight:true}),b=actor('blue',1),system=new CombatSystem();system.match([a,b],x=>x);
 a.characterPower+=10;system.advance(1);assert.equal(b.characterPower,7.5);
 system.match([a,b],x=>x);system.advance(1);assert.equal(b.characterPower,5);
});
