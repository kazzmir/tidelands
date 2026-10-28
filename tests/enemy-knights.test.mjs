import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function url(path,deps={}){let {code}=await transformWithOxc(await readFile(new URL(path,import.meta.url),'utf8'),'test.ts',{target:'es2022'});for(const[name,value]of Object.entries(deps))code=code.replaceAll(`'${name}'`,JSON.stringify(value)).replaceAll(`"${name}"`,JSON.stringify(value));return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;}
const spells=await url('../src/spells.ts');
const {EnemyKnightStrategy}=await import(await url('../src/enemy-knights.ts',{'./spells':spells}));
const {convertLeaderToKnight}=await import(await url('../src/knights.ts'));
function character(i){return{x:i,z:0,population:'blue',characterPower:10,knight:false,home:{x:i,z:0},survival:{phase:'alive',elapsed:0}};}
function world(count=24){const strategy=new EnemyKnightStrategy(),characters=Array.from({length:count},(_,i)=>character(i)),budget={value:10000};let owner=characters[0];return{strategy,characters,budget,get owner(){return owner;},advance:seconds=>strategy.advance(seconds,characters,owner,'blue',budget,c=>c,()=>true),train(){const action=strategy.advance(.1,characters,owner,'blue',budget,c=>c,()=>true);assert.equal(action.kind,'convert');assert.equal(convertLeaderToKnight(owner,()=>{budget.value-=1000;return true;}),'converted');strategy.converted();assert.equal(owner.characterPower,60);assert.equal(strategy.reservedPower,0);assert.equal(strategy.donates(action.successor),false);assert.ok(strategy.follows(action.successor));return action;},gather(action){action.leader.home=null;for(const donor of action.recruits){donor.home=null;action.leader.characterPower+=donor.characterPower;donor.characterPower=0;}},handoff(){owner=strategy.successor;owner.home=null;assert.ok(strategy.complete(owner));}};}

test('enemy musters real citizens after a grace period without inventing HP, recruiting knights, or draining its population',()=>{
 const w=world();assert.equal(w.advance(0),null);assert.equal(w.advance(119.9),null);const before=w.characters.map(c=>c.characterPower),action=w.advance(.1);
 assert.equal(action.kind,'gather');assert.equal(action.recruits.length,3);assert.ok(action.recruits.every(c=>!c.knight));assert.equal(w.strategy.reservedPower,1000);assert.deepEqual(w.characters.map(c=>c.characterPower),before);assert.ok(!action.recruits.includes(w.strategy.successor));
 assert.equal(w.advance(1),null,'cannot convert before followers physically donate');w.gather(action);assert.equal(w.owner.characterPower,40);assert.equal(w.characters.reduce((n,c)=>n+c.characterPower,0),240);w.train();assert.equal(w.budget.value,9000);assert.equal(w.strategy.created,1);w.handoff();assert.equal(w.strategy.dispatched,1);assert.equal(w.owner.knight,false);assert.equal(w.characters.filter(c=>c.knight).length,1);
});
test('successive musters produce three separate paid knights and then respect the active cap',()=>{
 const w=world();for(let i=0;i<3;i++){const action=w.advance(i?150:120);assert.equal(action.kind,'gather');w.gather(action);w.train();w.handoff();}
 assert.equal(w.strategy.created,3);assert.equal(w.strategy.dispatched,3);assert.equal(w.budget.value,7000);assert.equal(w.characters.filter(c=>c.knight&&c.characterPower>0).length,3);assert.equal(w.characters.reduce((n,c)=>n+c.characterPower,0),300);assert.equal(w.advance(10000),null);
});
test('fallen raiders can be replaced without exceeding the living knight cap',()=>{
 const w=world();for(let i=0;i<3;i++){w.gather(w.advance(i?150:120));w.train();w.handoff();}assert.equal(w.advance(150),null);
 const fallen=w.characters.find(c=>c.knight);fallen.characterPower=0;fallen.survival.phase='dead';const action=w.advance(20);assert.equal(action.kind,'gather');w.gather(action);w.train();w.handoff();assert.equal(w.strategy.created,4);assert.equal(w.characters.filter(c=>c.knight&&c.characterPower>0).length,3);assert.equal(w.budget.value,6000);
});
test('insufficient population, money, or healthy donors prevents a muster',()=>{
 const few=world(9);assert.equal(few.advance(120),null);assert.equal(few.strategy.phase,'idle');
 const poor=world();poor.budget.value=999;assert.equal(poor.advance(120),null);
 const weak=world();weak.characters.slice(1).forEach(c=>c.characterPower=1);assert.equal(weak.advance(120),null);
});
test('healthy stronger donors can be selected when nearby wounded citizens cannot form a strong enough muster',()=>{
 const w=world();w.characters.slice(1).forEach(c=>c.characterPower=1);w.characters.slice(-3).forEach(c=>c.characterPower=20);const action=w.advance(120);assert.equal(action.kind,'gather');assert.ok(action.recruits.every(c=>c.characterPower===20));assert.ok(action.leader.characterPower+action.recruits.reduce((n,c)=>n+c.characterPower,0)>=40);
 const tiny=world(6);tiny.owner.characterPower=40;assert.equal(tiny.advance(120),null);
});
test('death and failed gatherings cancel orders and reservations without creating a knight',()=>{
 for(const failure of ['death','timeout']){const w=world();w.advance(120);if(failure==='death')w.owner.survival.phase='dead';assert.equal(w.advance(failure==='timeout'?76:1),null);assert.equal(w.strategy.phase,'idle');assert.equal(w.strategy.reservedPower,0);assert.equal(w.strategy.recruits.size,0);assert.equal(w.strategy.created,0);assert.equal(w.budget.value,10000);}
});
test('a lost successor is replaced rather than consuming or converting the heir',()=>{
 const w=world();w.gather(w.advance(120));w.train();const old=w.strategy.successor;old.characterPower=0;old.survival.phase='dead';const replacement=w.advance(1);assert.equal(replacement.kind,'handoff');assert.notEqual(replacement.successor,old);assert.equal(w.strategy.complete(old),false);assert.equal(w.strategy.donates(replacement.successor),false);assert.equal(w.budget.value,9000);w.handoff();
});
test('an existing knight carrying the pole hands it on without another conversion or multiplier',()=>{
 const w=world();w.owner.knight=true;w.owner.characterPower=60;const action=w.advance(120);assert.equal(action.kind,'handoff');assert.equal(w.strategy.reservedPower,0);assert.equal(w.strategy.created,0);assert.equal(w.owner.characterPower,60);assert.equal(w.budget.value,10000);
});
test('reset clears staging and history and restores the opening grace period',()=>{
 const w=world();w.gather(w.advance(120));w.train();w.strategy.reset();assert.equal(w.strategy.phase,'idle');assert.equal(w.strategy.created,0);assert.equal(w.strategy.dispatched,0);assert.equal(w.strategy.successor,null);assert.equal(w.strategy.commander,null);assert.equal(w.strategy.recruits.size,0);assert.equal(w.advance(119),null);
});
