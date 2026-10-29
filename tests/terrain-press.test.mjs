import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
const source=await readFile(new URL('../src/terrain-press.ts',import.meta.url),'utf8'),{code}=await transformWithOxc(source,'test.ts',{target:'es2022'}),{TerrainPressTracker}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const pointer=(overrides={})=>({pointerId:1,pointerType:'touch',clientX:10,clientY:20,...overrides});
test('a touch tap stays short; a stationary touch held 500ms lowers once on release',()=>{
 const press=new TerrainPressTracker();press.begin(pointer(),100);assert.equal(press.finish(pointer(),599).longPress,false);press.begin(pointer(),1000);press.move(pointer({clientX:12,clientY:21}));assert.equal(press.finish(pointer(),1500).longPress,true);assert.equal(press.finish(pointer(),2000),null);
});
test('dragging cancels an edit even if the finger returns to its starting point',()=>{
 const press=new TerrainPressTracker();press.begin(pointer(),0);press.move(pointer({clientX:30}));press.move(pointer());assert.equal(press.finish(pointer(),1000),null);press.begin(pointer(),0);assert.equal(press.finish(pointer({clientY:40}),1000),null);
});
test('two-finger gestures never turn into land edits when either finger is released',()=>{
 const press=new TerrainPressTracker();press.begin(pointer(),0);press.begin(pointer({pointerId:2}),100);assert.equal(press.finish(pointer({pointerId:2}),600),null);assert.equal(press.finish(pointer(),800),null);press.begin(pointer(),900);assert.equal(press.finish(pointer(),950).longPress,false);
});
test('cancellation, focus loss and pointer capture loss discard pending long presses',()=>{
 const press=new TerrainPressTracker();press.begin(pointer(),0);press.cancelPointer(1);assert.equal(press.finish(pointer(),1000),null);press.begin(pointer(),0);press.cancel();assert.equal(press.finish(pointer(),1000),null);
 press.begin(pointer(),0);press.begin(pointer({pointerId:2}),0);press.cancelPointer(1);press.begin(pointer({pointerId:3}),500);assert.equal(press.finish(pointer({pointerId:3}),1500),null);assert.equal(press.finish(pointer({pointerId:2}),1500),null);
});
test('mouse and pen holds do not override the normal button mapping',()=>{
 for(const pointerType of ['mouse','pen']){const press=new TerrainPressTracker();press.begin(pointer({pointerType}),0);assert.equal(press.finish(pointer({pointerType}),2000).longPress,false);}
});
