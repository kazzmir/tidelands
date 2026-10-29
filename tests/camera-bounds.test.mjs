import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/camera-bounds.ts',import.meta.url),'utf8'),'camera-bounds.ts',{target:'es2022'});
const {clampCameraCenter}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('camera centers remain within every map edge and corner for all world sizes',()=>{
 for(const size of [200,350,500])for(const x of [-size,0,size])for(const z of [-size,0,size]){
  const target={x,y:7,z},camera={x:x+34,y:41,z:z+34};const changed=clampCameraCenter(camera,target,size);
  assert.equal(target.x,Math.max(-size/2,Math.min(size/2,x)));assert.equal(target.z,Math.max(-size/2,Math.min(size/2,z)));
  assert.equal(camera.x-target.x,34);assert.equal(camera.z-target.z,34);assert.equal(camera.y,41);assert.equal(target.y,7);assert.equal(changed,x!==0||z!==0);
 }
});
test('valid positions, including exact boundaries, are unchanged',()=>{
 for(const x of [-100,0,100])for(const z of [-100,0,100]){const target={x,z},camera={x:x-13,z:z+29},before=structuredClone({camera,target});assert.equal(clampCameraCenter(camera,target,200),false);assert.deepEqual({camera,target},before);}
});
test('only out-of-bounds axes are corrected and resizing uses the current map dimensions',()=>{
 const target={x:240,z:20},camera={x:260,z:-30};assert.equal(clampCameraCenter(camera,target,500),false);assert.ok(clampCameraCenter(camera,target,200));assert.deepEqual(target,{x:100,z:20});assert.deepEqual(camera,{x:120,z:-30});
});
test('invalid bounds are rejected without changing camera state',()=>{
 for(const size of [0,-1,NaN,Infinity]){const target={x:1,z:2},camera={x:3,z:4};assert.throws(()=>clampCameraCenter(camera,target,size));assert.deepEqual(target,{x:1,z:2});assert.deepEqual(camera,{x:3,z:4});}
});
test('drag/touch damping and keyboard panning share the same live-size camera clamp',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(source,/controls\.addEventListener\('change', keepCameraInBounds\)/);assert.match(source,/clampCameraCenter\(camera.position, controls.target, SIZE\)/);assert.match(source,/controls.target.add\(panOffset\);\s*keepCameraInBounds\(\)/);assert.match(source,/controls.update\(\);\s*keepCameraInBounds\(\)/);assert.match(source,/screenSpacePanning = false/);
});
