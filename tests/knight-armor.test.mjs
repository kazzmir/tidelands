import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
import * as THREE from 'three';

const source=await readFile(new URL('../src/knight-armor.ts',import.meta.url),'utf8');
let {code}=await transformWithOxc(source,'knight-armor.ts',{target:'es2022'});
code=code.replaceAll("'three'",JSON.stringify(import.meta.resolve('three'))).replaceAll('"three"',JSON.stringify(import.meta.resolve('three')));
const {createSilverArmorMaterial,equipKnightArmor}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function character(){
 const group=new THREE.Group();group.scale.setScalar(1.15);
 const cloth=new THREE.MeshStandardMaterial({color:'red'}),dark=new THREE.MeshStandardMaterial({color:'#333333'});
 const body=new THREE.Mesh(new THREE.BoxGeometry(.17,.21,.12),cloth);body.position.y=.25;
 const head=new THREE.Mesh(new THREE.BoxGeometry(.135,.14,.13),cloth);head.position.y=.425;
 const hair=new THREE.Mesh(new THREE.BoxGeometry(.145,.055,.14),dark);hair.position.set(0,.49,-.01);
 group.add(body,head,hair);
 const limbs=[];
 for(const side of [-1,1]){
  const leg=new THREE.Mesh(new THREE.BoxGeometry(.055,.16,.065),cloth);leg.position.set(side*.05,.085,0);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(.055,.16,.065),cloth);arm.position.set(side*.115,.25,0);
  group.add(leg,arm);limbs.push(leg,arm);
 }
 return {group,body,head,hair,limbs,silver:createSilverArmorMaterial(),dark};
}
function ownBounds(mesh){mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);}

test('knight armor scales a normal character by 1.3 exactly once',()=>{
 const c=character();equipKnightArmor(c.group,c.limbs,c.silver,c.dark);
 assert.deepEqual(c.group.scale.toArray(),Array(3).fill(1.15*1.3));
 const count=c.group.children.length;
 equipKnightArmor(c.group,c.limbs,c.silver,c.dark);
 assert.deepEqual(c.group.scale.toArray(),Array(3).fill(1.15*1.3));assert.equal(c.group.children.length,count);
});

test('silver helmet and torso fully enclose the original head, hair, and shirt',()=>{
 const c=character();equipKnightArmor(c.group,c.limbs,c.silver,c.dark);c.group.updateMatrixWorld(true);
 const helmet=c.group.getObjectByName('knight-helmet'),torso=c.group.getObjectByName('knight-cuirass');
 assert.ok(ownBounds(helmet).containsBox(ownBounds(c.head)));
 assert.ok(ownBounds(helmet).containsBox(ownBounds(c.hair)));
 assert.ok(ownBounds(torso).containsBox(ownBounds(c.body)));
 assert.equal(helmet.material,c.silver);assert.equal(torso.material,c.silver);
 assert.equal(c.silver.color.getHexString(),'d7dde5');assert.ok(c.silver.metalness>=.7);assert.ok(c.silver.roughness<=.35);
});

test('silver greaves, boots, pauldrons, bracers, and gauntlets follow every animated limb',()=>{
 const c=character();equipKnightArmor(c.group,c.limbs,c.silver,c.dark);
 for(const [side,offset] of [['left',0],['right',2]]){
  const leg=c.limbs[offset],arm=c.limbs[offset+1];
  for(const name of ['greave','knee','boot'])assert.equal(c.group.getObjectByName(`knight-${name}-${side}`).parent,leg);
  for(const name of ['pauldron','vambrace','gauntlet'])assert.equal(c.group.getObjectByName(`knight-${name}-${side}`).parent,arm);
  leg.rotation.x=.6;arm.rotation.x=-.7;
 }
 c.group.updateMatrixWorld(true);
 for(const [side,offset] of [['left',0],['right',2]]){
  assert.ok(ownBounds(c.group.getObjectByName(`knight-greave-${side}`)).containsBox(ownBounds(c.limbs[offset])));
  assert.ok(ownBounds(c.group.getObjectByName(`knight-vambrace-${side}`)).containsBox(ownBounds(c.limbs[offset+1])));
 }
 c.group.traverse(mesh=>{
  if(!mesh.name.startsWith('knight-'))return;
  assert.equal(mesh.userData.ownedGeometry,true);assert.equal(mesh.castShadow,true);assert.equal(mesh.receiveShadow,true);
  if(mesh.name!=='knight-visor')assert.equal(mesh.material,c.silver);
 });
});
