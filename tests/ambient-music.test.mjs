import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/ambient-music.ts',import.meta.url),'utf8'),'ambient-music.ts',{target:'es2022'});
const {ambientScore,createAmbientBuffer,createAmbientMusic}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function context(){
 const ctx={state:'running',currentTime:0,destination:{},sources:[],gains:[],allocations:0};
 ctx.createBuffer=(channels,length,rate)=>{ctx.allocations++;const data=Array.from({length:channels},()=>new Float32Array(length));return{length,sampleRate:rate,numberOfChannels:channels,duration:length/rate,getChannelData(channel){return data[channel];}};};
 ctx.createBufferSource=()=>{const source={disconnected:0,starts:[],stops:[],connect(){},disconnect(){this.disconnected++;},start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}};ctx.sources.push(source);return source;};
 ctx.createGain=()=>{const gain={disconnected:0,connect(){},disconnect(){this.disconnected++;},gain:{value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);},cancelScheduledValues(){}}};ctx.gains.push(gain);return gain;};return ctx;
}
test('original ambient composition contains a harmonic progression, bass and sparse melody',()=>{
 const score=ambientScore();assert.deepEqual(score,ambientScore());for(const kind of ['pad','bass','bell'])assert.ok(score.some(n=>n.kind===kind));assert.equal(score.filter(n=>n.kind==='pad').length,12);assert.equal(score.filter(n=>n.kind==='bass').length,4);assert.ok(score.filter(n=>n.kind==='bell').length>=8);for(const n of score){assert.ok(n.start>=0&&n.start<24);assert.ok(n.duration>0&&n.duration<9);assert.ok(n.gain>0&&n.gain<=.1);assert.ok(Math.abs(n.pan)<=1);assert.ok([1,2,4,6,7,9,11].includes(n.midi%12));}
});
test('rendered stereo loop is finite, quiet, non-silent, mono-compatible and seamless at its boundary',()=>{
 const buffer=createAmbientBuffer(context());assert.equal(buffer.duration,24);assert.equal(buffer.sampleRate,16000);assert.equal(buffer.numberOfChannels,2);const l=buffer.getChannelData(0),r=buffer.getChannelData(1);let peak=0,energy=0,stereo=0;for(let i=0;i<l.length;i++){assert.ok(Number.isFinite(l[i])&&Number.isFinite(r[i]));peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));energy+=((l[i]+r[i])/2)**2;stereo+=(l[i]-r[i])**2;}assert.ok(peak>.29&&peak<.301);assert.ok(Math.sqrt(energy/l.length)>.015);assert.ok(stereo>1);assert.ok(Math.abs(l[0]-l.at(-1))<.005);assert.ok(Math.abs(r[0]-r.at(-1))<.005);
});
test('music uses a single cached looping buffer and a gentle fade-in, not an unbounded scheduler',()=>{
 const ctx=context(),music=createAmbientMusic(ctx);music.start();music.start();assert.equal(ctx.allocations,1);assert.equal(ctx.sources.length,1);assert.equal(ctx.sources[0].loop,true);assert.deepEqual(ctx.gains[0].gain.events,[['set',0,0],['ramp',.10,2]]);assert.equal(music.playing,true);music.dispose();assert.equal(music.playing,false);
});
test('sound effects temporarily duck the music without interrupting or restarting its loop',()=>{
 const ctx=context(),music=createAmbientMusic(ctx);music.start();ctx.currentTime=3;music.duck(1.2);assert.equal(ctx.sources.length,1);assert.equal(music.position,3);assert.ok(ctx.gains[0].gain.events.some(e=>e[0]==='ramp'&&e[1]===.025));assert.deepEqual(ctx.gains[0].gain.events.at(-1),['ramp',.10,5.4]);music.dispose();
});
test('pause preserves phrase position and resume does not advance through hidden time or rebuild samples',()=>{
 const ctx=context(),music=createAmbientMusic(ctx);music.start();ctx.currentTime=5.5;music.stop();assert.equal(music.position,5.5);ctx.currentTime=65;assert.equal(music.position,5.5);music.start();assert.deepEqual(ctx.sources[1].starts,[[65,5.5]]);assert.equal(ctx.allocations,1);ctx.currentTime=71;assert.equal(music.position,11.5);music.dispose();
});
test('closing frees every playing/fading voice, and suspended contexts allocate nothing',()=>{
 const ctx=context(),music=createAmbientMusic(ctx);ctx.state='suspended';music.start();assert.equal(ctx.allocations,0);ctx.state='running';music.start();music.stop();music.start();music.dispose();music.dispose();assert.ok(ctx.sources.every(s=>s.disconnected===1));assert.ok(ctx.gains.every(g=>g.disconnected===1));assert.ok(ctx.sources.every(s=>s.onended===null));music.start();assert.equal(ctx.sources.length,2);
});
test('developer song audition is explicit, toggles play/stop, honors mute, and never changes persistent music settings',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');const binding=source.slice(source.indexOf('function bindDeveloperMode()'),source.indexOf('function updatePreviewControls()'));
 assert.match(html,/id="developer-music"[^>]*aria-pressed="false">Play ambient song/);assert.match(binding,/developerMusicPreview = !developerMusicPreview/);assert.match(binding,/if \(gameAudio.musicMuted\)/);assert.doesNotMatch(binding,/setMusicMuted\(|localStorage.setItem/);assert.match(binding,/developerMusicPreview = false;\s*gameAudio.syncMusic\(\)/);assert.match(source,/developerMusicPreview = false;\s*gameAudio.pauseMusic\(\)/);
});
test('music has its own persisted footer toggle and is silenced for hidden tabs and developer auditions',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/id="toggle-music"[^>]*aria-label="Mute ambient music"/);assert.match(source,/isMusicAudible: \(\) => \(!developerView \|\| developerMusicPreview\) && !document.hidden/);assert.match(source,/localStorage.getItem\('tidelands-music-muted'\)/);assert.match(source,/gameAudio.setMusicMuted\(!gameAudio.musicMuted\)/);assert.match(source,/gameAudio.syncMusic\(\);\s*if \(developerView\)/);
});
