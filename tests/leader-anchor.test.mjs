import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
import * as THREE from 'three';
async function url(path,deps={}){let {code}=await transformWithOxc(await readFile(new URL(path,import.meta.url),'utf8'),'test.ts',{target:'es2022'});for(const[name,value]of Object.entries(deps))code=code.replaceAll(`'${name}'`,JSON.stringify(value)).replaceAll(`"${name}"`,JSON.stringify(value));return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;}
const leadership=await url('../src/leadership.ts');
const {LeaderAnchor}=await import(await url('../src/leader-anchor.ts',{'./leadership':leadership}));
const {createLeaderAnchorMarker}=await import(await url('../src/leader-anchor-marker.ts',{'three':import.meta.resolve('three')}));

test('button arms placement; a second click removes either pending placement or the placed anchor',()=>{
 const anchor=new LeaderAnchor(),tile={x:3,z:0};assert.equal(anchor.active,false);assert.equal(anchor.place(tile),false);
 anchor.toggle();assert.equal(anchor.placing,true);anchor.toggle();assert.equal(anchor.active,false);
 anchor.toggle();assert.equal(anchor.place(tile),true);assert.equal(anchor.target,tile);assert.equal(anchor.placing,false);assert.equal(anchor.active,true);
 anchor.cancelPlacement();assert.equal(anchor.target,tile);anchor.toggle();assert.equal(anchor.target,null);assert.equal(anchor.active,false);
});
test('leader routes to the anchor and stays at its destination instead of wandering',()=>{
 const nodes=Array.from({length:5},(_,x)=>({x,z:0})),neighbors=t=>nodes.filter(n=>Math.abs(n.x-t.x)===1),anchor=new LeaderAnchor(),owner={};
 anchor.toggle();anchor.place(nodes[4]);
 for(let x=0;x<4;x++)assert.deepEqual(anchor.steps(owner,nodes[x],neighbors,()=>true,0),[nodes[x+1]]);
 assert.deepEqual(anchor.steps(owner,nodes[4],neighbors,()=>true,0),[]);
 anchor.reset();assert.deepEqual(anchor.steps(owner,nodes[0],neighbors,()=>true,0),[]);
});
test('unreachable anchors lead to the nearest reachable shore; a new bridge invalidates the route',()=>{
 const nodes=Array.from({length:5},(_,x)=>({x,z:0})),anchor=new LeaderAnchor(),owner={};let bridge=false;
 const walkable=t=>t.x!==2||bridge,neighbors=t=>nodes.filter(n=>Math.abs(n.x-t.x)===1&&walkable(n));
 anchor.toggle();anchor.place(nodes[4]);assert.deepEqual(anchor.steps(owner,nodes[0],neighbors,walkable,0),[nodes[1]]);
 assert.deepEqual(anchor.steps(owner,nodes[1],neighbors,walkable,0),[]);
 bridge=true;assert.deepEqual(anchor.steps(owner,nodes[1],neighbors,walkable,1),[nodes[2]]);
});
test('water destinations are not entered; a successor can use the same persistent anchor',()=>{
 const nodes=Array.from({length:4},(_,x)=>({x,z:0})),anchor=new LeaderAnchor();
 const walkable=t=>t.x<3,neighbors=t=>nodes.filter(n=>Math.abs(n.x-t.x)===1&&walkable(n));
 anchor.toggle();anchor.place(nodes[3]);assert.deepEqual(anchor.steps({},nodes[1],neighbors,walkable,0),[nodes[2]]);
 assert.deepEqual(anchor.steps({},nodes[2],neighbors,walkable,0),[]);assert.equal(anchor.target,nodes[3]);
});
test('the visible destination is a gold 3D anchor, distinct from the leader pole',()=>{
 const marker=createLeaderAnchorMarker();assert.ok(marker instanceof THREE.Group);assert.equal(marker.name,'leader-destination-anchor');assert.equal(marker.visible,false);
 assert.ok(marker.children.length>=7);assert.ok(marker.children.every(mesh=>mesh.material.color.getHex()===0xffd34f));
 marker.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});marker.children[0].material.dispose();
});
test('anchor button is in the bottom toolbar and leader routing suppresses settlement',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.ok(html.slice(html.indexOf('<div class="bottom-bar">')).includes('id="leader-anchor"'));
 assert.match(main,/leaderAnchor.steps\(/);assert.match(main,/!\(leaderAnchor.target && settler === leadership.leader\)/);
});
