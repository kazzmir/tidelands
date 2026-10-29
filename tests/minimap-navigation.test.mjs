import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const {code}=await transformWithOxc(await readFile(new URL('../src/minimap-navigation.ts',import.meta.url),'utf8'),'minimap-navigation.ts',{target:'es2022'});
const {bindMinimapNavigation}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function fixture(){
 const canvas=new EventTarget(),view=new EventTarget(),captured=new Set(),points=[];
 canvas.ownerDocument={defaultView:view};canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);canvas.releasePointerCapture=id=>captured.delete(id);
 const dispose=bindMinimapNavigation(canvas,e=>points.push([e.clientX,e.clientY]));
 function send(type,values={}){const event=Object.assign(new Event(type,{cancelable:true}),{button:0,buttons:1,pointerId:1,clientX:10,clientY:20,...values});canvas.dispatchEvent(event);return event;}
 return{canvas,view,captured,points,dispose,send};
}
test('minimap clicks navigate immediately, then follow every captured drag movement, including outside the canvas',()=>{
 const f=fixture();assert.equal(f.send('pointerdown').defaultPrevented,true);assert.ok(f.captured.has(1));f.send('pointermove',{clientX:50,clientY:60});f.send('pointermove',{clientX:-100,clientY:500});assert.deepEqual(f.points,[[10,20],[50,60],[-100,500]]);f.send('pointerup',{buttons:0});assert.equal(f.captured.size,0);f.send('pointermove');assert.equal(f.points.length,3);f.dispose();
});
test('hover, right/middle clicks and unrelated fingers cannot navigate or interrupt the primary drag',()=>{
 const f=fixture();f.send('pointermove');f.send('pointerdown',{button:2});f.send('pointerdown',{button:1});assert.equal(f.points.length,0);f.send('pointerdown');f.send('pointerdown',{pointerId:2});f.send('pointermove',{pointerId:2});f.send('pointerup',{pointerId:2});assert.ok(f.captured.has(1));f.send('pointermove');assert.equal(f.points.length,2);f.dispose();
});
for(const type of ['pointercancel','lostpointercapture'])test(`${type} ends minimap dragging and permits a fresh drag`,()=>{
 const f=fixture();f.send('pointerdown');f.send(type);f.send('pointermove');assert.equal(f.points.length,1);assert.equal(f.captured.size,0);f.send('pointerdown',{pointerId:2});f.send('pointermove',{pointerId:2});assert.equal(f.points.length,3);f.dispose();
});
test('window blur or a missed mouse release stops navigation without leaving capture behind',()=>{
 const f=fixture();f.send('pointerdown');f.view.dispatchEvent(new Event('blur'));f.send('pointermove');assert.equal(f.points.length,1);assert.equal(f.captured.size,0);f.send('pointerdown');f.send('pointermove',{buttons:0});f.send('pointermove');assert.equal(f.points.length,2);assert.equal(f.captured.size,0);f.dispose();
});
test('touch and pen primary pointers use the same drag navigation and cleanup removes all handlers',()=>{
 for(const pointerType of ['touch','pen']){const f=fixture();f.send('pointerdown',{pointerType});f.send('pointermove',{pointerType,clientX:30});assert.equal(f.points.length,2);f.dispose();f.dispose();assert.equal(f.captured.size,0);f.send('pointerdown');f.send('pointermove');assert.equal(f.points.length,2);}
});
