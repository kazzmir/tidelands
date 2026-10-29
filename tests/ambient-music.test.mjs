import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/ambient-music.ts',import.meta.url),'utf8'),'ambient-music.ts',{target:'es2022'});
const {ambientScore,upbeatScore,musicTracks,endingMusicTracks,allMusicTracks,endingScore,chooseMusicTrack,createAmbientBuffer,createAmbientMusic}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
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
 assert.match(html,/id="developer-music"[^>]*aria-pressed="false">Play ambient song/);assert.match(binding,/developerMusicPreview = !developerMusicPreview \|\| gameAudio.previewTrack !== track.id/);assert.match(binding,/if \(gameAudio.musicMuted\)/);assert.doesNotMatch(binding,/setMusicMuted\(|localStorage.setItem/);assert.match(binding,/developerMusicPreview = false;\s*gameAudio.previewMusic\(null\)/);assert.match(source,/developerMusicPreview = false;\s*gameAudio.pauseMusic\(\)/);
});
test('upbeat song is a separate faster composition with rhythmic plucks, bass and percussion',()=>{
 const tracks=musicTracks();assert.equal(tracks.length,2);assert.ok(tracks[1].bpm>tracks[0].bpm);assert.equal(tracks[1].seconds,16);const score=upbeatScore();assert.notDeepEqual(score,ambientScore());for(const kind of ['pluck','kick','shaker','bass','bell'])assert.ok(score.some(n=>n.kind===kind));assert.ok(score.length/16>ambientScore().length/24*3);assert.equal(chooseMusicTrack(()=>.1),'ambient');assert.equal(chooseMusicTrack(()=>.9),'upbeat');
});
test('upbeat stereo loop is audible, finite and seamless, with a cached buffer and per-track pause positions',()=>{
 const ctx=context(),buffer=createAmbientBuffer(ctx,'upbeat');assert.equal(buffer.duration,16);for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(channel);let peak=0,energy=0;for(const n of data){assert.ok(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));energy+=n*n;}assert.ok(peak>.2&&peak<.301);assert.ok(Math.sqrt(energy/data.length)>.01);assert.ok(Math.abs(data[0]-data.at(-1))<.005);}
 const music=createAmbientMusic(ctx);music.start();ctx.currentTime=5;music.select('upbeat');music.start();assert.equal(music.track,'upbeat');assert.equal(music.position,0);ctx.currentTime=8;music.select('ambient');music.start();assert.equal(music.position,5);music.select('upbeat');assert.equal(music.position,3);assert.equal(ctx.allocations,3);music.select('upbeat',true);assert.equal(music.position,0);music.start();assert.equal(ctx.allocations,3);music.dispose();
});
test('each new world chooses music independently of world RNG and both tracks have developer audition controls',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(source,/gameAudio.selectMusic\(chooseMusicTrack\(\)\)/);assert.doesNotMatch(source,/chooseMusicTrack\(random\)/);assert.match(html,/id="developer-upbeat"[^>]*>Play upbeat song/);assert.match(source,/gameAudio.previewMusic\(developerMusicPreview \? track.id : null\)/);
});
test('victory and defeat are distinct finite songs with silent endpoints, not background loop choices',()=>{
 assert.deepEqual(endingMusicTracks().map(t=>t.id),['victory','defeat']);assert.equal(allMusicTracks().length,4);assert.notDeepEqual(endingScore('victory'),endingScore('defeat'));for(const [track,duration]of [['victory',8],['defeat',9]]){const b=createAmbientBuffer(context(),track);assert.equal(b.duration,duration);for(let c=0;c<2;c++){const data=b.getChannelData(c);let peak=0;for(const n of data){assert.ok(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));}assert.ok(peak>.2&&peak<.301);assert.equal(data[0],0);assert.ok(Math.abs(data.at(-1))<.0001);}}
});
test('ending songs play once, pause/resume correctly, and only restart after an explicit selection',()=>{
 const ctx=context(),music=createAmbientMusic(ctx,'victory');music.start();assert.equal(ctx.sources[0].loop,false);ctx.currentTime=8;ctx.sources[0].onended();assert.equal(music.finished,true);assert.equal(music.position,8);for(let i=0;i<5;i++)music.start();assert.equal(ctx.sources.length,1);music.select('defeat',true);music.start();ctx.currentTime=11;music.stop();assert.equal(music.position,3);ctx.currentTime=40;music.start();assert.deepEqual(ctx.sources.at(-1).starts,[[40,3]]);ctx.currentTime=46;ctx.sources.at(-1).onended();assert.equal(music.finished,true);music.select('victory',true);music.start();assert.equal(music.finished,false);assert.equal(music.position,0);music.dispose();
});
test('result music uses the real winner, has developer auditions, and never chooses an ending song for a new world',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(source,/gameAudio.finishMusic\(\s*winner === 'draw' \? 'draw' : winner === populationColor \? 'victory' : 'defeat',?\s*\)/);for(const id of ['victory','defeat'])assert.match(html,new RegExp(`id="developer-${id}"`));assert.equal(musicTracks().some(t=>t.id==='victory'||t.id==='defeat'),false);
});
test('music has its own persisted footer toggle and is silenced for hidden tabs and developer auditions',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/id="toggle-music"[^>]*aria-label="Mute ambient music"/);assert.match(source,/isMusicAudible: \(\) => \(!developerView \|\| developerMusicPreview\) && !document.hidden/);assert.match(source,/localStorage.getItem\('tidelands-music-muted'\)/);assert.match(source,/gameAudio.setMusicMuted\(!gameAudio.musicMuted\)/);assert.match(source,/gameAudio.syncMusic\(\);\s*if \(developerView\)/);
});
