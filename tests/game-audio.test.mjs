import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc,parseSync} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/game-audio.ts',import.meta.url),'utf8'),'game-audio.ts',{target:'es2022'});
const {createGameAudio,gameSoundPlan,CastleSoundTracker}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const sounds=['castle','pole','knight','earthquake','swamp','volcano','flood','armageddon'];
function parameter(value=1){return{value,events:[],setValueAtTime(v,t){this.events.push(['set',v,t]);this.value=v;},linearRampToValueAtTime(v,t){this.events.push(['linear',v,t]);this.value=v;},exponentialRampToValueAtTime(v,t){this.events.push(['exp',v,t]);this.value=v;},cancelScheduledValues(t){this.events.push(['cancel',t]);}};}
function context(){
 const ctx={currentTime:0,sampleRate:1000,state:'running',destination:{},nodes:[],sources:[],closed:0};
 function node(){const n={gain:parameter(),frequency:parameter(),Q:parameter(),connections:[],disconnected:0,connect(other){this.connections.push(other);return other;},disconnect(){this.disconnected++;}};ctx.nodes.push(n);return n;}
 function source(){const n=Object.assign(node(),{starts:[],stops:[],ended:false,start(t){this.starts.push(t);},stop(t){this.stops.push(t);}});ctx.sources.push(n);return n;}
 Object.assign(ctx,{createGain:node,createOscillator:source,createBufferSource:source,createBiquadFilter:node,createBuffer(channels,length){const data=new Float32Array(length);return{getChannelData(){return data;}};},resume(){ctx.state='running';return Promise.resolve();},close(){ctx.closed++;ctx.state='closed';return Promise.resolve();},flush(){for(const s of ctx.sources)if(!s.ended){s.ended=true;s.onended?.();}}});return ctx;
}
test('castle and all seven spells have distinct, finite, short synthesized waveform recipes',()=>{
 const plans=sounds.map(gameSoundPlan);assert.equal(new Set(plans.map(p=>JSON.stringify(p))).size,8);
 for(const plan of plans){assert.ok(plan.length>0&&plan.length<=6);for(const layer of plan){assert.ok(['sine','triangle','square','sawtooth','noise'].includes(layer.wave));for(const value of [layer.frequency,layer.duration,layer.gain])assert.ok(Number.isFinite(value)&&value>0);assert.ok(layer.gain<=.5);assert.ok(layer.start>=0&&layer.start+layer.duration<=2);}}
});
test('castle cues track construction/upgrade transitions, never redraws, and allow rebuilding after destruction',()=>{
 const tracker=new CastleSoundTracker();assert.equal(tracker.update([]),false);assert.equal(tracker.update(['red:1:2']),true);assert.equal(tracker.update(['red:1:2']),false);assert.equal(tracker.update(['red:1:2','blue:3:4']),true);assert.equal(tracker.update(['blue:3:4']),false);assert.equal(tracker.update(['red:1:2','blue:3:4']),true);tracker.reset();assert.equal(tracker.update(['red:1:2']),true);
});
test('audio is lazy and silent before unlock; scheduled envelopes clean up every voice when it ends',()=>{
 const ctx=context();let created=0;const audio=createGameAudio({createContext(){created++;return ctx;}});assert.equal(created,0);assert.equal(audio.play('castle'),false);audio.unlock();assert.equal(created,1);assert.equal(audio.play('castle'),true);assert.equal(audio.activeCount,1);assert.equal(ctx.sources.length,5);assert.ok(ctx.sources.every(s=>s.starts[0]>=.005&&s.stops[0]>s.starts[0]));assert.equal(audio.play('castle'),false);ctx.currentTime=.41;assert.equal(audio.play('castle'),true);ctx.flush();assert.equal(audio.activeCount,0);assert.ok(ctx.nodes.every(n=>n===ctx.nodes[0]||n.disconnected===1));audio.dispose();assert.equal(ctx.closed,1);
});
test('mute, hidden/menu/preview suppression and suspended contexts never queue a burst of delayed sound',()=>{
 const ctx=context();let audible=true;const audio=createGameAudio({createContext:()=>ctx,isAudible:()=>audible});audio.unlock();audible=false;assert.equal(audio.play('earthquake'),false);assert.equal(ctx.sources.length,0);audible=true;assert.equal(audio.play('earthquake'),true);audio.setMuted(true);assert.equal(audio.activeCount,0);assert.ok(ctx.sources.every(s=>s.stops.at(-1)===.025));assert.equal(audio.play('pole'),false);audio.setMuted(false);ctx.state='suspended';assert.equal(audio.play('pole'),false);audio.unlock();assert.equal(audio.play('pole'),true);audio.stopAll();ctx.flush();assert.equal(audio.activeCount,0);audio.dispose();
});
test('overlapping effects are capped and rapid duplicate castle cues are rate-limited',()=>{
 const ctx=context(),audio=createGameAudio({createContext:()=>ctx});audio.unlock();for(const sound of sounds)assert.equal(audio.play(sound),true);assert.equal(audio.activeCount,8);ctx.currentTime=.1;assert.equal(audio.play('castle'),false);assert.equal(audio.play('pole'),true);assert.equal(audio.activeCount,8);audio.stopAll();ctx.flush();audio.dispose();audio.dispose();assert.equal(ctx.closed,1);assert.equal(audio.play('flood'),false);
});
test('unavailable/denied Web Audio fails silently without affecting game actions',async()=>{
 for(const createContext of [()=>null,()=>{throw Error('denied');}]){const audio=createGameAudio({createContext});assert.doesNotThrow(()=>audio.unlock());assert.equal(audio.play('knight'),false);audio.dispose();}
 const broken=context();broken.createBuffer=()=>{throw Error('allocation denied');};const partial=createGameAudio({createContext:()=>broken});partial.unlock();assert.equal(broken.closed,1);assert.equal(partial.play('castle'),false);partial.dispose();
 const ctx=context();ctx.state='suspended';ctx.resume=()=>Promise.reject(Error('blocked'));const audio=createGameAudio({createContext:()=>ctx});audio.unlock();assert.equal(audio.play('castle'),false);await new Promise(resolve=>setImmediate(resolve));audio.dispose();
});
test('live integration plays only successful casts, tracks castle identities, and silences previews/hidden tabs',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),functions=new Map();function visit(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id)functions.set(node.id.name,source.slice(node.start,node.end));for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}visit(parseSync('main.ts',source).program);
 const cast=functions.get('castSpell');assert.match(cast,/if \(!budget.spend\(cost\)\) return;\s*gameAudio.play\(spell\)/);assert.match(cast,/if \(result === 'moved'\) \{\s*gameAudio.play\('pole'\)/);assert.match(cast,/if \(result === 'converted' && owner\) \{\s*gameAudio.play\('knight'\)/);assert.match(functions.get('startArmageddon'),/if \(result !== 'started'\)[\s\S]*?return;[\s\S]*?gameAudio.play\('armageddon'\)/);assert.match(functions.get('rebuildBuildings'),/castleSoundTracker.update\(castles\)/);assert.match(functions.get('generateWorld'),/castleSoundTracker.reset\(\)/);assert.match(source,/gameStarted && !newGameMenu.open && !developerView && !document.hidden/);assert.match(source,/if \(document.hidden\) gameAudio.stopAll\(\)/);
});
