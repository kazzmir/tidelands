import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const source=await readFile(new URL('../src/minimap.ts',import.meta.url),'utf8');
const {code}=await transformWithOxc(source,'minimap.ts',{target:'es2022'});
const {MinimapTerrain,layoutMinimapMarkers,minimapWorldPoint}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const palette=['#125577','#55aa33','#448844','#337755','#667766','#888888','#aaaaaa','#cccccc','#eeeeee'];
function field(size=16){const levels=new Uint8Array((size+1)**2);return{size,levels,level(x,z){return levels[z*(size+1)+x];}};}

test('minimap colors distinguish water and elevation, preserving small summit islands',()=>{
 const surface=field(),map=new MinimapTerrain(16,8,8,palette);
 assert.equal(map.update(surface),64);assert.deepEqual([...map.pixels.slice(0,4)],[0x12,0x55,0x77,255]);
 assert.equal(map.update(surface),0);
 surface.levels[8*17+8]=6;map.invalidate([{x:8,z:8}]);
 assert.ok(map.update(surface)<64);
 assert.deepEqual([...map.pixels.slice((4*8+4)*4,(4*8+4)*4+4)],[170,170,170,255]);
});

test('incremental terrain updates match full rerenders, including world edges and shared cells',()=>{
 const surface=field(),map=new MinimapTerrain(16,8,8,palette);map.update(surface);
 for(let i=0;i<24;i++){
  const x=i*7%17,z=i*11%17;surface.levels[z*17+x]=i%9;
  map.invalidate([{x,z}]);map.update(surface);
  const fresh=new MinimapTerrain(16,8,8,palette);fresh.update(surface);
  assert.deepEqual(map.pixels,fresh.pixels);
 }
 map.invalidate();assert.equal(map.update(surface),64);
});

test('houses and castles retain team colors and suppress crowded character dots',()=>{
 const markers=layoutMinimapMarkers(1000,192,192,[
  {x:500,z:500,population:'red',kind:'house'},
  {x:952,z:952,population:'blue',kind:'castle'},
  {x:501,z:500,population:'red',kind:'character'},
  {x:800,z:100,population:'blue',kind:'character'},
 ]);
 assert.equal(markers.length,3);
 assert.equal(markers.find(marker=>marker.kind==='castle').size,5);
 assert.equal(markers.find(marker=>marker.kind==='house').population,'red');
 assert.equal(markers.find(marker=>marker.kind==='character').population,'blue');
});

test('leaders and knights get first choice when character markers share limited space',()=>{
 const markers=layoutMinimapMarkers(1000,192,192,[
  {x:50,z:500,population:'red',kind:'character',priority:0},
  {x:50,z:500,population:'red',kind:'character',priority:3},
 ]);
 assert.equal(markers.length,1);assert.equal(markers[0].priority,3);
});

test('minimap camera navigation covers the full map and clamps clicks at the boundary',()=>{
 assert.deepEqual(minimapWorldPoint(.5,.5,1000),{x:499.5,z:499.5});
 assert.deepEqual(minimapWorldPoint(-1,2,1000),{x:0,z:999});
 assert.deepEqual(minimapWorldPoint(1,0,1000),{x:999,z:0});
});
