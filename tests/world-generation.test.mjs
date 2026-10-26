import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path){
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {generateWorldHeights,generateWorldLayout}=await loadModule('../src/world-generation.ts');
const {TerrainSurface}=await loadModule('../src/terrain-surface.ts');

test('a 1000×1000 world starts with compact varied-height islands and surrounding sea',()=>{
  const size=1000,width=size+1;
  const levels=generateWorldHeights(size,34);
  assert.equal(levels.length,1001*1001);
  let land=0,startingLand=0;
  const heights=new Set();
  for(let z=0;z<=size;z++)for(let x=0;x<=size;x++){
    const h=levels[z*width+x];
    assert.ok(h<=8);
    if(h>0){land++;heights.add(h);if(Math.abs(x-500)<=50 && Math.abs(z-500)<=50)startingLand++;}
    for(const [dx,dz] of [[1,0],[0,1],[1,1],[-1,1]]){
      if(x+dx>=0 && x+dx<=size && z+dz<=size && Math.abs(h-levels[(z+dz)*width+x+dx])>1)assert.fail(`steep terrain at ${x},${z}`);
    }
  }
  assert.ok(land>4000,`${land} land points`);
  assert.ok(land<25000,'islands should remain compact rather than form broad continents');
  assert.ok(startingLand>1000,`${startingLand} dry points near the start`);
  assert.ok(heights.size>=5);
  assert.ok(Math.max(...heights)>=6);
});

test('island bodies fit within 50×50 and frequent dry bridges connect nearby islands',()=>{
  const {islands,bridges}=generateWorldLayout(1000,34);
  const levels=generateWorldHeights(1000,34);
  assert.equal(islands.length,9);
  for(const island of islands){
    assert.ok(island.radiusX*2+2<=50);
    assert.ok(island.radiusZ*2+2<=50);
  }
  assert.ok(bridges.length>=8);
  const visited=new Set([0]),queue=[0];
  for(let i=0;i<queue.length;i++)for(const bridge of bridges){
    const next=bridge.from===queue[i]?bridge.to:bridge.to===queue[i]?bridge.from:null;
    if(next!==null && !visited.has(next)){visited.add(next);queue.push(next);}
  }
  assert.equal(visited.size,islands.length);
  for(const bridge of bridges){
    const a=islands[bridge.from],b=islands[bridge.to];
    const x=Math.round((a.x+b.x)/2),z=Math.round((a.z+b.z)/2);
    assert.ok(levels[z*1001+x]>0,'bridge midpoint should be dry');
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<60,'bridges should join nearby islands');
  }
});

test('world generation is seeded and reproducible',()=>{
  assert.deepEqual(generateWorldHeights(100,34),generateWorldHeights(100,34));
  assert.notDeepEqual(generateWorldHeights(100,34),generateWorldHeights(100,51));
});

test('streamed geometry contains only requested tiles, retaining global positions and heights',()=>{
  const surface=new TerrainSurface(1000,new Uint8Array(1001*1001).fill(3),0.65);
  const positions=surface.positions({x:500,z:480,width:32,depth:32});
  assert.equal(positions.length,32*32*18);
  assert.equal(positions[0],0);
  assert.ok(Math.abs(positions[1]-1.95)<1e-6);
  assert.equal(positions[2],-20);
  assert.equal(positions.at(-3),32);
  assert.equal(positions.at(-1),12);
});
