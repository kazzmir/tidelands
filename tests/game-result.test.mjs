import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/game-result.ts',import.meta.url),'utf8'),'game-result.ts',{target:'es2022'});
const {eliminationWinner}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function actor(population,hp=10,phase='alive',home=null){return{population,characterPower:hp,survival:{phase},home};}
test('either side immediately wins when the opposing population has no survivors',()=>{
 assert.equal(eliminationWinner([actor('red'),actor('blue')]),null);assert.equal(eliminationWinner([actor('red'),actor('blue',0)]),'red');assert.equal(eliminationWinner([actor('red',0),actor('blue')]),'blue');assert.equal(eliminationWinner([actor('red')]),'red');
});
test('occupied buildings and housed leaders count as survivors even when all roaming citizens die',()=>{
 const residents=[actor('red'),actor('blue',.1,'alive',{x:4,z:5})];assert.equal(eliminationWinner(residents),null);residents[1].characterPower=0;assert.equal(eliminationWinner(residents),'red');
});
test('rescuable drowning characters prevent victory, but terminal sinking/dead characters do not',()=>{
 assert.equal(eliminationWinner([actor('red'),actor('blue',10,'drowning')]),null);for(const phase of ['sinking','dead'])assert.equal(eliminationWinner([actor('red'),actor('blue',10,phase)]),'red');
});
test('simultaneous elimination is a draw and outcome checks never mutate character state',()=>{
 const people=[actor('red',0),actor('blue',0)],snapshot=structuredClone(people);assert.equal(eliminationWinner(people),'draw');assert.deepEqual(people,snapshot);assert.equal(eliminationWinner([]),'draw');
});
test('live elimination uses the shared result/music flow, freezes simulation and resets on a fresh world',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(source,/const winner = eliminationWinner\(settlers\)/);assert.match(source,/finishGame\(winner, 'elimination'\)/);assert.match(source,/function clearSettlers\(\): void \{\s*gameWinner = null/);assert.match(source,/if \(resolveGameEnd\(\)\) \{\s*renderWorldFrame\([\s\S]*?return;/);assert.match(source,/if \(gameWinner !== null \|\| armageddon.active\) return/);assert.match(source,/function finishGame[\s\S]*?gameAudio.finishMusic\(/);
});
