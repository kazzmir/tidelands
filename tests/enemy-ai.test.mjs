import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function load(path){const source=await readFile(new URL(path,import.meta.url),'utf8');const {code}=await transformWithOxc(source,'test.ts',{target:'es2022'});return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);}
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
