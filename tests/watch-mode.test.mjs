import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function graph(path,cache=new Map()){
 const file=new URL(path,import.meta.url).href;if(cache.has(file))return cache.get(file);
 const promise=(async()=>{let {code}=await transformWithOxc(await readFile(new URL(file),'utf8'),'test.ts',{target:'es2022'});code=code.replaceAll("'three'",JSON.stringify(import.meta.resolve('three'))).replaceAll('"three"',JSON.stringify(import.meta.resolve('three')));for(const name of new Set([...code.matchAll(/\bfrom\s*['"]([.][^'"]+)['"]/g)].map(m=>m[1]))){const child=await graph(new URL(name+'.ts',file).href,cache);code=code.replaceAll(`'${name}'`,JSON.stringify(child)).replaceAll(`"${name}"`,JSON.stringify(child));}return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;})();cache.set(file,promise);return promise;
}
const cache=new Map(),{WatchSimulation}=await import(await graph('../src/watch-simulation.ts',cache)),{createAttractView}=await import(await graph('../src/attract-view.ts',cache));
test('watch mode runs two real equally funded AI policies on each selected full-size world',()=>{
 for(const [preset,size]of [['small',150],['medium',200],['large',300]]){const watch=new WatchSimulation('hard',preset,34);assert.equal(watch.game.surface.size,size);assert.equal(watch.game.options.scenario,'generated');assert.equal(watch.game.options.red.id,'sorcerer');assert.equal(watch.game.options.blue.id,'sorcerer');for(const side of ['red','blue']){assert.equal(watch.game.metrics(side).population,24);assert.equal(watch.game.metrics(side).currency,500);}watch.dispose();}
});
test('watch simulation actually moves/settles citizens, respects pause and bounded frames, and never resets after two minutes',()=>{
 const sounds=[],watch=new WatchSimulation('normal','small',34,s=>sounds.push(s));const before=watch.game.people.map(p=>[p.x,p.z]);for(let i=0;i<400;i++)assert.ok(watch.advance(.05)<=2);assert.notDeepEqual(watch.game.people.map(p=>[p.x,p.z]),before);assert.ok(watch.game.people.some(p=>p.home));assert.ok(sounds.includes('castle'));const elapsed=watch.game.elapsed;watch.paused=true;assert.equal(watch.advance(1000),0);assert.equal(watch.game.elapsed,elapsed);watch.paused=false;const game=watch.game;game.elapsed=121;for(let i=0;i<5;i++)watch.advance(.05);assert.equal(watch.game,game);assert.equal(watch.round,1);assert.ok(game.elapsed>121);const time=game.elapsed;watch.advance(1000);assert.ok(game.elapsed-time<=.5);watch.dispose();
});
test('watch outcomes use real elimination and hold the finished match instead of silently restarting',()=>{
 const watch=new WatchSimulation('normal','small',34);watch.game.people.filter(p=>p.population==='blue').forEach(p=>p.characterPower=0);for(let i=0;i<5;i++)watch.advance(.05);assert.equal(watch.outcome,'red');const game=watch.game,time=game.elapsed;assert.equal(watch.paused,true);for(let i=0;i<10;i++)watch.advance(1000);assert.equal(watch.game,game);assert.equal(game.elapsed,time);watch.dispose();assert.equal(watch.disposed,true);assert.equal(watch.advance(1),0);assert.throws(()=>watch.game);
});
test('watch presentation uses normal models, an automatic camera and a reusable renderer with clean disposal',()=>{
 let scene,camera,rendererDisposed=0,lists=0;const renderer={capabilities:{getMaxAnisotropy:()=>1},render(s,c){scene=s;camera=c;},renderLists:{dispose(){lists++;}},dispose(){rendererDisposed++;}};
 const watch=new WatchSimulation('normal','small',34),view=createAttractView(renderer,false,watch,true);view.render(.05,1000,700);assert.ok(scene.getObjectByName('normal-character'));assert.ok(scene.getObjectByName('attract-terrain'));assert.notEqual(camera.position.x,65);assert.equal(camera.far,600);view.dispose();view.dispose();assert.equal(watch.disposed,true);assert.equal(rendererDisposed,0);assert.equal(lists,1);
});
test('menu exposes read-only watch mode; simulation inputs/hotkeys are guarded and selected modes are disposed on restart',async()=>{
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8'),css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');assert.match(html,/id="menu-game-mode"/);assert.match(html,/value="watch">Watch AI vs AI · read-only/);assert.match(html,/id="watch-hud"[^>]*hidden/);assert.match(main,/if \(watchView\) return;\s*if \(developerView\)/);assert.match(main,/if \(watchView \|\| gameWinner !== null \|\| armageddon.active\) return/);assert.match(main,/if \(watchView\) \{\s*if \(!newGameMenu.open && !document.hidden\)/);assert.match(main,/watchView\?\.dispose\(\)/);assert.match(main,/controls.enabled = !watchView/);assert.match(css,/\.watch-mode #world>:not\(#scene\):not\(.scene-grain\):not\(#watch-hud\)/);
});
