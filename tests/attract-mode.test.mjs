import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function graph(path,cache=new Map()){
 const file=new URL(path,import.meta.url).href;if(cache.has(file))return cache.get(file);
 const promise=(async()=>{let {code}=await transformWithOxc(await readFile(new URL(file),'utf8'),'test.ts',{target:'es2022'});
 code=code.replaceAll("'three'",JSON.stringify(import.meta.resolve('three'))).replaceAll('"three"',JSON.stringify(import.meta.resolve('three')));
 for(const name of new Set([...code.matchAll(/\bfrom\s*['"]([.][^'"]+)['"]/g)].map(m=>m[1]))){const value=await graph(new URL(name.endsWith('.ts')?name:name+'.ts',file).href,cache);code=code.replaceAll(`'${name}'`,JSON.stringify(value)).replaceAll(`"${name}"`,JSON.stringify(value));}
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;})();cache.set(file,promise);return promise;
}
const cache=new Map(),{AttractSimulation}=await import(await graph('../src/attract-simulation.ts',cache)),{createAttractView}=await import(await graph('../src/attract-view.ts',cache));

test('the startup preview is a real two-policy simulation with ordinary populations and 500 power',()=>{
 const preview=new AttractSimulation();assert.equal(preview.game.sides.length,2);assert.notEqual(preview.game.options.red.id,preview.game.options.blue.id);
 for(const side of ['red','blue']){const m=preview.game.metrics(side);assert.equal(m.population,24);assert.equal(m.hp,240);assert.equal(m.currency,500);}
 const positions=preview.game.people.map(p=>[p.x,p.z]);for(let i=0;i<30;i++)preview.advance(1/60);assert.ok(preview.game.elapsed>0);assert.notDeepEqual(preview.game.people.map(p=>[p.x,p.z]),positions);preview.dispose();
});
test('preview pause, reduced-motion startup, and disposal stop simulation without a catch-up burst',()=>{
 const preview=new AttractSimulation(true);const game=preview.game;for(let i=0;i<10;i++)assert.equal(preview.advance(10),0);assert.equal(game.elapsed,0);
 preview.paused=false;assert.ok(preview.advance(.05)>0);const time=game.elapsed;preview.paused=true;preview.advance(1000);assert.equal(game.elapsed,time);preview.dispose();preview.dispose();assert.equal(preview.disposed,true);assert.equal(preview.advance(.05),0);assert.equal(game.elapsed,time);assert.throws(()=>preview.game);
});
test('long/invalid frame times cannot run unbounded background work',()=>{
 const preview=new AttractSimulation();for(const dt of [NaN,Infinity,0,-1])assert.equal(preview.advance(dt),0);
 for(let i=0;i<10;i++){const time=preview.game.elapsed,steps=preview.advance(1000);assert.ok(steps<=2);assert.ok(preview.game.elapsed-time<=.5);}
 preview.dispose();
});
test('completed preview rounds loop with fresh independent games and reset budgets',()=>{
 const preview=new AttractSimulation(false,.25),old=preview.game;preview.advance(.05);assert.equal(old.elapsed,.25);for(let i=0;i<41;i++)preview.advance(.05);
 assert.equal(preview.round,2);assert.notEqual(preview.game,old);assert.notEqual(preview.game.options.seed,old.options.seed);assert.equal(preview.game.metrics('red').currency,500);assert.equal(preview.game.metrics('blue').currency,500);preview.dispose();
});
test('two previews have independent state and deterministic actions',()=>{
 const a=new AttractSimulation(),b=new AttractSimulation();a.advance(.05);assert.equal(b.game.elapsed,0);b.advance(.05);assert.deepEqual(a.game.metrics('red'),b.game.metrics('red'));assert.deepEqual(a.game.people.map(p=>[p.x,p.z]),b.game.people.map(p=>[p.x,p.z]));a.dispose();b.dispose();
});
test('preview renderer presents both teams, renders paused frames only as needed, and frees its resources without disposing the shared renderer',()=>{
 let scene,draws=0,lists=0,rendererDisposals=0;
 const renderer={capabilities:{getMaxAnisotropy:()=>1},render:(s)=>{scene=s;draws++;},renderLists:{dispose:()=>lists++},dispose:()=>rendererDisposals++};
 const view=createAttractView(renderer,true);view.render(1/60,800,600);assert.equal(draws,1);assert.ok(scene.getObjectByName('attract-red-settlers').count>0);assert.ok(scene.getObjectByName('attract-blue-settlers').count>0);assert.ok(scene.getObjectByName('attract-terrain').geometry.attributes.position.count>0);
 view.render(1/60,800,600);assert.equal(draws,1);view.render(1/60,400,600);assert.equal(draws,2);assert.equal(view.simulation.game.elapsed,0);
 const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material){for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);if(material.map)textures.add(material.map);if(material.normalMap)textures.add(material.normalMap);}}});
 const disposed=new Map();for(const resource of [...geometries,...materials,...textures])resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)??0)+1));
 view.dispose();view.dispose();for(const resource of [...geometries,...materials,...textures])assert.equal(disposed.get(resource),1);assert.equal(view.simulation.disposed,true);assert.equal(lists,1);assert.equal(rendererDisposals,0);view.render(.05,800,600);assert.equal(draws,2);
});
test('attract mode is startup-only; starting play tears it down and later menus still freeze the player world',async()=>{
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(main,/function startWorld\(test: boolean\): void\s*\{\s*stopAttractMode\(\)/);assert.match(main,/if\s*\(!gameStarted\)/);assert.match(main,/attractView\s*&&\s*!document.hidden/);assert.match(main,/if\s*\(newGameMenu.open\)\s*return/);assert.match(main,/prefers-reduced-motion: reduce/);assert.match(html,/id="toggle-preview" type="button"/);
});
