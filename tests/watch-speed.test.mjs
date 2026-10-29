import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function graph(path,cache=new Map()){
 const file=new URL(path,import.meta.url).href;if(cache.has(file))return cache.get(file);
 const promise=(async()=>{let {code}=await transformWithOxc(await readFile(new URL(file),'utf8'),'test.ts',{target:'es2022'});for(const name of new Set([...code.matchAll(/\bfrom\s*['"]([.][^'"]+)['"]/g)].map(m=>m[1]))){const child=await graph(new URL(name+'.ts',file).href,cache);code=code.replaceAll(`'${name}'`,JSON.stringify(child)).replaceAll(`"${name}"`,JSON.stringify(child));}return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;})();cache.set(file,promise);return promise;
}
const {WatchSimulation}=await import(await graph('../src/watch-simulation.ts'));
test('watch simulation runs at the selected 1x, 2x or 4x with bounded fixed-step work',()=>{
 for(const speed of [1,2,4]){const watch=new WatchSimulation('normal','small',34);assert.equal(watch.speed,1);watch.speed=speed;for(let frame=0;frame<60;frame++)assert.ok(watch.advance(.05)<=watch.maxStepsPerFrame);assert.equal(watch.game.elapsed,3*speed);watch.paused=true;watch.advance(1000);assert.equal(watch.game.elapsed,3*speed);watch.paused=false;watch.advance(1000);assert.ok(watch.game.elapsed<=3*speed+.5);for(const invalid of [0,-1,3,Infinity,NaN])assert.throws(()=>{watch.speed=invalid;});assert.equal(watch.speed,speed);watch.dispose();}
});
test('watch UI retains only the playback speed buttons, while keeping gameplay actions hidden',async()=>{
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');assert.match(main,/if \(watchView\) watchView.simulation.speed = Number\(button.dataset.speed\)/);assert.match(css,/:not\(.minimap-panel\):not\(.bottom-bar\)/);assert.match(css,/\.watch-mode \.playback>:not\(.speed-buttons\)\{display:none\}/);
});
