import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
import * as THREE from 'three';
let {code}=await transformWithOxc(await readFile(new URL('../src/combat-effects.ts',import.meta.url),'utf8'),'combat-effects.ts',{target:'es2022'});
code=code.replaceAll("'three'",JSON.stringify(import.meta.resolve('three'))).replaceAll('"three"',JSON.stringify(import.meta.resolve('three')));
const {createCombatEffects}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function actor(x,material){
 const mesh=new THREE.Group(),legs=[];mesh.position.x=x;
 for(let i=0;i<4;i++){const limb=new THREE.Mesh(new THREE.BoxGeometry(.05,.16,.06),material);mesh.add(limb);legs.push(limb);}
 return {mesh,legs,phase:0};
}
test('fighters face one another and glow without changing shared materials or nonfighters',()=>{
 const shared=new THREE.MeshStandardMaterial({color:'blue'}),a=actor(0,shared),b=actor(1,shared),bystander=actor(2,shared),effects=createCombatEffects();
 effects.update([{a,b}],.2);
 assert.equal(a.mesh.rotation.y,Math.PI/2);assert.equal(b.mesh.rotation.y,-Math.PI/2);
 assert.notEqual(a.legs[0].material,shared);assert.equal(bystander.legs[0].material,shared);assert.equal(shared.emissive.getHex(),0);
 assert.ok(a.legs[0].material.emissive.r>.8);assert.ok(a.mesh.getObjectByName('combat-red-aura'));
 const pose=a.legs[1].rotation.x;effects.update([{a,b}],.2);assert.equal(a.legs[1].rotation.x,pose,'paused time freezes strikes');
 effects.update([{a,b}],.3);assert.notEqual(a.legs[1].rotation.x,pose);
 effects.update([],1);assert.equal(a.legs[0].material,shared);assert.equal(a.mesh.getObjectByName('combat-red-aura'),undefined);assert.equal(a.mesh.rotation.z,0);assert.equal(a.legs[1].rotation.x,0);
 effects.dispose();
});
test('new knight equipment receives the glow during an ongoing fight, and cleanup disposes clones only',()=>{
 const shared=new THREE.MeshStandardMaterial(),a=actor(0,shared),b=actor(1,shared),effects=createCombatEffects();let originalDisposed=0,cloneDisposed=0;
 shared.addEventListener('dispose',()=>originalDisposed++);effects.update([{a,b}],0);
 a.legs[0].material.addEventListener('dispose',()=>cloneDisposed++);
 const armor=new THREE.Mesh(new THREE.BoxGeometry(),shared);a.mesh.add(armor);effects.update([{a,b}],1);
 assert.notEqual(armor.material,shared);effects.clear();assert.equal(armor.material,shared);assert.equal(originalDisposed,0);assert.equal(cloneDisposed,1);
 effects.dispose();
});
