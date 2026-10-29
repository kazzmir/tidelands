import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function moduleUrl(path){const file=new URL(path,import.meta.url),source=await readFile(file,'utf8');let {code}=await transformWithOxc(source,'test.ts',{target:'es2022'});for(const name of new Set([...code.matchAll(/\bfrom\s*['"]([.][^'"]+)['"]/g)].map(m=>m[1]))){const child=await moduleUrl(new URL(name+'.ts',file).href);code=code.replaceAll(`'${name}'`,JSON.stringify(child)).replaceAll(`"${name}"`,JSON.stringify(child));}return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;}
async function load(path){return import(await moduleUrl(path));}
const {TerrainSurface}=await load('../src/terrain-surface.ts');
const {PowerMeter}=await load('../src/power.ts');
const {EnemyTerraformer}=await load('../src/enemy-ai.ts');
const {trySettle,reconcileSettlements}=await load('../src/settlement.ts');
function world(height=7){
 const surface=new TerrainSurface(64,new Uint8Array(65**2),.65);surface.editCorner(32,32,height);
 const tiles=Array.from({length:64**2},(_,i)=>({x:i%64,z:Math.floor(i/64),house:false,tree:false}));
 const lookup=(x,z)=>x>=0&&z>=0&&x<64&&z<64?tiles[z*64+x]:undefined;
 const resident={population:'blue',tile:lookup(32,32),home:null,power:0,homeLevel:null,characterPower:10};
 return{surface,tiles,lookup,resident,ai:new EnemyTerraformer({x:32,z:32}),budget:new PowerMeter(5,10000)};
}

function coast(balance=100){
 const size=24,surface=new TerrainSurface(size,new Uint8Array((size+1)**2),.65);for(let z=0;z<=size;z++)for(let x=0;x<=size;x++)if(x<=4||x>=13)surface.levels[z*(size+1)+x]=1;const tiles=Array.from({length:size**2},(_,i)=>({x:i%size,z:Math.floor(i/size),house:false,tree:false})),lookup=(x,z)=>x>=0&&z>=0&&x<size&&z<size?tiles[z*size+x]:undefined,resident={tile:lookup(4,12),home:null,power:0,homeLevel:null,characterPower:15},ai=new EnemyTerraformer({x:2,z:12}),budget=new PowerMeter(5,balance);return{surface,lookup,resident,ai,budget};
}
test('stalled shore pursuits receive one paid one-level edit per shared terrain interval, without catch-up bursts',()=>{
 const w=coast(),request=()=>[{from:w.resident.tile,toward:{x:15,z:12}}],before=w.surface.levels.slice();assert.equal(w.ai.advance(3.99,w.surface,w.budget,[w.resident],w.lookup,()=>true,request),null);assert.deepEqual(w.surface.levels,before);assert.equal(w.ai.advance(.01,w.surface,w.budget,[w.resident],w.lookup,()=>true,request).status,'changed');assert.equal(w.ai.edits,1);assert.equal(w.ai.bridgeEdits,1);assert.equal(w.ai.spent,1);assert.equal(w.budget.value,99);assert.equal(w.surface.levels.reduce((sum,v,i)=>sum+Math.abs(v-before[i]),0),1);w.ai.advance(1000,w.surface,w.budget,[w.resident],w.lookup,()=>true,request);assert.equal(w.ai.edits,2);assert.equal(w.ai.advance(.1,w.surface,w.budget,[w.resident],w.lookup,()=>true,request),null);w.ai.reset();assert.equal(w.ai.bridgeEdits,0);
});
test('bridge construction stays affordable/reachable and never edits homes, land obstacles or absent pursuit goals',()=>{
 const poor=coast(0),request=()=>[{from:poor.resident.tile,toward:{x:15,z:12}}],before=poor.surface.levels.slice();assert.equal(poor.ai.advance(4,poor.surface,poor.budget,[poor.resident],poor.lookup,()=>true,request).status,'insufficient');assert.deepEqual(poor.surface.levels,before);assert.equal(poor.ai.bridgeEdits,0);
 for(const denied of ['reach','house','tree','no-goal']){const w=coast(),before=w.surface.levels.slice();if(denied==='house')w.lookup(5,12).house=true;if(denied==='tree')w.lookup(5,12).tree=true;w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup,()=>denied!=='reach',()=>denied==='no-goal'?[]:[{from:w.resident.tile,toward:{x:15,z:12}}]);assert.deepEqual(w.surface.levels,before);assert.equal(w.budget.value,100);}
 const home=coast();home.resident.home=home.lookup(5,12);home.ai.advance(4,home.surface,home.budget,[home.resident],home.lookup,()=>true,()=>[{from:home.lookup(4,12),toward:{x:15,z:12}}]);assert.equal(home.ai.bridgeEdits,0);
});
test('paid incremental shore edits open a traversable causeway without teleporting or changing distant ocean',()=>{
 const w=coast(),start=w.budget.value;let changes=0;
 for(let tick=0;tick<70&&w.resident.tile.x<14;tick++){
  const from=w.resident.tile,next=w.lookup(from.x+1,from.z);if(w.surface.sample(next.x+.5,next.z+.5)>.08&&w.surface.sample(from.x+1,from.z+.5)>.08){w.resident.tile=next;continue;}
  const result=w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup,undefined,()=>[{from:w.resident.tile,toward:{x:15,z:12}}]);if(result?.status==='changed')changes++;
 }
 assert.ok(w.resident.tile.x>=14);assert.ok(changes>0);assert.equal(w.ai.bridgeEdits,changes);assert.equal(start-w.budget.value,w.ai.spent);assert.equal(w.surface.level(9,0),0);for(let z=0;z<24;z++)for(let x=0;x<24;x++)for(const [dx,dz]of [[1,0],[0,1],[1,1]])assert.ok(Math.abs(w.surface.level(x,z)-w.surface.level(x+dx,z+dz))<=1);
});
test('enemy terrain edits respect the same supplied character-reach gate without spending on denied plans',()=>{
 const far=world(),farBefore=far.surface.levels.slice();far.resident.tile=far.lookup(0,0);
 assert.equal(far.ai.advance(4,far.surface,far.budget,[far.resident],far.lookup),null);assert.deepEqual(far.surface.levels,farBefore);assert.equal(far.budget.value,10000);
 const w=world(),before=w.surface.levels.slice(),balance=w.budget.value;
 assert.equal(w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup,()=>false),null);
 assert.deepEqual(w.surface.levels,before);assert.equal(w.budget.value,balance);assert.equal(w.ai.edits,0);
 const within=point=>(point.x-32.5)**2+(point.z-32.5)**2<=100;
 assert.equal(w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup,within).status,'changed');
 const changed=w.surface.levels.slice();w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup,()=>false);assert.deepEqual(w.surface.levels,changed);
});
test('enemy edits slowly in simulation time, with no paused work or catch-up bursts',()=>{
 const w=world(),before=w.surface.levels.slice();
 assert.equal(w.ai.advance(0,w.surface,w.budget,[w.resident],w.lookup),null);
 assert.equal(w.ai.advance(3.99,w.surface,w.budget,[w.resident],w.lookup),null);
 assert.deepEqual(w.surface.levels,before);
 assert.equal(w.ai.advance(.01,w.surface,w.budget,[w.resident],w.lookup).status,'changed');
 assert.equal(w.ai.edits,1);
 w.ai.advance(1000,w.surface,w.budget,[w.resident],w.lookup);assert.equal(w.ai.edits,2);
});

test('enemy pays the complete cascade, and insufficient power leaves terrain unchanged',()=>{
 const w=world(),before=w.surface.levels.slice();
 const result=w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup);
 const cost=w.surface.levels.reduce((sum,height,i)=>sum+Math.abs(height-before[i]),0);
 assert.equal(result.cost,cost);assert.equal(w.budget.value,10000-cost);assert.equal(w.ai.spent,cost);
 assert.ok(cost>0);assert.ok(w.surface.levels.every((height,i)=>Math.abs(height-before[i])<=1));
 const poor=world(),saved=poor.surface.levels.slice();poor.budget.value=0;
 assert.equal(poor.ai.advance(4,poor.surface,poor.budget,[poor.resident],poor.lookup).status,'insufficient');
 assert.deepEqual(poor.surface.levels,saved);assert.equal(poor.ai.edits,0);
});

test('patient terraforming prepares a high 3×3 castle site using normal settlement rules',()=>{
 const w=world();let site;
 for(let i=0;i<150&&!site;i++){
  w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup);site=w.ai.nextBuildSite(w.surface,w.lookup);
 }
 assert.ok(site);assert.ok(w.surface.level(site.x,site.z)>=4);
 w.resident.tile=site;assert.equal(trySettle(w.resident,w.surface),true);
 reconcileSettlements([w.resident],w.tiles,w.surface,w.lookup);assert.equal(w.resident.power,5);
 const corners=w.surface.tileCorners(site.x,site.z).map(p=>w.surface.level(p.x,p.z));
 for(let i=0;i<100;i++){
  w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup);
  assert.deepEqual(w.surface.tileCorners(site.x,site.z).map(p=>w.surface.level(p.x,p.z)),corners);
 }
});

test('terraces prefer high ground but adapt height to the local terrain',()=>{
 const low=world(6),high=world(8);
 low.ai.advance(4,low.surface,low.budget,[low.resident],low.lookup);
 high.ai.advance(4,high.surface,high.budget,[high.resident],high.lookup);
 assert.ok(low.ai.plan.height>=4);assert.ok(high.ai.plan.height>low.ai.plan.height);
});

test('enemy avoids swamp and castle-buffer footprints even when the center tile is available',()=>{
 for(const flag of ['swamp','castleGap']){
  const w=world();for(const tile of w.tiles)tile[flag]=true;w.resident.tile[flag]=false;
  assert.equal(w.ai.advance(4,w.surface,w.budget,[w.resident],w.lookup),null);
  assert.equal(w.ai.edits,0);assert.equal(w.budget.value,10000);
 }
});

test('an eliminated enemy cannot terraform and a new world resets AI history',()=>{
 const w=world(),before=w.surface.levels.slice();
 w.resident.characterPower=0;
 assert.equal(w.ai.advance(100,w.surface,w.budget,[w.resident],w.lookup),null);
 assert.deepEqual(w.surface.levels,before);
 w.ai.reset();assert.equal(w.ai.edits,0);assert.equal(w.ai.spent,0);assert.equal(w.ai.plan,null);assert.equal(w.ai.sites.length,0);
});
