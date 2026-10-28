import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/terrain-reach.ts',import.meta.url),'utf8'),'terrain-reach.ts',{target:'es2022'});
const {withinTerrainReach}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function actor(x,z,population='red',phase='alive'){return{x,z,population,characterPower:10,survival:{phase,elapsed:0},home:null};}
const check=(point,characters,whole=false)=>withinTerrainReach(point,whole,characters,'red',a=>a.home?{x:a.home.x+.5,z:a.home.z+.5}:a);

test('manual corner range is an inclusive Euclidean radius of exactly ten tiles',()=>{
 const own=actor(20,20);assert.ok(check({x:30,z:20},[own]));assert.ok(check({x:26,z:28},[own]));
 assert.equal(check({x:30.001,z:20},[own]),false);assert.equal(check({x:28,z:28},[own]),false);
});
test('Shift-selected surfaces use tile centers, not their northwest corner',()=>{
 const own=actor(20.5,20.5);assert.ok(check({x:30,z:20},[own],true));assert.equal(check({x:31,z:20},[own],true),false);
 assert.equal(check({x:10,z:20},[own]),false);assert.ok(check({x:10,z:20},[own],true));
});
test('only living own characters count; drowning characters can authorize their own rescue',()=>{
 const target={x:20,z:20},enemy=actor(20,20,'blue'),dead=actor(20,20,'red','dead'),sinking=actor(20,20,'red','sinking'),empty=actor(20,20);empty.characterPower=0;
 assert.equal(check(target,[enemy,dead,sinking,empty]),false);assert.equal(check(target,[]),false);
 assert.ok(check(target,[actor(20,20,'red','drowning')]));
});
test('reach follows actual walking positions and occupied-home centers',()=>{
 const own=actor(20,20);assert.ok(check({x:30,z:20},[own]));own.x=19;assert.equal(check({x:30,z:20},[own]),false);
 own.home={x:29,z:19};assert.ok(check({x:30,z:20},[own]));
});
test('only the selected point is limited; reach checks do not alter characters or spend power',()=>{
 const own=actor(20,20),before=structuredClone(own);assert.ok(check({x:30,z:20},[own]));assert.deepEqual(own,before);
});
