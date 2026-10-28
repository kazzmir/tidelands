import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/leader-vitals.ts',import.meta.url),'utf8'),'leader-vitals.ts',{target:'es2022'});
const {leaderVitals}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function actor(hp=10,phase='alive'){return{population:'red',characterPower:hp,knight:false,home:null,survival:{phase,elapsed:0}};}

test('the leader panel uses a fixed 10,000 scale and actual character values, not building level',()=>{
 const owner=actor(37.5);owner.home={};owner.power=5;
 assert.deepEqual(leaderVitals(owner,[]),{hp:37.5,power:37.5,maximum:10000});
 owner.knight=true;assert.equal(leaderVitals(owner,[]).power,37.5,'do not apply the knight multiplier a second time');
});
test('wounded HP and combat power are shown separately for either side of a duel',()=>{
 const owner=actor(6),enemy=actor(8);const pair={a:owner,b:enemy,powerA:20,powerB:10};
 assert.deepEqual(leaderVitals(owner,[pair]),{hp:6,power:20,maximum:10000});
 assert.deepEqual(leaderVitals(enemy,[pair]),{hp:8,power:10,maximum:10000});
 enemy.characterPower=0;assert.equal(leaderVitals(owner,[pair]).power,6,'after combat, show power available for the next engagement');
});
test('unattended poles, dead/sinking holders and zero HP hide the panel; drowning holders retain their stats',()=>{
 assert.equal(leaderVitals(null,[]),null);assert.equal(leaderVitals(actor(0),[]),null);
 for(const phase of ['dead','sinking'])assert.equal(leaderVitals(actor(10,phase),[]),null);
 assert.equal(leaderVitals(actor(10,'drowning'),[]).hp,10);
});
test('values above the visual scale are preserved without capping actual character HP',()=>{
 const owner=actor(12500);assert.deepEqual(leaderVitals(owner,[]),{hp:12500,power:12500,maximum:10000});assert.equal(owner.characterPower,12500);
});
test('two labeled bars sit above the spell palette, with red HP and blue character power',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="leader-vitals"')<html.indexOf('class="spellbox"'));assert.match(html,/id="leader-hp" max="10000"/);assert.match(html,/id="leader-power" max="10000"/);
 assert.match(css,/\.leader-vital-hp\{--vital-fill:#d33136/);assert.match(css,/\.leader-vital-power\{--vital-fill:#2d64d6/);
});
