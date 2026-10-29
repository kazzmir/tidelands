import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function url(path,deps={}){let {code}=await transformWithOxc(await readFile(new URL(path,import.meta.url),'utf8'),'test.ts',{target:'es2022'});for(const[name,value]of Object.entries(deps))code=code.replaceAll(`'${name}'`,JSON.stringify(value)).replaceAll(`"${name}"`,JSON.stringify(value));return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;}
const spells=await url('../src/spells.ts'),{SPELL_COSTS}=await import(spells);
const {EnemySpellcaster}=await import(await url('../src/enemy-spells.ts',{'./spells':spells}));
const players=[{x:10,z:10,weight:6}],allies=[{x:100,z:100}];
function fixture(roll=0,balance=10000){const caster=new EnemySpellcaster(),budget={value:balance},calls=[];const advance=seconds=>caster.advance(seconds,budget,players,allies,(spell,target)=>{calls.push({spell,target});budget.value-=SPELL_COSTS[spell];return true;},()=>roll);return{caster,budget,calls,advance};}

test('enemy spells have an opening grace period, freeze on pause, and never catch up in bursts',()=>{
 const w=fixture();assert.equal(w.advance(0),null);assert.equal(w.advance(74.99),null);assert.equal(w.calls.length,0);
 assert.equal(w.advance(.01).spell,'earthquake');assert.equal(w.budget.value,9200);assert.equal(w.caster.spent,800);
 w.advance(10000);assert.equal(w.calls.length,2);assert.equal(w.caster.casts,2);w.caster.reset();assert.equal(w.caster.spent,0);assert.equal(w.caster.lastSpell,null);assert.equal(w.advance(74),null);
});
test('earthquake, swamp, and volcano use normal costs from the shared enemy budget',()=>{
 for(const [roll,spell]of [[0,'earthquake'],[.55,'swamp'],[.95,'volcano']]){
  const w=fixture(roll);assert.equal(w.advance(75).spell,spell);assert.equal(w.budget.value,10000-SPELL_COSTS[spell]);assert.equal(w.caster.spent,SPELL_COSTS[spell]);
 }
 const insufficient=fixture(.99,799);assert.equal(insufficient.advance(75),null);assert.equal(insufficient.budget.value,799);
 const poor=fixture(.99,800);assert.equal(poor.advance(75).spell,'earthquake');assert.equal(poor.budget.value,0);assert.equal(poor.advance(1000),null);
});
test('failed/no-effect casts never count as paid successes and do not retry every frame',()=>{
 const caster=new EnemySpellcaster(),budget={value:10000};let calls=0;
 const cast=()=>{calls++;return false;};assert.equal(caster.advance(75,budget,players,allies,cast,()=>0),null);assert.equal(caster.casts,0);assert.equal(caster.spent,0);assert.equal(budget.value,10000);
 caster.advance(1,budget,players,allies,cast,()=>0);assert.equal(calls,1);
});
test('dense valuable settlements are preferred over isolated walkers and allies are kept outside the blast area',()=>{
 const caster=new EnemySpellcaster(),budget={value:10000},targets=[{x:10,z:10,weight:1},{x:60,z:60,weight:6},{x:61,z:60,weight:3},{x:60,z:61,weight:3}];
 const cast=(spell,target)=>true;assert.ok(caster.advance(75,budget,targets,allies,cast,()=>0).target.x>=60);
 caster.reset();const safe=caster.advance(75,budget,targets,[{x:60,z:60}],cast,()=>0);assert.equal(safe.target.x,10);
 caster.reset();assert.equal(caster.advance(75,budget,players,[{x:10,z:10}],cast,()=>0),null);
});
test('an eliminated enemy or absent player cannot trigger attacks or bank a delayed burst',()=>{
 const caster=new EnemySpellcaster(),budget={value:10000};let calls=0;const cast=()=>{calls++;return true;};
 assert.equal(caster.advance(1000,budget,players,[],cast,()=>0),null);assert.equal(caster.advance(1000,budget,[],allies,cast,()=>0),null);assert.equal(calls,0);
 assert.equal(caster.advance(74,budget,players,allies,cast,()=>0),null);assert.ok(caster.advance(1,budget,players,allies,cast,()=>0));
});
