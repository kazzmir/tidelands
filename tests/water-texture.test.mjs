import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
import * as THREE from 'three';

const source=await readFile(new URL('../src/water-texture.ts',import.meta.url),'utf8');
let {code}=await transformWithOxc(source,'water-texture.ts',{target:'es2022'});
code=code.replaceAll("'three'",JSON.stringify(import.meta.resolve('three'))).replaceAll('"three"',JSON.stringify(import.meta.resolve('three')));
const {waterWaveHeight,createWaterTextures,animateWaterTextures}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('wave patterns and derivatives join seamlessly across both repeating texture boundaries',()=>{
 const epsilon=1e-5;
 for(let i=0;i<=24;i++){
  const t=i/24;
  close(waterWaveHeight(0,t),waterWaveHeight(1,t));
  close(waterWaveHeight(t,0),waterWaveHeight(t,1));
  close(waterWaveHeight(-t,.37),waterWaveHeight(1-t,.37));
  const left=(waterWaveHeight(epsilon,t)-waterWaveHeight(-epsilon,t))/(2*epsilon);
  const right=(waterWaveHeight(1+epsilon,t)-waterWaveHeight(1-epsilon,t))/(2*epsilon);
  close(left,right,1e-6);
 }
});

test('ocean color and normal textures repeat continuously every eight world tiles',()=>{
 const textures=createWaterTextures(3000,16,64);
 for(const texture of Object.values(textures)){
  assert.equal(texture.wrapS,THREE.RepeatWrapping);assert.equal(texture.wrapT,THREE.RepeatWrapping);
  assert.deepEqual(texture.repeat.toArray(),[375,375]);
  assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(texture.magFilter,THREE.LinearFilter);
  assert.equal(texture.generateMipmaps,true);assert.equal(texture.anisotropy,8);
  assert.equal(texture.image.data.length,64*64*4);
 }
 assert.equal(textures.map.colorSpace,THREE.SRGBColorSpace);
 assert.equal(textures.normalMap.colorSpace,THREE.NoColorSpace);
 assert.ok(new Set(textures.map.image.data).size>20,'wave color must vary, not be flat water');
 for(const texture of Object.values(textures))texture.dispose();
});

test('ripple normals are valid unit directions with no transparent gaps',()=>{
 const textures=createWaterTextures(3000,1,32),data=textures.normalMap.image.data;
 for(let i=0;i<data.length;i+=4){
  close(Math.hypot(data[i]/255*2-1,data[i+1]/255*2-1,data[i+2]/255*2-1),1,.012);
  assert.ok(data[i+2]>128);assert.equal(data[i+3],255);assert.equal(textures.map.image.data[i+3],255);
 }
 for(const texture of Object.values(textures))texture.dispose();
});

test('wave animation is smooth, keeps color/normals aligned, and does not reupload textures',()=>{
 const textures=createWaterTextures(3000,1,32),version=textures.map.version;
 animateWaterTextures(textures,10);const before=textures.map.offset.clone();
 animateWaterTextures(textures,10.01);
 close(textures.map.offset.x-before.x,.01*.012);close(textures.map.offset.y-before.y,.01*.005);
 assert.deepEqual(textures.map.offset.toArray(),textures.normalMap.offset.toArray());
 assert.equal(textures.map.version,version);
 const paused=textures.map.offset.clone();animateWaterTextures(textures,10.01);
 assert.deepEqual(textures.map.offset.toArray(),paused.toArray());
 for(const texture of Object.values(textures))texture.dispose();
});
