import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function graph(path,cache=new Map()){
 const file=new URL(path,import.meta.url).href;if(cache.has(file))return cache.get(file);
 const promise=(async()=>{let {code}=await transformWithOxc(await readFile(new URL(file),'utf8'),'test.ts',{target:'es2022'});
 for(const name of ['three','three/addons/controls/OrbitControls.js'])code=code.replaceAll(`'${name}'`,JSON.stringify(import.meta.resolve(name))).replaceAll(`"${name}"`,JSON.stringify(import.meta.resolve(name)));
 for(const name of new Set([...code.matchAll(/\bfrom\s*['"]([.][^'"]+)['"]/g)].map(m=>m[1]))){const value=await graph(new URL(name.endsWith('.ts')?name:name+'.ts',file).href,cache);code=code.replaceAll(`'${name}'`,JSON.stringify(value)).replaceAll(`"${name}"`,JSON.stringify(value));}
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;})();cache.set(file,promise);return promise;
}
const cache=new Map(),{createDeveloperView,developerModels}=await import(await graph('../src/developer-view.ts',cache)),{animateWalkingModel}=await import(await graph('../src/game-models.ts',cache));
function fixture(reduced=false){
 const document=new EventTarget(),canvas=new EventTarget();canvas.ownerDocument=document;canvas.getRootNode=()=>document;canvas.style={touchAction:'none',cursor:'crosshair'};
 const captured=new Set();canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);canvas.releasePointerCapture=id=>captured.delete(id);
 let scene,calls=0,lists=0,rendererDisposed=0;const renderer={render(s){scene=s;calls++;},renderLists:{dispose(){lists++;}},dispose(){rendererDisposed++;}};
 const view=createDeveloperView(renderer,canvas,reduced);function render(dt=.05,w=1000,h=700){view.render(dt,w,h);return scene;}
 return{view,canvas,captured,render,get calls(){return calls;},get lists(){return lists;},get rendererDisposed(){return rendererDisposed;}};
}
test('developer stage offers walking character, all four house tiers, castle, walking knight and fighting pair',()=>{
 assert.deepEqual(developerModels().map(m=>m.id),['character','house-1','house-2','house-3','house-4','castle','knight','combat']);const f=fixture();assert.equal(f.view.selection,'character');f.view.select('invalid');assert.equal(f.view.selection,'character');f.view.dispose();
});
test('walking poses are shared with normal play and pause/reduced-motion freeze the animation',async()=>{
 const f=fixture(),scene=f.render(),person=scene.getObjectByName('normal-character'),limb=person.children.find(m=>m.geometry?.parameters.width===.055);const first=limb.rotation.x;f.render();assert.notEqual(limb.rotation.x,first);f.view.paused=true;const frozen=limb.rotation.x;f.render(1000);assert.equal(limb.rotation.x,frozen);f.view.dispose();
 const reduced=fixture(true),s=reduced.render(),actor=s.getObjectByName('normal-character');assert.equal(actor.children.find(m=>m.geometry?.parameters.width===.055).rotation.x,0);reduced.view.paused=false;reduced.render();assert.notEqual(actor.children.find(m=>m.geometry?.parameters.width===.055).rotation.x,0);reduced.view.dispose();
 const legs=Array.from({length:4},()=>({rotation:{x:0}}));animateWalkingModel({legs},2,.7);legs.forEach((leg,i)=>assert.equal(leg.rotation.x,Math.sin(18+.7)*(i<2?.45:-.45)));const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(main,/animateWalkingModel\(settler, simulationTime, settler.phase\)/);
});
test('house previews use normal power-specific geometry and castle, and the knight retains full gear and scale',()=>{
 const f=fixture();for(let power=1;power<=4;power++){f.view.select(`house-${power}`);const house=f.render().getObjectByName('normal-house');assert.ok(house);assert.equal(house.scale.x,.8+power*.08);assert.ok(house.children.some(m=>m.geometry?.type==='ExtrudeGeometry'));}
 f.view.select('castle');assert.ok(f.render().getObjectByName('normal-castle').children.length>40);f.view.select('knight');const knight=f.render().getObjectByName('normal-character');assert.ok(Math.abs(knight.scale.x-1.495)<1e-10);assert.ok(knight.getObjectByName('knight-team-flag'));assert.ok(knight.getObjectByName('knight-cuirass'));f.view.dispose();
});
test('combat preview uses real facing/strike poses, isolated red auras and animated yellow lightning',()=>{
 const f=fixture();f.view.select('combat');let scene=f.render();assert.equal(scene.getObjectsByProperty('name','normal-character').length,2);assert.equal(scene.getObjectsByProperty('name','combat-red-aura').length,2);const bolts=scene.getObjectsByProperty('name','combat-yellow-lightning');assert.equal(bolts.length,1);const travel=bolts[0].userData.travel;f.render();assert.notEqual(bolts[0].userData.travel,travel);f.view.select('character');scene=f.render();assert.equal(scene.getObjectsByProperty('name','combat-red-aura').length,0);assert.equal(scene.getObjectsByProperty('name','combat-yellow-lightning').length,0);f.view.dispose();
});
test('switching models frees private geometry; closing frees stage resources and restores shared canvas without disposing renderer',()=>{
 const f=fixture();f.view.select('house-1');let disposed=0;f.render().getObjectByName('normal-house').children.find(m=>m.userData.ownedGeometry).geometry.addEventListener('dispose',()=>disposed++);f.view.select('combat');assert.equal(disposed,1);const stage=f.render().getObjectByName('developer-stage');let floor=0;stage.geometry.addEventListener('dispose',()=>floor++);f.view.dispose();f.view.dispose();assert.equal(floor,1);assert.equal(f.canvas.style.touchAction,'none');assert.equal(f.canvas.style.cursor,'crosshair');assert.equal(f.rendererDisposed,0);assert.equal(f.lists,1);const calls=f.calls;f.render();assert.equal(f.calls,calls);
});
test('closing during an orbit releases its captured pointer',()=>{
 const f=fixture();f.canvas.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerId:1,pointerType:'mouse',button:0,clientX:10,clientY:20,ctrlKey:false,metaKey:false,shiftKey:false}));assert.ok(f.captured.has(1));f.view.dispose();assert.equal(f.captured.size,0);
});
test('developer mode freezes the live world, blocks editing, preserves pause state, and supports keyboard exit',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(source,/if \(developerView\) \{\s*if \(!document.hidden\)\s*developerView.render\(elapsed, world.clientWidth, world.clientHeight\);\s*return;/);assert.match(source,/if \(developerView \|\| !down\) return;/);assert.match(source,/event.key === 'Escape'[\s\S]*?stopDeveloperMode\(\)/);assert.match(source,/controls.enabled = gameStarted && !newGameMenu.open/);assert.match(html,/id="developer-toggle"[^>]*aria-label="Toggle developer mode"/);assert.match(html,/id="developer-panel"[^>]*hidden/);
});
