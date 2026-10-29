import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function loadGraph(path,cache=new Map()){
 const url=new URL(path,import.meta.url).href;if(cache.has(url))return cache.get(url);
 const promise=(async()=>{let {code}=await transformWithOxc(await readFile(new URL(url),'utf8'),'test.ts',{target:'es2022'});
 for(const specifier of new Set([...code.matchAll(/\bfrom\s*['"]([.][^'"]+)['"]/g)].map(match=>match[1]))){const child=new URL(specifier.endsWith('.ts')?specifier:specifier+'.ts',url);const data=await loadGraph(child.href,cache);code=code.replaceAll(`'${specifier}'`,JSON.stringify(data)).replaceAll(`"${specifier}"`,JSON.stringify(data));}
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;})();cache.set(url,promise);return promise;
}
const graph=new Map(),{SimulationGame}=await import(await loadGraph('../src/simulation/game.ts',graph)),{aiProfiles,profileById,difficultyProfile}=await import(await loadGraph('../src/ai-profiles.ts',graph)),{scheduleTournament,playJob,tournamentReport,standings}=await import(await loadGraph('../src/simulation/tournament.ts',graph));
const {walkDistance}=await import(await loadGraph('../src/simulation/walk.ts',graph));
const {CHARACTER_SPEED}=await import(await loadGraph('../src/game-settings.ts',graph));
test('fixed-step walking carries unused distance and preserves exactly five-percent faster Armageddon followers',()=>{
 function walk(step,speed){const actor={tile:{x:0,z:0},target:null,progress:0,x:.5,z:.5};for(let t=0;t<100;t+=step)walkDistance(actor,step*speed,()=>({x:actor.tile.x+1,z:0}),()=>true);return actor.x-.5;}
 assert.ok(Math.abs(CHARACTER_SPEED/.65-1.1)<1e-12);assert.ok(Math.abs(walk(1,CHARACTER_SPEED)-71.5)<1e-9);assert.ok(Math.abs(walk(.5,CHARACTER_SPEED)-71.5)<1e-9);assert.ok(Math.abs(walk(1,CHARACTER_SPEED*1.05)/walk(1,CHARACTER_SPEED)-1.05)<1e-9);
});
test('live and headless movement share the ten-percent faster character speed, not terrain height or sheep speed',async()=>{
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),sim=await readFile(new URL('../src/simulation/game.ts',import.meta.url),'utf8');assert.match(main,/settler.progress \+ dt \* CHARACTER_SPEED \* armageddon.movementMultiplier\(settler\)/);assert.match(sim,/seconds \* CHARACTER_SPEED,/);assert.match(sim,/seconds \* CHARACTER_SPEED \* this.finale.movementMultiplier\(c\)/);assert.match(main,/const STEP = 0.65/);
});
function options(overrides={}){return{seed:42,red:profileById('balanced'),blue:profileById('patient'),scenario:'plains',size:40,seconds:90,step:1,...overrides};}
function settings(overrides={}){return{games:100,seed:100,size:40,seconds:1,step:1,scenarios:['plains','tidal','islands','highlands'],profiles:aiProfiles(),...overrides};}

test('a real AI knight stranded at water builds a paid reachable crossing and continues its hostile pursuit',()=>{
 const game=new SimulationGame(options({size:40,seconds:120,step:.25,red:profileById('patient'),blue:profileById('patient')})),size=40;game.surface.levels.fill(0);for(let z=0;z<=size;z++)for(let x=0;x<=size;x++)if(x<=4||x>=13)game.surface.levels[z*(size+1)+x]=1;for(const tile of game.tiles){tile.tree=false;tile.house=false;tile.reserved=false;tile.castleGap=false;tile.swamp=false;}
 const knight=game.people.find(c=>c.population==='red'),enemy=game.people.find(c=>c.population==='blue');game.people=[knight,enemy];for(const [c,x]of [[knight,4],[enemy,16]]){c.home=null;c.power=0;c.tile=game.tiles[12*size+x];c.x=x+.5;c.z=12.5;c.target=null;c.wait=0;c.progress=0;c.characterPower=100;}knight.knight=true;const before=game.sides[0].money.value;for(let i=0;i<480&&knight.x<11;i++)game.step(.25);assert.ok(game.sides[0].terrain.bridgeEdits>0);assert.ok(knight.x>10.5);assert.ok(knight.characterPower>0);assert.equal(before-game.sides[0].money.value,game.sides[0].terrain.spent);assert.equal(game.surface.level(9,0),0);
});
test('generated simulations accept the current 150-tile Small map with both full populations',()=>{
 const game=new SimulationGame(options({size:150,scenario:'generated',seconds:1}));assert.equal(game.surface.size,150);assert.equal(game.metrics('red').population,24);assert.equal(game.metrics('blue').population,24);
});
test('every difficulty uses distinct real policies with identical initial population, HP and resources',()=>{
 const ids=['easy','normal','hard'].map(d=>difficultyProfile(d).id);assert.equal(new Set(ids).size,3);
 for(const profile of aiProfiles()){const game=new SimulationGame(options({red:profile,blue:profile}));for(const color of ['red','blue']){const metrics=game.metrics(color);assert.equal(metrics.population,24);assert.equal(metrics.hp,240);assert.equal(metrics.currency,500);}assert.ok(profile.terrainInterval>=4);}
 assert.throws(()=>profileById('cheater'));
});
test('the live difficulty selector uses the same policy registry and controller parameters as simulations',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="ai-difficulty"/);for(const mode of ['easy','normal','hard'])assert.match(html,new RegExp(`value="${mode}"`));
 assert.match(source,/difficultyProfile\(difficulty\)/);assert.match(source,/EnemyTerraformer\(enemyStart, profile\.terrainInterval\)/);assert.match(source,/EnemyKnightStrategy<Settler>\(profile\.knights\)/);assert.match(source,/profile\.spells\.minimumDelay/);assert.match(source,/profile\.spells\.maximumDelay/);
});
test('fixed seeds and input profiles produce exactly reproducible headless games',()=>{
 assert.deepEqual(new SimulationGame(options()).run(),new SimulationGame(options()).run());
});
test('headless games account for every spell, knight and terrain payment without hidden resource bonuses',()=>{
 const game=new SimulationGame(options({red:profileById('sorcerer'),seconds:180,size:96})),result=game.run();
 for(const m of [result.redMetrics,result.blueMetrics]){assert.equal(m.currency,500+m.earned-m.spellSpent-m.terrainSpent-m.trained*1000);assert.ok(m.hp>=0);}
 assert.ok(result.redMetrics.spellCasts>0);
});
test('real recruits must gather before paid knights are trained and physically hand off leadership',()=>{
 const base=profileById('balanced'),profile={...base,knights:{...base.knights,initialDelay:3,cooldown:30},spells:{...base.spells,minimumDelay:1000,maximumDelay:1000}};
 const game=new SimulationGame(options({red:profile,blue:profile,seconds:90,startingPower:10000}));game.run();assert.ok(game.metrics('red').trained+game.metrics('blue').trained>0);
 for(const side of game.sides)assert.ok(side.knights.created>=side.knights.dispatched);
});
test('time limits are draws, even with an overwhelming material advantage; only elimination wins',()=>{
 const game=new SimulationGame(options({seconds:1}));game.people.find(c=>c.population==='red').characterPower=10000;assert.equal(game.run().reason,'time-limit');assert.equal(game.run().winner,'draw');
 const elimination=new SimulationGame(options());elimination.people.filter(c=>c.population==='blue').forEach(c=>c.characterPower=0);assert.equal(elimination.run().winner,'red');
 const mutual=new SimulationGame(options());mutual.people.forEach(c=>c.characterPower=0);assert.equal(mutual.run().reason,'mutual-elimination');
});
test('optional referee finale pays once and resolves real Armageddon leader combat, not material scores',()=>{
 const game=new SimulationGame(options({seconds:1,finaleSeconds:180,startingPower:10000}));const result=game.run();assert.ok(result.finale);assert.equal(result.reason,'armageddon');assert.ok(result.leaderHP.red===0||result.leaderHP.blue===0);assert.equal(result.redMetrics.finaleSpent+result.blueMetrics.finaleSpent,6000);
 for(const m of [result.redMetrics,result.blueMetrics])assert.equal(m.currency,10000+m.earned-m.spellSpent-m.terrainSpent-m.trained*1000-m.finaleSpent);
 const manual=new SimulationGame(options({startingPower:10000}));assert.ok(manual.startFinale());assert.equal(manual.startFinale(),false);assert.equal(manual.metrics('red').currency+manual.metrics('blue').currency,14000);
 const poor=new SimulationGame(options());assert.equal(poor.startFinale(),false);assert.equal(poor.metrics('red').currency,500);
});
test('invalid world, step and scenario parameters fail before simulation',()=>{
 for(const bad of [{size:10},{step:0},{step:2},{seconds:NaN},{scenario:'unknown'},{scenario:'generated',size:64}])assert.throws(()=>new SimulationGame(options(bad)));
});
test('round robin schedules complete side-swapped pairs on identical maps and disjoint held-out seeds',()=>{
 const jobs=scheduleTournament(settings());assert.equal(jobs.length,100);assert.equal(jobs.filter(j=>j.fold==='holdout').length,20);
 for(let i=0;i<jobs.length;i+=2){const a=jobs[i],b=jobs[i+1];assert.equal(a.options.seed,b.options.seed);assert.equal(a.options.scenario,b.options.scenario);assert.equal(a.options.red.id,b.options.blue.id);assert.equal(a.options.blue.id,b.options.red.id);}
 const train=new Set(jobs.filter(j=>j.fold==='training').map(j=>j.options.seed));assert.ok(jobs.filter(j=>j.fold==='holdout').every(j=>!train.has(j.options.seed)));
 assert.throws(()=>scheduleTournament(settings({games:101})));assert.throws(()=>scheduleTournament(settings({scenarios:[]})));
});
test('reports reject missing, duplicated, mislabeled, impossible, or unpaid outcomes',()=>{
 const config=settings({games:20}),matches=scheduleTournament(config).map(playJob),report=tournamentReport(config,matches,'test');assert.equal(report.matches.length,20);assert.equal(report.settings.startingPower,500);assert.ok(report.notes.some(n=>n.startsWith('Insufficient')));assert.ok(report.training.every(r=>r.score===.5));
 assert.throws(()=>tournamentReport(config,matches.slice(1),'test'));assert.throws(()=>tournamentReport(config,[matches[0],...matches.slice(0,-1)],'test'));
 assert.throws(()=>tournamentReport(config,[{...matches[0],seed:99},...matches.slice(1)],'test'));
 assert.throws(()=>tournamentReport(config,[{...matches[0],winner:'red'},...matches.slice(1)],'test'));
 const bad={...matches[0],redMetrics:{...matches[0].redMetrics,currency:999999}};assert.throws(()=>tournamentReport(config,[bad,...matches.slice(1)],'test'));
 assert.deepEqual(standings(matches,config.profiles),standings(matches.slice().reverse(),config.profiles));
});
test('the committed 1000-game calibration contains complete audited pairings and reproducible standings',async()=>{
 const raw=JSON.parse(gunzipSync(await readFile(new URL('../benchmarks/ai-baseline.json.gz',import.meta.url))).toString());assert.equal(raw.matches.length,1000);assert.match(raw.engineDigest,/^[a-f0-9]{64}$/);
 const checked=tournamentReport({...raw.settings,startingPower:10000},raw.matches,raw.engineDigest);assert.deepEqual(checked.training,raw.training);assert.deepEqual(checked.holdout,raw.holdout);assert.equal(raw.matches.filter(m=>m.fold==='training').length,800);assert.equal(raw.matches.filter(m=>m.fold==='holdout').length,200);
 assert.equal(difficultyProfile('easy').id,raw.training.at(-1).profile);assert.equal(difficultyProfile('hard').id,raw.training[0].profile);
});
test('CLI results are worker-count independent and support exact replay and checkpoint resume',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tidelands-ai-')),one=join(dir,'one.json'),two=join(dir,'two.json'),resumed=join(dir,'resume.json');
 const run=args=>execFileSync(process.execPath,['tools/run-ai.mjs',...args],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
 run(['--games','20','--seconds','1','--finale','0','--workers','1','--out',one]);run(['--games','20','--seconds','1','--finale','0','--workers','2','--out',two]);
 const a=JSON.parse(await readFile(one,'utf8')),b=JSON.parse(await readFile(two,'utf8'));assert.equal(a.settings.startingPower,500);assert.deepEqual(a.matches,b.matches);assert.deepEqual(a.training,b.training);assert.match(run(['--replay',one,'--match','3']),/"verified": true/);
 const partial=JSON.parse(await readFile(one+'.checkpoint.json','utf8'));partial.matches=partial.matches.slice(0,7);const checkpoint=join(dir,'partial.json');await writeFile(checkpoint,JSON.stringify(partial));
 run(['--resume',checkpoint,'--workers','2','--out',resumed]);assert.deepEqual(JSON.parse(await readFile(resumed,'utf8')).matches,a.matches);
 assert.throws(()=>run(['--games','21']));assert.throws(()=>run(['--workers','0']));assert.throws(()=>run(['--nonsense','1']));
});
