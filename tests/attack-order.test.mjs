import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function url(path,deps={}){let {code}=await transformWithOxc(await readFile(new URL(path,import.meta.url),'utf8'),'test.ts',{target:'es2022'});for(const[name,value]of Object.entries(deps))code=code.replaceAll(`'${name}'`,JSON.stringify(value)).replaceAll(`"${name}"`,JSON.stringify(value));return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;}
const leadership=await url('../src/leadership.ts');
const {AttackOrder,SharedPursuit}=await import(await url('../src/attack-order.ts',{'./leadership':leadership}));
const {rallySteps}=await import(leadership);
function actor(population,phase='alive'){return{population,characterPower:17.5,survival:{phase,elapsed:0},home:{}};}

test('attack toggle commands all living human characters, including residents, without changing HP',()=>{
 const order=new AttackOrder(),red=actor('red'),blue=actor('blue');assert.equal(order.commands(red,'red'),false);
 order.toggle();assert.equal(order.commands(red,'red'),true);assert.equal(order.commands(blue,'red'),false);
 assert.equal(order.commands(blue,'blue'),true);assert.equal(order.commands(actor('red','drowning'),'red'),false);assert.equal(order.commands(actor('red','dead'),'red'),false);
 assert.equal(red.characterPower,17.5);order.toggle();assert.equal(order.commands(red,'red'),false);order.toggle();order.reset();assert.equal(order.active,false);
});
test('an army shares a reverse route toward a character or building approach goal',()=>{
 const tiles=Array.from({length:6},(_,x)=>({x,z:0})),routes=new SharedPursuit();let calls=0;
 const neighbors=t=>{calls++;return tiles.filter(n=>Math.abs(n.x-t.x)===1);};
 const first=routes.field(tiles[0],tiles[5],[tiles[5]],neighbors,0),count=calls;
 assert.equal(routes.field(tiles[1],tiles[5],[tiles[5]],neighbors,0),first);assert.equal(calls,count);
 assert.deepEqual(rallySteps(tiles[0],neighbors(tiles[0]),first),[tiles[1]]);
});
test('disconnected attackers advance to shore, wait, and resume when a causeway is built',()=>{
 const tiles=Array.from({length:5},(_,x)=>({x,z:0})),routes=new SharedPursuit();let bridge=false;
 const neighbors=t=>tiles.filter(n=>Math.abs(n.x-t.x)===1&&(n.x!==2||bridge));
 const field=routes.field(tiles[0],tiles[4],[tiles[4]],neighbors,0);
 assert.deepEqual(rallySteps(tiles[0],neighbors(tiles[0]),field),[tiles[1]]);assert.deepEqual(rallySteps(tiles[1],neighbors(tiles[1]),field),[]);
 bridge=true;const connected=routes.field(tiles[1],tiles[4],[tiles[4]],neighbors,1);assert.notEqual(connected,field);assert.deepEqual(rallySteps(tiles[1],neighbors(tiles[1]),connected),[tiles[2]]);
});
test('route caching is bounded and world resets discard previous fields',()=>{
 const tiles=Array.from({length:5},(_,x)=>({x,z:0})),routes=new SharedPursuit(2),neighbors=t=>tiles.filter(n=>Math.abs(n.x-t.x)===1);
 const first=routes.field(tiles[0],tiles[4],[tiles[4]],neighbors,0);routes.field(tiles[0],tiles[3],[tiles[3]],neighbors,0);routes.field(tiles[0],tiles[2],[tiles[2]],neighbors,0);
 const rebuilt=routes.field(tiles[0],tiles[4],[tiles[4]],neighbors,0);assert.notEqual(rebuilt,first);routes.reset();assert.notEqual(routes.field(tiles[0],tiles[4],[tiles[4]],neighbors,0),rebuilt);
});
test('attack UI is in the bottom toolbar and commanded characters cannot settle',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.ok(html.slice(html.indexOf('<div class="bottom-bar">')).includes('id="attack-enemy"'));
 assert.match(main,/!attackOrder.commands\(settler, populationColor\)/);assert.match(main,/leadership.rallying = false/);assert.match(main,/attackOrder.reset\(\)/);
});
