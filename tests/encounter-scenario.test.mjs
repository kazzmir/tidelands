import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function moduleUrl(path,dependencies={}){
 const source=await readFile(new URL(path,import.meta.url),'utf8');let {code}=await transformWithOxc(source,'test.ts',{target:'es2022'});
 for(const[name,url]of Object.entries(dependencies))code=code.replaceAll(`'${name}'`,JSON.stringify(url)).replaceAll(`"${name}"`,JSON.stringify(url));
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const terrainUrl=await moduleUrl('../src/terrain-surface.ts');
const {TerrainSurface}=await import(terrainUrl);
const {createEncounterScenario,unoccupiedWalkSteps}=await import(await moduleUrl('../src/encounter-scenario.ts',{'./terrain-surface':terrainUrl}));

test('encounter test camps are close together on one connected dry island',()=>{
 const scenario=createEncounterScenario(500),surface=new TerrainSurface(500,scenario.levels,.65);
 assert.equal(scenario.levels.length,501**2);
 assert.equal(Math.hypot(scenario.playerStart.x-scenario.enemyStart.x,scenario.playerStart.z-scenario.enemyStart.z),6);
 for(const start of [scenario.playerStart,scenario.enemyStart])assert.equal(surface.sample(start.x+.5,start.z+.5),2.6);
 assert.equal(surface.level(0,0),0);assert.equal(surface.level(499,499),0);
 const queue=[250*501+250],seen=new Set(queue);
 for(let head=0;head<queue.length;head++){
  const index=queue[head],x=index%501,z=Math.floor(index/501);
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const nx=x+dx,nz=z+dz,next=nz*501+nx;
   if(nx<0||nz<0||nx>500||nz>500||!scenario.levels[next]||seen.has(next))continue;
   seen.add(next);queue.push(next);
  }
 }
 assert.equal(seen.size,scenario.levels.filter(level=>level>0).length);
 for(let z=0;z<500;z++)for(let x=0;x<500;x++)for(const [dx,dz]of [[1,0],[0,1],[1,1]])assert.ok(Math.abs(surface.level(x,z)-surface.level(x+dx,z+dz))<=1);
});

test('test walkers avoid occupied tiles and reserved destinations regardless of team',()=>{
 const a={},b={},c={},free={};
 const red={tile:a,target:null,population:'red',characterPower:10};
 const blue={tile:b,target:c,population:'blue',characterPower:10};
 assert.deepEqual(unoccupiedWalkSteps(red,[b,c,free],[red,blue]),[free]);
 assert.equal(red.characterPower,10);assert.equal(blue.characterPower,10);
});

test('walkers cannot swap head-on, but can follow after another walker vacates a tile',()=>{
 const a={},b={},c={};const first={tile:a,target:null},second={tile:b,target:null};
 assert.deepEqual(unoccupiedWalkSteps(first,[b],[first,second]),[]);
 second.target=c;assert.deepEqual(unoccupiedWalkSteps(first,[b,c],[first,second]),[]);
 second.tile=c;second.target=null;assert.deepEqual(unoccupiedWalkSteps(first,[b],[first,second]),[b]);
});

test('scenario picker retains combat while keeping automatic births disabled',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.match(source,/element<HTMLSelectElement>\('#test-scenario'\).addEventListener\('change'/);
 assert.match(source,/selection === 'combat'\) startWorld\(true\)/);
 assert.match(source,/for \(const defeated of combat.advance\(dt\)\)/);
 assert.doesNotMatch(source,/encounterTest\s*\?\s*\[\]\s*:\s*combat.advance/);
 assert.match(source,/encounterTest\s*\|\|\s*armageddon.active\s*\?\s*\[\]\s*:\s*growPopulation/);
 assert.match(source,/unoccupiedWalkSteps\(/);
});
